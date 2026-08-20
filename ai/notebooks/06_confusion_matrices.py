import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
import joblib
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "ai" / "models"
DATA_PATH = ROOT / "ai" / "data" / "SMRT_features_v2.csv"
FIG_DIR = ROOT / "figures"
FIG_DIR.mkdir(exist_ok=True)

classifier_info = json.loads((MODEL_DIR / "classifier_info.json").read_text(encoding="utf-8"))
print("classifier_info.json:", classifier_info)
print("NOTE: 05_classifier.ipynb is empty/truncated in this repo, and no saved train/test split indices were found. The original synthetic generation code is not available here, so the split below is reconstructed deterministically from the documented counts and a fixed random_state=42 as a fallback. If the original generator differs, this will not match the original confusion matrix exactly.")

feature_df = pd.read_csv(DATA_PATH)
feature_cols = [c for c in feature_df.columns if c not in ["pubchem", "rt"]]

# Fallback deterministic reconstruction from the documented dataset counts.
# This is the closest reproducible split available from repo artifacts.
# If the original anomaly-generation logic differs, the otherwise-expected
# confusion matrix will not match the reference exactly.
n_genuine = 75_506
n_anomaly = 77_901
rng = np.random.default_rng(42)

genuine = feature_df.iloc[:n_genuine].copy().reset_index(drop=True)
anomaly = feature_df.iloc[:n_anomaly].copy().reset_index(drop=True)
anomaly["rt"] = anomaly["rt"].to_numpy() * (1 + rng.uniform(0.10, 0.25, len(anomaly)))

X_all = pd.concat([genuine[feature_cols], anomaly[feature_cols]], ignore_index=True)
y_all = np.concatenate([
    np.zeros(len(genuine), dtype=int),
    np.ones(len(anomaly), dtype=int),
])
rt_true = pd.concat([genuine["rt"], anomaly["rt"]], ignore_index=True).to_numpy(dtype=float)

rt_model = joblib.load(MODEL_DIR / "rt_predictor.pkl")
rt_scaler = joblib.load(MODEL_DIR / "scaler.pkl")
clf = joblib.load(MODEL_DIR / "anomaly_classifier.pkl")
scaler = joblib.load(MODEL_DIR / "scaler_classifier.pkl")

X_scaled = rt_scaler.transform(X_all[feature_cols].to_numpy(dtype=float))
rt_pred = rt_model.predict(X_scaled)
pct_deviation = np.abs(rt_true - rt_pred) / np.maximum(np.abs(rt_pred), 1e-6) * 100.0
model_input = np.hstack([X_all.to_numpy(dtype=float), np.column_stack([rt_true, pct_deviation])])
probs = clf.predict_proba(scaler.transform(model_input))[:, 1]

_, idx_test = train_test_split(
    np.arange(len(y_all)),
    test_size=0.2,
    random_state=42,
    stratify=y_all,
)

# Train/test split: use the original 80/20 random_state=42 behavior.
train_idx = np.setdiff1d(np.arange(len(y_all)), idx_test)
set_names = [("Training Set", train_idx), ("Validation Set", idx_test)]

reference = np.array([[14363, 738], [1251, 14330]], dtype=int)

for title, idx in set_names:
    y_true = y_all[idx]
    y_prob = probs[idx]
    y_pred = (y_prob >= 0.5).astype(int)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    acc = accuracy_score(y_true, y_pred)
    prec = precision_score(y_true, y_pred, zero_division=0)
    rec = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    auc = roc_auc_score(y_true, y_prob)

    print(f"\n{title}")
    print("Confusion matrix (sklearn array):\n", cm)
    print("\nReadable table:")
    df_cm = pd.DataFrame(
        cm,
        index=pd.Index(["Actual Genuine", "Actual Anomaly"], name="Actual"),
        columns=pd.Index(["Pred Genuine", "Pred Anomaly"], name="Predicted"),
    )
    print(df_cm)
    print(f"Accuracy: {acc:.4f}")
    print(f"Precision: {prec:.4f}")
    print(f"Recall: {rec:.4f}")
    print(f"F1: {f1:.4f}")
    print(f"AUC: {auc:.4f}")

    if title == "Validation Set" and np.allclose(cm, reference, atol=20):
        print("SANITY CHECK: validation confusion matrix matches the documented reference within tolerance.")
    elif title == "Validation Set":
        print("WARNING: validation confusion matrix does NOT closely match the documented reference. This usually indicates the original synthetic split/generator is not recoverable from the repo artifacts.")

    # Report possible overfitting signal.
    if title == "Training Set":
        train_metrics = {"accuracy": acc, "precision": prec, "recall": rec, "f1": f1, "auc": auc}
    elif title == "Validation Set":
        val_metrics = {"accuracy": acc, "precision": prec, "recall": rec, "f1": f1, "auc": auc}
        if "train_metrics" in locals() and abs(train_metrics["f1"] - val_metrics["f1"]) > 0.10:
            print("OVERFITTING FLAG: training F1 is more than 0.10 above validation F1, suggesting a possible overfit.")
        if "train_metrics" in locals() and abs(train_metrics["auc"] - val_metrics["auc"]) > 0.10:
            print("OVERFITTING FLAG: training AUC is more than 0.10 above validation AUC, suggesting a possible overfit.")

# Save the combined figure.
fig, axes = plt.subplots(1, 2, figsize=(12, 5), constrained_layout=True)
cm_by_title = {}
for title, idx in set_names:
    y_true = y_all[idx]
    y_prob = probs[idx]
    y_pred = (y_prob >= 0.5).astype(int)
    cm_by_title[title] = confusion_matrix(y_true, y_pred, labels=[0, 1])

vmax = max(cm_by_title["Training Set"].max(), cm_by_title["Validation Set"].max())
for ax, (title, idx) in zip(axes, set_names):
    cm = cm_by_title[title]
    sns.heatmap(
        cm,
        annot=True,
        fmt="d",
        cmap="Blues",
        vmin=0,
        vmax=vmax,
        xticklabels=["Pred Genuine", "Pred Anomaly"],
        yticklabels=["Actual Genuine", "Actual Anomaly"],
        cbar=(ax == axes[-1]),
        ax=ax,
    )
    ax.set_title(title)
    ax.set_xlabel("Predicted label")
    ax.set_ylabel("Actual label")

fig.suptitle("BioToken anomaly classifier confusion matrices", fontsize=14)
fig.savefig(FIG_DIR / "confusion_matrices_train_val.png", dpi=300, bbox_inches="tight")
print(f"\nSaved figure: {FIG_DIR / 'confusion_matrices_train_val.png'}")
