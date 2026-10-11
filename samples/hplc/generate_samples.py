"""Generate the sample HPLC files used to exercise the mint and lab-verification flows.

Run from the repo root:  python samples/hplc/generate_samples.py
Outputs are deterministic (fixed seeds), so re-running reproduces the committed files.

The chromatograms are synthetic: ten Gaussian peaks on a drifting baseline,
sampled every 0.5 s. Peak heights follow the consensus baseline in
frontend/src/lib/consensusValidator.js, so the manufacturer files pass the
mint-time consensus check. The retention time of the tallest peak equals the
RT the lab types into the dashboard for that sample (see manifest.json).

Each lab scan is a fresh "measurement" of a Gold Standard: same peak profile
with ±1% height noise, so its 10 extracted peaks land within the default
tolerance (10) of the Gold Standard's. The tampered scan has four peaks 20%
lower, as from a diluted or adulterated batch.
"""

import json
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent
T = np.arange(0.0, 1200.0, 0.5)  # seconds

# Relative heights of the ten peaks (tallest first), matching the consensus
# peer means [253, 243, 237, 232, 227, 221, 217, 211, 207, 199] after the
# extractor normalises the tallest peak to 255.
REL_HEIGHTS = np.array([255, 242, 237, 232, 227, 222, 217, 211, 207, 199]) / 255
# Retention times of the nine secondary peaks; the main peak's RT is per batch.
OTHER_RTS = [180.0, 265.0, 340.0, 415.0, 505.0, 760.0, 845.0, 930.0, 1030.0]

BATCHES = {
    "BATCH-CAF-001": 636.2,         # caffeine (RT is the model's own prediction)
    "BATCH-SMRT-53193463": 603.4,   # measured METLIN SMRT RT, held-out molecule
    "BATCH-SMRT-49677779": 945.2,   # measured METLIN SMRT RT, held-out molecule
}


def chromatogram(main_rt: float, seed: int, jitter: float = 0.0, scale: dict | None = None) -> np.ndarray:
    rng = np.random.default_rng(seed)
    rts = [main_rt] + OTHER_RTS
    heights = 1000.0 * REL_HEIGHTS * (1 + rng.uniform(-jitter, jitter, 10))
    heights[0] = 1000.0  # main peak stays the tallest
    for index, factor in (scale or {}).items():
        heights[index] *= factor
    y = 2.0 + 0.004 * T  # slow baseline drift (mAU)
    for h, rt in zip(heights, rts):
        y += h * np.exp(-0.5 * ((T - rt) / 3.5) ** 2)
    return y + rng.normal(0.0, 0.05, T.size)  # detector noise


def write_csv(path: Path, y: np.ndarray) -> None:
    lines = ["Time (s),Absorbance (mAU)"] + [f"{t:.1f},{v:.3f}" for t, v in zip(T, y)]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    manufacturer, lab = OUT / "manufacturer", OUT / "lab"
    manufacturer.mkdir(exist_ok=True)
    lab.mkdir(exist_ok=True)
    for old in [*manufacturer.glob("*"), *lab.glob("*")]:
        old.unlink()

    # ── Manufacturer: Gold Standard fingerprints uploaded on the Mint page ──
    for seed, (batch, rt) in enumerate(BATCHES.items(), start=1):
        write_csv(manufacturer / f"{batch}_gold_standard.csv", chromatogram(rt, seed=seed))
    (manufacturer / "BATCH-JSON-001_gold_standard.json").write_text(json.dumps({
        "peaks": [250, 244, 238, 232, 227, 221, 216, 211, 206, 200],
    }, indent=2) + "\n", encoding="utf-8")
    (manufacturer / "NEGATIVE_consensus_fail.json").write_text(json.dumps({
        "peaks": [255, 120, 118, 230, 60, 221, 216, 90, 206, 200],
    }, indent=2) + "\n", encoding="utf-8")

    # ── Lab: scans uploaded on the Lab Dashboard ──
    write_csv(lab / "BATCH-CAF-001_lab_scan_genuine.csv", chromatogram(636.2, seed=11, jitter=0.01))
    write_csv(lab / "BATCH-CAF-001_lab_scan_rt_shifted.csv", chromatogram(827.1, seed=12, jitter=0.01))
    write_csv(lab / "BATCH-CAF-001_lab_scan_tampered.csv",
              chromatogram(636.2, seed=13, jitter=0.01, scale={2: 0.8, 4: 0.8, 6: 0.8, 8: 0.8}))
    write_csv(lab / "BATCH-SMRT-53193463_lab_scan_genuine.csv", chromatogram(603.4, seed=14, jitter=0.01))
    write_csv(lab / "BATCH-SMRT-49677779_lab_scan_genuine.csv", chromatogram(945.2, seed=15, jitter=0.01))
    write_csv(lab / "BATCH-SMRT-49677779_lab_scan_rt_shifted.csv", chromatogram(661.6, seed=16, jitter=0.01))


if __name__ == "__main__":
    main()
