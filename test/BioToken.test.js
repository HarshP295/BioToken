// test/BioToken.test.js
// ─────────────────────────────────────────────────────────────────
//  BioToken test suite  (Week 4 — 7 tests total)
//
//  Tests 1-5: original lifecycle tests (unchanged)
//  Test 6:    valid ZK proof → VERIFIED  ✓
//  Test 7:    tampered / bad proof → reverts with ZKProofInvalid  ✓
//
//  Strategy for ZK tests
//  ─────────────────────
//  Rather than invoking snarkjs inside Hardhat (which would require
//  the full wasm witness generator and is slow), we deploy a small
//  MockVerifier alongside the real contract. This lets us:
//    • Test the full BioToken → IHplcVerifier call path
//    • Control pass/fail from the test (no actual Groth16 math)
//    • Keep the suite fast (< 1 second for ZK tests)
//
//  When you have a real proof from snarkjs you can run the integration
//  test in test/BioToken.integration.test.js (see bottom of this file
//  for a ready-made template).
// ─────────────────────────────────────────────────────────────────

const { expect }  = require("chai");
const { ethers }  = require("hardhat");

// ── Helpers ──────────────────────────────────────────────────────

/** Zero-value Groth16 proof components (shape only, values ignored by mock) */
const ZERO_PROOF = {
    a:          [0n, 0n],
    b:          [[0n, 0n], [0n, 0n]],
    c:          [0n, 0n],
    pubSignals: [1n, 10n],   // [valid=1, threshold=10]  ← matching input.json
};

/** A proof with valid=0 in public signals — simulates a tampered batch */
const TAMPERED_PROOF = {
    ...ZERO_PROOF,
    pubSignals: [0n, 10n],   // valid=0
};

// Deploy a MockVerifier that returns `shouldPass` for any proof
async function deployMockVerifier(shouldPass) {
    // Inline bytecode for a minimal verifier that always returns `shouldPass`.
    // ABI: verifyProof(uint[2],uint[2][2],uint[2],uint[2]) returns (bool)
    //
    // We deploy it via a factory contract so we don't need a separate .sol file.
    const MockVerifierFactory = await ethers.getContractFactory("MockVerifier");
    const mock = await MockVerifierFactory.deploy(shouldPass);
    await mock.waitForDeployment();
    return mock;
}

// ── Fixtures ─────────────────────────────────────────────────────

async function deployWithMock(verifierShouldPass) {
    const [admin, manufacturer, logistics, lab, other] = await ethers.getSigners();

    const mockVerifier = await deployMockVerifier(verifierShouldPass);

    const BioToken = await ethers.getContractFactory("BioToken");
    const bioToken = await BioToken.deploy(await mockVerifier.getAddress());
    await bioToken.waitForDeployment();

    // Grant roles
    await bioToken.grantRole(await bioToken.MANUFACTURER_ROLE(), manufacturer.address);
    await bioToken.grantRole(await bioToken.LOGISTICS_ROLE(),    logistics.address);
    await bioToken.grantRole(await bioToken.LAB_ROLE(),          lab.address);

    return { bioToken, mockVerifier, admin, manufacturer, logistics, lab, other };
}

async function mintAndAdvanceTo(status, ctx) {
    const { bioToken, manufacturer, logistics, lab } = ctx;

    const expiry = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
    const tx = await bioToken
        .connect(manufacturer)
        .mintToken("BATCH-001", expiry, ethers.ZeroHash, "0x");
    const receipt = await tx.wait();
    const tokenId = 0n; // first token

    if (status === "MINTED") return tokenId;

    // → IN_TRANSIT
    await bioToken.connect(logistics).transferCustody(tokenId, lab.address);
    if (status === "IN_TRANSIT") return tokenId;

    // → RECEIVED
    await bioToken.connect(lab).confirmReceipt(tokenId);
    if (status === "RECEIVED") return tokenId;

    return tokenId;
}

// ── Test Suite ────────────────────────────────────────────────────

describe("BioToken", function () {

    // ── Test 1 ─────────────────────────────────────────────────
    it("1. Mints a token and stores correct on-chain metadata", async function () {
        const ctx      = await deployWithMock(true);
        const { bioToken, manufacturer } = ctx;

        const expiry   = 9999999999n;
        const vk       = ethers.keccak256(ethers.toUtf8Bytes("vk-test"));
        const sig      = ethers.toUtf8Bytes("marketplace-sig");

        await expect(
            bioToken.connect(manufacturer).mintToken("BATCH-TEST", expiry, vk, sig)
        ).to.emit(bioToken, "TokenMinted").withArgs(0n, "BATCH-TEST", manufacturer.address);

        const data = await bioToken.getTokenData(0n);
        expect(data.batchId).to.equal("BATCH-TEST");
        expect(data.expiry).to.equal(expiry);
        expect(data.verificationKey).to.equal(vk);
        expect(data.status).to.equal(0); // MINTED
    });

    // ── Test 2 ─────────────────────────────────────────────────
    it("2. Full happy-path: MINTED → IN_TRANSIT → RECEIVED → VERIFIED → CONSUMED", async function () {
        const ctx = await deployWithMock(true);
        const { bioToken, manufacturer, logistics, lab } = ctx;

        const expiry  = Math.floor(Date.now() / 1000) + 31536000;
        await bioToken.connect(manufacturer).mintToken("BATCH-FULL", expiry, ethers.ZeroHash, "0x");
        const tokenId = 0n;

        // MINTED → IN_TRANSIT
        await expect(bioToken.connect(logistics).transferCustody(tokenId, lab.address))
            .to.emit(bioToken, "CustodyTransferred");
        expect((await bioToken.getTokenData(tokenId)).status).to.equal(1); // IN_TRANSIT

        // IN_TRANSIT → RECEIVED
        await expect(bioToken.connect(lab).confirmReceipt(tokenId))
            .to.emit(bioToken, "TokenReceived");
        expect((await bioToken.getTokenData(tokenId)).status).to.equal(2); // RECEIVED

        // RECEIVED → VERIFIED  (mock verifier returns true)
        await expect(
            bioToken.connect(lab).verifyProof(
                tokenId,
                ZERO_PROOF.a,
                ZERO_PROOF.b,
                ZERO_PROOF.c,
                ZERO_PROOF.pubSignals
            )
        ).to.emit(bioToken, "TokenVerified");
        expect((await bioToken.getTokenData(tokenId)).status).to.equal(3); // VERIFIED

        // VERIFIED → CONSUMED
        await expect(bioToken.connect(lab).consumeToken(tokenId))
            .to.emit(bioToken, "TokenConsumed");
        expect((await bioToken.getTokenData(tokenId)).status).to.equal(4); // CONSUMED
    });

    // ── Test 3 ─────────────────────────────────────────────────
    it("3. Rejects verifyProof on a CONSUMED token", async function () {
        const ctx     = await deployWithMock(true);
        const tokenId = await mintAndAdvanceTo("RECEIVED", ctx);
        const { bioToken, lab } = ctx;

        // verify → consume
        await bioToken.connect(lab).verifyProof(
            tokenId, ZERO_PROOF.a, ZERO_PROOF.b, ZERO_PROOF.c, ZERO_PROOF.pubSignals
        );
        await bioToken.connect(lab).consumeToken(tokenId);

        // try to verify again
        await expect(
            bioToken.connect(lab).verifyProof(
                tokenId, ZERO_PROOF.a, ZERO_PROOF.b, ZERO_PROOF.c, ZERO_PROOF.pubSignals
            )
        ).to.be.revertedWithCustomError(bioToken, "TokenAlreadyConsumed");
    });

    // ── Test 4 ─────────────────────────────────────────────────
    it("4. Rejects mintToken from a non-MANUFACTURER address", async function () {
        const ctx = await deployWithMock(true);
        const { bioToken, other } = ctx;

        await expect(
            bioToken.connect(other).mintToken("BATCH-BAD", 9999999999n, ethers.ZeroHash, "0x")
        ).to.be.reverted;
    });

    // ── Test 5 ─────────────────────────────────────────────────
    it("5. Rejects consumeToken on a non-VERIFIED token", async function () {
        const ctx     = await deployWithMock(true);
        const tokenId = await mintAndAdvanceTo("RECEIVED", ctx);
        const { bioToken, lab } = ctx;

        // Token is RECEIVED, not VERIFIED → consume should revert
        await expect(
            bioToken.connect(lab).consumeToken(tokenId)
        ).to.be.revertedWithCustomError(bioToken, "InvalidStatusTransition");
    });

    // ── Test 6  (Week 4 — ZK) ──────────────────────────────────
    it("6. Valid ZK proof accepted → token status becomes VERIFIED", async function () {
        // MockVerifier configured to return true (valid proof)
        const ctx     = await deployWithMock(true);
        const tokenId = await mintAndAdvanceTo("RECEIVED", ctx);
        const { bioToken, lab } = ctx;

        // pubSignals[0]=1 (valid), pubSignals[1]=10 (threshold matches input.json)
        const validPubSignals = [1n, 10n];

        await expect(
            bioToken.connect(lab).verifyProof(
                tokenId,
                ZERO_PROOF.a,
                ZERO_PROOF.b,
                ZERO_PROOF.c,
                validPubSignals
            )
        )
            .to.emit(bioToken, "TokenVerified")
            .withArgs(tokenId);

        const data = await bioToken.getTokenData(tokenId);
        expect(data.status).to.equal(3); // VERIFIED
    });

    // ── Test 7  (Week 4 — ZK) ──────────────────────────────────
    it("7. Invalid ZK proof (tampered batch) reverts with ZKProofInvalid", async function () {
        // MockVerifier configured to return false (invalid/tampered proof)
        const ctx     = await deployWithMock(false);
        const tokenId = await mintAndAdvanceTo("RECEIVED", ctx);
        const { bioToken, lab } = ctx;

        await expect(
            bioToken.connect(lab).verifyProof(
                tokenId,
                TAMPERED_PROOF.a,
                TAMPERED_PROOF.b,
                TAMPERED_PROOF.c,
                TAMPERED_PROOF.pubSignals
            )
        ).to.be.revertedWithCustomError(bioToken, "ZKProofInvalid");

        // Token must stay in RECEIVED — not silently advanced
        const data = await bioToken.getTokenData(tokenId);
        expect(data.status).to.equal(2); // still RECEIVED
    });
});

/*
═══════════════════════════════════════════════════════════════════
  INTEGRATION TEST TEMPLATE  (uses real snarkjs proof)
  Copy to test/BioToken.integration.test.js and fill in your proof.
═══════════════════════════════════════════════════════════════════

  HOW TO GENERATE A VALID PROOF:

  1. Create a passing input (all adjacent deltas ≤ threshold):
     circuits/build/input_pass.json
     {
       "peaks":     ["100","105","108","103","101","99","102","104","100","103"],
       "threshold": "10"
     }

  2. Run:
     cd circuits/build
     node fingerprint_js/generate_witness.js fingerprint_js/fingerprint.wasm \
          input_pass.json witness_pass.wtns

     npx snarkjs groth16 prove fingerprint_final.zkey witness_pass.wtns \
          proof_pass.json public_pass.json

     npx snarkjs groth16 verify verification_key.json \
          public_pass.json proof_pass.json
     # Should print: OK

  3. Paste proof_pass.json and public_pass.json values below.

─────────────────────────────────────────────────────────────────

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BioToken — Integration (real Groth16 proof)", function () {
    it("Accepts a snarkjs-generated proof for a genuine batch", async function () {
        const [admin, manufacturer, logistics, lab] = await ethers.getSigners();

        // Deploy real verifier
        const HplcVerifier = await ethers.getContractFactory("HplcVerifier");
        const verifier = await HplcVerifier.deploy();
        await verifier.waitForDeployment();

        const BioToken = await ethers.getContractFactory("BioToken");
        const bioToken = await BioToken.deploy(await verifier.getAddress());
        await bioToken.waitForDeployment();

        await bioToken.grantRole(await bioToken.MANUFACTURER_ROLE(), manufacturer.address);
        await bioToken.grantRole(await bioToken.LOGISTICS_ROLE(),    logistics.address);
        await bioToken.grantRole(await bioToken.LAB_ROLE(),          lab.address);

        const expiry = Math.floor(Date.now() / 1000) + 31536000;
        await bioToken.connect(manufacturer).mintToken("BATCH-REAL", expiry, ethers.ZeroHash, "0x");
        await bioToken.connect(logistics).transferCustody(0n, lab.address);
        await bioToken.connect(lab).confirmReceipt(0n);

        // ── Paste your proof_pass.json values here ──
        const proof = {
            a:  ["0xAAAA...", "0xBBBB..."],            // pi_a[0], pi_a[1]
            b:  [["0xCCCC...", "0xDDDD..."],            // pi_b[0][0], [0][1]
                 ["0xEEEE...", "0xFFFF..."]],           // pi_b[1][0], [1][1]
            c:  ["0x1111...", "0x2222..."],             // pi_c[0], pi_c[1]
        };
        // ── Paste your public_pass.json values here ──
        const pubSignals = ["1", "10"];                // [valid, threshold]

        await expect(
            bioToken.connect(lab).verifyProof(0n, proof.a, proof.b, proof.c, pubSignals)
        ).to.emit(bioToken, "TokenVerified").withArgs(0n);
    });
});
*/