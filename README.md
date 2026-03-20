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
