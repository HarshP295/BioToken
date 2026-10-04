"""Tests for src/verifier.py (requires trained models)."""

import pytest

from src.features import compute_features, features_dict_to_list, smiles_to_mol
from src.verifier import get_classifier_info, models_loaded, verify_from_smiles, verify_reagent

CAFFEINE_SMILES = "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"

pytestmark = pytest.mark.skipif(not models_loaded(), reason="Trained models not present")


def _caffeine_predicted_rt() -> float:
    # Caffeine is not in METLIN SMRT, so the RT predictor's own estimate is
    # used as the "genuine" observation.
    return verify_from_smiles(CAFFEINE_SMILES, 600.0)["predicted_rt"]


def test_classifier_metadata_matches_paper():
    info = get_classifier_info()
    assert info["auc"] == 0.9798
    assert info["f1"] == 0.9351
    assert info["threshold"] == 0.5
    assert info["n_features"] == 139


def test_verify_reagent_returns_required_keys():
    features = features_dict_to_list(compute_features(smiles_to_mol(CAFFEINE_SMILES)))
    result = verify_reagent(features, 600.0)
    assert {
        "predicted_rt", "observed_rt", "pct_deviation",
        "anomaly_prob", "threshold", "genuine", "result",
    } <= result.keys()


def test_caffeine_predicted_rt_is_stable():
    assert _caffeine_predicted_rt() == pytest.approx(636.2, abs=0.5)


def test_caffeine_genuine_at_predicted_rt():
    result = verify_from_smiles(CAFFEINE_SMILES, _caffeine_predicted_rt())
    assert result["genuine"] is True
    assert result["result"] == "GENUINE"


@pytest.mark.parametrize("shift", [1.35, 0.65])
def test_large_rt_shift_flagged_as_anomaly(shift):
    result = verify_from_smiles(CAFFEINE_SMILES, _caffeine_predicted_rt() * shift)
    assert result["genuine"] is False
    assert result["result"] == "ANOMALY"


def test_rejects_wrong_feature_count():
    with pytest.raises(ValueError):
        verify_reagent([0.0] * 136, 600.0)


def test_rejects_non_positive_rt():
    with pytest.raises(ValueError):
        verify_from_smiles(CAFFEINE_SMILES, 0.0)


def test_invalid_smiles_raises():
    with pytest.raises(ValueError):
        verify_from_smiles("not_a_smiles", 600.0)
