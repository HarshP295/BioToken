"""Tests for the FastAPI AI endpoints used by the lab dashboard."""

import time

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
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


def test_verify_requires_smiles_or_features():
    assert client.post("/verify", json={"observed_rt": 600, "token_id": 1}).status_code == 422


# ── Peak extraction (mirrors frontend/src/lib/hplcParser.js) ────────────

def _chromatogram(n_peaks: int, sci: bool = False) -> bytes:
    rows = ["Time (min),Absorbance (mAU)"]
    for i in range(n_peaks * 10):
        value = 100 + (i % 10 == 5) * (1000 - 10 * (i // 10))   # one peak every 10 rows
        rows.append(f"{i * 0.1:.2e},{value:.4e}" if sci else f"{i * 0.1:.1f},{value}")
    return "\n".join(rows).encode()


def test_extract_peaks_from_chromatogram_csv():
    response = client.post("/extract-peaks", files={"file": ("scan.csv", _chromatogram(12), "text/csv")})
    assert response.status_code == 200
    peaks = response.json()["peaks"]
    assert len(peaks) == 10 and peaks[0] == 255
    assert peaks == sorted(peaks, reverse=True)
    assert "threshold" not in response.json()


def test_extract_peaks_accepts_scientific_notation():
    response = client.post("/extract-peaks", files={"file": ("export.csv", _chromatogram(12, sci=True), "text/csv")})
    assert response.status_code == 200
    assert len(response.json()["peaks"]) == 10


def test_extract_peaks_rejects_too_few_peaks_instead_of_padding():
    response = client.post("/extract-peaks", files={"file": ("scan.csv", _chromatogram(5), "text/csv")})
    assert response.status_code == 400


def test_extract_peaks_rejects_non_csv():
    response = client.post("/extract-peaks", files={"file": ("scan.txt", b"1,2", "text/plain")})
    assert response.status_code == 400


# ── Signed AI verdict ───────────────────────────────────────────────────

ORACLE_KEY = "0x" + "11" * 32
CONTRACT = "0x" + "ab" * 20


@pytest.fixture
def oracle(monkeypatch):
    import api
    monkeypatch.setattr(api, "AI_ORACLE_KEY", ORACLE_KEY)
    return Account.from_key(ORACLE_KEY).address


def _verify_smiles(rt, token_id=5):
    return client.post("/verify", json={
        "smiles": CAFFEINE_SMILES, "observed_rt": rt, "token_id": token_id,
        "chain_id": 80002, "contract_address": CONTRACT,
    }).json()


def test_genuine_verdict_is_signed_for_chain_contract_token_and_reagent(oracle):
    import api
    result = _verify_smiles(636.2)
    assert result["genuine"] is True and result["oracle"] == oracle
    digest = api.ai_verdict_digest(80002, CONTRACT, 5, CAFFEINE_SMILES)
    signer = Account.recover_message(encode_defunct(primitive=digest), signature=result["attestation"])
    assert signer == oracle
    other = api.ai_verdict_digest(80002, CONTRACT, 6, CAFFEINE_SMILES)
    assert Account.recover_message(encode_defunct(primitive=other), signature=result["attestation"]) != oracle


def test_anomaly_verdict_is_not_signed(oracle):
    result = _verify_smiles(636.2 * 1.35)
    assert result["genuine"] is False and result["attestation"] is None


def test_feature_only_requests_are_never_signed(oracle):
    features = client.post("/compute-features", json={"smiles": CAFFEINE_SMILES, "observed_rt": 636.2}).json()
    result = client.post("/verify", json={
        "observed_features": features["observed_features"], "observed_rt": 636.2, "token_id": 1,
    }).json()
    assert result["genuine"] is True and result["attestation"] is None


# ── Role registration: signed by the wallet, granted to the smart account ──

WALLET_KEY = "0x" + "22" * 32
EOA = Account.from_key(WALLET_KEY).address.lower()
SMART = "0x2222222222222222222222222222222222222222"


class _FakeUsers:
    def __init__(self):
        self.docs = {}

    async def update_one(self, flt, update, upsert=False):
        key = flt["walletAddress"]
        if key in self.docs or upsert:
            self.docs.setdefault(key, {}).update(update["$set"])

    async def find_one(self, flt, projection=None):
        return dict(self.docs[flt["walletAddress"]]) if flt["walletAddress"] in self.docs else None


@pytest.fixture
def role_env(monkeypatch):
    import api
    users, grants = _FakeUsers(), []
    monkeypatch.setattr(api, "users_collection", users)
    monkeypatch.setattr(api, "grant_onchain_role", lambda addr, role: grants.append((addr.lower(), role)) or "0xabc")
    monkeypatch.setenv("VITE_CONTRACT_ADDRESS", CONTRACT)
    monkeypatch.setenv("ADMIN_API_TOKEN", "secret")
    monkeypatch.setenv("ROLE_AUTO_APPROVE", "false")   # approval-flow tests; default is auto
    return users, grants


def _registration(role="lab", key=WALLET_KEY, issued_at=None, holder=SMART):
    import api
    issued_at = issued_at or int(time.time())
    wallet = Account.from_key(key).address
    message = api.registration_message(role, wallet, holder, issued_at)
    signature = Account.sign_message(encode_defunct(text=message), private_key=key).signature.hex()
    return {"wallet_address": wallet, "role": role, "smart_account_address": holder,
            "issued_at": issued_at, "signature": "0x" + signature.removeprefix("0x")}


def test_registration_waits_for_admin_approval_then_grants_to_smart_account(role_env):
    users, grants = role_env
    response = client.post("/register-role", json=_registration())
    assert response.status_code == 202 and response.json()["pending"] is True
    assert grants == []
    assert client.post(f"/api/retry-role-grant/{EOA}").status_code == 403

    assert client.post(f"/admin/approve-role/{EOA}").status_code == 401
    approved = client.post(f"/admin/approve-role/{EOA}", headers={"X-Admin-Token": "secret"})
    assert approved.status_code == 200
    assert grants == [(SMART.lower(), "lab")]
    assert users.docs[EOA]["roleHolderAddress"] == SMART.lower()
    assert users.docs[EOA]["roleContract"] == CONTRACT
    assert users.docs[EOA]["labRoleGranted"] is True


@pytest.mark.parametrize("role", ["lab", "manufacturer"])
def test_auto_approve_is_the_default_and_grants_the_chosen_role(role_env, monkeypatch, role):
    _, grants = role_env
    monkeypatch.delenv("ROLE_AUTO_APPROVE")
    response = client.post("/register-role", json=_registration(role))
    assert response.status_code == 200 and response.json()["role"] == role
    assert grants == [(SMART.lower(), role)]


def test_registration_signed_by_another_wallet_is_rejected(role_env):
    body = _registration()
    body["wallet_address"] = Account.from_key("0x" + "33" * 32).address
    assert client.post("/register-role", json=body).status_code == 401


def test_stale_registration_is_rejected(role_env):
    assert client.post("/register-role", json=_registration(issued_at=int(time.time()) - 3600)).status_code == 400


def test_reregistering_keeps_approval_and_regrants_on_new_contract(role_env, monkeypatch):
    users, grants = role_env
    client.post("/register-role", json=_registration())
    client.post(f"/admin/approve-role/{EOA}", headers={"X-Admin-Token": "secret"})
    monkeypatch.setenv("VITE_CONTRACT_ADDRESS", "0x" + "cd" * 20)   # redeploy
    again = client.post("/register-role", json=_registration())
    assert again.status_code == 200
    assert grants == [(SMART.lower(), "lab"), (SMART.lower(), "lab")]
    assert users.docs[EOA]["roleContract"] == "0x" + "cd" * 20
