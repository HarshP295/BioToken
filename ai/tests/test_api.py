"""Tests for the FastAPI AI endpoints used by the lab dashboard."""

import pytest
from fastapi.testclient import TestClient

from api import app

client = TestClient(app)

CAFFEINE_SMILES = "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"


def test_health_reports_loaded_models():
    data = client.get("/health").json()
    assert data["models_loaded"] is True
    assert data["status"] == "ok"
    assert data["classifier_auc"] == 0.9798
    assert data["rt_predictor_r2"] == 0.7706


def test_compute_features_from_smiles():
    response = client.post("/compute-features", json={"smiles": CAFFEINE_SMILES, "observed_rt": 636.2})
    assert response.status_code == 200
    data = response.json()
    assert len(data["observed_features"]) == 137
    assert data["observed_rt"] == 636.2
    assert data["observed_features"][0] == pytest.approx(194.19, abs=0.1)  # mol_weight first


def test_compute_features_invalid_smiles_returns_422():
    response = client.post("/compute-features", json={"smiles": "not_valid_smiles", "observed_rt": 100.0})
    assert response.status_code == 422


def test_compute_features_rejects_non_positive_rt():
    response = client.post("/compute-features", json={"smiles": CAFFEINE_SMILES, "observed_rt": -5})
    assert response.status_code == 422


def test_compute_features_no_longer_accepts_peaks_only():
    response = client.post("/compute-features", json={"peaks": [1] * 10})
    assert response.status_code == 422


def _verify(rt: float) -> dict:
    features = client.post(
        "/compute-features", json={"smiles": CAFFEINE_SMILES, "observed_rt": rt}
    ).json()
    response = client.post("/verify", json={**features, "token_id": 1})
    assert response.status_code == 200
    return response.json()


def test_verify_genuine_and_anomaly_paths():
    genuine = _verify(636.2)
    assert genuine["genuine"] is True and genuine["result"] == "GENUINE"
    assert "zk_proof" not in genuine

    anomaly = _verify(636.2 * 1.35)
    assert anomaly["genuine"] is False and anomaly["result"] == "ANOMALY"


def test_verify_rejects_wrong_feature_count():
    response = client.post("/verify", json={"observed_features": [0.0] * 10, "observed_rt": 600, "token_id": 1})
    assert response.status_code == 400


def test_extract_peaks_from_chromatogram_csv():
    rows = ["time,intensity"] + [f"{i * 0.1:.1f},{(i % 7) * 10 + i}" for i in range(80)]
    response = client.post(
        "/extract-peaks",
        files={"file": ("scan.csv", "\n".join(rows).encode(), "text/csv")},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["peaks"]) == 10
    assert all(0 <= p <= 255 for p in data["peaks"])
    assert 50 <= data["threshold"] <= 255


def test_extract_peaks_rejects_non_csv():
    response = client.post("/extract-peaks", files={"file": ("scan.txt", b"1,2", "text/plain")})
    assert response.status_code == 400
