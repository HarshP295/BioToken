// Shared fixtures for the BioToken tests.
const path = require("path");
const { pathToFileURL } = require("url");
const { ethers } = require("hardhat");

const ROOT = path.join(__dirname, "..");
const WASM = path.join(ROOT, "circuits", "build", "fingerprint_js", "fingerprint.wasm");
const ZKEY = path.join(ROOT, "circuits", "build", "fingerprint_final.zkey");

const GOLD_PEAKS = [255, 242, 237, 232, 227, 222, 218, 212, 208, 200];
const LAB_PEAKS = [255, 241, 239, 230, 228, 223, 216, 210, 207, 201];   // within 2 of gold
const CAFFEINE = "CN1C=NC2=C1C(=O)N(C(=O)N2C)C";
const TOLERANCE = 10;

const fingerprint = () => import(pathToFileURL(path.join(ROOT, "frontend", "src", "lib", "fingerprint.js")).href);
const snarkjs = () => import("snarkjs");

/** Deploys BioToken with the given verifier ("real" or a MockVerifier result). */
async function deploy(verifierKind = "real") {
    const [admin, manufacturer, lab, otherLab, outsider, oracle] = await ethers.getSigners();
    const verifier = verifierKind === "real"
        ? await (await ethers.getContractFactory("HplcVerifier")).deploy()
        : await (await ethers.getContractFactory("MockVerifier")).deploy(verifierKind === "mock-pass");
    const bioToken = await (await ethers.getContractFactory("BioToken")).deploy(await verifier.getAddress(), oracle.address);
    await bioToken.grantRole(await bioToken.MANUFACTURER_ROLE(), manufacturer.address);
    await bioToken.grantRole(await bioToken.LAB_ROLE(), lab.address);
    await bioToken.grantRole(await bioToken.LAB_ROLE(), otherLab.address);
    return { bioToken, verifier, admin, manufacturer, lab, otherLab, outsider, oracle };
}

/** Mints a batch whose commitment is Poseidon(GOLD_PEAKS, salt). Returns { tokenId, salt, commitment }. */
async function mint(ctx, { batchId = "BATCH-001", smiles = CAFFEINE, tolerance = TOLERANCE } = {}) {
    const fp = await fingerprint();
    const salt = fp.randomSalt();
    const commitment = await fp.computeCommitment(GOLD_PEAKS, salt);
    const expiry = (await ethers.provider.getBlock("latest")).timestamp + 365 * 86400;
    const tx = await ctx.bioToken.connect(ctx.manufacturer)
        .mintToken(batchId, smiles, expiry, fp.toBytes32(commitment), tolerance, "0x");
    const receipt = await tx.wait();
    const event = receipt.logs.map(l => ctx.bioToken.interface.parseLog(l)).find(e => e?.name === "TokenMinted");
    return { tokenId: event.args.tokenId, salt, commitment, tolerance, expiry };
}

/** Mint, ship to `lab`, confirm receipt. */
async function mintToReceived(ctx, opts) {
    const minted = await mint(ctx, opts);
    await ctx.bioToken.connect(ctx.manufacturer).transferCustody(minted.tokenId, ctx.lab.address);
    await ctx.bioToken.connect(ctx.lab).confirmReceipt(minted.tokenId);
    return minted;
}

/** AI oracle signature over BioToken.aiVerdictDigest(tokenId). */
async function attest(ctx, tokenId, signer = ctx.oracle) {
    return signer.signMessage(ethers.getBytes(await ctx.bioToken.aiVerdictDigest(tokenId)));
}

/** Real Groth16 proof for the given lab peaks against a minted batch. */
async function prove(minted, { labPeaks = LAB_PEAKS, tokenId = minted.tokenId } = {}) {
    const fp = await fingerprint();
    const input = fp.buildCircuitInput({
        labPeaks, goldPeaks: GOLD_PEAKS, salt: minted.salt,
        commitment: minted.commitment, tolerance: minted.tolerance, tokenId,
    });
    const { proof, publicSignals } = await (await snarkjs()).groth16.fullProve(input, WASM, ZKEY);
    return { ...fp.formatProofForContract(proof), publicSignals };
}

const DUMMY_PROOF = { a: [1, 2], b: [[3, 4], [5, 6]], c: [7, 8] };

module.exports = {
    deploy, mint, mintToReceived, attest, prove, fingerprint, snarkjs,
    GOLD_PEAKS, LAB_PEAKS, CAFFEINE, TOLERANCE, WASM, ZKEY, DUMMY_PROOF,
};
