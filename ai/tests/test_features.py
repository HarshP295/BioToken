"""Tests for src/features.py."""

from pathlib import Path

import joblib
import pandas as pd
import pytest
from rdkit import Chem

from src.features import (
    ALL_FEATURES,
    FP_FEATURES,
    PHYS_FEATURES,
    compute_features,
    inchi_to_mol,
    smiles_to_mol,
)

AI_DIR = Path(__file__).resolve().parent.parent
CAFFEINE_SMILES = "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"


def test_compute_features_returns_137_keys():
    features = compute_features(Chem.MolFromSmiles(CAFFEINE_SMILES))
    assert len(features) == 137


def test_feature_key_order_matches_all_features_list():
    features = compute_features(Chem.MolFromSmiles(CAFFEINE_SMILES))
    assert list(features.keys()) == ALL_FEATURES
    assert len(PHYS_FEATURES) == 9
    assert len(FP_FEATURES) == 128
    assert len(ALL_FEATURES) == 137


def test_feature_order_matches_fitted_scalers():
    scaler = joblib.load(AI_DIR / "models" / "scaler.pkl")
    scaler_clf = joblib.load(AI_DIR / "models" / "scaler_classifier.pkl")
    assert list(scaler.feature_names_in_) == ALL_FEATURES
    assert list(scaler_clf.feature_names_in_) == ALL_FEATURES + ["observed_rt", "pct_deviation"]


def test_caffeine_features_are_correct():
    features = compute_features(Chem.MolFromSmiles(CAFFEINE_SMILES))
    assert abs(features["mol_weight"] - 194.19) < 0.1
    assert features["hbd"] == 0
    assert features["logp"] < 0


def test_invalid_smiles_returns_none():
    assert smiles_to_mol("not_a_smiles") is None
    assert smiles_to_mol("") is None


@pytest.mark.skipif(
    not (AI_DIR / "data" / "SMRT_features_v2.csv").exists(),
    reason="SMRT dataset not downloaded",
)
def test_features_reproduce_training_matrix():
    """Inference-time features must equal the rows the models were trained on."""
    raw = pd.read_csv(AI_DIR / "data" / "SMRT_dataset.csv", sep=";")
    train = pd.read_csv(AI_DIR / "data" / "SMRT_features_v2.csv")
    assert list(train.columns[:-2]) == ALL_FEATURES

    sample = train.sample(n=200, random_state=0)
    for _, row in sample.iterrows():
        inchi = raw.loc[raw["pubchem"] == row["pubchem"], "inchi"].iloc[0]
        features = compute_features(inchi_to_mol(inchi))
        for key in ALL_FEATURES:
            assert features[key] == pytest.approx(row[key], abs=1e-6), (row["pubchem"], key)
