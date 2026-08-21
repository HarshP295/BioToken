from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from rdkit import Chem

ROOT = Path(__file__).resolve().parents[1]
AI_ROOT = ROOT / "ai"
MODEL_DIR = AI_ROOT / "models"
DATA_DIR = ROOT / "data"
FIG_DIR = ROOT / "figures"
CSV_PATH = DATA_DIR / "layer2_results.csv"
sys.path.insert(0, str(AI_ROOT))
from src.features import ALL_FEATURES, compute_features, features_dict_to_list


DESTINATION_CAFFEINE_RT = 643.8
THRESHOLD = 0.5

SAMPLES = [
    ("Caffeine", "caffeine", "Ribeiro 2019", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", 4.5, "caffeine-anchor", 4.5, "GENUINE"),
    ("Caffeine", "caffeine", "Acheampong 2016", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", 7.2, "caffeine-anchor", 7.2, "GENUINE"),
    ("Caffeine", "caffeine", "Srdjenovic 2008", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", 9.0, "caffeine-anchor", 9.0, "GENUINE"),
    ("Caffeine", "caffeine", "Scott & Marks 1984", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", 18.0, "caffeine-anchor", 18.0, "GENUINE"),
    ("Theophylline", "methylxanthine", "Scott & Marks 1984", "CN1C=NC2=C1C(=O)[NH]C(=O)N2C", 9.4, "caffeine-anchor", 18.0, "ANOMALY"),
    ("Theophylline", "methylxanthine", "Srdjenovic 2008", "CN1C=NC2=C1C(=O)[NH]C(=O)N2C", 5.8, "caffeine-anchor", 9.0, "ANOMALY"),
    ("Theobromine", "methylxanthine", "Scott & Marks 1984", "CN1C=NC2=C1C(=O)NC(=O)N2C", 5.4, "caffeine-anchor", 18.0, "ANOMALY"),
    ("Theobromine", "methylxanthine", "Srdjenovic 2008", "CN1C=NC2=C1C(=O)NC(=O)N2C", 4.2, "caffeine-anchor", 9.0, "ANOMALY"),
    ("Paraxanthine", "methylxanthine", "Scott & Marks 1984", "CN1C=NC2=C1C(=O)NC(=O)N2", 8.0, "caffeine-anchor", 18.0, "ANOMALY"),
    ("Aspirin", "aspirin", "Singh 2012", "CC(=O)Oc1ccccc1C(=O)O", 2.60, "median-anchor fallback", 4.40, "GENUINE"),
    ("Aspirin", "aspirin", "Musumeci 2021", "CC(=O)Oc1ccccc1C(=O)O", 5.80, "median-anchor fallback", 4.45, "GENUINE"),
    ("Salicylic acid", "salicylate", "Singh 2012", "OC(=O)c1ccccc1O", 1.42, "median-anchor fallback", 4.40, "ANOMALY"),
    ("Salicylic acid", "salicylate", "Musumeci 2021", "OC(=O)c1ccccc1O", 3.10, "median-anchor fallback", 4.45, "ANOMALY"),
    ("Acetylsalicylsalicylic acid", "salicylate", "Singh 2012", "CC(=O)Oc1ccccc1C(=O)Oc1ccccc1C(=O)O", 8.35, "median-anchor fallback", 4.40, "ANOMALY"),
    ("Salsalate", "salicylate", "Singh 2012", "OC(=O)c1ccccc1OC(=O)c1ccccc1O", 6.20, "median-anchor fallback", 4.40, "ANOMALY"),
]


def run_layer2() -> pd.DataFrame:
    rt_model = joblib.load(MODEL_DIR / "rt_predictor.pkl")
    rt_scaler = joblib.load(MODEL_DIR / "scaler.pkl")
    anomaly_model = joblib.load(MODEL_DIR / "anomaly_classifier.pkl")
    classifier_scaler = joblib.load(MODEL_DIR / "scaler_classifier.pkl")
    rows = []
    for compound, family, paper, smiles, raw_min, method, anchor_min, true_label in SAMPLES:
        scale = DESTINATION_CAFFEINE_RT / (anchor_min * 60.0)
        normalized_rt = raw_min * 60.0 * scale
        mol = Chem.MolFromSmiles(smiles)
        features = np.asarray(features_dict_to_list(compute_features(mol)), dtype=float).reshape(1, -1)
        predicted_rt = float(rt_model.predict(rt_scaler.transform(features))[0])
        pct_deviation = abs(normalized_rt - predicted_rt) / max(abs(predicted_rt), 1e-6) * 100.0
        classifier_input = np.hstack([features, [[normalized_rt, pct_deviation]]])
        probability = float(anomaly_model.predict_proba(classifier_scaler.transform(classifier_input))[0, 1])
        predicted_label = "ANOMALY" if probability >= THRESHOLD else "GENUINE"
        rows.append({
            "compound_name": compound,
            "family": family,
            "source_paper": paper,
            "raw_literature_rt_min": raw_min,
            "raw_literature_rt_s": raw_min * 60.0,
            "normalization_method": method,
            "anchor_rt_min": anchor_min,
            "anchor_scale_factor": scale,
            "normalized_rt_s": normalized_rt,
            "predicted_rt_s": predicted_rt,
            "pct_deviation": pct_deviation,
            "anomaly_probability": probability,
            "true_label": true_label,
            "predicted_label": predicted_label,
        })
    results = pd.DataFrame(rows)
    results["correct"] = results["true_label"] == results["predicted_label"]
    DATA_DIR.mkdir(exist_ok=True)
    results.to_csv(CSV_PATH, index=False)
    tp = int(((results.true_label == "ANOMALY") & (results.predicted_label == "ANOMALY")).sum())
    tn = int(((results.true_label == "GENUINE") & (results.predicted_label == "GENUINE")).sum())
    fp = int(((results.true_label == "GENUINE") & (results.predicted_label == "ANOMALY")).sum())
    fn = int(((results.true_label == "ANOMALY") & (results.predicted_label == "GENUINE")).sum())
    accuracy = (tp + tn) / len(results)
    fpr = fp / (fp + tn)
    print(f"Layer 2: accuracy={accuracy:.6f}, FPR={fpr:.6f}, TP={tp}, TN={tn}, FP={fp}, FN={fn}")
    print(results[results.compound_name == "Aspirin"].to_string(index=False))
    return results


def save_figures(results: pd.DataFrame) -> None:
    FIG_DIR.mkdir(exist_ok=True)
    info = json.loads((MODEL_DIR / "classifier_info.json").read_text(encoding="utf-8"))
    cm = np.array([[14364, 743], [1286, 14295]])
    plt.figure(figsize=(7, 6))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", cbar=False,
                xticklabels=["Predicted Genuine", "Predicted Anomaly"],
                yticklabels=["Actual Genuine", "Actual Anomaly"])
    plt.title("Phase 1 Synthetic Classifier\nAUC=0.9805 | F1=0.9337 | threshold=0.50")
    plt.xlabel("Predicted label")
    plt.ylabel("Actual label")
    plt.tight_layout()
    plt.savefig(FIG_DIR / "confusion_matrix_synthetic.png", dpi=300)
    plt.close()

    table = results[["compound_name", "family", "true_label", "predicted_label", "anomaly_probability"]].copy()
    table["anomaly_probability"] = table["anomaly_probability"].map(lambda value: f"{value:.4f}")
    fig, ax = plt.subplots(figsize=(13, 6))
    ax.axis("off")
    rendered = ax.table(cellText=table.values, colLabels=table.columns, loc="center", cellLoc="center")
    rendered.auto_set_font_size(False)
    rendered.set_fontsize(9)
    rendered.scale(1, 1.7)
    for cell in rendered.get_celld().values():
        cell.set_edgecolor("#cccccc")
    for column in range(len(table.columns)):
        rendered[(0, column)].set_facecolor("#234e70")
        rendered[(0, column)].get_text().set_color("white")
    for row_index, is_fp in enumerate((table.true_label == "GENUINE") & (table.predicted_label == "ANOMALY"), start=1):
        if is_fp:
            for column in range(len(table.columns)):
                rendered[(row_index, column)].set_facecolor("#ffd6d6")
    plt.title("Layer 2 ICH Q1A Validation: Per-Sample Results\nFalse positives highlighted", pad=20)
    plt.tight_layout()
    plt.savefig(FIG_DIR / "layer2_results_table.png", dpi=300, bbox_inches="tight")
    plt.close()

    metrics = ["Accuracy", "FPR"]
    original = [100.0, 0.0]
    corrected = [86.7, 33.3]
    x = np.arange(len(metrics))
    width = 0.36
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.bar(x - width / 2, original, width, label="Originally Reported", color="#7fbf7b")
    ax.bar(x + width / 2, corrected, width, label="Corrected (verified tonight)", color="#e6a23c")
    ax.set_xticks(x, metrics)
    ax.set_ylim(0, 110)
    ax.set_ylabel("Percent")
    ax.set_title("Layer 2 Validation: Reported vs Corrected")
    ax.legend()
    for offset, values in [(-width / 2, original), (width / 2, corrected)]:
        for i, value in enumerate(values):
            ax.text(i + offset, value + 3, f"{value:.1f}%", ha="center")
    plt.tight_layout()
    plt.savefig(FIG_DIR / "layer2_summary_bar.png", dpi=300)
    plt.close()

    diagnostic = pd.DataFrame([
        ["RIBITOL", "0191", 52.8, 52.8, 691.843, 92.368, 0.999758],
        ["Glycodeoxycholic acid", "0311", 279.3, 279.3, 742.569, 62.387, 0.999437],
        ["Dicrotophos", "0382", 270.0, 270.0, 664.945, 59.395, 0.999693],
        ["BIOTIN", "0149", 738.0, 738.0, 637.360, 15.790, 0.968197],
        ["Unknown", "0425", 633.0, 633.0, 875.793, 27.723, 0.999543],
        ["9-Oxo-10(E),12(E)-octadecadienoic acid", "0217", 670.020, 670.020, 1084.554, 38.222, 0.999703],
        ["Unknown", "0186", 600.1, 600.1, 604.956, 0.803, 0.002246],
        ["piperine", "0390", 275.664, 242.847, 822.416, 66.481, 0.999529],
        ["Progesterone", "0044", 94.8, 94.8, 1075.468, 91.185, 0.999255],
        ["RIBITOL", "0180", 59.4, 59.4, 691.843, 91.414, 0.999758],
    ], columns=["Compound", "Dataset", "RT sec", "Local median", "Predicted RT", "Deviation %", "Anomaly probability"])
    fig, ax = plt.subplots(figsize=(14, 6))
    ax.axis("off")
    rendered = ax.table(cellText=diagnostic.round(4).values, colLabels=diagnostic.columns, loc="center", cellLoc="center")
    rendered.auto_set_font_size(False)
    rendered.set_fontsize(8)
    rendered.scale(1, 1.7)
    for column in range(len(diagnostic.columns)):
        rendered[(0, column)].set_facecolor("#234e70")
        rendered[(0, column)].get_text().set_color("white")
    plt.title("RepoRT Genuine-Sample Diagnostic: Cross-System RT Mismatch", pad=20)
    plt.tight_layout()
    plt.savefig(FIG_DIR / "layer1_diagnostic.png", dpi=300, bbox_inches="tight")
    plt.close()

    summary = pd.DataFrame([
        ["Core Classifier", "VERIFIED", "AUC 0.98", "#c6efce"],
        ["Layer 2 ICH Q1A", "CORRECTED", "86.7% accuracy", "#ffeb9c"],
        ["Layer 1 RepoRT", "INVALID AS PUBLISHED", "Cross-system RT mismatch", "#ffc7ce"],
    ], columns=["Layer", "Status", "Evidence", "Color"])
    fig, ax = plt.subplots(figsize=(12, 4.5))
    ax.axis("off")
    rendered = ax.table(cellText=summary.iloc[:, :3].values, colLabels=summary.columns[:3], loc="center", cellLoc="left", colWidths=[0.25, 0.28, 0.47])
    rendered.auto_set_font_size(False)
    rendered.set_fontsize(12)
    rendered.scale(1, 2.3)
    for column in range(3):
        rendered[(0, column)].set_facecolor("#234e70")
        rendered[(0, column)].get_text().set_color("white")
    for row_index, color in enumerate(summary["Color"], start=1):
        for column in range(3):
            rendered[(row_index, column)].set_facecolor(color)
    plt.title("BioToken Validation Status Summary", pad=20, fontsize=16)
    plt.tight_layout()
    plt.savefig(FIG_DIR / "pipeline_verification_summary.png", dpi=300, bbox_inches="tight")
    plt.close()

    for filename in ["confusion_matrix_synthetic.png", "layer2_results_table.png", "layer2_summary_bar.png", "layer1_diagnostic.png", "pipeline_verification_summary.png"]:
        print(f"Saved: {FIG_DIR / filename}")


if __name__ == "__main__":
    save_figures(run_layer2())