const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYMENT_FILE = path.join(__dirname, "../deployments/amoy.json");

async function main() {
  const network = hre.network.name;
  console.log(`\nDeploying on network: ${network}`);

  // Load existing deployments
  let deployments = {};
  if (fs.existsSync(DEPLOYMENT_FILE)) {
    deployments = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
  }

  // Check if already deployed — verify it's still live on-chain
  if (deployments.BioToken) {
    console.log(`\nFound existing deployment: ${deployments.BioToken.address}`);
    try {
      const code = await hre.ethers.provider.getCode(deployments.BioToken.address);
      if (code !== "0x") {
        console.log("✓ Contract verified live on-chain. Skipping redeployment.\n");
        console.log(`CONTRACT_ADDRESS=${deployments.BioToken.address}`);
        updateEnvFile(deployments.BioToken.address);
        return;
      }
      console.log("✗ Contract not found on-chain. Redeploying...");
    } catch (e) {
      console.log("Could not verify, redeploying...");
    }
  }

  // Deploy fresh
  const verifierAddress = "0xd8Fe46FcE57550451dA9E536643d7d863FeE1658";
  console.log(`\nUsing existing HplcVerifier: ${verifierAddress}`);

  console.log("\nDeploying BioToken contract...");
  const BioToken = await hre.ethers.getContractFactory("BioToken");
  const bioToken = await BioToken.deploy(verifierAddress);
  await bioToken.waitForDeployment();

  const address = await bioToken.getAddress();
  const deployTx = bioToken.deploymentTransaction();

  console.log(`\n✓ BioToken deployed to: ${address}`);
  console.log(`  Tx hash: ${deployTx.hash}`);

  // Save deployment info
  deployments.BioToken = {
    address,
    txHash: deployTx.hash,
    network,
    deployedAt: new Date().toISOString(),
    abi: JSON.parse(bioToken.interface.formatJson()),
  };

  fs.mkdirSync(path.dirname(DEPLOYMENT_FILE), { recursive: true });
  fs.writeFileSync(DEPLOYMENT_FILE, JSON.stringify(deployments, null, 2));
  console.log(`  Saved to: ${DEPLOYMENT_FILE}`);

  // Auto-update .env
  updateEnvFile(address);
}

function updateEnvFile(address) {
  const envPath = path.join(__dirname, "../.env");
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  if (envContent.includes("VITE_CONTRACT_ADDRESS=")) {
    envContent = envContent.replace(
      /VITE_CONTRACT_ADDRESS=.*/,
      `VITE_CONTRACT_ADDRESS=${address}`
    );
  } else {
    envContent += `\nVITE_CONTRACT_ADDRESS=${address}`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log(`  .env updated with contract address`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});