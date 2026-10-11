// BioToken — lifecycle, access control and AI attestation (MockVerifier).
// The real Groth16 path is in BioToken.integration.test.js.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deploy, mint, mintToReceived, attest, CAFFEINE, DUMMY_PROOF } = require("./helpers");

const S = { MINTED: 0, IN_TRANSIT: 1, RECEIVED: 2, VERIFIED: 3, CONSUMED: 4 };

async function verify(ctx, tokenId, signer = ctx.lab, attestation) {
    const sig = attestation ?? await attest(ctx, tokenId);
    return ctx.bioToken.connect(signer).verifyProof(tokenId, DUMMY_PROOF.a, DUMMY_PROOF.b, DUMMY_PROOF.c, sig);
}

describe("BioToken", function () {
    this.timeout(60_000);

    describe("mint", function () {
        it("stores metadata, commitment and tolerance", async function () {
            const ctx = await deploy("mock-pass");
            const m = await mint(ctx, { batchId: "BATCH-A", tolerance: 12 });
            const d = await ctx.bioToken.getTokenData(m.tokenId);
            expect(d.batchId).to.equal("BATCH-A");
            expect(d.reagentSmiles).to.equal(CAFFEINE);
            expect(d.fingerprintCommitment).to.equal("0x" + m.commitment.toString(16).padStart(64, "0"));
            expect(d.tolerance).to.equal(12);
            expect(d.status).to.equal(S.MINTED);
            expect(await ctx.bioToken.ownerOf(m.tokenId)).to.equal(ctx.manufacturer.address);
            expect(await ctx.bioToken.totalMinted()).to.equal(1n);
        });

        it("rejects callers without MANUFACTURER_ROLE", async function () {
            const ctx = await deploy("mock-pass");
            await expect(ctx.bioToken.connect(ctx.outsider).mintToken("B", CAFFEINE, 2n ** 40n, ethers.toBeHex(1, 32), 10, "0x"))
                .to.be.revertedWithCustomError(ctx.bioToken, "AccessControlUnauthorizedAccount");
        });

        it("rejects a zero or out-of-field commitment, past expiry and empty reagent", async function () {
            const ctx = await deploy("mock-pass");
            const t = ctx.bioToken.connect(ctx.manufacturer);
            const future = 2n ** 40n;
            await expect(t.mintToken("B", CAFFEINE, future, ethers.ZeroHash, 10, "0x")).to.be.revertedWithCustomError(t, "InvalidCommitment");
            await expect(t.mintToken("B", CAFFEINE, future, ethers.toBeHex(ethers.MaxUint256, 32), 10, "0x")).to.be.revertedWithCustomError(t, "InvalidCommitment");
            await expect(t.mintToken("B", CAFFEINE, 1, ethers.toBeHex(1, 32), 10, "0x")).to.be.revertedWithCustomError(t, "InvalidExpiry");
            await expect(t.mintToken("B", "", future, ethers.toBeHex(1, 32), 10, "0x")).to.be.revertedWithCustomError(t, "EmptyReagent");
        });
    });

    describe("custody", function () {
        it("full lifecycle MINTED → IN_TRANSIT → RECEIVED → VERIFIED → CONSUMED", async function () {
            const ctx = await deploy("mock-pass");
            const { tokenId } = await mint(ctx);
            await expect(ctx.bioToken.connect(ctx.manufacturer).transferCustody(tokenId, ctx.lab.address))
                .to.emit(ctx.bioToken, "CustodyTransferred").withArgs(tokenId, ctx.manufacturer.address, ctx.lab.address);
            expect(await ctx.bioToken.ownerOf(tokenId)).to.equal(ctx.lab.address);
            await expect(ctx.bioToken.connect(ctx.lab).confirmReceipt(tokenId)).to.emit(ctx.bioToken, "TokenReceived");
            await expect(verify(ctx, tokenId)).to.emit(ctx.bioToken, "TokenVerified").withArgs(tokenId, ctx.lab.address);
            await expect(ctx.bioToken.connect(ctx.lab).consumeToken(tokenId)).to.emit(ctx.bioToken, "TokenConsumed");
            expect((await ctx.bioToken.getTokenData(tokenId)).status).to.equal(S.CONSUMED);
        });

        it("only the holder (or an approved operator) can ship", async function () {
            const ctx = await deploy("mock-pass");
            const { tokenId } = await mint(ctx);
            await expect(ctx.bioToken.connect(ctx.outsider).transferCustody(tokenId, ctx.lab.address))
                .to.be.revertedWithCustomError(ctx.bioToken, "NotTokenHolder");
            await ctx.bioToken.connect(ctx.manufacturer).approve(ctx.outsider.address, tokenId);
            await ctx.bioToken.connect(ctx.outsider).transferCustody(tokenId, ctx.lab.address);
            expect(await ctx.bioToken.ownerOf(tokenId)).to.equal(ctx.lab.address);
        });

        it("can only ship to an address with LAB_ROLE", async function () {
            const ctx = await deploy("mock-pass");
            const { tokenId } = await mint(ctx);
            await expect(ctx.bioToken.connect(ctx.manufacturer).transferCustody(tokenId, ctx.outsider.address))
                .to.be.revertedWithCustomError(ctx.bioToken, "RecipientNotLab");
        });

        it("only the receiving lab can confirm receipt", async function () {
            const ctx = await deploy("mock-pass");
            const { tokenId } = await mint(ctx);
            await ctx.bioToken.connect(ctx.manufacturer).transferCustody(tokenId, ctx.lab.address);
            await expect(ctx.bioToken.connect(ctx.otherLab).confirmReceipt(tokenId))
                .to.be.revertedWithCustomError(ctx.bioToken, "NotTokenHolder");
            await expect(ctx.bioToken.connect(ctx.outsider).confirmReceipt(tokenId))
                .to.be.revertedWithCustomError(ctx.bioToken, "AccessControlUnauthorizedAccount");
        });

        it("plain ERC-721 transfers are disabled", async function () {
            const ctx = await deploy("mock-pass");
            const { tokenId } = await mint(ctx);
            await expect(ctx.bioToken.connect(ctx.manufacturer).transferFrom(ctx.manufacturer.address, ctx.outsider.address, tokenId))
                .to.be.revertedWithCustomError(ctx.bioToken, "TransferNotAllowed");
        });

        it("enforces the status order", async function () {
            const ctx = await deploy("mock-pass");
            const { tokenId } = await mint(ctx);
            await ctx.bioToken.connect(ctx.manufacturer).transferCustody(tokenId, ctx.lab.address);
            await expect(ctx.bioToken.connect(ctx.lab).consumeToken(tokenId))
                .to.be.revertedWithCustomError(ctx.bioToken, "InvalidStatusTransition");
            await expect(verify(ctx, tokenId)).to.be.revertedWithCustomError(ctx.bioToken, "InvalidStatusTransition");
        });

        it("only the holding lab can consume", async function () {
            const ctx = await deploy("mock-pass");
            const { tokenId } = await mintToReceived(ctx);
            await verify(ctx, tokenId);
            await expect(ctx.bioToken.connect(ctx.outsider).consumeToken(tokenId))
                .to.be.revertedWithCustomError(ctx.bioToken, "NotTokenHolder");
        });

        it("verifyDemo no longer exists", async function () {
            const ctx = await deploy("mock-pass");
            expect(ctx.bioToken.interface.getFunction("verifyDemo")).to.equal(null);
        });
    });

    describe("verification", function () {
        it("requires LAB_ROLE and the token holder", async function () {
            const ctx = await deploy("mock-pass");
            const { tokenId } = await mintToReceived(ctx);
            await expect(verify(ctx, tokenId, ctx.outsider)).to.be.revertedWithCustomError(ctx.bioToken, "AccessControlUnauthorizedAccount");
            await expect(verify(ctx, tokenId, ctx.otherLab)).to.be.revertedWithCustomError(ctx.bioToken, "NotTokenHolder");
        });

        it("rejects an AI attestation from a non-oracle signer", async function () {
            const ctx = await deploy("mock-pass");
            const { tokenId } = await mintToReceived(ctx);
            const forged = await attest(ctx, tokenId, ctx.lab);
            await expect(verify(ctx, tokenId, ctx.lab, forged)).to.be.revertedWithCustomError(ctx.bioToken, "AiAttestationInvalid");
        });

        it("rejects an AI attestation issued for a different token", async function () {
            const ctx = await deploy("mock-pass");
            const first = await mintToReceived(ctx, { batchId: "A" });
            const second = await mintToReceived(ctx, { batchId: "B" });
            const forFirst = await attest(ctx, first.tokenId);
            await expect(verify(ctx, second.tokenId, ctx.lab, forFirst)).to.be.revertedWithCustomError(ctx.bioToken, "AiAttestationInvalid");
        });

        it("binds the AI verdict to the reagent recorded at mint", async function () {
            const ctx = await deploy("mock-pass");
            const caffeine = await mint(ctx, { batchId: "A" });
            const aspirin = await mint(ctx, { batchId: "B", smiles: "CC(=O)OC1=CC=CC=C1C(=O)O" });
            expect(await ctx.bioToken.aiVerdictDigest(caffeine.tokenId)).to.not.equal(await ctx.bioToken.aiVerdictDigest(aspirin.tokenId));
        });

        it("reverts when the ZK verifier rejects the proof", async function () {
            const ctx = await deploy("mock-fail");
            const { tokenId } = await mintToReceived(ctx);
            await expect(verify(ctx, tokenId)).to.be.revertedWithCustomError(ctx.bioToken, "ZKProofInvalid");
        });

        it("rejects verification after expiry", async function () {
            const ctx = await deploy("mock-pass");
            const m = await mintToReceived(ctx);
            await ethers.provider.send("evm_setNextBlockTimestamp", [Number(m.expiry) + 1]);
            await expect(verify(ctx, m.tokenId)).to.be.revertedWithCustomError(ctx.bioToken, "ReagentExpired");
        });
    });
});
