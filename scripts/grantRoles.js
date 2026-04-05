const hre = require("hardhat");
const deployment = require("../deployments/localhost.json");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const BioToken = await hre.ethers.getContractFactory("BioToken");
    const contract = BioToken.attach(deployment.BioToken.address);

    const address = "0xdD2FD4581271e230360230F9337D5c0430Bf44C0";
    
    const MANUFACTURER_ROLE = await contract.MANUFACTURER_ROLE();
    const LOGISTICS_ROLE = await contract.LOGISTICS_ROLE();
    const LAB_ROLE = await contract.LAB_ROLE();

    await (await contract.grantRole(MANUFACTURER_ROLE, address)).wait();
    await (await contract.grantRole(LOGISTICS_ROLE, address)).wait();
    await (await contract.grantRole(LAB_ROLE, address)).wait();
    
    console.log("All roles granted to", address);
}

main().catch(console.error);