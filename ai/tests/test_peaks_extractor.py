"""Tests for src/peaks_extractor.py."""

from src.peaks_extractor import (
    extract_peaks,
    peaks_from_intensities,
    validate_against_gold_standard,
)


def test_extract_peaks_returns_exactly_n_peaks():
    signal = [0, 0, 1, 0, 5, 0, 3, 0, 2, 0, 4]
    peaks = extract_peaks(signal, list(range(len(signal))), n_peaks=10)
    assert len(peaks) == 10


def test_extract_peaks_values_in_range_0_to_scale_max():
    signal = [0, 0, 1, 0, 5, 0, 3, 0, 2, 0, 4]
    peaks = extract_peaks(signal, list(range(len(signal))), n_peaks=10, scale_max=1000)
    assert all(0 <= p <= 1000 for p in peaks)
    assert max(peaks) == 1000


def test_extract_peaks_pads_with_zeros_when_fewer_peaks_found():
    signal = [0, 0, 1, 0, 0]
    peaks = extract_peaks(signal, list(range(len(signal))), n_peaks=10)
    assert len(peaks) == 10
    assert peaks.count(0) >= 9


GOLD = [255, 242, 237, 232, 227, 222, 218, 212, 208, 200]


def test_validate_gold_standard_passes_within_tolerance():
    lab = [255, 241, 239, 230, 228, 223, 216, 210, 207, 201]
    assert validate_against_gold_standard(lab, GOLD, tolerance=10) is True


def test_validate_gold_standard_fails_when_one_peak_is_off():
    lab = GOLD[:9] + [GOLD[9] + 11]
    assert validate_against_gold_standard(lab, GOLD, tolerance=10) is False


def test_validate_gold_standard_rejects_out_of_range_values():
    assert validate_against_gold_standard([300] + GOLD[1:], [300] + GOLD[1:], tolerance=10) is False


def test_peaks_from_intensities_sorts_pads_and_scales():
    peaks = peaks_from_intensities([10.0, 40.0, 20.0], n_peaks=10, scale_max=255)
    assert peaks[:3] == [255, 127, 63]
    assert peaks[3:] == [0] * 7
