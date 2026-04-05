# BioToken — Setup & How It Works

## Setup Steps

### 1. Start the local blockchain
Open a terminal and keep it running the whole time:
```bash
npx hardhat node
```

### 2. Deploy contracts
In a second terminal:
```bash
npx hardhat run scripts/deploy.js --network localhost
```
Creates `deployments/localhost.json` with both contract addresses.

### 3. Grant roles to your wallet
Edit `scripts/grantRoles.js` and put your MetaMask address in, then:
```bash
npx hardhat run scripts/grantRoles.js --network localhost
```
This gives your wallet MANUFACTURER_ROLE, LOGISTICS_ROLE, and LAB_ROLE.

### 4. Make sure `frontend/src/config.js` is set to localhost
```js
import BioTokenDeploy from "../../deployments/localhost.json";
export const TARGET_CHAIN_ID = 31337;
```

### 5. Add Hardhat Local network to MetaMask
| Field | Value |
|---|---|
| Network name | Hardhat Local |
| RPC URL | http://127.0.0.1:8545 |
| Chain ID | 31337 |
| Currency symbol | ETH |

Import Account #0 from the `npx hardhat node` output into MetaMask, or use your own wallet after running `grantRoles.js`.

### 6. Start the frontend
```bash
cd frontend
npm run dev
```

### 7. Run the tests
```bash
# Unit tests (fast)
npx hardhat test test/BioToken.test.js

# Integration tests (real Groth16, ~8s)
npx hardhat test test/BioToken.integration.test.js
```
Expected: **12/12 passing**

---

## Switching to Polygon Amoy (when you have MATIC)

```bash
npx hardhat run scripts/deploy.js --network amoy
```

Then update `config.js`:
```js
import BioTokenDeploy from "../../deployments/amoy.json";
export const TARGET_CHAIN_ID = 80002;
// rpcUrls: use your Alchemy URL, not the public one
```

And update MetaMask RPC to your Alchemy URL — the public Polygon Amoy RPC rate-limits aggressively.

---

## How Each Stage Works

### Stage 1 — Mint
Manufacturer creates a new reagent batch NFT.

- Frontend calls `BioToken.mintToken(batchId, expiry, vkHash, sig)`
- Contract mints an ERC-721 with status `MINTED`, owned by the manufacturer
- Batch ID, expiry, and VK hash are permanently recorded on-chain

### Stage 2 — Transfer Custody
Reagent is shipped. Manufacturer hands it off to the lab.

- Frontend calls `BioToken.transferCustody(tokenId, labAddress)`
- NFT ownership transfers to the lab address
- Status: `MINTED` → `IN_TRANSIT`

### Stage 3 — Confirm Receipt
Lab confirms the physical vial arrived.

- Frontend calls `BioToken.confirmReceipt(tokenId)`
- Status: `IN_TRANSIT` → `RECEIVED`

### Stage 4 — ZK-AI Verification
The core of BioToken. Three steps happen in sequence:

**A. AI Pre-screen**
- Lab enters 10 HPLC peak values from their instrument
- `aiCheck.js` runs locally in the browser
- Checks if the peak profile is within expected tolerance
- If anomaly detected → pipeline halts, no proof generated

**B. ZK Proof Generation**
- Peaks + threshold go into the Circom circuit (`FingerprintMatch`)
- Circuit checks: are all adjacent peak differences ≤ threshold?
- If yes → `valid = 1`
- snarkjs generates a Groth16 proof (3 elliptic curve points)
- The proof says "my data matches" without revealing the actual peaks

**C. On-chain Verification**
- Frontend calls `BioToken.verifyProof(tokenId, a, b, c, pubSignals)`
- BioToken calls `HplcVerifier.verifyProof(a, b, c, pubSignals)`
- HplcVerifier checks `pubSignals[0] == 1` (circuit reported a match)
- Then runs BN128 elliptic curve pairing math
- If it passes → status `RECEIVED` → `VERIFIED`

> **The pi_b swap:** snarkjs stores pi_b as `[[x1,x2],[y1,y2]]` but Solidity expects `[[x2,x1],[y2,y1]]`. Always swap the inner coordinates when passing a proof to the contract.

### Stage 5 — Consume
Lab uses the reagent. Terminal state, cannot be undone.

- Frontend calls `BioToken.consumeToken(tokenId)`
- Status: `VERIFIED` → `CONSUMED`
- Any future scan of this token returns "Token Expended"
- Empty vials are worthless to counterfeiters — the NFT is dead

---

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `RPC endpoint returned too many errors` | Public Amoy RPC rate limit | Use Alchemy RPC URL in MetaMask, not the public one |
| `execution reverted` on mint | No MANUFACTURER_ROLE | Run `grantRoles.js` with your wallet address |
| `Token Not Found` / `BAD_DATA` | Wrong contract address | Check `config.js` imports the right deployment JSON |
| `insufficient funds` | No ETH/MATIC in wallet | Use Hardhat Account #0 locally, or get testnet MATIC |
| `ZKProofInvalid` | Wrong proof or pi_b not swapped | Use `proof_pass.json` values with pi_b coordinates swapped |
| Everything breaks after restart | Hardhat node reset = blockchain wiped | Redeploy contracts + hard refresh browser (Ctrl+Shift+R) |
