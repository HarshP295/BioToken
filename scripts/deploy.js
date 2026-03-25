// scripts/deploy.js
// ─────────────────────────────────────────────────────────────────
//  BioToken deployment  (Week 4 update)
//
//  Deploy order:
//    1. HplcVerifier   — standalone Groth16 verifier (no constructor args)
//    2. BioToken       — ERC-721 + AccessControl, receives verifier address
//
//  Writes ABI + addresses to deployments/amoy.json for use by the
//  frontend and backend API.
// ─────────────────────────────────────────────────────────────────

const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log(
        "Account balance:",
        hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)),
        "MATIC\n"
    );

    // ── 1. Deploy HplcVerifier ──────────────────────────────────
    console.log("1/2  Deploying HplcVerifier...");
    const HplcVerifier = await hre.ethers.getContractFactory("HplcVerifier");
    const verifier = await HplcVerifier.deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();
    console.log("     HplcVerifier deployed to:", verifierAddress);

    // ── 2. Deploy BioToken ──────────────────────────────────────
    console.log("2/2  Deploying BioToken...");
    const BioToken = await hre.ethers.getContractFactory("BioToken");
    const bioToken = await BioToken.deploy(verifierAddress);
    await bioToken.waitForDeployment();
    const bioTokenAddress = await bioToken.getAddress();
    console.log("     BioToken deployed to:     ", bioTokenAddress);

    // ── 3. Save deployment info ─────────────────────────────────
    const deployments = {
        network:        hre.network.name,
        deployedAt:     new Date().toISOString(),
        deployer:       deployer.address,
        HplcVerifier: {
            address: verifierAddress,
            abi:     JSON.parse(verifier.interface.formatJson()),
        },
        BioToken: {
            address: bioTokenAddress,
            abi:     JSON.parse(bioToken.interface.formatJson()),
        },
    };

    const outDir  = path.join(__dirname, "..", "deployments");
    const outFile = path.join(outDir, `${hre.network.name}.json`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(deployments, null, 2));
    console.log("\nDeployment info saved to:", outFile);

    // ── 4. Quick smoke-test ─────────────────────────────────────
    const name   = await bioToken.name();
    const symbol = await bioToken.symbol();
    console.log(`\nSmoke test — name: ${name}  symbol: ${symbol}  ✓`);

    const storedVerifier = await bioToken.verifier();
    console.log(
        "Verifier address on-chain:",
        storedVerifier,
        storedVerifier.toLowerCase() === verifierAddress.toLowerCase() ? "✓" : "✗ MISMATCH"
    );
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});