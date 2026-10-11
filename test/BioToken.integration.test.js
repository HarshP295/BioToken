// BioToken — real Groth16 verifier and real proofs from circuits/build.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
    deploy, mintToReceived, attest, prove, fingerprint, snarkjs,
    GOLD_PEAKS, LAB_PEAKS, WASM, ZKEY,
} = require("./helpers");

describe("BioToken — Integration (real Groth16 verifier)", function () {
    this.timeout(120_000);

    it("I-1. matching lab scan + AI attestation → VERIFIED", async function () {
        const ctx = await deploy("real");
        const minted = await mintToReceived(ctx);
        const p = await prove(minted);
        await expect(ctx.bioToken.connect(ctx.lab).verifyProof(minted.tokenId, p.a, p.b, p.c, await attest(ctx, minted.tokenId)))
            .to.emit(ctx.bioToken, "TokenVerified").withArgs(minted.tokenId, ctx.lab.address);
        expect((await ctx.bioToken.getTokenData(minted.tokenId)).status).to.equal(3);
    });

    it("I-2. public signals are [commitment, tolerance, tokenId]", async function () {
        const ctx = await deploy("real");
        const minted = await mintToReceived(ctx);
        const p = await prove(minted);
        expect(p.publicSignals).to.deep.equal([minted.commitment.toString(), String(minted.tolerance), minted.tokenId.toString()]);
    });

    it("I-3. a proof made for one token is rejected for another (no replay)", async function () {
        const ctx = await deploy("real");
        const first = await mintToReceived(ctx, { batchId: "A" });
        const second = await mintToReceived(ctx, { batchId: "B" });
        // same Gold Standard and salt, proof built for token `first`
        const p = await prove({ ...second, tokenId: first.tokenId });
        await expect(ctx.bioToken.connect(ctx.lab).verifyProof(second.tokenId, p.a, p.b, p.c, await attest(ctx, second.tokenId)))
            .to.be.revertedWithCustomError(ctx.bioToken, "ZKProofInvalid");
    });

    it("I-4. a proof against a different Gold Standard commitment is rejected", async function () {
        const ctx = await deploy("real");
        const first = await mintToReceived(ctx, { batchId: "A" });
        const second = await mintToReceived(ctx, { batchId: "B" });   // different salt → different commitment
        const p = await prove({ ...first, tokenId: second.tokenId });
        await expect(ctx.bioToken.connect(ctx.lab).verifyProof(second.tokenId, p.a, p.b, p.c, await attest(ctx, second.tokenId)))
            .to.be.revertedWithCustomError(ctx.bioToken, "ZKProofInvalid");
    });

    it("I-5. a proof made with a looser tolerance than the one stored is rejected", async function () {
        const ctx = await deploy("real");
        const minted = await mintToReceived(ctx, { tolerance: 5 });
        const p = await prove({ ...minted, tolerance: 50 });
        await expect(ctx.bioToken.connect(ctx.lab).verifyProof(minted.tokenId, p.a, p.b, p.c, await attest(ctx, minted.tokenId)))
            .to.be.revertedWithCustomError(ctx.bioToken, "ZKProofInvalid");
    });

    it("I-6. a tampered proof is rejected", async function () {
        const ctx = await deploy("real");
        const minted = await mintToReceived(ctx);
        const p = await prove(minted);
        const badA = [p.a[0], (p.a[1] + 1n)];
        await expect(ctx.bioToken.connect(ctx.lab).verifyProof(minted.tokenId, badA, p.b, p.c, await attest(ctx, minted.tokenId)))
            .to.be.reverted;
    });

    it("I-7. no proof exists for a lab scan outside tolerance, a wrong salt, or out-of-range peaks", async function () {
        const fp = await fingerprint();
        const s = await snarkjs();
        const salt = fp.randomSalt();
        const commitment = await fp.computeCommitment(GOLD_PEAKS, salt);
        const base = fp.buildCircuitInput({ labPeaks: LAB_PEAKS, goldPeaks: GOLD_PEAKS, salt, commitment, tolerance: 10, tokenId: 0 });
        const cases = {
            "peak 11 away": { ...base, labPeaks: [...base.labPeaks.slice(0, 9), String(GOLD_PEAKS[9] + 11)] },
            "wrong salt": { ...base, salt: (salt + 1n).toString() },
            "peak 300 with tolerance 255": { ...base, labPeaks: ["300", ...base.labPeaks.slice(1)], tolerance: "255" },
            "negative peak": { ...base, labPeaks: [(fp.SNARK_SCALAR_FIELD - 1n).toString(), ...base.labPeaks.slice(1)] },
        };
        for (const [name, input] of Object.entries(cases)) {
            let proved = false;
            try { await s.groth16.fullProve(input, WASM, ZKEY); proved = true; } catch { /* expected */ }
            expect(proved, name).to.equal(false);
        }
    });

    it("I-8. full lifecycle with a real proof: MINTED → CONSUMED", async function () {
        const ctx = await deploy("real");
        const minted = await mintToReceived(ctx);
        const p = await prove(minted);
        await ctx.bioToken.connect(ctx.lab).verifyProof(minted.tokenId, p.a, p.b, p.c, await attest(ctx, minted.tokenId));
        await ctx.bioToken.connect(ctx.lab).consumeToken(minted.tokenId);
        expect((await ctx.bioToken.getTokenData(minted.tokenId)).status).to.equal(4);
    });

    it("I-9. HplcVerifier directly: accepts the proof only with the right public signals", async function () {
        const ctx = await deploy("real");
        const minted = await mintToReceived(ctx);
        const p = await prove(minted);
        const pub = p.publicSignals.map(BigInt);
        expect(await ctx.verifier.verifyProof(p.a, p.b, p.c, pub)).to.equal(true);
        expect(await ctx.verifier.verifyProof(p.a, p.b, p.c, [pub[0], pub[1], pub[2] + 1n])).to.equal(false);
        expect(await ctx.verifier.verifyProof(p.a, p.b, p.c, [pub[0], 255n, pub[2]])).to.equal(false);
    });
});
