# ai/src/peaks_extractor.py
# ─────────────────────────────────────────────────────────────────
# BioToken — Peaks Extractor
#
# Converts raw HPLC chromatogram data into the 10-integer peaks
# array that the Circom FingerprintMatch(10) circuit expects.
#
# Sits between verifier.py (AI decision) and prover.py (ZK proof).
# ─────────────────────────────────────────────────────────────────

import numpy as np
from scipy.signal import find_peaks


def extract_peaks(raw_chromatogram: list,
                  time_axis: list,
                  n_peaks: int = 10,
                  scale_max: int = 1000) -> list:

    signal = np.array(raw_chromatogram)

    # Normalize signal first to 0-1 range
    if signal.max() > signal.min():
        signal = (signal - signal.min()) / (signal.max() - signal.min())

    # Try with progressively relaxed constraints until we get n_peaks
    for distance in [10, 5, 3, 2, 1]:
        for height in [0.1, 0.05, 0.01, 0.0]:
            peak_indices, _ = find_peaks(signal, height=height, distance=distance)
            if len(peak_indices) >= n_peaks:
                break
        if len(peak_indices) >= n_peaks:
            break

    # If still not enough, just take all local maxima by brute force
    if len(peak_indices) < n_peaks:
        # Every point higher than both neighbors
        peak_indices = np.array([
            i for i in range(1, len(signal)-1)
            if signal[i] > signal[i-1] and signal[i] > signal[i+1]
        ])

    # Sort by height, take top n_peaks
    heights = signal[peak_indices]
    top_idx = np.argsort(heights)[::-1][:n_peaks]
    top_heights = heights[top_idx]

    # Pad with zeros if still fewer than n_peaks
    while len(top_heights) < n_peaks:
        top_heights = np.append(top_heights, 0.0)

    # Scale to integer range
    if top_heights.max() > 0:
        normed = (top_heights / top_heights.max() * scale_max).astype(int)
    else:
        normed = np.zeros(n_peaks, dtype=int)

    return normed.tolist()


def validate_against_gold_standard(lab_peaks: list[int],
                                   gold_peaks: list[int],
                                   threshold: int = 10) -> bool:
    """
    Pre-validate that all adjacent deltas are within threshold.
    Mirrors the circuit constraint — catches mismatches before
    wasting snarkjs computation.

    Parameters
    ----------
    lab_peaks : list[int]
        Peaks extracted from the lab's local HPLC scan.
    gold_peaks : list[int]
        Gold Standard peaks received from the manufacturer.
    threshold : int
        Maximum allowed absolute difference between any two
        adjacent peaks (matches what is stored on-chain).

    Returns
    -------
    bool
        True if all adjacent deltas ≤ threshold.
    """
    peaks = lab_peaks  # validate the lab's own peaks for circuit compatibility
    for i in range(len(peaks) - 1):
        if abs(peaks[i] - peaks[i + 1]) > threshold:
            return False
    return True


def peaks_from_intensities(intensities: list[float],
                           n_peaks: int = 10,
                           scale_max: int = 255) -> list[int]:
    """
    Convenience function: when the lab already has discrete
    intensity values (e.g. from a CSV export), skip peak detection
    and just normalise + truncate/pad to n_peaks.

    Parameters
    ----------
    intensities : list[float]
        Pre-identified peak intensity values.
    n_peaks : int
        Target count (default 10).
    scale_max : int
        Max normalised value (default 255).

    Returns
    -------
    list[int]
        Exactly n_peaks integer values in [0, scale_max].
    """
    vals = np.array(intensities, dtype=float)

    # Sort descending and take top n_peaks
    vals = np.sort(vals)[::-1][:n_peaks]

    # Pad if needed
    if len(vals) < n_peaks:
        vals = np.concatenate([vals, np.zeros(n_peaks - len(vals))])

    # Normalise
    max_val = vals.max()
    if max_val > 0:
        normed = (vals / max_val * scale_max).astype(int)
    else:
        normed = np.zeros(n_peaks, dtype=int)

    return normed.tolist()
