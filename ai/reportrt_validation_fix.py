from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix, roc_auc_score

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai.src.features import ALL_FEATURES, compute_features, smiles_to_mol


ROOT = Path(__file__).resolve().parents[1]
REPO_RT_ROOT = ROOT.parent / "RepoRT_official"
RAW_DATA_DIR = REPO_RT_ROOT / "raw_data"
MODEL_DIR = ROOT / "ai" / "models"


def main() -> None:
    if not RAW_DATA_DIR.exists():
        raise FileNotFoundError(
            f"RepoRT_official not found at {RAW_DATA_DIR}. "
            "Clone it before running this validation."
        )

    rt_model = joblib.load(MODEL_DIR / "rt_predictor.pkl")
    rt_scaler = joblib.load(MODEL_DIR / "scaler.pkl")
    anomaly_model = joblib.load(MODEL_DIR / "anomaly_classifier.pkl")
    scaler_classifier = joblib.load(MODEL_DIR / "scaler_classifier.pkl")
    with open(MODEL_DIR / "classifier_info.json", "r", encoding="utf-8") as fh:
        classifier_info = json.load(fh)

    rows = []
    files = sorted(RAW_DATA_DIR.glob("*/*_rtdata.tsv"))
    if not files:
        raise FileNotFoundError(f"No *_rtdata.tsv files found under {RAW_DATA_DIR}")

    for file_path in files:
        dataset_id = file_path.parent.name
        try:
            df = pd.read_csv(file_path, sep='\t', dtype=str)
        except Exception as exc:
            print(f"WARN: failed to read {file_path}: {exc}")
            continue

        needed = [
            "name",
            "rt",
            "pubchem.cid",
            "pubchem.smiles.isomeric",
        ]
        missing = [c for c in needed if c not in df.columns]
        if missing:
            print(f"WARN: {file_path} missing columns: {missing}")
            continue

        subset = df.loc[:, ["name", "rt", "pubchem.cid", "pubchem.smiles.isomeric"]].copy()
        subset["dataset_id"] = dataset_id
        subset["rt_minutes"] = pd.to_numeric(subset["rt"], errors="coerce")
        subset["rt_seconds"] = subset["rt_minutes"] * 60.0
        subset["pubchem.cid"] = subset["pubchem.cid"].replace({"nan": np.nan})
        subset["name"] = subset["name"].replace({"nan": np.nan})
        subset["pubchem.smiles.isomeric"] = subset["pubchem.smiles.isomeric"].replace({"nan": np.nan})
        subset = subset[subset["rt_minutes"].notna()]
        subset = subset[subset["pubchem.smiles.isomeric"].notna()]
        subset = subset[subset["pubchem.smiles.isomeric"].astype(str).str.strip().ne("")]
        subset = subset[~subset["pubchem.smiles.isomeric"].astype(str).str.strip().eq("-")]
        rows.append(subset)

    if not rows:
        raise RuntimeError("No valid RepoRT rows loaded")

    rt_df = pd.concat(rows, ignore_index=True)
    rt_df = rt_df[rt_df["rt_seconds"].notna()].copy()
    rt_df["group_key"] = rt_df.apply(
        lambda r: str(r["dataset_id"]) + "::" + (str(r["pubchem.cid"]) if pd.notna(r["pubchem.cid"]) and str(r["pubchem.cid"]).strip() != "" else str(r["name"])),
        axis=1,
    )
    group_medians = rt_df.groupby("group_key")["rt_seconds"].median().rename("local_median_rt")
    rt_df = rt_df.merge(group_medians, on="group_key", how="left")
    rt_df["label"] = np.where(
        rt_df["local_median_rt"].replace(0, np.nan).notna() & (np.abs(rt_df["rt_seconds"] - rt_df["local_median_rt"]) / rt_df["local_median_rt"]) > 0.25,
        "ANOMALY",
        "GENUINE",
    )

    genuine = rt_df[rt_df["label"] == "GENUINE"].copy()
    anomaly = rt_df[rt_df["label"] == "ANOMALY"].copy()
    print(f"Loaded rows: {len(rt_df)}")
    print(f"Genuine groups: {len(genuine)}")
    print(f"Anomaly groups: {len(anomaly)}")

    if len(genuine) < 500 or len(anomaly) < 500:
        raise RuntimeError(
            f"Not enough class examples for a 500/500 balanced sample. "
            f"GENUINE={len(genuine)}, ANOMALY={len(anomaly)}"
        )

    rng = np.random.default_rng(42)
    genuine_sample = genuine.sample(n=500, random_state=42, replace=False)
    anomaly_sample = anomaly.sample(n=500, random_state=42, replace=False)
    selected = pd.concat([genuine_sample, anomaly_sample], ignore_index=True)
    selected["y_true"] = (selected["label"] == "ANOMALY").astype(int)

    feature_rows = []
    rt_preds = []
    pct_devs = []
    probs = []
    pred_labels = []

    for _, row in selected.iterrows():
        smiles = str(row["pubchem.smiles.isomeric"]).strip()
        mol = smiles_to_mol(smiles)
        if mol is None:
            raise ValueError(f"Could not parse SMILES for row: {row.get('name', '<unknown>')} :: {smiles}")

        feature_dict = compute_features(mol)
        feature_vec = np.array([float(feature_dict[k]) for k in ALL_FEATURES], dtype=float)
        feature_rows.append(feature_vec)

        scaled = rt_scaler.transform(feature_vec.reshape(1, -1))
        pred_rt = float(rt_model.predict(scaled)[0])
        observed_rt = float(row["rt_seconds"])
        pct_dev = abs(observed_rt - pred_rt) / max(abs(pred_rt), 1e-6) * 100.0
        rt_preds.append(pred_rt)
        pct_devs.append(pct_dev)

        model_input = np.hstack([
            feature_vec.reshape(1, -1),
            np.array([[observed_rt, pct_dev]], dtype=float),
        ])
        scaled_model_input = scaler_classifier.transform(model_input)
        prob = float(anomaly_model.predict_proba(scaled_model_input)[0, 1])
        probs.append(prob)
        pred_labels.append(int(prob >= float(classifier_info.get("threshold", 0.5))))

    X = np.vstack(feature_rows)
    y_true = selected["y_true"].to_numpy(dtype=int)
    y_prob = np.asarray(probs, dtype=float)
    y_pred = np.asarray(pred_labels, dtype=int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    auc = roc_auc_score(y_true, y_prob)
    detection_rate = tp / (tp + fn) if (tp + fn) else 0.0
    fpr = fp / (fp + tn) if (fp + tn) else 0.0

    print("\n=== Sanity checks (10 rows) ===")
    sanity = pd.DataFrame({
        "name": selected["name"].values[:10],
        "raw_rt_min": selected["rt_minutes"].values[:10],
        "converted_rt_sec": selected["rt_seconds"].values[:10],
        "predicted_rt_sec": np.asarray(rt_preds)[:10],
        "pct_deviation": np.asarray(pct_devs)[:10],
    })
    print(sanity.to_string(index=False))

    print("\n=== RepoRT validation summary ===")
    print(f"Balanced sample: {len(selected)} rows ({len(selected)//2} genuine / {len(selected)//2} anomaly)")
    print(f"AUC: {auc:.6f}")
    print(f"Detection rate: {detection_rate:.6f}")
    print(f"FPR: {fpr:.6f}")
    print(f"TN/FP/FN/TP: {tn}/{fp}/{fn}/{tp}")

    paper_auc = 0.9412
    paper_detection = 0.894
    paper_fpr = 0.051
    print("\n=== Comparison to paper claims ===")
    print(f"Paper AUC:    {paper_auc:.4f}")
    print(f"Measured AUC: {auc:.4f}")
    print(f"Paper DET:    {paper_detection:.4f}")
    print(f"Measured DET: {detection_rate:.4f}")
    print(f"Paper FPR:    {paper_fpr:.4f}")
    print(f"Measured FPR: {fpr:.4f}")


if __name__ == "__main__":
    main()
