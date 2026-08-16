// test/BioToken.integration.test.js
// ─────────────────────────────────────────────────────────────────
//  BioToken — Integration Test (real Groth16 proof)
//
//  Uses the actual snarkjs-generated proof from:
//    circuits/build/proof_pass.json    (passing batch — valid=1)
//    circuits/build/public_pass.json   [1, 10]
//
//  Input used to generate the proof (input_pass.json):
//    peaks:     [100,105,108,103,101,99,102,104,100,103]
//    threshold: 10
//    All adjacent deltas ≤ 10 → circuit output valid=1
//
//  These tests deploy the REAL HplcVerifier (no mock), so they
//  exercise the full Groth16 pairing check on-chain.
//
//  Run with:
//    npx hardhat test test/BioToken.integration.test.js
// ─────────────────────────────────────────────────────────────────

const { expect } = require("chai");
const { ethers } = require("hardhat");

// ── Real proof from circuits/build/proof_pass.json ───────────────
// NOTE on pi_b encoding:
// snarkjs proof.json stores pi_b as [[x1,x2],[y1,y2]]
// but the Solidity Groth16 verifier assembly expects [[x2,x1],[y2,y1]]
// (the two coordinates within each G2 pair are swapped).
// This is a known snarkjs/Solidity convention mismatch.
const VALID_PROOF = {
    a: [
        "4777844671232050108953442715308197667734048965470351746427056976856623146688",
        "11856247079383004015968103073903269621395622119538017248761465471481665201298",
    ],
    b: [
        // pi_b[0] swapped: [x2, x1]
        [
            "10783320587903247978563503376773635339963206777030142223344523265274185317157",
            "19122068484625028672507584130218438542386448365989176569041575814969182125693",
        ],
        // pi_b[1] swapped: [y2, y1]
        [
            "19907685149344304200770954608074063210681941876754680870511266607776314181068",
            "8830045404300893224887161484622980231758532746422421823662904287301805401734",
        ],
    ],
    c: [
        "18422412737604342025128268278138609633972625395678652985093054094339704163068",
        "7786008442037180193308190909843519701454404373230373769621527139433762533005",
    ],
    // public_pass.json: [valid=1, threshold=10]
    pubSignals: ["1", "10"],
};

// ── Tampered: flip valid to 0, keep everything else the same ─────
// The pairing will fail because the public input changed but the
// proof wasn't regenerated for it — double rejection (valid≠1 AND
// pairing fails).
const TAMPERED_PROOF = {
    ...VALID_PROOF,
    pubSignals: ["0", "10"],   // valid=0 → rejected by the guard before pairing
};

// ── Fixture ───────────────────────────────────────────────────────
async function deployReal() {
    const [admin, manufacturer, logistics, lab] = await ethers.getSigners();

    // Deploy real HplcVerifier
    const HplcVerifier = await ethers.getContractFactory("HplcVerifier");
    const verifier = await HplcVerifier.deploy();
    await verifier.waitForDeployment();

    // Deploy BioToken pointing at real verifier
    const BioToken = await ethers.getContractFactory("BioToken");
    const bioToken = await BioToken.deploy(await verifier.getAddress());
    await bioToken.waitForDeployment();

    // Grant roles
    await bioToken.grantRole(await bioToken.MANUFACTURER_ROLE(), manufacturer.address);
    await bioToken.grantRole(await bioToken.LOGISTICS_ROLE(),    logistics.address);
    await bioToken.grantRole(await bioToken.LAB_ROLE(),          lab.address);

    return { bioToken, verifier, manufacturer, logistics, lab };
}

// Mint a token and advance it to RECEIVED state
async function mintToReceived({ bioToken, manufacturer, logistics, lab }) {
    const expiry = Math.floor(Date.now() / 1000) + 31536000;
    await bioToken.connect(manufacturer)
        .mintToken("BATCH-REAL-001", expiry, ethers.ZeroHash, "0x");
    const tokenId = 0n;
    await bioToken.connect(logistics).transferCustody(tokenId, lab.address);
    await bioToken.connect(lab).confirmReceipt(tokenId);
    return tokenId;
}

// ── Tests ─────────────────────────────────────────────────────────
describe("BioToken — Integration (real Groth16 verifier)", function () {

    // Groth16 pairing is gas-heavy; give it a generous timeout
    this.timeout(30_000);

    // ── Integration Test 1 ────────────────────────────────────────
    it("I-1. Real snarkjs proof for genuine batch → VERIFIED", async function () {
        const ctx     = await deployReal();
        const tokenId = await mintToReceived(ctx);
        const { bioToken, lab } = ctx;

        await expect(
            bioToken.connect(lab).verifyProof(
                tokenId,
                VALID_PROOF.a,
                VALID_PROOF.b,
                VALID_PROOF.c,
                VALID_PROOF.pubSignals
            )
        )
            .to.emit(bioToken, "TokenVerified")
            .withArgs(tokenId, lab.address);

        const data = await bioToken.getTokenData(tokenId);
        expect(data.status).to.equal(3); // VERIFIED
    });

    // ── Integration Test 2 ────────────────────────────────────────
    it("I-2. Tampered public signals (valid=0) → reverts ZKProofInvalid", async function () {
        const ctx     = await deployReal();
        const tokenId = await mintToReceived(ctx);
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

        // Token must stay RECEIVED — not silently advanced
        const data = await bioToken.getTokenData(tokenId);
        expect(data.status).to.equal(2); // RECEIVED
    });

    // ── Integration Test 3 ────────────────────────────────────────
    it("I-3. Full lifecycle with real proof: MINTED → CONSUMED", async function () {
        const ctx = await deployReal();
        const { bioToken, manufacturer, logistics, lab } = ctx;

        const expiry = Math.floor(Date.now() / 1000) + 31536000;

        // MINTED
        await bioToken.connect(manufacturer)
            .mintToken("BATCH-FULL-REAL", expiry, ethers.ZeroHash, "0x");
        const tokenId = 0n;
        expect((await bioToken.getTokenData(tokenId)).status).to.equal(0);

        // → IN_TRANSIT
        await bioToken.connect(logistics).transferCustody(tokenId, lab.address);
        expect((await bioToken.getTokenData(tokenId)).status).to.equal(1);

        // → RECEIVED
        await bioToken.connect(lab).confirmReceipt(tokenId);
        expect((await bioToken.getTokenData(tokenId)).status).to.equal(2);

        // → VERIFIED  (real Groth16 proof)
        await expect(
            bioToken.connect(lab).verifyProof(
                tokenId,
                VALID_PROOF.a,
                VALID_PROOF.b,
                VALID_PROOF.c,
                VALID_PROOF.pubSignals
            )
        ).to.emit(bioToken, "TokenVerified");
        expect((await bioToken.getTokenData(tokenId)).status).to.equal(3);

        // → CONSUMED
        await expect(bioToken.connect(lab).consumeToken(tokenId))
            .to.emit(bioToken, "TokenConsumed");
        expect((await bioToken.getTokenData(tokenId)).status).to.equal(4);
    });

    // ── Integration Test 4 ────────────────────────────────────────
    it("I-4. verifyProof directly on HplcVerifier: valid proof returns true", async function () {
        const ctx = await deployReal();
        const { verifier } = ctx;

        const result = await verifier.verifyProof(
            VALID_PROOF.a,
            VALID_PROOF.b,
            VALID_PROOF.c,
            VALID_PROOF.pubSignals
        );
        expect(result).to.equal(true);
    });

    // ── Integration Test 5 ────────────────────────────────────────
    it("I-5. verifyProof directly on HplcVerifier: valid=0 returns false", async function () {
        const ctx = await deployReal();
        const { verifier } = ctx;

        const result = await verifier.verifyProof(
            TAMPERED_PROOF.a,
            TAMPERED_PROOF.b,
            TAMPERED_PROOF.c,
            TAMPERED_PROOF.pubSignals   // pubSignals[0]=0
        );
        expect(result).to.equal(false);
    });
});