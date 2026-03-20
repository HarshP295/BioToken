const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const BioToken = await hre.ethers.getContractFactory("BioToken");
  const bioToken = await BioToken.deploy();
  await bioToken.waitForDeployment();

  const address = await bioToken.getAddress();
  console.log(`BioToken deployed to: ${address}`);

  // ── Save deployment info ──
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const artifact = await hre.artifacts.readArtifact("BioToken");
  const deploymentData = {
    address: address,
    abi: artifact.abi,
    network: hre.network.name,
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(deploymentsDir, "amoy.json");
  fs.writeFileSync(outPath, JSON.stringify(deploymentData, null, 2));
  console.log(`Deployment info saved to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
