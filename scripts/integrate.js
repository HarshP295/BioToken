// scripts/integrate.js
// ─────────────────────────────────────────────────────────────────
//  BioToken End-to-End Integration Script
//
//  Connects all three layers:
//    1. AI pre-screen (genuine / anomaly check)
//    2. ZK proof generation (snarkjs Groth16)
//    3. On-chain verification (BioToken.verifyProof)
//
//  On the local Hardhat network the script self-deploys (each
//  `hardhat run` spins up a fresh in-memory chain). For persistent
//  networks (localhost, amoy) it reads deployments/<network>.json.
//
//  Step 4 calls the Python AI service (ai/api.py), so start it first:
//    cd ai && uvicorn api:app --port 8000
//
//  Usage:
//    npx hardhat run scripts/integrate.js
//    npx hardhat run scripts/integrate.js --network localhost
//    npx hardhat run scripts/integrate.js --network amoy
//  Env: AI_API_URL (default http://localhost:8000), OBSERVED_RT (seconds)
// ─────────────────────────────────────────────────────────────────

const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");
const { aiPreScreen: circuitPreCheck } = require("./aiCheck");

// ── Configuration ────────────────────────────────────────────────

// Sample HPLC data — in production this comes from the HPLC machine
const SAMPLE_PEAKS     = [100, 105, 108, 103, 101, 99, 102, 104, 100, 103];
const SAMPLE_THRESHOLD = 10;

// Reagent identity + RT the lab measured (caffeine; 636.2 s is the RT
// predictor's estimate on the METLIN SMRT scale — caffeine is not in SMRT).
const AI_API_URL         = process.env.AI_API_URL || "http://localhost:8000";
const SAMPLE_SMILES      = "CN1C=NC2=C1C(=O)N(C(=O)N2C)C";
const SAMPLE_OBSERVED_RT = Number(process.env.OBSERVED_RT || 636.2);

// Paths to circuit artifacts
const CIRCUIT_DIR   = path.join(__dirname, "..", "circuits", "build");
const WASM_PATH     = path.join(CIRCUIT_DIR, "fingerprint_js", "fingerprint.wasm");
const ZKEY_PATH     = path.join(CIRCUIT_DIR, "fingerprint_final.zkey");

// ── Helpers ──────────────────────────────────────────────────────

/**
 * AI pre-screen via the Python service: SMILES + observed RT → 137 RDKit
 * features → XGBoost RT predictor + anomaly classifier.
 */
async function runAiPreScreen(smiles, observedRt) {
    const post = async (route, body) => {
        const res = await fetch(`${AI_API_URL}${route}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`${route} → HTTP ${res.status}: ${await res.text()}`);
        return res.json();
    };
    const features = await post("/compute-features", { smiles, observed_rt: observedRt });
    return post("/verify", { ...features, token_id: 0 });
}

/**
 * Deploy contracts fresh (used for the ephemeral "hardhat" network).
 */
async function deployFresh() {
    console.log("  Deploying HplcVerifier...");
    const HplcVerifier = await hre.ethers.getContractFactory("HplcVerifier");
    const verifier = await HplcVerifier.deploy();
    await verifier.waitForDeployment();

    console.log("  Deploying BioToken...");
    const BioToken = await hre.ethers.getContractFactory("BioToken");
    const bioToken = await BioToken.deploy(await verifier.getAddress());
    await bioToken.waitForDeployment();

    console.log(`  HplcVerifier: ${await verifier.getAddress()}`);
    console.log(`  BioToken:     ${await bioToken.getAddress()}\n`);
    return bioToken;
}

/**
 * Load already-deployed contracts from deployments/<network>.json.
 */
function loadDeployment(networkName) {
    const deployPath = path.join(__dirname, "..", "deployments", `${networkName}.json`);
    if (!fs.existsSync(deployPath)) {
        console.error(`❌ No deployment found at ${deployPath}`);
        console.error("   Run 'npx hardhat run scripts/deploy.js --network <network>' first.");
        process.exit(1);
    }
    const deployment = JSON.parse(fs.readFileSync(deployPath, "utf8"));
    console.log(`  Loaded deployment from ${deployPath}`);
    console.log(`  BioToken:     ${deployment.BioToken.address}`);
    console.log(`  HplcVerifier: ${deployment.HplcVerifier.address}\n`);
    return deployment;
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
    const networkName = hre.network.name;
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  BioToken End-to-End Integration");
    console.log(`  Network: ${networkName}`);
    console.log("═══════════════════════════════════════════════════════════\n");

    // ── Get contract instance ────────────────────────────────────
    const [admin] = await hre.ethers.getSigners();
    let bioToken;

    if (networkName === "hardhat") {
        // Ephemeral in-memory network — deploy inline
        console.log("─── Deploy (ephemeral hardhat network) ─────────────────");
        bioToken = await deployFresh();
    } else {
        // Persistent network — read from deployment file
        console.log("─── Loading deployment ─────────────────────────────────");
        const deployment = loadDeployment(networkName);
        bioToken = new hre.ethers.Contract(
            deployment.BioToken.address,
            deployment.BioToken.abi,
            admin
        );
    }

    // ── Step 1: Mint a token ─────────────────────────────────────
    console.log("─── Step 1: Mint Token ─────────────────────────────────");
    const MANUFACTURER_ROLE = await bioToken.MANUFACTURER_ROLE();
    const LOGISTICS_ROLE    = await bioToken.LOGISTICS_ROLE();
    const LAB_ROLE          = await bioToken.LAB_ROLE();

    // Grant roles (admin = deployer has DEFAULT_ADMIN_ROLE)
    const signers = await hre.ethers.getSigners();
    const manufacturer = signers[1] || admin;
    const logistics    = signers[2] || admin;
    const labSigner    = signers[3] || admin;

    // Grant roles if not already granted
    try {
        if (!(await bioToken.hasRole(MANUFACTURER_ROLE, manufacturer.address))) {
            await (await bioToken.grantRole(MANUFACTURER_ROLE, manufacturer.address)).wait();
        }
        if (!(await bioToken.hasRole(LOGISTICS_ROLE, logistics.address))) {
            await (await bioToken.grantRole(LOGISTICS_ROLE, logistics.address)).wait();
        }
        if (!(await bioToken.hasRole(LAB_ROLE, labSigner.address))) {
            await (await bioToken.grantRole(LAB_ROLE, labSigner.address)).wait();
        }
    } catch (e) {
        console.log("  (Roles may already be granted, continuing...)");
    }

    const expiry = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
    const mintTx = await bioToken.connect(manufacturer).mintToken(
        "BATCH-INTEGRATION-001", expiry, hre.ethers.ZeroHash, "0x"
    );
    const mintReceipt = await mintTx.wait();
    // Parse tokenId from TokenMinted event
    const mintEvent = mintReceipt.logs.find(
        log => {
            try { return bioToken.interface.parseLog(log)?.name === "TokenMinted"; }
            catch { return false; }
        }
    );
    const tokenId = bioToken.interface.parseLog(mintEvent).args[0];
    console.log(`  ✓ Minted token #${tokenId} (batch: BATCH-INTEGRATION-001)\n`);

    // ── Step 2: Transfer custody ─────────────────────────────────
    console.log("─── Step 2: Transfer Custody ──────────────────────────");
    await (await bioToken.connect(logistics).transferCustody(tokenId, labSigner.address)).wait();
    console.log(`  ✓ Custody transferred to lab (${labSigner.address})\n`);

    // ── Step 3: Confirm receipt ──────────────────────────────────
    console.log("─── Step 3: Confirm Receipt ───────────────────────────");
    await (await bioToken.connect(labSigner).confirmReceipt(tokenId)).wait();
    console.log("  ✓ Lab confirmed receipt. Status: RECEIVED\n");

    // ── Step 4: AI Pre-Screen ───────────────────────────────────
    console.log("─── Step 4: AI Pre-Screen ─────────────────────────────");
    console.log(`  SMILES:       ${SAMPLE_SMILES}`);
    console.log(`  Observed RT:  ${SAMPLE_OBSERVED_RT} s`);
    const aiResult = await runAiPreScreen(SAMPLE_SMILES, SAMPLE_OBSERVED_RT);
    console.log(`  Predicted RT: ${aiResult.predicted_rt.toFixed(1)} s (deviation ${aiResult.pct_deviation.toFixed(2)}%)`);
    console.log(`  Anomaly prob: ${aiResult.anomaly_prob.toFixed(4)} (threshold ${aiResult.threshold})`);
    console.log(`  Result:       ${aiResult.genuine ? "✓ GENUINE" : "✗ ANOMALY"}\n`);

    if (!aiResult.genuine) {
        console.error("❌ AI pre-screen FAILED. Batch flagged as anomaly.");
        console.error("   ZK proof generation skipped. Pipeline halted.");
        process.exit(1);
    }

    // Cheap check of the same constraint the circuit enforces, so an
    // out-of-tolerance peak profile fails before spending time on snarkjs.
    const preCheck = circuitPreCheck(SAMPLE_PEAKS, SAMPLE_THRESHOLD);
    console.log(`  Circuit pre-check: ${preCheck.details.reason}\n`);
    if (!preCheck.genuine) {
        console.error("❌ Peak profile violates the circuit tolerance. Pipeline halted.");
        process.exit(1);
    }

    // ── Step 5: Generate ZK Proof ───────────────────────────────
    console.log("─── Step 5: Generate ZK Proof ─────────────────────────");

    // Dynamically import snarkjs (ESM module)
    const snarkjs = await import("snarkjs");

    // Prepare circuit input
    const circuitInput = {
        peaks: SAMPLE_PEAKS.map(String),
        threshold: String(SAMPLE_THRESHOLD),
    };
    console.log("  Generating witness and proof...");

    // Generate proof using snarkjs fullProve (witness + prove in one step)
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInput, WASM_PATH, ZKEY_PATH
    );

    console.log(`  ✓ Proof generated successfully`);
    console.log(`  Public signals: [valid=${publicSignals[0]}, threshold=${publicSignals[1]}]`);
    console.log(`  Protocol: ${proof.protocol}, Curve: ${proof.curve}\n`);

    if (publicSignals[0] !== "1") {
        console.error("❌ Circuit output valid=0. Proof generated but batch didn't pass.");
        process.exit(1);
    }

    // ── Step 6: Submit Proof On-Chain ───────────────────────────
    console.log("─── Step 6: Submit Proof On-Chain ─────────────────────");

    // Format proof for Solidity (snarkjs pi_b needs coordinate swap)
    const a = [proof.pi_a[0], proof.pi_a[1]];
    const b = [
        [proof.pi_b[0][1], proof.pi_b[0][0]],   // swap x coords
        [proof.pi_b[1][1], proof.pi_b[1][0]],   // swap y coords
    ];
    const c = [proof.pi_c[0], proof.pi_c[1]];
    const pubSignals = [publicSignals[0], publicSignals[1]];

    console.log("  Submitting to BioToken.verifyProof()...");
    const verifyTx = await bioToken.connect(labSigner).verifyProof(
        tokenId, a, b, c, pubSignals
    );
    const verifyReceipt = await verifyTx.wait();
    console.log(`  ✓ Transaction confirmed: ${verifyReceipt.hash}`);
    console.log(`  Gas used: ${verifyReceipt.gasUsed.toString()}\n`);

    // ── Step 7: Verify final state ──────────────────────────────
    console.log("─── Step 7: Final State ───────────────────────────────");
    const tokenData = await bioToken.getTokenData(tokenId);
    const statusNames = ["MINTED", "IN_TRANSIT", "RECEIVED", "VERIFIED", "CONSUMED"];
    console.log(`  Token #${tokenId}:`);
    console.log(`    Batch:  ${tokenData.batchId}`);
    console.log(`    Status: ${statusNames[Number(tokenData.status)]}`);
    console.log(`    Owner:  ${await bioToken.ownerOf(tokenId)}\n`);

    // ── Step 8: Consume ─────────────────────────────────────────
    console.log("─── Step 8: Consume Token ─────────────────────────────");
    await (await bioToken.connect(labSigner).consumeToken(tokenId)).wait();
    const finalData = await bioToken.getTokenData(tokenId);
    console.log(`  ✓ Token consumed. Final status: ${statusNames[Number(finalData.status)]}\n`);

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ BioToken End-to-End Integration: SUCCESS");
    console.log("═══════════════════════════════════════════════════════════");
}

// snarkjs leaves its curve worker threads running, so exit explicitly.
main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Integration failed:", err);
        process.exit(1);
    });
