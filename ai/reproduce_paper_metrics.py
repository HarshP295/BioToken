"""
Reproduce the AI numbers reported in the BioToken paper from the deployed models.

Re-runs the exact procedure of notebooks/03_xgboost.ipynb (RT predictor split)
and notebooks/05_classifier.ipynb (synthetic genuine/anomaly generation with
np.random.seed(42), pruning, stratified 80/20 split) and evaluates the frozen
models in ai/models. Nothing is retrained.

Paper tables covered: 3 (RT predictor), 4 (thresholds), 8 (confusion matrix),
9 (degradation sensitivity).

Usage (from repo root):  python ai/reproduce_paper_metrics.py
"""

import sys
import warnings
from pathlib import Path

import joblib
import matplotlib
import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix, f1_score, mean_squared_error, r2_score, roc_auc_score
from sklearn.model_selection import train_test_split

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

warnings.filterwarnings("ignore")

AI_DIR = Path(__file__).resolve().parent
ROOT = AI_DIR.parent
sys.path.insert(0, str(AI_DIR))
from src.verifier import CLF_FEATURES  # noqa: E402

MODEL_DIR = AI_DIR / "models"
DATA_PATH = AI_DIR / "data" / "SMRT_features_v2.csv"
FIG_DIR = ROOT / "figures"


def main() -> None:
    df = pd.read_csv(DATA_PATH)
    features = [c for c in df.columns if c not in ["pubchem", "rt"]]
    rt_model = joblib.load(MODEL_DIR / "rt_predictor.pkl")
    rt_scaler = joblib.load(MODEL_DIR / "scaler.pkl")
    clf = joblib.load(MODEL_DIR / "anomaly_classifier.pkl")
    clf_scaler = joblib.load(MODEL_DIR / "scaler_classifier.pkl")

    # ── Table 3: RT predictor on the 20% held-out split ──────────────
    X, y = df[features], df["rt"]
    _, X_test, _, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    test_pred = rt_model.predict(rt_scaler.transform(X_test))
    print(f"RT predictor: n_test={len(y_test)}  R2={r2_score(y_test, test_pred):.4f}  "
          f"RMSE={np.sqrt(mean_squared_error(y_test, test_pred)):.2f}s")

    # ── Synthetic classifier data (05_classifier.ipynb, cells 1-3) ───
    pred_all = rt_model.predict(rt_scaler.transform(X))
    np.random.seed(42)
    rows = []
    for i, true_rt in enumerate(y.to_numpy()):
        predicted = float(pred_all[i])
        obs = true_rt * (1 + np.random.uniform(-0.01, 0.01))
        rows.append((i, obs, abs(obs - predicted) / predicted * 100, 0))
        shift = np.random.uniform(0.15, 0.40)
        direction = np.random.choice([-1, 1])
        obs_a = true_rt * (1 + direction * shift)
        rows.append((i, obs_a, abs(obs_a - predicted) / predicted * 100, 1))
    syn = pd.DataFrame(rows, columns=["idx", "observed_rt", "pct_deviation", "label"])
    syn = pd.concat([syn[(syn.label == 0) & (syn.pct_deviation < 20)], syn[syn.label == 1]],
                    ignore_index=True)
    print(f"Synthetic samples: {len(syn)} (genuine {(syn.label == 0).sum()}, "
          f"anomaly {(syn.label == 1).sum()})")

    X_clf = df.loc[syn.idx, features].reset_index(drop=True)
    X_clf[["observed_rt", "pct_deviation"]] = syn[["observed_rt", "pct_deviation"]]
    _, Xc_test, _, yc_test = train_test_split(
        X_clf[CLF_FEATURES], syn.label, test_size=0.2, random_state=42, stratify=syn.label
    )
    prob = clf.predict_proba(clf_scaler.transform(Xc_test))[:, 1]
    print(f"Classifier AUC={roc_auc_score(yc_test, prob):.4f}")

    # ── Table 4: thresholds ──────────────────────────────────────────
    print("\nThreshold  Det%   FPR%   F1")
    for t in [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60]:
        pred = (prob >= t).astype(int)
        tn, fp, fn, tp = confusion_matrix(yc_test, pred).ravel()
        print(f"  {t:.2f}     {tp / (tp + fn) * 100:.1f}  {fp / (fp + tn) * 100:5.1f}  "
              f"{f1_score(yc_test, pred):.4f}")

    # ── Table 8: confusion matrix at 0.50 ────────────────────────────
    cm = confusion_matrix(yc_test, (prob >= 0.5).astype(int))
    tn, fp, fn, tp = cm.ravel()
    print(f"\nConfusion @0.50: TN={tn} FP={fp} FN={fn} TP={tp}  (n={cm.sum()})")

    # ── Table 9: shift sensitivity ───────────────────────────────────
    # The paper's table used 500 molecules (df.sample(500, random_state=42));
    # the full 15,581-molecule RT test split is shown alongside.
    sample = df.sample(500, random_state=42)
    for label, base, true_rt in [
        ("500-molecule sample (paper Table 9)", sample[features], sample["rt"].to_numpy()),
        ("full RT test split (n=15,581)", X_test, y_test.to_numpy()),
    ]:
        base_pred = rt_model.predict(rt_scaler.transform(base))
        print(f"\n{label}\nShift  Detection%")
        for shift in [0, 2, 5, 8, 15]:
            rt_obs = true_rt * (1 + shift / 100)
            Xs = base.assign(observed_rt=rt_obs,
                             pct_deviation=np.abs(rt_obs - base_pred) / base_pred * 100)
            rate = (clf.predict_proba(clf_scaler.transform(Xs[CLF_FEATURES]))[:, 1] >= 0.5).mean() * 100
            print(f"  {shift:>2}%   {rate:5.1f}" + ("   <- genuine at true RT (FPR)" if shift == 0 else ""))

    FIG_DIR.mkdir(exist_ok=True)
    fig, ax = plt.subplots(figsize=(6, 5))
    ax.imshow(cm, cmap="Blues")
    for (r, c), v in np.ndenumerate(cm):
        ax.text(c, r, f"{v:,}", ha="center", va="center",
                color="white" if v > cm.max() / 2 else "black", fontsize=13)
    ax.set_xticks([0, 1], ["Predicted Genuine", "Predicted Anomaly"])
    ax.set_yticks([0, 1], ["Actually Genuine", "Actually Anomaly"])
    ax.set_title(f"Anomaly classifier (threshold 0.50)\nAUC = {roc_auc_score(yc_test, prob):.4f}, "
                 f"held-out n = {cm.sum():,}")
    plt.tight_layout()
    plt.savefig(FIG_DIR / "confusion_matrix_synthetic.png", dpi=200)
    print(f"\nSaved {FIG_DIR / 'confusion_matrix_synthetic.png'}")


if __name__ == "__main__":
    main()
