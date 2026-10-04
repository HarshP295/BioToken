"""
Layer 2: ICH Q1A forced-degradation proof-of-concept (paper section 5.2).

Every literature RT is evaluated through the same verify_from_smiles()
interface the backend uses, with the frozen models in ai/models.

Normalisation (paper rule): a linear, within-paper anchor that maps the
genuine parent's measured RT in the same paper onto the parent's RT on the
METLIN SMRT scale:  RT_norm = RT_lit * (RT_parent_SMRT / RT_parent_lit).

Neither caffeine nor aspirin occurs in METLIN SMRT (checked by exact InChI),
so RT_parent_SMRT is the RT predictor's own estimate for the parent. As a
consequence the genuine parents land at 0% deviation by construction; only
the nine degradation products test the classifier. For transparency the run
is repeated with the paper's literal 437.1 s caffeine anchor, which is not a
caffeine value in SMRT.

Usage (from repo root):  python ai/layer2_validation_logged.py
"""

from __future__ import annotations

import sys
import warnings
from pathlib import Path

import matplotlib
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[1]
AI_ROOT = ROOT / "ai"
sys.path.insert(0, str(AI_ROOT))
from src.verifier import verify_from_smiles  # noqa: E402

CSV_PATH = AI_ROOT / "data" / "layer2_results.csv"
FIG_DIR = ROOT / "figures"
PAPER_CAFFEINE_ANCHOR_S = 437.1

# PubChem isomeric SMILES. Earlier versions of this file used theobromine's
# SMILES for theophylline and 7-methylxanthine's for paraxanthine.
SMILES = {
    "Caffeine": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",                    # CID 2519
    "Theophylline": "CN1C2=C(C(=O)N(C1=O)C)NC=N2",                 # CID 2153
    "Theobromine": "CN1C=NC2=C1C(=O)NC(=O)N2C",                    # CID 5429
    "Paraxanthine": "CN1C=NC2=C1C(=O)N(C(=O)N2)C",                 # CID 4687
    "Aspirin": "CC(=O)OC1=CC=CC=C1C(=O)O",                         # CID 2244
    "Salicylic acid": "OC(=O)C1=CC=CC=C1O",                        # CID 338
    "Acetylsalicylsalicylic acid": "CC(=O)OC1=CC=CC=C1C(=O)OC1=CC=CC=C1C(=O)O",
    "Salsalate": "OC(=O)C1=CC=CC=C1OC(=O)C1=CC=CC=C1O",            # CID 5161
}
PARENT = {"methylxanthine": "Caffeine", "salicylate": "Aspirin"}

# (compound, family, source, literature RT in minutes, true label)
SAMPLES = [
    ("Caffeine", "methylxanthine", "Ribeiro 2019", 4.5, "GENUINE"),
    ("Caffeine", "methylxanthine", "Acheampong 2016", 7.2, "GENUINE"),
    ("Caffeine", "methylxanthine", "Srdjenovic 2008", 9.0, "GENUINE"),
    ("Caffeine", "methylxanthine", "Scott & Marks 1984", 18.0, "GENUINE"),
    ("Theophylline", "methylxanthine", "Scott & Marks 1984", 9.4, "ANOMALY"),
    ("Theophylline", "methylxanthine", "Srdjenovic 2008", 5.8, "ANOMALY"),
    ("Theobromine", "methylxanthine", "Scott & Marks 1984", 5.4, "ANOMALY"),
    ("Theobromine", "methylxanthine", "Srdjenovic 2008", 4.2, "ANOMALY"),
    ("Paraxanthine", "methylxanthine", "Scott & Marks 1984", 8.0, "ANOMALY"),
    ("Aspirin", "salicylate", "Singh 2012", 2.60, "GENUINE"),
    ("Aspirin", "salicylate", "Musumeci 2021", 5.80, "GENUINE"),
    ("Salicylic acid", "salicylate", "Singh 2012", 1.42, "ANOMALY"),
    ("Salicylic acid", "salicylate", "Musumeci 2021", 3.10, "ANOMALY"),
    ("Acetylsalicylsalicylic acid", "salicylate", "Singh 2012", 8.35, "ANOMALY"),
    ("Salsalate", "salicylate", "Singh 2012", 6.20, "ANOMALY"),
]


def _parent_lit_rt(family: str, source: str) -> float:
    parent = PARENT[family]
    return next(rt for c, _, s, rt, _ in SAMPLES if c == parent and s == source)


def run(destination: dict[str, float], protocol: str) -> pd.DataFrame:
    rows = []
    for compound, family, source, rt_min, true_label in SAMPLES:
        scale = destination[family] / (_parent_lit_rt(family, source) * 60.0)
        normalized_rt = rt_min * 60.0 * scale
        result = verify_from_smiles(SMILES[compound], normalized_rt)
        rows.append({
            "protocol": protocol,
            "compound_name": compound,
            "family": family,
            "source_paper": source,
            "raw_literature_rt_min": rt_min,
            "parent_literature_rt_min": _parent_lit_rt(family, source),
            "destination_anchor_s": destination[family],
            "anchor_scale_factor": scale,
            "normalized_rt_s": normalized_rt,
            "predicted_rt_s": result["predicted_rt"],
            "pct_deviation": result["pct_deviation"],
            "anomaly_probability": result["anomaly_prob"],
            "true_label": true_label,
            "predicted_label": result["result"],
        })
    df = pd.DataFrame(rows)
    df["correct"] = df["true_label"] == df["predicted_label"]
    return df


def summarize(df: pd.DataFrame) -> str:
    t, p = df["true_label"], df["predicted_label"]
    tp = int(((t == "ANOMALY") & (p == "ANOMALY")).sum())
    tn = int(((t == "GENUINE") & (p == "GENUINE")).sum())
    fp = int(((t == "GENUINE") & (p == "ANOMALY")).sum())
    fn = int(((t == "ANOMALY") & (p == "GENUINE")).sum())
    return (f"accuracy {tp + tn}/{len(df)} ({(tp + tn) / len(df):.1%}), "
            f"FPR {fp}/{fp + tn} ({fp / (fp + tn):.1%}), TP={tp} TN={tn} FP={fp} FN={fn}")


def save_table(df: pd.DataFrame) -> None:
    table = df[["compound_name", "source_paper", "normalized_rt_s", "predicted_rt_s",
                "pct_deviation", "anomaly_probability", "true_label", "predicted_label"]].copy()
    for col in ["normalized_rt_s", "predicted_rt_s", "pct_deviation"]:
        table[col] = table[col].map(lambda v: f"{v:.1f}")
    table["anomaly_probability"] = table["anomaly_probability"].map(lambda v: f"{v:.3f}")
    fig, ax = plt.subplots(figsize=(14, 6))
    ax.axis("off")
    rendered = ax.table(cellText=table.values, colLabels=table.columns, loc="center", cellLoc="center")
    rendered.auto_set_font_size(False)
    rendered.set_fontsize(9)
    rendered.scale(1, 1.6)
    for column in range(len(table.columns)):
        rendered[(0, column)].set_facecolor("#234e70")
        rendered[(0, column)].get_text().set_color("white")
    for row_index, ok in enumerate(df["correct"], start=1):
        if not ok:
            for column in range(len(table.columns)):
                rendered[(row_index, column)].set_facecolor("#ffd6d6")
    plt.title("Layer 2 (ICH Q1A degradation): parent-anchored normalisation\n" + summarize(df), pad=20)
    plt.tight_layout()
    FIG_DIR.mkdir(exist_ok=True)
    plt.savefig(FIG_DIR / "layer2_results_table.png", dpi=200, bbox_inches="tight")
    plt.close()


def main() -> None:
    predicted_parent = {
        family: verify_from_smiles(SMILES[parent], 600.0)["predicted_rt"]
        for family, parent in PARENT.items()
    }
    parent_anchored = run(predicted_parent, "parent-anchor (predicted parent RT)")
    paper_literal = run(
        {"methylxanthine": PAPER_CAFFEINE_ANCHOR_S, "salicylate": predicted_parent["salicylate"]},
        "paper literal 437.1 s caffeine anchor",
    )

    print("Destination anchors (predicted, parents absent from SMRT):",
          {k: round(v, 1) for k, v in predicted_parent.items()})
    for df in (parent_anchored, paper_literal):
        print(f"\n[{df['protocol'].iloc[0]}] {summarize(df)}")
        print(df[["compound_name", "source_paper", "normalized_rt_s", "predicted_rt_s",
                  "pct_deviation", "anomaly_probability", "predicted_label", "true_label"]]
              .round(3).to_string(index=False))

    results = pd.concat([parent_anchored, paper_literal], ignore_index=True)
    CSV_PATH.parent.mkdir(exist_ok=True)
    results.to_csv(CSV_PATH, index=False)
    save_table(parent_anchored)
    print(f"\nSaved {CSV_PATH}\nSaved {FIG_DIR / 'layer2_results_table.png'}")


if __name__ == "__main__":
    main()
