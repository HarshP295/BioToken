# BioToken

A decentralized reagent provenance system on Polygon. Each biochemical reagent batch is minted as an ERC-721 NFT and tracked through a five-stage lifecycle (MINTED → IN\_TRANSIT → RECEIVED → VERIFIED → CONSUMED). A batch is verified by an AI check of its HPLC retention time and a zero-knowledge proof that the lab's HPLC fingerprint matches the manufacturer's, without revealing either fingerprint.

**Live (Polygon Amoy testnet)**

| | |
|---|---|
| Web app | https://biotoken-web.onrender.com |
| AI service | https://biotoken-api.onrender.com/health |
| BioToken contract | [`0x59B06aE32e732bb3D91b0F301af6791A0C98b202`](https://amoy.polygonscan.com/address/0x59B06aE32e732bb3D91b0F301af6791A0C98b202) |
| HplcVerifier (Groth16) | [`0xA44699310aE4599cF43C1dBe68B227f3cb4E16DA`](https://amoy.polygonscan.com/address/0xA44699310aE4599cF43C1dBe68B227f3cb4E16DA) |

The AI service runs on Render's free plan, so the first request after it has been idle takes up to a minute while it wakes up.

Both services redeploy automatically on Render whenever a commit lands on `main`.

---

## How verification works

1. **Mint (manufacturer).** The Gold Standard HPLC file is parsed in the browser and checked against known-good supplier fingerprints. A Poseidon commitment to its 10 peaks (plus a random salt) and a per-peak tolerance are stored on-chain with the token. The manufacturer sends the **Gold Standard package** (peaks + salt) to the receiving lab privately.
2. **Ship and receive.** Only the token holder can ship, and only to an address with `LAB_ROLE`. The receiving lab confirms receipt.
3. **AI pre-screen (lab).** The AI service predicts the retention time of the reagent recorded on the token (RDKit features → XGBoost) and compares it with the RT the lab measured. A GENUINE verdict is signed by the AI oracle key.
4. **ZK proof (lab).** In the browser, the lab proves that its own scan is within the stored tolerance of the committed Gold Standard, for this token. A scan that doesn't match has no proof.
5. **On-chain verification.** `BioToken.verifyProof` checks the oracle's signature and the Groth16 proof against the commitment, tolerance and token id it stored itself. Then the lab can consume the batch.

Transactions are gasless: users log in with Privy, and their actions are sent as ERC-4337 UserOperations from a smart account sponsored by Pimlico. Users choose the **Lab** or **Manufacturer** role on first login.

## Repository structure

```
contracts/      BioToken (ERC-721 + roles + verification) and the generated HplcVerifier
circuits/       fingerprint.circom, compiled circuit and trusted-setup files (see circuits/SETUP.md)
ai/             FastAPI AI service, RDKit features, XGBoost models, tests, paper-metric scripts
frontend/       React + Vite web app (Privy login, Pimlico smart accounts, in-browser proving)
samples/hplc/   Sample HPLC files for the Mint and Lab pages, with expected results
scripts/        Contract deployment, role grants, local end-to-end run, Render smoke test
test/           Hardhat tests (lifecycle, access control, real Groth16 proofs)
deployments/    Deployed addresses + ABI (amoy.json), read by the app and the API
docs/           System verification report, deployment guide, evidence of live runs
render.yaml     Render Blueprint for the AI service and the web app
```

## Prerequisites

- Node.js ≥ 20.19 and npm
- Python 3.13 (3.11+ works for development)
- For deploying contracts: a Polygon Amoy wallet with test POL

## Run locally

```bash
git clone https://github.com/HarshP295/BioToken.git
cd BioToken

# 1. Install
npm install
cd frontend && npm install && cd ..
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # macOS/Linux: .venv/bin/pip

# 2. Configure: copy the examples and fill them in (see "Configuration")
cp .env.example .env
cp frontend/.env.example frontend/.env

# 3. AI service (http://localhost:8000)
cd ai && ../.venv/Scripts/python -m uvicorn api:app --port 8000

# 4. Web app (http://localhost:5173), in a second terminal
cd frontend && npm run dev
```

Open http://localhost:5173 (not `127.0.0.1`; Privy only allows the configured origin). To try a full verification, mint with a file from [samples/hplc/manufacturer/](samples/hplc/manufacturer/), ship it to the lab's address (shown on its Lab Dashboard), then on the Lab Dashboard upload the matching lab scan from [samples/hplc/lab/](samples/hplc/lab/) and the Gold Standard package downloaded after minting. The files, the RT to type, and the expected outcome of each are listed in [docs/SYSTEM_VERIFICATION.md §6](docs/SYSTEM_VERIFICATION.md#6-hplc-upload-files).

## Test

```bash
npx hardhat test                        # contracts, incl. real Groth16 proofs (26 tests)
cd ai && python -m pytest tests         # AI service, signed verdicts, roles, samples (49 tests)
npm run check:samples                   # sample files through the parser, consensus and circuit
npm run integrate                       # full lifecycle on a local chain (AI service running)
npm run e2e:amoy                        # full gasless lifecycle on Amoy (writes docs/evidence/)
npm run smoke -- --api <api url> --web <web url>   # read-only checks of a deployment
```

`npm run integrate` also takes `LAB_CSV`, `GOLD_FILE`, `SMILES` and `OBSERVED_RT`. For example, the tampered scan stops at the proof step:

```bash
LAB_CSV=samples/hplc/lab/BATCH-CAF-001_lab_scan_tampered.csv npm run integrate
```

AI reproduction scripts (need the METLIN SMRT data in `ai/data/`):

```bash
curl -L "https://ndownloader.figshare.com/files/18130628" -o ai/data/SMRT_dataset.csv
python ai/reproduce_paper_metrics.py       # paper Tables 3, 4, 8, 9
python ai/layer2_validation_logged.py      # Layer 2 (ICH degradation)
python ai/reportrt_validation_fix.py path/to/RepoRT   # Layer 1, needs a RepoRT clone
```

`ai/models/` holds the models the paper's numbers come from. See [AI_VALIDATION_RECONCILIATION.md](AI_VALIDATION_RECONCILIATION.md) for verified results.

## Deploy

**Contracts** (only when they change, e.g. after a circuit change):

```bash
npm run deploy:contracts    # deploys HplcVerifier + BioToken to Amoy, writes deployments/amoy.json
```

Commit `deployments/amoy.json` afterwards; the app and the API read the address and ABI from it. The circuit build and trusted setup are in [circuits/SETUP.md](circuits/SETUP.md).

**Web app and AI service** on Render: [render.yaml](render.yaml) defines both. Use Render → New → Blueprint, fill in the secrets, add the web URL to Privy's allowed origins, then run `npm run smoke`. The full guide is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Configuration

Repo-root `.env` (contracts, scripts, AI service):

| Variable | Description |
|---|---|
| `DEPLOYER_PRIVATE_KEY` | Admin/deployer key; also signs role grants from the API |
| `AMOY_RPC_URL` | Polygon Amoy JSON-RPC endpoint |
| `VITE_CONTRACT_ADDRESS` | Deployed BioToken (optional; defaults to `deployments/amoy.json`) |
| `AI_ORACLE_PRIVATE_KEY` | Signs GENUINE AI verdicts; its address holds `AI_ORACLE_ROLE` |
| `ROLE_AUTO_APPROVE` | Default `true`: the role a user picks is granted at once. `false` requires admin approval |
| `ADMIN_API_TOKEN` | `X-Admin-Token` for the `/admin/*` approval endpoints |
| `CORS_ORIGINS` | Browser origins allowed to call the API |
| `MONGODB_URI` | User and role records |
| `PINATA_API_KEY`, `PINATA_SECRET_KEY` | Pinata IPFS keys |

`frontend/.env`: `VITE_PRIVY_APP_ID`, `VITE_PIMLICO_API_KEY`, `VITE_PIMLICO_POLICY_ID`, `VITE_AI_API_URL`, `VITE_AMOY_RPC_URL`, and optionally `VITE_CONTRACT_ADDRESS`.

## Documentation

- [docs/SYSTEM_VERIFICATION.md](docs/SYSTEM_VERIFICATION.md): how each layer works, test results, the live Amoy runs, findings and known limitations
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Render setup, configuration reference, release process
- [circuits/SETUP.md](circuits/SETUP.md): circuit and trusted setup
- [AI_VALIDATION_RECONCILIATION.md](AI_VALIDATION_RECONCILIATION.md): AI model validation

## Status and limitations

This is a testnet deployment. Before production use:

- run a multi-party phase-2 trusted setup (the current one has a single contributor);
- set `ROLE_AUTO_APPROVE=false`, so roles need approval;
- use dedicated keys for the deployer and the AI oracle.

The full list is in [docs/SYSTEM_VERIFICATION.md §10](docs/SYSTEM_VERIFICATION.md#10-known-limitations-and-next-steps).

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Stable, release-ready code |
| `dev` | Active development, integration branch |
| `feature/xxx` | Individual feature branches off `dev` |

All work happens on `feature/*` branches, merged into `dev` via pull request. `dev` is merged into `main` when stable.
