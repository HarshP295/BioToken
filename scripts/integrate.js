// scripts/integrate.js
// ─────────────────────────────────────────────────────────────────
//  BioToken End-to-End Integration Script
//
//  Runs the whole lifecycle with the same code the web app uses
//  (frontend/src/lib/hplcParser.js, consensusValidator.js, fingerprint.js):
//    1. Manufacturer: Gold Standard file → consensus → Poseidon commitment → mint
//    2. Ship to the lab, lab confirms receipt
//    3. AI pre-screen (ai/api.py /verify) → GENUINE + oracle signature
//    4. Lab scan file → ZK proof that it matches the committed Gold Standard
//    5. verifyProof on-chain (Groth16 + AI signature), then consume
//
//  On the local Hardhat network the script deploys fresh contracts and
//  trusts the AI service's oracle key. Start the AI service first:
//    cd ai && uvicorn api:app --port 8000
//
//  Usage:
//    npx hardhat run scripts/integrate.js
//  Env (all optional):
//    AI_API_URL   default http://127.0.0.1:8000
//    GOLD_FILE    default samples/hplc/manufacturer/BATCH-CAF-001_gold_standard.csv
//    LAB_CSV      default samples/hplc/lab/BATCH-CAF-001_lab_scan_genuine.csv
//    SMILES       default caffeine;  OBSERVED_RT  default 636.2 (seconds)
//    TOLERANCE    default 10
//  The real-network equivalent (gasless, via Pimlico) is scripts/e2e_amoy.mjs.
// ─────────────────────────────────────────────────────────────────

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..");
const AI_API_URL  = process.env.AI_API_URL || "http://127.0.0.1:8000";
const GOLD_FILE   = process.env.GOLD_FILE || "samples/hplc/manufacturer/BATCH-CAF-001_gold_standard.csv";
const LAB_CSV     = process.env.LAB_CSV || "samples/hplc/lab/BATCH-CAF-001_lab_scan_genuine.csv";
const SMILES      = process.env.SMILES || "CN1C=NC2=C1C(=O)N(C(=O)N2C)C";
const OBSERVED_RT = Number(process.env.OBSERVED_RT || 636.2);
const TOLERANCE   = Number(process.env.TOLERANCE || 10);
const BATCH_ID    = process.env.BATCH_ID || "BATCH-INTEGRATION-001";

const WASM = path.join(ROOT, "circuits", "build", "fingerprint_js", "fingerprint.wasm");
const ZKEY = path.join(ROOT, "circuits", "build", "fingerprint_final.zkey");
const STATUS = ["MINTED", "IN_TRANSIT", "RECEIVED", "VERIFIED", "CONSUMED"];

const lib = name => import(pathToFileURL(path.join(ROOT, "frontend", "src", "lib", name)).href);

async function readPeaks(relPath) {
    const { parseHplcFile } = await lib("hplcParser.js");
    const filePath = path.resolve(ROOT, relPath);
    const text = fs.readFileSync(filePath, "utf8");
    return (await parseHplcFile({ name: path.basename(filePath), text: async () => text })).peaks.map(Number);
}

async function aiVerify(body) {
    const res = await fetch(`${AI_API_URL}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`/verify → HTTP ${res.status}: ${await res.text()}`);
    return res.json();
}

async function main() {
    const network = hre.network.name;
    if (network !== "hardhat" && network !== "localhost") {
        throw new Error("integrate.js deploys its own contracts; for Amoy use `node scripts/e2e_amoy.mjs`");
    }
    const fp = await lib("fingerprint.js");
    const { validateConsensus } = await lib("consensusValidator.js");
    const [, manufacturer, lab] = await hre.ethers.getSigners();

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  BioToken End-to-End Integration");
    console.log(`  Network: ${network}`);
    console.log("═══════════════════════════════════════════════════════════\n");

    // ── Deploy ───────────────────────────────────────────────────
    console.log("─── Deploy ─────────────────────────────────────────────");
    const health = await (await fetch(`${AI_API_URL}/health`)).json();
    if (!health.ai_oracle) throw new Error("AI service has no AI_ORACLE_PRIVATE_KEY; it cannot sign verdicts");
    const verifier = await (await hre.ethers.getContractFactory("HplcVerifier")).deploy();
    const bioToken = await (await hre.ethers.getContractFactory("BioToken")).deploy(await verifier.getAddress(), health.ai_oracle);
    await bioToken.grantRole(await bioToken.MANUFACTURER_ROLE(), manufacturer.address);
    await bioToken.grantRole(await bioToken.LAB_ROLE(), lab.address);
    const contractAddress = await bioToken.getAddress();
    console.log(`  HplcVerifier: ${await verifier.getAddress()}`);
    console.log(`  BioToken:     ${contractAddress}`);
    console.log(`  AI oracle:    ${health.ai_oracle} (from ${AI_API_URL}/health)\n`);

    // ── Step 1: Manufacturer mints ───────────────────────────────
    console.log("─── Step 1: Mint (manufacturer) ───────────────────────");
    const goldPeaks = await readPeaks(GOLD_FILE);
    const consensus = validateConsensus(goldPeaks);
    console.log(`  Gold Standard ${path.basename(GOLD_FILE)}: [${goldPeaks.join(", ")}]`);
    console.log(`  Consensus: ${consensus.passed ? "PASS" : "FAIL"} (±${consensus.tolerance} of ${consensus.peerCount} peers)`);
    if (!consensus.passed) throw new Error("Consensus failed; mint blocked");
    const salt = fp.randomSalt();
    const commitment = await fp.computeCommitment(goldPeaks, salt);
    const expiry = (await hre.ethers.provider.getBlock("latest")).timestamp + 365 * 86400;
    const mintReceipt = await (await bioToken.connect(manufacturer)
        .mintToken(BATCH_ID, SMILES, expiry, fp.toBytes32(commitment), TOLERANCE, "0x")).wait();
    const tokenId = mintReceipt.logs.map(l => bioToken.interface.parseLog(l)).find(e => e?.name === "TokenMinted").args.tokenId;
    const goldPackage = fp.buildGoldPackage({
        tokenId, batchId: BATCH_ID, reagentSmiles: SMILES, peaks: goldPeaks, salt,
        tolerance: TOLERANCE, commitment, contract: contractAddress, chainId: 31337,
    });
    console.log(`  ✓ Token #${tokenId} minted, commitment ${goldPackage.commitment.slice(0, 18)}…, tolerance ±${TOLERANCE}\n`);

    // ── Step 2: Ship, receive ────────────────────────────────────
    console.log("─── Step 2: Ship to lab, confirm receipt ──────────────");
    await (await bioToken.connect(manufacturer).transferCustody(tokenId, lab.address)).wait();
    await (await bioToken.connect(lab).confirmReceipt(tokenId)).wait();
    console.log(`  ✓ Lab ${lab.address} holds token #${tokenId}, status RECEIVED\n`);

    // ── Step 3: AI pre-screen ────────────────────────────────────
    console.log("─── Step 3: AI pre-screen ─────────────────────────────");
    const reagent = (await bioToken.getTokenData(tokenId)).reagentSmiles;
    const ai = await aiVerify({
        smiles: reagent, observed_rt: OBSERVED_RT, token_id: Number(tokenId),
        chain_id: 31337, contract_address: contractAddress,
    });
    console.log(`  Reagent (on-chain): ${reagent}`);
    console.log(`  Observed RT:  ${OBSERVED_RT} s, predicted ${ai.predicted_rt.toFixed(1)} s (deviation ${ai.pct_deviation.toFixed(2)}%)`);
    console.log(`  Anomaly prob: ${ai.anomaly_prob.toFixed(4)} (threshold ${ai.threshold})`);
    console.log(`  Result:       ${ai.genuine ? "✓ GENUINE (signed by oracle)" : "✗ ANOMALY"}\n`);
    if (!ai.genuine) {
        console.error("❌ AI pre-screen FAILED. Batch flagged as anomaly. Pipeline halted.");
        process.exit(1);
    }

    // ── Step 4: ZK proof ─────────────────────────────────────────
    console.log("─── Step 4: ZK proof (lab scan vs committed Gold Standard)");
    const labPeaks = await readPeaks(LAB_CSV);
    const cmp = fp.compareToGold(labPeaks, goldPackage.peaks, TOLERANCE);
    console.log(`  Lab scan ${path.basename(LAB_CSV)}: [${labPeaks.join(", ")}]`);
    console.log(`  Max |lab − gold| = ${Math.max(...cmp.perPeak.map(p => p.delta))} (tolerance ±${TOLERANCE})`);
    if (!cmp.passed) {
        console.error("❌ Lab scan does not match the Gold Standard. No proof can exist. Pipeline halted.");
        process.exit(1);
    }
    const snarkjs = await import("snarkjs");
    const t0 = Date.now();
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(fp.buildCircuitInput({
        labPeaks, goldPeaks: goldPackage.peaks, salt: goldPackage.salt,
        commitment, tolerance: TOLERANCE, tokenId,
    }), WASM, ZKEY);
    console.log(`  ✓ Proof generated in ${Date.now() - t0} ms; public signals [commitment, tolerance=${publicSignals[1]}, tokenId=${publicSignals[2]}]\n`);

    // ── Step 5: On-chain verification ────────────────────────────
    console.log("─── Step 5: verifyProof on-chain ──────────────────────");
    const { a, b, c } = fp.formatProofForContract(proof);
    const verifyReceipt = await (await bioToken.connect(lab).verifyProof(tokenId, a, b, c, ai.attestation)).wait();
    console.log(`  ✓ Transaction ${verifyReceipt.hash}, gas used ${verifyReceipt.gasUsed}`);
    console.log(`  Status: ${STATUS[Number((await bioToken.getTokenData(tokenId)).status)]}\n`);

    // ── Step 6: Consume ──────────────────────────────────────────
    console.log("─── Step 6: Consume ───────────────────────────────────");
    await (await bioToken.connect(lab).consumeToken(tokenId)).wait();
    console.log(`  ✓ Final status: ${STATUS[Number((await bioToken.getTokenData(tokenId)).status)]}\n`);

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  ✅ BioToken End-to-End Integration: SUCCESS");
    console.log("═══════════════════════════════════════════════════════════");
}

// snarkjs leaves its curve worker threads running, so exit explicitly.
main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Integration failed:", err.message || err);
        process.exit(1);
    });
