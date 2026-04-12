const hre = require("hardhat");

async function main() {
    const address = "0x9204D687ecB511ac0d69E450C36a6a476F7A9425";
    const b = await hre.ethers.getContractAt("BioToken", address);
    
    // STEP 4: Grant MANUFACTURER_ROLE
    const role = await b.MANUFACTURER_ROLE();
    const targetAddress = "0x0b88A97C1537ef7709f25683E3F7eb578F60D233";
    console.log("Granting role...");
    await (await b.grantRole(role, targetAddress)).wait();
    console.log("Role granted:", await b.hasRole(role, targetAddress));

    // STEP 5: Mint a fresh token and move to RECEIVED
    const [deployer] = await hre.ethers.getSigners();
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 365 * 86400);
    const vk = "0x0000000000000000000000000000000000000000000000000000000000000000";
    
    console.log("Minting token...");
    const mintTx = await b.mintToken("BATCH-DEMO-001", expiry, vk, "0x");
    await mintTx.wait();
    
    console.log("Transferring custody...");
    // The previous calls assume tokenId 0 based on user instructions "b.transferCustody(0, deployer.address)"
    // Let's just use 0. If multiple runs, it might be 1, 2, etc. Wait, we forced redeploy so it should be Token Id 0!
    await (await b.transferCustody(0, deployer.address)).wait();
    
    console.log("Confirming receipt...");
    await (await b.confirmReceipt(0)).wait();
    
    const status = (await b.getTokenData(0)).status.toString();
    console.log("Token 0 status:", status);
}

main().catch(console.error);