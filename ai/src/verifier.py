"""Main inference interface for BioToken reagent verification."""

from pathlib import Path

import joblib
import json
import numpy as np
import pandas as pd

from src.features import ALL_FEATURES, compute_features, features_dict_to_list, smiles_to_mol

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_MODELS_DIR = _PROJECT_ROOT / "models"

CLF_FEATURES = ALL_FEATURES + ["observed_rt", "pct_deviation"]

_rt_predictor = None
_scaler = None
_anomaly_classifier = None
_scaler_classifier = None
_classifier_info = None
_model_info = None


def _check_feature_order(scaler, expected: list[str], name: str) -> None:
    """Fail loudly if a scaler was fitted on a different column order."""
    fitted = getattr(scaler, "feature_names_in_", None)
    if fitted is not None and list(fitted) != expected:
        raise RuntimeError(
            f"{name} was fitted on a different feature order than src/features.py "
            f"produces. First fitted columns: {list(fitted)[:9]}"
        )


def _load_models() -> None:
    """Load trained models once at module import."""
    global _rt_predictor, _scaler, _anomaly_classifier, _scaler_classifier
    global _classifier_info, _model_info

    rt_path = _MODELS_DIR / "rt_predictor.pkl"
    scaler_path = _MODELS_DIR / "scaler.pkl"
    classifier_path = _MODELS_DIR / "anomaly_classifier.pkl"
    scaler_classifier_path = _MODELS_DIR / "scaler_classifier.pkl"
    info_path = _MODELS_DIR / "classifier_info.json"
    model_info_path = _MODELS_DIR / "model_info.json"

    if rt_path.exists():
        _rt_predictor = joblib.load(rt_path)
    if scaler_path.exists():
        _scaler = joblib.load(scaler_path)
        _check_feature_order(_scaler, ALL_FEATURES, "scaler.pkl")
    if classifier_path.exists():
        _anomaly_classifier = joblib.load(classifier_path)
    if scaler_classifier_path.exists():
        _scaler_classifier = joblib.load(scaler_classifier_path)
        _check_feature_order(_scaler_classifier, CLF_FEATURES, "scaler_classifier.pkl")
    if info_path.exists():
        with open(info_path, encoding="utf-8") as f:
            _classifier_info = json.load(f)
    if model_info_path.exists():
        with open(model_info_path, encoding="utf-8") as f:
            _model_info = json.load(f)


def models_loaded() -> bool:
    """Return True if all required models are loaded."""
    return all(
        m is not None
        for m in (_rt_predictor, _scaler, _anomaly_classifier, _scaler_classifier, _classifier_info)
    )


def get_classifier_info() -> dict | None:
    """Return classifier metadata from classifier_info.json."""
    return _classifier_info


def get_model_info() -> dict | None:
    """Return RT predictor metadata from model_info.json."""
    return _model_info


def verify_reagent(observed_features: list[float], observed_rt: float) -> dict:
    """
    Verify a reagent against trained RT predictor and anomaly classifier.

    Args:
        observed_features: list of exactly 137 floats in ALL_FEATURES order.
        observed_rt: retention time measured at lab in seconds.

    Returns:
        dict with predicted_rt, observed_rt, pct_deviation, anomaly_prob,
        threshold, genuine, and result keys.
    """
    if _rt_predictor is None or _scaler is None:
        raise RuntimeError("RT predictor models not loaded. Run training notebooks first.")
    if _anomaly_classifier is None or _scaler_classifier is None or _classifier_info is None:
        raise RuntimeError("Anomaly classifier models not loaded. Run training notebooks first.")

    if len(observed_features) != len(ALL_FEATURES):
        raise ValueError(f"Expected {len(ALL_FEATURES)} features, got {len(observed_features)}")
    if not np.isfinite(observed_rt) or observed_rt <= 0:
        raise ValueError("observed_rt must be a positive retention time in seconds")

    threshold = float(_classifier_info.get("threshold", 0.50))
    features_df = pd.DataFrame([observed_features], columns=ALL_FEATURES, dtype=float)

    predicted_rt = float(_rt_predictor.predict(_scaler.transform(features_df))[0])

    if predicted_rt == 0:
        pct_deviation = 0.0
    else:
        pct_deviation = abs(observed_rt - predicted_rt) / predicted_rt * 100

    classifier_df = features_df.assign(observed_rt=float(observed_rt), pct_deviation=pct_deviation)
    scaled_classifier_input = _scaler_classifier.transform(classifier_df[CLF_FEATURES])
    anomaly_prob = float(_anomaly_classifier.predict_proba(scaled_classifier_input)[0, 1])

    genuine = anomaly_prob < threshold
    result = "GENUINE" if genuine else "ANOMALY"

    return {
        "predicted_rt": predicted_rt,
        "observed_rt": float(observed_rt),
        "pct_deviation": pct_deviation,
        "anomaly_prob": anomaly_prob,
        "threshold": threshold,
        "genuine": genuine,
        "result": result,
    }


def verify_from_smiles(smiles: str, observed_rt: float) -> dict:
    """Compute features from SMILES then call verify_reagent."""
    mol = smiles_to_mol(smiles)
    if mol is None:
        raise ValueError(f"Unable to parse SMILES: {smiles}")

    features = compute_features(mol)
    feature_list = features_dict_to_list(features)
    return verify_reagent(feature_list, observed_rt)


_load_models()
