const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BioToken", function () {
  let bioToken;
  let owner, manufacturer, logistics, lab, outsider;

  // Role hashes (must match the contract)
  const MANUFACTURER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MANUFACTURER_ROLE"));
  const LOGISTICS_ROLE    = ethers.keccak256(ethers.toUtf8Bytes("LOGISTICS_ROLE"));
  const LAB_ROLE          = ethers.keccak256(ethers.toUtf8Bytes("LAB_ROLE"));

  // Status enum values
  const Status = { MINTED: 0, IN_TRANSIT: 1, RECEIVED: 2, VERIFIED: 3, CONSUMED: 4 };

  // Shared mint helpers
  const BATCH_ID      = "BATCH-2026-001";
  const EXPIRY        = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // +1 year
  const VK            = ethers.keccak256(ethers.toUtf8Bytes("placeholder-vk"));
  const MARKETPLACE_SIG = "0x";
  const STUB_PROOF     = "0x";

  beforeEach(async function () {
    [owner, manufacturer, logistics, lab, outsider] = await ethers.getSigners();

    const BioToken = await ethers.getContractFactory("BioToken");
    bioToken = await BioToken.deploy();
    await bioToken.waitForDeployment();

    // Grant roles
    await bioToken.grantRole(MANUFACTURER_ROLE, manufacturer.address);
    await bioToken.grantRole(LOGISTICS_ROLE, logistics.address);
    await bioToken.grantRole(LAB_ROLE, lab.address);
  });

  // ─────────────────────────────────────────────────
  //  1. Mint a token and verify on-chain metadata
  // ─────────────────────────────────────────────────
  it("should mint a token and store correct on-chain metadata", async function () {
    const tx = await bioToken.connect(manufacturer).mintToken(BATCH_ID, EXPIRY, VK, MARKETPLACE_SIG);
    const receipt = await tx.wait();

    // Token ID should be 0 (first mint)
    const tokenId = 0;

    // Verify ownership
    expect(await bioToken.ownerOf(tokenId)).to.equal(manufacturer.address);

    // Verify metadata
    const data = await bioToken.getTokenData(tokenId);
    expect(data.batchId).to.equal(BATCH_ID);
    expect(data.expiry).to.equal(EXPIRY);
    expect(data.verificationKey).to.equal(VK);
    expect(data.status).to.equal(Status.MINTED);

    // Verify event
    await expect(tx)
      .to.emit(bioToken, "TokenMinted")
      .withArgs(tokenId, BATCH_ID, manufacturer.address);
  });

  // ─────────────────────────────────────────────────
  //  2. Full happy-path lifecycle
  //     MINTED → IN_TRANSIT → RECEIVED → VERIFIED → CONSUMED
  // ─────────────────────────────────────────────────
  it("should complete the full lifecycle: MINTED → IN_TRANSIT → RECEIVED → VERIFIED → CONSUMED", async function () {
    // Mint
    await bioToken.connect(manufacturer).mintToken(BATCH_ID, EXPIRY, VK, MARKETPLACE_SIG);
    const tokenId = 0;

    // Transfer custody → IN_TRANSIT
    const txTransfer = await bioToken.connect(logistics).transferCustody(tokenId, lab.address);
    await expect(txTransfer)
      .to.emit(bioToken, "CustodyTransferred")
      .withArgs(tokenId, manufacturer.address, lab.address);
    expect((await bioToken.getTokenData(tokenId)).status).to.equal(Status.IN_TRANSIT);
    expect(await bioToken.ownerOf(tokenId)).to.equal(lab.address);

    // Confirm receipt → RECEIVED
    const txReceipt = await bioToken.connect(lab).confirmReceipt(tokenId);
    await expect(txReceipt)
      .to.emit(bioToken, "TokenReceived")
      .withArgs(tokenId, lab.address);
    expect((await bioToken.getTokenData(tokenId)).status).to.equal(Status.RECEIVED);

    // Verify proof → VERIFIED
    const txVerify = await bioToken.connect(lab).verifyProof(tokenId, STUB_PROOF);
    await expect(txVerify).to.emit(bioToken, "TokenVerified").withArgs(tokenId);
    expect((await bioToken.getTokenData(tokenId)).status).to.equal(Status.VERIFIED);

    // Consume → CONSUMED
    const txConsume = await bioToken.connect(lab).consumeToken(tokenId);
    await expect(txConsume).to.emit(bioToken, "TokenConsumed").withArgs(tokenId);
    expect((await bioToken.getTokenData(tokenId)).status).to.equal(Status.CONSUMED);
  });

  // ─────────────────────────────────────────────────
  //  3. Reject re-verifying a CONSUMED token
  // ─────────────────────────────────────────────────
  it("should reject verifyProof on a CONSUMED token", async function () {
    // Mint → Transfer → Receive → Verify → Consume
    await bioToken.connect(manufacturer).mintToken(BATCH_ID, EXPIRY, VK, MARKETPLACE_SIG);
    const tokenId = 0;
    await bioToken.connect(logistics).transferCustody(tokenId, lab.address);
    await bioToken.connect(lab).confirmReceipt(tokenId);
    await bioToken.connect(lab).verifyProof(tokenId, STUB_PROOF);
    await bioToken.connect(lab).consumeToken(tokenId);

    // Attempt to verify again — should revert
    await expect(
      bioToken.connect(lab).verifyProof(tokenId, STUB_PROOF)
    ).to.be.revertedWithCustomError(bioToken, "TokenAlreadyConsumed");
  });

  // ─────────────────────────────────────────────────
  //  4. Reject non-role address calling mintToken
  // ─────────────────────────────────────────────────
  it("should reject mintToken from a non-MANUFACTURER address", async function () {
    await expect(
      bioToken.connect(outsider).mintToken(BATCH_ID, EXPIRY, VK, MARKETPLACE_SIG)
    ).to.be.revertedWithCustomError(bioToken, "AccessControlUnauthorizedAccount");
  });

  // ─────────────────────────────────────────────────
  //  5. Reject consumeToken on a MINTED (not verified) token
  // ─────────────────────────────────────────────────
  it("should reject consumeToken on a token that is not VERIFIED", async function () {
    // Mint a token — status is MINTED, not VERIFIED
    await bioToken.connect(manufacturer).mintToken(BATCH_ID, EXPIRY, VK, MARKETPLACE_SIG);
    const tokenId = 0;

    // Grant LAB_ROLE to manufacturer so the role check passes but status check fails
    await bioToken.grantRole(LAB_ROLE, manufacturer.address);

    await expect(
      bioToken.connect(manufacturer).consumeToken(tokenId)
    ).to.be.revertedWithCustomError(bioToken, "InvalidStatusTransition");
  });
});
