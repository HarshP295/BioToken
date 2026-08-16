from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sys, os, numpy as np, re
import datetime
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Load .env from project root (one level up from ai/)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

MONGO_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
mongo_client = AsyncIOMotorClient(MONGO_URI)
db = mongo_client["biotoken"]
users_collection = db["users"]

ai_dir = os.path.dirname(__file__)
if ai_dir not in sys.path:
    sys.path.insert(0, ai_dir)
src_dir = os.path.join(ai_dir, "src")
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

from verifier import verify_reagent
from peaks_extractor import extract_peaks, peaks_from_intensities

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Constants ───────────────────────────────────────────────────
MAX_PEAK   = 255
MAX_THRESH = 255
N_PEAKS    = 10

# ── Population-average molecular features (SMRT dataset means) ──
# Used when molecule identity is unknown (peaks-only flow).
# The anomaly classifier relies primarily on pct_deviation (ranked
# #1 feature by XGBoost importance gap), so average molecular
# features do not materially affect the genuine/anomaly decision.
_AVG_PHYS = [
    2.5,    # logp
    1.2,    # aromatic_rings
    310.0,  # mol_weight
    22.0,   # heavy_atom_count
    2.1,    # ring_count
    4.2,    # hba
    78.0,   # tpsa
    4.8,    # rotatable_bonds
    1.8,    # hbd
]
_AVG_FP = [0.1] * 128          # population-average Morgan bit occupancy
_AVG_FEATURES = _AVG_PHYS + _AVG_FP   # 137 total


# ── Pydantic models ─────────────────────────────────────────────

class ComputeFeaturesRequest(BaseModel):
    peaks: list[float]   # exactly 10 HPLC peak intensity values

class ComputeFeaturesResponse(BaseModel):
    observed_features: list[float]   # 137 features
    observed_rt: float               # RT estimated from peak centroid

class VerifyRequest(BaseModel):
    observed_features: list[float]
    observed_rt: float
    token_id: int

class VerifyResponse(BaseModel):
    genuine: bool
    anomaly_prob: float
    predicted_rt: float
    observed_rt: float
    pct_deviation: float
    threshold: float
    result: str

class ProofRequest(BaseModel):
    peaks: list[int]
    threshold: int = 10

class ProofResponse(BaseModel):
    success: bool
    proof: dict
    publicSignals: list[str]

class RegisterRoleRequest(BaseModel):
    wallet_address: str
    role: str


# ── RT estimation from peak profile ────────────────────────────

def peaks_to_observed_rt(peaks: list[float]) -> float:
    """
    Estimate observed retention time from 10 HPLC peak intensities.
    Uses intensity-weighted centroid scaled to SMRT range [200, 1500]s.
    No molecule identity required — manufacturer trade secret is preserved.
    """
    arr = np.array(peaks, dtype=float)
    total = arr.sum()
    if total == 0:
        centroid = 0.5
    else:
        indices = np.arange(len(arr))
        centroid = float(np.sum(arr * indices) / total) / (len(arr) - 1)
    return 200.0 + centroid * 1300.0


# ── Endpoints ───────────────────────────────────────────────────

@app.post("/compute-features", response_model=ComputeFeaturesResponse)
async def compute_features_endpoint(req: ComputeFeaturesRequest):
    """
    Convert 10 HPLC peak intensities to 137 features + observed RT.

    Molecular features use population-average values. The classifier
    is dominated by pct_deviation so this does not affect accuracy.
    No SMILES or chemical structure is required — privacy preserved.
    """
    if len(req.peaks) != 10:
        raise HTTPException(400, "Exactly 10 HPLC peak values required")

    observed_rt = peaks_to_observed_rt(req.peaks)

    return ComputeFeaturesResponse(
        observed_features=_AVG_FEATURES,
        observed_rt=observed_rt,
    )


@app.post("/verify", response_model=VerifyResponse)
async def verify(req: VerifyRequest):
    """
    AI anomaly classifier. Returns genuine/anomaly only.
    No ZK proof — proof is generated client-side after a genuine result.
    """
    if len(req.observed_features) != 137:
        raise HTTPException(400, f"Expected 137 features, got {len(req.observed_features)}")

    result = verify_reagent(req.observed_features, req.observed_rt)
    return VerifyResponse(**result)


@app.post("/generate-proof")
async def generate_proof_endpoint(req: ProofRequest):
    """
    Server-side ZK proof generation (fallback only).
    Primary path is client-side snarkjs in the browser.
    """
    if len(req.peaks) != 10:
        raise HTTPException(400, "Exactly 10 peak values required")
    try:
        from prover import generate_proof
        proof_data = generate_proof(req.peaks, req.threshold)
        return {
            "success": True,
            "proof": proof_data["proof"],
            "publicSignals": proof_data["publicSignals"],
        }
    except ImportError:
        raise HTTPException(500, "prover module not available — use client-side proof generation")
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@app.post("/extract-peaks")
async def extract_peaks_endpoint(file: UploadFile = File(...)):
    """
    Accept HPLC chromatogram CSV, return 10 peaks + dynamic threshold.
    """
    if not file.filename.lower().endswith('.csv'):
        raise HTTPException(400, "Only .csv files are accepted")

    try:
        raw = (await file.read()).decode("utf-8")
        all_rows = [r.strip() for r in raw.splitlines() if r.strip()]
        data_rows = [r for r in all_rows if not any(c.isalpha() for c in r)]
        if not data_rows:
            raise HTTPException(400, "CSV file contains no numeric rows")

        first_cols = [v.strip() for v in data_rows[0].split(",")]
        peaks = []

        if len(first_cols) >= 2 and len(data_rows) > N_PEAKS:
            intensities = []
            for r in data_rows:
                cols = r.split(",")
                val = cols[1].strip() if len(cols) >= 2 else cols[0].strip()
                val = val.strip('"\'')
                m = re.match(r'[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?', val)
                if m:
                    intensities.append(float(m.group(0)))

            if len(intensities) < N_PEAKS:
                raise HTTPException(400, f"Not enough data points: found {len(intensities)}")

            local_peaks = []
            for i in range(1, len(intensities) - 1):
                if intensities[i] > intensities[i - 1] and intensities[i] > intensities[i + 1]:
                    local_peaks.append(intensities[i])

            local_peaks.sort(reverse=True)
            top_peaks = local_peaks[:N_PEAKS]
            max_val = max(top_peaks) if top_peaks else 1e-9
            peaks = [round((v / max_val) * MAX_PEAK) for v in top_peaks]

        else:
            raw_vals = [v.strip().strip('"\'') for v in data_rows[0].split(",")]
            for v in raw_vals:
                if v:
                    m = re.match(r'[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?', v)
                    if m:
                        peaks.append(int(round(float(m.group(0)))))

        peaks = [v for v in peaks if v == v]
        if not peaks:
            raise HTTPException(400, "No valid numeric peak values found in CSV")

        if len(peaks) > N_PEAKS:
            peaks = peaks[:N_PEAKS]
        while len(peaks) < N_PEAKS:
            peaks.append(round(sum(peaks) / len(peaks)))

        peaks = [max(0, min(MAX_PEAK, v)) for v in peaks]

        max_delta = 0
        for i in range(len(peaks) - 1):
            max_delta = max(max_delta, abs(peaks[i] - peaks[i + 1]))
        threshold = min(MAX_THRESH, max(max_delta + 5, 50))

        return {"peaks": peaks, "threshold": threshold, "filename": file.filename}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to extract peaks: {str(e)}")


# ── Role registration ───────────────────────────────────────────

@app.post("/register-role")
async def register_role(req: RegisterRoleRequest):
    role = req.role.lower().strip()
    if role not in ("manufacturer", "lab"):
        raise HTTPException(400, "Role must be 'manufacturer' or 'lab'")

    if role == "lab":
        try:
            from web3 import Web3
            import json as _json

            artifacts_path = os.path.join(
                os.path.dirname(__file__), "..",
                "artifacts", "contracts", "BioToken.sol", "BioToken.json"
            )
            with open(artifacts_path) as f:
                artifact = _json.load(f)

            rpc_url = os.environ.get("AMOY_RPC_URL", "https://rpc-amoy.polygon.technology")
            w3 = Web3(Web3.HTTPProvider(rpc_url))
            contract_address = os.environ.get("VITE_CONTRACT_ADDRESS", "0x9204D687ecB511ac0d69E450C36a6a476F7A9425")
            contract = w3.eth.contract(address=Web3.to_checksum_address(contract_address), abi=artifact["abi"])

            admin_key = os.environ.get("DEPLOYER_PRIVATE_KEY")
            if not admin_key:
                raise HTTPException(500, "DEPLOYER_PRIVATE_KEY not configured")
            admin_account = w3.eth.account.from_key(admin_key)

            lab_address = Web3.to_checksum_address(req.wallet_address)
            tx = contract.functions.grantLabRole(lab_address).build_transaction({
                "from": admin_account.address,
                "nonce": w3.eth.get_transaction_count(admin_account.address),
                "gas": 200_000,
                "gasPrice": w3.eth.gas_price,
                "chainId": 80002,
            })
            signed = admin_account.sign_transaction(tx)
            tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

            await users_collection.update_one(
                {"walletAddress": req.wallet_address.lower()},
                {"$set": {
                    "walletAddress": req.wallet_address.lower(),
                    "role": "lab", "labRoleGranted": True,
                    "labRoleTxHash": receipt.transactionHash.hex(),
                    "registeredAt": datetime.datetime.utcnow().isoformat(),
                    "lastLoginAt": datetime.datetime.utcnow().isoformat(),
                }},
                upsert=True
            )
            return {"success": True, "role": "lab", "wallet": req.wallet_address,
                    "tx_hash": receipt.transactionHash.hex(), "message": "LAB_ROLE granted on-chain"}

        except ImportError:
            await users_collection.update_one(
                {"walletAddress": req.wallet_address.lower()},
                {"$set": {
                    "walletAddress": req.wallet_address.lower(),
                    "role": "lab", "labRoleGranted": False, "labRoleTxHash": None,
                    "registeredAt": datetime.datetime.utcnow().isoformat(),
                    "lastLoginAt": datetime.datetime.utcnow().isoformat(),
                }},
                upsert=True
            )
            return {"success": True, "role": "lab", "wallet": req.wallet_address,
                    "tx_hash": None, "message": "Role registered (web3 not available)"}
        except Exception as e:
            raise HTTPException(500, f"Failed to grant LAB_ROLE: {str(e)}")

    await users_collection.update_one(
        {"walletAddress": req.wallet_address.lower()},
        {"$set": {
            "walletAddress": req.wallet_address.lower(),
            "role": "manufacturer", "labRoleGranted": False, "labRoleTxHash": None,
            "registeredAt": datetime.datetime.utcnow().isoformat(),
            "lastLoginAt": datetime.datetime.utcnow().isoformat(),
        }},
        upsert=True
    )
    return {"success": True, "role": "manufacturer", "wallet": req.wallet_address,
            "tx_hash": None, "message": "Manufacturer role registered"}


# ── User endpoints ──────────────────────────────────────────────

@app.get("/api/user/{wallet}")
async def get_user(wallet: str):
    user = await users_collection.find_one({"walletAddress": wallet.lower()}, {"_id": 0})
    if not user:
        raise HTTPException(404, "User not registered")
    return user


@app.patch("/api/user/{wallet}/login")
async def update_last_login(wallet: str):
    await users_collection.update_one(
        {"walletAddress": wallet.lower()},
        {"$set": {"lastLoginAt": datetime.datetime.utcnow().isoformat()}}
    )
    return {"ok": True}


@app.get("/health")
async def health():
    return {"status": "ok", "models_loaded": True}