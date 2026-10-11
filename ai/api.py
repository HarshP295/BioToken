from fastapi import FastAPI, Header, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import sys, os, math, numpy as np, re, json, time
import datetime
from dotenv import load_dotenv
from eth_abi import encode as abi_encode
from eth_account import Account
from eth_account.messages import encode_defunct
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConfigurationError, ServerSelectionTimeoutError
from web3 import Web3

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

from src.features import compute_features, features_dict_to_list, smiles_to_mol
from verifier import get_classifier_info, get_model_info, models_loaded, verify_reagent

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Constants ───────────────────────────────────────────────────
MAX_PEAK   = 255
N_PEAKS    = 10
_NUMBER    = re.compile(r'[-+]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?')

AMOY_CHAIN_ID = 80002
DEFAULT_CONTRACT = os.environ.get("VITE_CONTRACT_ADDRESS", "")
# Signatures from this key are what BioToken accepts as AI verdicts
# (the address must hold AI_ORACLE_ROLE). Without it /verify still answers,
# but issues no attestation.
AI_ORACLE_KEY = os.environ.get("AI_ORACLE_PRIVATE_KEY")
AI_VERDICT_TAG = "BioToken AI verdict: GENUINE"   # must match BioToken.aiVerdictDigest
REGISTRATION_MAX_AGE_S = 600


# ── Pydantic models ─────────────────────────────────────────────

class ComputeFeaturesRequest(BaseModel):
    smiles: str          # reagent structure (public identity, not the HPLC fingerprint)
    observed_rt: float   # retention time measured by the lab's HPLC, in seconds

class ComputeFeaturesResponse(BaseModel):
    observed_features: list[float]   # 137 RDKit features (9 descriptors + 128 Morgan bits)
    observed_rt: float
    smiles: str

class VerifyRequest(BaseModel):
    observed_rt: float
    token_id: int
    # Preferred: the reagent SMILES recorded on the token. Features are then
    # computed here and a GENUINE verdict is signed for (chain, contract, token, SMILES).
    smiles: str | None = None
    # Legacy: precomputed features. Answered, but never signed.
    observed_features: list[float] | None = None
    chain_id: int | None = None
    contract_address: str | None = None

class VerifyResponse(BaseModel):
    genuine: bool
    anomaly_prob: float
    predicted_rt: float
    observed_rt: float
    pct_deviation: float
    threshold: float
    result: str
    attestation: str | None = None   # AI oracle signature for BioToken.verifyProof
    oracle: str | None = None

class RegisterRoleRequest(BaseModel):
    wallet_address: str
    role: str
    # The frontend sends transactions from a Pimlico smart account, so that is
    # the address BioToken's role checks see. Without it the EOA is used.
    smart_account_address: str | None = None
    issued_at: int       # unix seconds, part of the signed message
    signature: str       # wallet's EIP-191 signature over registration_message(...)


ROLE_NAMES = {"lab", "manufacturer"}
ROLE_FLAG_FIELDS = {
    "lab": ("labRoleGranted", "labRoleTxHash"),
    "manufacturer": ("manufacturerRoleGranted", "manufacturerRoleTxHash"),
}


def mongo_unavailable(error: Exception) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail=(
            "Role registration requires MongoDB, but the configured database "
            f"could not be reached: {error}. Check MONGODB_URI in .env."
        ),
    )


def registration_message(role: str, wallet: str, holder: str, issued_at: int) -> str:
    """Text the user's wallet signs to request a role (frontend builds the same string)."""
    return (
        "BioToken role registration\n"
        f"Role: {role}\n"
        f"Wallet: {Web3.to_checksum_address(wallet)}\n"
        f"Role holder: {Web3.to_checksum_address(holder)}\n"
        f"Issued at: {issued_at}"
    )


def ai_verdict_digest(chain_id: int, contract: str, token_id: int, smiles: str) -> bytes:
    """Same bytes as BioToken.aiVerdictDigest(tokenId)."""
    return Web3.keccak(abi_encode(
        ["string", "uint256", "address", "uint256", "bytes32"],
        [AI_VERDICT_TAG, chain_id, Web3.to_checksum_address(contract), token_id, Web3.keccak(text=smiles)],
    ))


def sign_ai_verdict(chain_id: int, contract: str, token_id: int, smiles: str) -> tuple[str, str]:
    account = Account.from_key(AI_ORACLE_KEY)
    signed = account.sign_message(encode_defunct(primitive=ai_verdict_digest(chain_id, contract, token_id, smiles)))
    return "0x" + signed.signature.hex().removeprefix("0x"), account.address


def current_contract() -> str:
    """Lower-case BioToken address role grants are recorded against."""
    return (os.environ.get("VITE_CONTRACT_ADDRESS") or "").lower()


def auto_approve_roles() -> bool:
    return os.environ.get("ROLE_AUTO_APPROVE", "").lower() == "true"


def require_admin(token: str | None) -> None:
    expected = os.environ.get("ADMIN_API_TOKEN")
    if not expected:
        raise HTTPException(503, "Admin endpoints are disabled: ADMIN_API_TOKEN is not set")
    if token != expected:
        raise HTTPException(401, "Invalid admin token")


def grant_onchain_role(wallet_address: str, role_name: str) -> str:
    role = role_name.lower().strip()
    if role not in ROLE_NAMES:
        raise ValueError("Role must be 'manufacturer' or 'lab'")

    rpc_url = os.environ.get("AMOY_RPC_URL")
    contract_address = os.environ.get("VITE_CONTRACT_ADDRESS")
    admin_key = os.environ.get("DEPLOYER_PRIVATE_KEY")
    if not rpc_url:
        raise RuntimeError("AMOY_RPC_URL not configured")
    if not contract_address:
        raise RuntimeError("VITE_CONTRACT_ADDRESS not configured")
    if not admin_key:
        raise RuntimeError("DEPLOYER_PRIVATE_KEY not configured")

    artifact_path = os.path.join(
        os.path.dirname(__file__), "..",
        "artifacts", "contracts", "BioToken.sol", "BioToken.json",
    )
    with open(artifact_path) as artifact_file:
        artifact = json.load(artifact_file)

    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 20}))
    if w3.eth.chain_id != AMOY_CHAIN_ID:
        raise RuntimeError("Configured RPC is not Polygon Amoy (chain ID 80002)")

    admin_account = w3.eth.account.from_key(admin_key)
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(contract_address),
        abi=artifact["abi"],
    )
    recipient = Web3.to_checksum_address(wallet_address)
    role_hash = Web3.keccak(text=f"{role.upper()}_ROLE")
    if contract.functions.hasRole(role_hash, recipient).call():
        return "already-granted"

    nonce = w3.eth.get_transaction_count(admin_account.address, "pending")
    transaction = contract.functions.grantRole(role_hash, recipient).build_transaction({
        "from": admin_account.address,
        "nonce": nonce,
        "chainId": AMOY_CHAIN_ID,
        "gas": 100_000,
        "gasPrice": w3.eth.gas_price,
    })
    signed = admin_account.sign_transaction(transaction)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    tx_hex = "0x" + tx_hash.hex().removeprefix("0x")
    if receipt["status"] != 1:
        raise RuntimeError(f"Transaction reverted: {tx_hex}")
    return tx_hex


# ── Endpoints ───────────────────────────────────────────────────

@app.post("/compute-features", response_model=ComputeFeaturesResponse)
async def compute_features_endpoint(req: ComputeFeaturesRequest):
    """
    Reagent SMILES + lab-measured RT → 137 RDKit features (paper §3.2).

    The SMILES identifies which reagent was ordered; the proprietary HPLC
    peak fingerprint never reaches this endpoint (it stays in the browser
    as the ZK witness).
    """
    mol = smiles_to_mol(req.smiles)
    if mol is None:
        raise HTTPException(422, "Unable to parse SMILES string")
    if not np.isfinite(req.observed_rt) or req.observed_rt <= 0:
        raise HTTPException(422, "observed_rt must be a positive retention time in seconds")

    return ComputeFeaturesResponse(
        observed_features=features_dict_to_list(compute_features(mol)),
        observed_rt=req.observed_rt,
        smiles=req.smiles,
    )


@app.post("/verify", response_model=VerifyResponse)
async def verify(req: VerifyRequest):
    """
    AI anomaly classifier. With `smiles`, a GENUINE verdict comes back with
    the AI oracle's signature, which BioToken.verifyProof requires.
    """
    if not models_loaded():
        raise HTTPException(503, "AI models not loaded")

    if req.smiles is not None:
        mol = smiles_to_mol(req.smiles)
        if mol is None:
            raise HTTPException(422, "Unable to parse SMILES string")
        features = features_dict_to_list(compute_features(mol))
    elif req.observed_features is not None:
        if len(req.observed_features) != 137:
            raise HTTPException(400, f"Expected 137 features, got {len(req.observed_features)}")
        features = req.observed_features
    else:
        raise HTTPException(422, "Provide the reagent SMILES (or 137 precomputed features)")

    try:
        result = verify_reagent(features, req.observed_rt)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e

    if result["genuine"] and req.smiles is not None and AI_ORACLE_KEY:
        contract = req.contract_address or DEFAULT_CONTRACT
        if not Web3.is_address(contract or ""):
            raise HTTPException(422, "contract_address is required to sign the verdict")
        result["attestation"], result["oracle"] = sign_ai_verdict(
            req.chain_id or AMOY_CHAIN_ID, contract, req.token_id, req.smiles
        )
    return VerifyResponse(**result)


@app.post("/extract-peaks")
async def extract_peaks_endpoint(file: UploadFile = File(...)):
    """
    HPLC chromatogram CSV → 10 peaks (0-255), tallest first.

    Same rules as frontend/src/lib/hplcParser.js, which the web app uses so
    the scan never leaves the browser. Kept for scripts and tests.
    """
    if not file.filename.lower().endswith('.csv'):
        raise HTTPException(400, "Only .csv files are accepted")

    raw = (await file.read()).decode("utf-8-sig")
    rows = [[c.strip().strip('"\'') for c in r.split(",") if c.strip()] for r in raw.splitlines() if r.strip()]
    # A data row is one whose cells are all numbers (scientific notation
    # included); header rows are skipped.
    data_rows = [cells for cells in rows if cells and all(_NUMBER.fullmatch(c) for c in cells)]
    if not data_rows:
        raise HTTPException(400, "CSV file contains no numeric rows")

    if len(data_rows[0]) >= 2 and len(data_rows) > N_PEAKS:
        intensities = [float(cells[1]) for cells in data_rows]
        local_peaks = [
            intensities[i] for i in range(1, len(intensities) - 1)
            if intensities[i] > intensities[i - 1] and intensities[i] > intensities[i + 1]
        ]
        if len(local_peaks) < N_PEAKS:
            raise HTTPException(400, f"Chromatogram has {len(local_peaks)} peaks; at least {N_PEAKS} are needed")
        top_peaks = sorted(local_peaks, reverse=True)[:N_PEAKS]
        if top_peaks[0] <= 0:
            raise HTTPException(400, "Chromatogram intensities must be positive")
        # floor(x + 0.5) rounds like JavaScript's Math.round
        peaks = [math.floor(v / top_peaks[0] * MAX_PEAK + 0.5) for v in top_peaks]
    else:
        values = [float(c) for c in data_rows[0]]
        if any(v != int(v) for v in values):
            raise HTTPException(400, f"Peak values must be whole numbers from 0 to {MAX_PEAK}")
        peaks = [int(v) for v in values]

    if len(peaks) != N_PEAKS:
        raise HTTPException(400, f"Expected exactly {N_PEAKS} peak values, found {len(peaks)}")
    if any(not 0 <= p <= MAX_PEAK for p in peaks):
        raise HTTPException(400, f"Peak values must be whole numbers from 0 to {MAX_PEAK}")
    return {"peaks": peaks, "filename": file.filename}


# ── Role registration ───────────────────────────────────────────
#
# 1. The user's wallet signs registration_message(...) (proves it owns the
#    wallet; the role holder is the smart account it transacts from).
# 2. With ROLE_AUTO_APPROVE=true the role is granted at once (demo mode).
#    Otherwise the request waits until an admin calls
#    POST /admin/approve-role/{wallet} with the X-Admin-Token header.

async def _grant_and_record(wallet: str, role: str, holder: str) -> str:
    granted_field, tx_field = ROLE_FLAG_FIELDS[role]
    try:
        tx_hash = grant_onchain_role(holder, role)
    except Exception as error:
        try:
            await users_collection.update_one(
                {"walletAddress": wallet.lower()},
                {"$set": {f"{role}RoleGrantError": str(error), granted_field: False}},
            )
        except (ConfigurationError, ServerSelectionTimeoutError) as mongo_error:
            raise mongo_unavailable(mongo_error) from mongo_error
        raise HTTPException(502, f"On-chain {role} role grant failed: {error}") from error

    try:
        await users_collection.update_one(
            {"walletAddress": wallet.lower()},
            {"$set": {
                "roleHolderAddress": holder.lower(),
                "roleContract": current_contract(),
                granted_field: True,
                tx_field: tx_hash,
                f"{role}RoleGrantError": None,
            }},
        )
    except (ConfigurationError, ServerSelectionTimeoutError) as e:
        raise mongo_unavailable(e) from e
    return tx_hash


@app.post("/register-role")
async def register_role(req: RegisterRoleRequest):
    role = req.role.lower().strip()
    if role not in ROLE_NAMES:
        raise HTTPException(400, "Role must be 'manufacturer' or 'lab'")

    try:
        wallet = Web3.to_checksum_address(req.wallet_address)
        holder = Web3.to_checksum_address(req.smart_account_address or req.wallet_address)
    except ValueError as error:
        raise HTTPException(400, "Invalid wallet address") from error

    if abs(time.time() - req.issued_at) > REGISTRATION_MAX_AGE_S:
        raise HTTPException(400, "Registration request expired; sign a new one")
    try:
        signer = Account.recover_message(
            encode_defunct(text=registration_message(role, wallet, holder, req.issued_at)),
            signature=req.signature,
        )
    except Exception as error:
        raise HTTPException(401, "Invalid registration signature") from error
    if signer.lower() != wallet.lower():
        raise HTTPException(401, "Registration must be signed by the wallet being registered")

    granted_field, tx_field = ROLE_FLAG_FIELDS[role]
    now = datetime.datetime.utcnow().isoformat()
    try:
        existing = await users_collection.find_one({"walletAddress": wallet.lower()}, {"_id": 0}) or {}
        # Re-registering the same role and holder keeps an earlier approval
        # (this is how the app retries a failed or outdated grant).
        approved = auto_approve_roles() or (
            existing.get("roleApproved") is True
            and existing.get("role") == role
            and existing.get("roleHolderAddress") == holder.lower()
        )
        await users_collection.update_one(
            {"walletAddress": wallet.lower()},
            {"$set": {
                "walletAddress": wallet.lower(),
                "roleHolderAddress": holder.lower(),
                "role": role,
                "roleApproved": approved,
                granted_field: False,
                tx_field: None,
                f"{role}RoleGrantError": None,
                "registeredAt": now,
                "lastLoginAt": now,
            }},
            upsert=True
        )
    except (ConfigurationError, ServerSelectionTimeoutError) as e:
        raise mongo_unavailable(e) from e

    if not approved:
        return JSONResponse(status_code=202, content={
            "success": True, "pending": True, "role": role, "wallet": wallet,
            "message": "Registration received; an administrator must approve it before the role is granted.",
        })

    tx_hash = await _grant_and_record(wallet, role, holder)
    return {"success": True, "role": role, "wallet": wallet,
            "tx_hash": tx_hash,
            "message": f"{role.upper()}_ROLE granted on-chain"}


async def _find_user(wallet: str) -> tuple[str, dict]:
    try:
        checksum_wallet = Web3.to_checksum_address(wallet)
    except ValueError as error:
        raise HTTPException(400, "Invalid wallet address") from error
    try:
        user = await users_collection.find_one({"walletAddress": checksum_wallet.lower()}, {"_id": 0})
    except (ConfigurationError, ServerSelectionTimeoutError) as e:
        raise mongo_unavailable(e) from e
    if not user:
        raise HTTPException(404, "User not registered")
    if user.get("role", "").lower().strip() not in ROLE_NAMES:
        raise HTTPException(400, "User has no supported role to grant")
    return checksum_wallet, user


@app.post("/api/retry-role-grant/{wallet}")
async def retry_role_grant(wallet: str):
    """Retry a failed on-chain grant for an approved registration."""
    checksum_wallet, user = await _find_user(wallet)
    role = user["role"].lower().strip()
    granted_field, tx_field = ROLE_FLAG_FIELDS[role]
    if not user.get("roleApproved"):
        raise HTTPException(403, "Registration is awaiting administrator approval")
    holder = user.get("roleHolderAddress") or checksum_wallet
    # A grant only counts on the contract it was made on (a redeploy starts over).
    if user.get(granted_field) is True and user.get("roleContract") == current_contract():
        return {"success": True, "role": role, "wallet": checksum_wallet,
                "tx_hash": user.get(tx_field), "message": "Role already granted on-chain"}
    tx_hash = await _grant_and_record(checksum_wallet, role, holder)
    return {"success": True, "role": role, "wallet": checksum_wallet,
            "tx_hash": tx_hash,
            "message": f"{role.upper()}_ROLE granted on-chain"}


@app.get("/admin/role-requests")
async def list_role_requests(x_admin_token: str | None = Header(default=None)):
    require_admin(x_admin_token)
    try:
        cursor = users_collection.find({"roleApproved": {"$ne": True}}, {"_id": 0})
        return {"pending": await cursor.to_list(length=200)}
    except (ConfigurationError, ServerSelectionTimeoutError) as e:
        raise mongo_unavailable(e) from e


@app.post("/admin/approve-role/{wallet}")
async def approve_role(wallet: str, x_admin_token: str | None = Header(default=None)):
    require_admin(x_admin_token)
    checksum_wallet, user = await _find_user(wallet)
    role = user["role"].lower().strip()
    try:
        await users_collection.update_one(
            {"walletAddress": checksum_wallet.lower()}, {"$set": {"roleApproved": True}},
        )
    except (ConfigurationError, ServerSelectionTimeoutError) as e:
        raise mongo_unavailable(e) from e
    holder = user.get("roleHolderAddress") or checksum_wallet
    tx_hash = await _grant_and_record(checksum_wallet, role, holder)
    return {"success": True, "role": role, "wallet": checksum_wallet, "holder": holder, "tx_hash": tx_hash}


# ── User endpoints ──────────────────────────────────────────────

@app.get("/api/user/{wallet}")
async def get_user(wallet: str):
    try:
        user = await users_collection.find_one({"walletAddress": wallet.lower()}, {"_id": 0})
    except (ConfigurationError, ServerSelectionTimeoutError) as e:
        raise mongo_unavailable(e) from e
    if not user:
        raise HTTPException(404, "User not registered")
    return user


@app.patch("/api/user/{wallet}/login")
async def update_last_login(wallet: str):
    try:
        await users_collection.update_one(
            {"walletAddress": wallet.lower()},
            {"$set": {"lastLoginAt": datetime.datetime.utcnow().isoformat()}}
        )
    except (ConfigurationError, ServerSelectionTimeoutError) as e:
        raise mongo_unavailable(e) from e
    return {"ok": True}


@app.get("/health")
async def health():
    loaded = models_loaded()
    clf_info = get_classifier_info() or {}
    rt_info = get_model_info() or {}
    return {
        "status": "ok" if loaded else "degraded",
        "models_loaded": loaded,
        "rt_predictor_r2": rt_info.get("r2"),
        "classifier_auc": clf_info.get("auc"),
        "threshold": clf_info.get("threshold"),
        "ai_oracle": Account.from_key(AI_ORACLE_KEY).address if AI_ORACLE_KEY else None,
        "contract": DEFAULT_CONTRACT or None,
    }
