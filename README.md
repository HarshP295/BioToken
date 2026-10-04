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

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
#    Edit .env and fill in your PRIVATE_KEY and AMOY_RPC_URL

# 4. Compile contracts
npx hardhat compile

# 5. Run tests (local Hardhat network)
npx hardhat test

# 6. Deploy to Polygon Amoy testnet
npx hardhat run scripts/deploy.js --network amoy
```

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

npx hardhat run scripts/integrate.js # full lifecycle incl. AI → ZK proof → on-chain verify
```

`ai/models/` holds the models the paper's numbers come from; `src/features.py` emits features in the column order they were fitted on and `src/verifier.py` refuses to load if that ever drifts. See `AI_VALIDATION_RECONCILIATION.md` for verified results.

## Environment Variables

| Variable           | Description                       |
| ------------------ | --------------------------------- |
| `PRIVATE_KEY`      | Deployer wallet private key       |
| `AMOY_RPC_URL`     | Polygon Amoy JSON-RPC endpoint    |
| `PINATA_API_KEY`   | Pinata API key for IPFS uploads   |
| `PINATA_SECRET_KEY` | Pinata secret key                |

## Branch Strategy

| Branch         | Purpose                                    |
| -------------- | ------------------------------------------ |
| `main`         | Stable, release-ready code                 |
| `dev`          | Active development, integration branch     |
| `feature/xxx`  | Individual feature branches off `dev`      |

All work happens on `feature/*` branches, merged into `dev` via pull request. `dev` is merged into `main` when stable.

## License

MIT
