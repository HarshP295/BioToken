// scripts/grantRoles.js
// Grant a BioToken role from the admin (deployer) key.
//
//   ROLE=LAB ADDRESS=0x... npx hardhat run scripts/grantRoles.js --network amoy
//   ROLE is MANUFACTURER, LAB or AI_ORACLE. For web-app users, ADDRESS is the
//   smart-account address (shown on the Lab Dashboard), not the Privy wallet.
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const role = (process.env.ROLE || "").toUpperCase();
    const address = process.env.ADDRESS;
    if (!["MANUFACTURER", "LAB", "AI_ORACLE"].includes(role) || !hre.ethers.isAddress(address)) {
        throw new Error("Set ROLE=MANUFACTURER|LAB|AI_ORACLE and ADDRESS=0x...");
    }
    const deployment = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${hre.network.name}.json`), "utf8"));
    const bioToken = await hre.ethers.getContractAt("BioToken", deployment.BioToken.address);
    const roleHash = await bioToken[`${role}_ROLE`]();
    if (await bioToken.hasRole(roleHash, address)) {
        console.log(`${address} already has ${role}_ROLE`);
        return;
    }
    await (await bioToken.grantRole(roleHash, address)).wait();
    console.log(`${role}_ROLE granted to ${address}`);
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
