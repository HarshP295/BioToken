# BioToken

A decentralized reagent provenance system built on Polygon PoS. Each biochemical reagent batch is minted as an ERC-721 NFT and tracked through a five-stage lifecycle (MINTED → IN\_TRANSIT → RECEIVED → VERIFIED → CONSUMED), with Zero-Knowledge Proofs used to verify reagent authenticity without revealing the manufacturer's chemical fingerprint.

---

## Repository Structure

```
/contracts       — Solidity smart contracts
/circuits        — Circom ZK circuits (Week 3+)
/scripts         — Deployment & interaction scripts
/test            — Hardhat unit tests
/ai              — AI model for anomaly detection (Week 5+)
/frontend        — React web app (Week 9+)
```

## Prerequisites

- Node.js ≥ 18
- npm
- A Polygon Amoy testnet wallet funded with test MATIC

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/HarshP295/BioToken.git
cd BioToken

# 2. Install dependencies (the frontend install also provides circomlibjs for tests and scripts)
npm install
cd frontend && npm install && cd ..

# 3. Configure environment: create .env and frontend/.env (variables below)

# 4. Compile contracts
npx hardhat compile

# 5. Run tests (local Hardhat network)
npx hardhat test

# 6. Deploy HplcVerifier + BioToken to Polygon Amoy (updates both .env files)
npx hardhat run scripts/deploy.js --network amoy
```

Current Amoy deployment: BioToken `0x59B06aE32e732bb3D91b0F301af6791A0C98b202`, HplcVerifier `0xA44699310aE4599cF43C1dBe68B227f3cb4E16DA` ([deployments/amoy.json](deployments/amoy.json)). The circuit build and trusted setup are described in [circuits/SETUP.md](circuits/SETUP.md).

## AI Verification Service

The lab's AI pre-screen (`ai/`) takes the reagent SMILES and the retention time the lab measured, computes 137 RDKit features (9 descriptors + 128-bit Morgan fingerprint) and runs the XGBoost RT predictor + anomaly classifier. The HPLC peak values are not sent; they stay in the browser as the ZK witness.

```bash
pip install -r requirements.txt
# METLIN SMRT data (only needed for tests/reproduction), into ai/data/:
curl -L "https://ndownloader.figshare.com/files/18130628" -o ai/data/SMRT_dataset.csv

cd ai
uvicorn api:app --port 8000          # API used by the frontend and scripts/integrate.js
python -m pytest tests               # AI unit/API tests
cd ..
python ai/reproduce_paper_metrics.py # re-evaluates the frozen models (paper Tables 3, 4, 8, 9)
python ai/layer2_validation_logged.py
python ai/reportrt_validation_fix.py path/to/RepoRT   # Layer 1, needs a RepoRT clone

npx hardhat run scripts/integrate.js # full lifecycle on a local chain: mint → AI → ZK proof → verify → consume
cd frontend && node scripts/e2e_amoy.mjs  # the same lifecycle on Amoy, gasless via Pimlico
```

For a layer-by-layer description of the whole system, verification results, the live Amoy run, findings, and the sample HPLC files to upload on the Mint and Lab pages (`samples/hplc/`), see [docs/SYSTEM_VERIFICATION.md](docs/SYSTEM_VERIFICATION.md).

`ai/models/` holds the models the paper's numbers come from; `src/features.py` emits features in the column order they were fitted on and `src/verifier.py` refuses to load if that ever drifts. See `AI_VALIDATION_RECONCILIATION.md` for verified results.

## Deployment (Render)

`render.yaml` defines the AI service (`biotoken-api`, Python) and the web app (`biotoken-web`, static site). Create both with Render → New → Blueprint, fill in the secrets, add the web URL to Privy's allowed origins, then check the deployment:

```bash
npm run smoke -- --api https://biotoken-api.onrender.com --web https://biotoken-web.onrender.com
```

Step-by-step guide, configuration reference and release process: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Copy `.env.example` / `frontend/.env.example` for local development.

## Environment Variables

Repo-root `.env` (contracts, scripts, AI service):

| Variable                | Description |
| ----------------------- | ----------- |
| `DEPLOYER_PRIVATE_KEY`  | Admin/deployer key; also signs role grants from the API |
| `AMOY_RPC_URL`          | Polygon Amoy JSON-RPC endpoint (used by Hardhat and the API) |
| `VITE_CONTRACT_ADDRESS` | Deployed BioToken (set by `scripts/deploy.js`) |
| `AI_ORACLE_PRIVATE_KEY` | Signs GENUINE AI verdicts; its address holds `AI_ORACLE_ROLE` |
| `ADMIN_API_TOKEN`       | `X-Admin-Token` for `/admin/*` role approval endpoints |
| `ROLE_AUTO_APPROVE`     | Default on: the role a user picks (lab or manufacturer) is granted at once. `false` requires admin approval |
| `MONGODB_URI`           | User/role records |
| `PINATA_API_KEY`, `PINATA_SECRET_KEY` | Pinata IPFS keys |

`frontend/.env`: `VITE_PRIVY_APP_ID`, `VITE_PIMLICO_API_KEY`, `VITE_PIMLICO_POLICY_ID`, `VITE_CONTRACT_ADDRESS`, `VITE_AI_API_URL`, `VITE_AMOY_RPC_URL`.

## Branch Strategy

| Branch         | Purpose                                    |
| -------------- | ------------------------------------------ |
| `main`         | Stable, release-ready code                 |
| `dev`          | Active development, integration branch     |
| `feature/xxx`  | Individual feature branches off `dev`      |

All work happens on `feature/*` branches, merged into `dev` via pull request. `dev` is merged into `main` when stable.


