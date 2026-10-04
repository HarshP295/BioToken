"""
Layer 1: RepoRT multi-laboratory validation (paper section 5.1).

Protocol as described in the paper: for every (dataset, compound) group the
local median RT is computed and a measurement is labelled ANOMALY when it
deviates from that median by more than 25%. A balanced 500/500 sample is
passed through the frozen production models without retraining.

Data: RepoRT (Kretschmer et al., Nature Methods 2024), processed_data/ from
https://github.com/michaelwitting/RepoRT. Dataset 0186 is METLIN SMRT itself,
i.e. the training data, and is excluded. Only reversed-phase C18/C8 columns
(USP L1/L7) are used.

Usage (from repo root):
    python ai/reportrt_validation_fix.py [path/to/RepoRT]
Default RepoRT location: ../RepoRT_official (next to this repository).
"""

from __future__ import annotations

import sys
import warnings
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix, roc_auc_score

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ai"))
from src.verifier import get_classifier_info, verify_from_smiles  # noqa: E402

SMRT_DATASET_ID = "0186"
RP_USP_CODES = {"L1", "L7"}
LABEL_THRESHOLD = 0.25
FIG_DIR = ROOT / "figures"


def load_repo_rt(repo_root: Path) -> pd.DataFrame:
    processed = repo_root / "processed_data"
    if not processed.exists():
        raise FileNotFoundError(
            f"RepoRT processed_data not found under {repo_root}. Clone "
            "https://github.com/michaelwitting/RepoRT first."
        )
    frames = []
    for rt_file in sorted(processed.glob("*/*_rtdata_canonical_success.tsv")):
        dataset_id = rt_file.parent.name
        meta_file = rt_file.with_name(f"{dataset_id}_metadata.tsv")
        if dataset_id == SMRT_DATASET_ID or not meta_file.exists():
            continue
        usp = pd.read_csv(meta_file, sep="\t", dtype=str)["column.usp.code"].iloc[0]
        if usp not in RP_USP_CODES:
            continue
        df = pd.read_csv(rt_file, sep="\t", dtype=str)
        df = df[["name", "rt", "smiles.std", "inchikey.std"]].assign(dataset_id=dataset_id)
        frames.append(df)
    data = pd.concat(frames, ignore_index=True)
    data["rt_seconds"] = pd.to_numeric(data["rt"], errors="coerce") * 60.0
    return data.dropna(subset=["rt_seconds", "smiles.std", "inchikey.std"])


def main() -> None:
    repo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "RepoRT_official"
    data = load_repo_rt(repo_root)
    data = data[data["rt_seconds"] > 0]

    group = data.groupby(["dataset_id", "inchikey.std"])["rt_seconds"]
    data["local_median_rt"] = group.transform("median")
    data["group_size"] = group.transform("size")
    data["rel_dev"] = (data["rt_seconds"] - data["local_median_rt"]).abs() / data["local_median_rt"]
    data["label"] = (data["rel_dev"] > LABEL_THRESHOLD).astype(int)

    print(f"RP rows (SMRT excluded): {len(data)} from {data['dataset_id'].nunique()} datasets")
    print(f"Groups with repeated measurements: {(group.size() >= 2).sum()}")
    print(f"Label counts: GENUINE={int((data.label == 0).sum())}, ANOMALY={int((data.label == 1).sum())}")

    sample = pd.concat([
        data[data.label == 0].sample(n=500, random_state=42),
        data[data.label == 1].sample(n=500, random_state=42),
    ], ignore_index=True)

    results = []
    for _, row in sample.iterrows():
        try:
            r = verify_from_smiles(row["smiles.std"], float(row["rt_seconds"]))
        except ValueError:
            continue
        results.append({**row.to_dict(), **{k: r[k] for k in ("predicted_rt", "pct_deviation", "anomaly_prob")}})
    res = pd.DataFrame(results)

    threshold = float(get_classifier_info()["threshold"])
    y_true = res["label"].to_numpy()
    y_prob = res["anomaly_prob"].to_numpy()
    y_pred = (y_prob >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()

    print(f"\nEvaluated {len(res)} rows ({int((y_true == 0).sum())} genuine / {int((y_true == 1).sum())} anomaly)")
    print(f"AUC:            {roc_auc_score(y_true, y_prob):.4f}   (paper: 0.9412)")
    print(f"Detection rate: {tp / (tp + fn):.4f}   (paper: 0.894)")
    print(f"FPR:            {fp / (fp + tn):.4f}   (paper: 0.051)")
    print(f"TN/FP/FN/TP:    {tn}/{fp}/{fn}/{tp}")

    genuine = res[res.label == 0]
    print("\nGenuine RepoRT measurements vs SMRT-scale RT predictor:")
    print(f"  median observed RT {genuine.rt_seconds.median():.0f}s, "
          f"median predicted RT {genuine.predicted_rt.median():.0f}s, "
          f"median |deviation| {genuine.pct_deviation.median():.1f}%")

    out_csv = ROOT / "ai" / "data" / "layer1_reportrt_results.csv"
    res.to_csv(out_csv, index=False)

    FIG_DIR.mkdir(exist_ok=True)
    fig, ax = plt.subplots(figsize=(7, 4.5))
    bins = np.linspace(0, 1, 21)
    ax.hist(genuine.anomaly_prob, bins=bins, alpha=0.7, label="Labelled GENUINE (within 25% of local median)")
    ax.hist(res[res.label == 1].anomaly_prob, bins=bins, alpha=0.7, label="Labelled ANOMALY")
    ax.axvline(threshold, color="black", linestyle="--", linewidth=1)
    ax.set_xlabel("Anomaly probability")
    ax.set_ylabel("Measurements")
    ax.set_title(f"Layer 1 RepoRT (RP, SMRT excluded): AUC {roc_auc_score(y_true, y_prob):.3f}, "
                 f"FPR {fp / (fp + tn):.1%}")
    ax.legend(fontsize=8)
    plt.tight_layout()
    plt.savefig(FIG_DIR / "layer1_diagnostic.png", dpi=200)
    print(f"\nSaved {out_csv}\nSaved {FIG_DIR / 'layer1_diagnostic.png'}")


if __name__ == "__main__":
    main()
