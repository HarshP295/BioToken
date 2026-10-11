# Deploying BioToken on Render

This guide puts the two off-chain parts of BioToken on [Render](https://render.com). The smart contracts are already on Polygon Amoy.

| Render service | What it is | Defined in |
|---|---|---|
| `biotoken-api` | FastAPI AI service ([ai/api.py](../ai/api.py)): AI verdicts signed by the oracle key, role registration | [render.yaml](../render.yaml) |
| `biotoken-web` | React app ([frontend/](../frontend/)), built by Vite and served as a static site | [render.yaml](../render.yaml) |
| (external) | Polygon Amoy contracts: BioToken `0x59B06aE32e732bb3D91b0F301af6791A0C98b202`, HplcVerifier `0xA44699310aE4599cF43C1dBe68B227f3cb4E16DA` | [deployments/amoy.json](../deployments/amoy.json) |
| (external) | MongoDB (e.g. Atlas), Privy, Pimlico | their dashboards |

Both services read the contract address and ABI from the committed `deployments/amoy.json`, so the git-ignored Hardhat `artifacts/` folder is not needed on Render.

---

## 1. Before you start

1. **Push the repository** (including `render.yaml`, `deployments/amoy.json`, `ai/models/`, `circuits/build/` and `frontend/public/`) to GitHub or GitLab.
2. **MongoDB**: an Atlas cluster (the free M0 tier is enough). Under *Network Access*, allow Render's outbound IPs for your region (Render dashboard → service → *Connect* → *Outbound*), or `0.0.0.0/0` for a quick start. Copy the `mongodb+srv://…` connection string.
3. **Keys** (from your local `.env`):
   - `DEPLOYER_PRIVATE_KEY`: the admin of the deployed BioToken (`0xbb6E…89B4`). The API uses it to grant roles, so it needs a little POL for gas.
   - `AI_ORACLE_PRIVATE_KEY`: the key whose address (`0x5653…c68e`) holds `AI_ORACLE_ROLE`. It must be this exact key, or `verifyProof` will reject every AI verdict.
4. **Privy**: your app id (`VITE_PRIVY_APP_ID`).
5. **Pimlico**: API key and sponsorship policy id (`VITE_PIMLICO_API_KEY`, `VITE_PIMLICO_POLICY_ID`).

## 2. Create the services from the Blueprint

1. Render dashboard → **New → Blueprint** → pick the repository. Render reads `render.yaml` and shows both services.
2. Fill in the secrets it asks for:

   | Service | Variable | Value |
   |---|---|---|
   | biotoken-api | `DEPLOYER_PRIVATE_KEY` | admin key |
   | biotoken-api | `AI_ORACLE_PRIVATE_KEY` | oracle key |
   | biotoken-api | `MONGODB_URI` | Atlas connection string |
   | biotoken-web | `VITE_PRIVY_APP_ID` | Privy app id |
   | biotoken-web | `VITE_PIMLICO_API_KEY` | Pimlico API key |
   | biotoken-web | `VITE_PIMLICO_POLICY_ID` | Pimlico sponsorship policy id |

   Set automatically: `ADMIN_API_TOKEN` (random), `ROLE_AUTO_APPROVE=true`, `AMOY_RPC_URL`, `PYTHON_VERSION`, `NODE_VERSION`. The two services point at each other's public URLs: the web app's `VITE_AI_API_URL` is `https://biotoken-api.onrender.com`, and the API's `CORS_ORIGINS` is `https://biotoken-web.onrender.com`. (Render's `fromService … property: host` is not used: it gives the internal service name, which browsers cannot reach.) If Render gives a service a different URL, or you add a custom domain, change these two values.
3. **Apply**. The first API build takes several minutes (RDKit, XGBoost, scikit-learn wheels); the web build about two minutes.

## 3. After the first deploy

1. **Privy dashboard → Settings → Allowed origins**: add `https://biotoken-web.onrender.com` (or your custom domain). Without it, login fails. Today the app allows only `http://localhost:5173` (seen in the browser console as a blocked `frame-ancestors` for `auth.privy.io`); that is also why login only works on `localhost:5173`, not `127.0.0.1` or `vite preview`'s port 4173.
2. **Pimlico dashboard**: restrict the API key to the web app's origin and set spending limits on the sponsorship policy. The key is shipped to every browser.
3. **Run the smoke test** from your machine:

   ```bash
   npm run smoke -- --api https://biotoken-api.onrender.com --web https://biotoken-web.onrender.com
   ```

   It checks, read-only:
   - API health;
   - `/health/ready`: contract deployed, oracle and admin roles on-chain, admin has gas, MongoDB reachable;
   - CORS for the web origin;
   - a real AI verdict signed by the on-chain oracle;
   - the SPA routes;
   - that the bundle points at the deployed contract and this API;
   - that the served `fingerprint.wasm`/`.zkey` match the hashes the deployed verifier was built from.
4. **One manual session**: log in as a manufacturer and as a lab (two browsers), then mint, ship, receive and verify with the files in [samples/hplc/](../samples/hplc/) (see [SYSTEM_VERIFICATION.md §6](SYSTEM_VERIFICATION.md#6-hplc-upload-files)).

## 4. Configuration reference

**biotoken-api**

| Variable | Required | Notes |
|---|---|---|
| `DEPLOYER_PRIVATE_KEY` | yes | Admin of the deployed BioToken; grants roles |
| `AI_ORACLE_PRIVATE_KEY` | yes | Address must hold `AI_ORACLE_ROLE` |
| `MONGODB_URI` | yes | |
| `AMOY_RPC_URL` | yes | Defaults to the public drpc endpoint; a dedicated RPC (Alchemy, Infura, drpc key) is more reliable |
| `CORS_ORIGINS` | yes | Comma-separated; bare hosts get `https://` |
| `ROLE_AUTO_APPROVE` | no | Default `true`: a user's chosen role (lab or manufacturer) is granted at once. `false`: requests wait for `POST /admin/approve-role/{wallet}` |
| `ADMIN_API_TOKEN` | if approval is used | `X-Admin-Token` header for `/admin/*` |
| `CONTRACT_ADDRESS` | no | Overrides `deployments/amoy.json` |
| `PYTHON_VERSION` | – | `3.13`; dependencies are pinned in [ai/requirements.txt](../ai/requirements.txt) |

**biotoken-web** (read at build time; changing one needs a redeploy of the static site)

| Variable | Required | Notes |
|---|---|---|
| `VITE_PRIVY_APP_ID` | yes | |
| `VITE_PIMLICO_API_KEY`, `VITE_PIMLICO_POLICY_ID` | yes | |
| `VITE_AI_API_URL` | yes | Public URL of the API service (e.g. `https://biotoken-api.onrender.com` or a custom domain); `VITE_AI_API_HOST` (bare host) also works |
| `VITE_AMOY_RPC_URL` | no | Read-only chain calls from the browser |
| `VITE_CONTRACT_ADDRESS` | no | Overrides `deployments/amoy.json` |
| `NODE_VERSION` | – | `22` (Vite 8 needs ≥ 20.19) |

**Endpoints for operations**

| Endpoint | Use |
|---|---|
| `GET /health` | Render health check: models loaded, oracle and contract configured |
| `GET /health/ready` | Full readiness (chain, roles, gas, MongoDB); 503 with details when something is missing |
| `GET /admin/role-requests`, `POST /admin/approve-role/{wallet}` | Role approval when `ROLE_AUTO_APPROVE=false` (`X-Admin-Token`) |

## 5. Releasing changes

- **App or API code**: push to the branch Render tracks; each service redeploys only when its paths change (see `buildFilter` in `render.yaml`).
- **New contracts** (e.g. after a circuit change):
  1. Rebuild the circuit and copy its artifacts to `frontend/public/` ([circuits/SETUP.md](../circuits/SETUP.md)).
  2. Run `npm run deploy:contracts` locally (needs `DEPLOYER_PRIVATE_KEY` and `AI_ORACLE_PRIVATE_KEY` in `.env`).
  3. Commit `deployments/amoy.json` and push. Both services redeploy and pick up the new address.
  4. Users re-register on the new contract (the app's retry button does it).
  5. Run the smoke test.
- **Rotating the AI oracle key**: grant `AI_ORACLE_ROLE` to the new address (`ROLE=AI_ORACLE ADDRESS=0x… npx hardhat run scripts/grantRoles.js --network amoy`), update `AI_ORACLE_PRIVATE_KEY` on Render, then revoke the old address's role.

## 6. Production notes

- **Plan size**: measured on Linux with exactly `ai/requirements.txt` (Python 3.13): ready 7 s after start, 273 MB resident after a verdict, 530 MB installed. `render.yaml` uses the *Free* plan: its 512 MB is enough, but it spins down after 15 idle minutes, and the next request waits for a cold start (up to about a minute). For an always-on API, change `plan: free` to `plan: starter` (paid).
- **Secrets**: the deployer and oracle keys are as sensitive as the contract itself. For anything beyond a testnet, use separate keys from your development ones, keep them only in Render's environment, and consider a hardware/KMS signer for the oracle.
- **Open role registration**: with `ROLE_AUTO_APPROVE=true` any signed-in user can become a lab or manufacturer. Switch it to `false` before real users and approve requests through `/admin/approve-role`.
- **Trusted setup**: the circuit's phase-2 setup has a single contributor. That's fine on Amoy; run a multi-party phase 2 before mainnet ([circuits/SETUP.md](../circuits/SETUP.md)).
- **Mainnet**: moving off Amoy means a mainnet RPC, chain id and Pimlico chain, a `polygon` network in `hardhat.config.js`, and redeploying. `TARGET_CHAIN_ID` in `frontend/src/config.js` and the `polygonAmoy` chain in `frontend/src/main.jsx` and `lib/pimlico.js` are Amoy-specific today.
