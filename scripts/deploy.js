// scripts/deploy.js
// Deploys HplcVerifier + BioToken, records the deployment and points the
// app at it.
//
//   npx hardhat run scripts/deploy.js --network amoy
//
// - The AI oracle (AI_ORACLE_ROLE) is the address of AI_ORACLE_PRIVATE_KEY
//   from .env, so the AI service's signatures are accepted.
// - Writes deployments/<network>.json (addresses, ABI, circuit artifact
//   hashes) and sets VITE_CONTRACT_ADDRESS in .env and frontend/.env.
// - Every run deploys new contracts: tokens and role grants on the previous
//   deployment do not carry over.
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");

function sha256(relPath) {
    return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, relPath))).digest("hex");
}

function setEnv(envPath, key, value) {
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    const line = `${key}=${value}`;
    content = new RegExp(`^${key}=.*$`, "m").test(content)
        ? content.replace(new RegExp(`^${key}=.*$`, "m"), line)
        : `${content}${content.endsWith("\n") || !content ? "" : "\n"}${line}\n`;
    fs.writeFileSync(envPath, content);
}

async function main() {
    const network = hre.network.name;
    const [deployer] = await hre.ethers.getSigners();
    if (!process.env.AI_ORACLE_PRIVATE_KEY) throw new Error("AI_ORACLE_PRIVATE_KEY is not set in .env");
    const aiOracle = new hre.ethers.Wallet(process.env.AI_ORACLE_PRIVATE_KEY).address;

    console.log(`Network:   ${network}`);
    console.log(`Deployer:  ${deployer.address} (${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} native)`);
    console.log(`AI oracle: ${aiOracle}`);

    const verifier = await (await hre.ethers.getContractFactory("HplcVerifier")).deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();
    console.log(`\n✓ HplcVerifier: ${verifierAddress}  (tx ${verifier.deploymentTransaction().hash})`);

    const bioToken = await (await hre.ethers.getContractFactory("BioToken")).deploy(verifierAddress, aiOracle);
    await bioToken.waitForDeployment();
    const address = await bioToken.getAddress();
    const deployTx = bioToken.deploymentTransaction();
    console.log(`✓ BioToken:     ${address}  (tx ${deployTx.hash})`);

    const deployment = {
        network,
        chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
        deployedAt: new Date().toISOString(),
        deployer: deployer.address,
        aiOracle,
        HplcVerifier: { address: verifierAddress, txHash: verifier.deploymentTransaction().hash },
        BioToken: {
            address,
            txHash: deployTx.hash,
            blockNumber: (await deployTx.wait()).blockNumber,
            abi: JSON.parse(bioToken.interface.formatJson()),
        },
        circuit: {
            "fingerprint.wasm": sha256("circuits/build/fingerprint_js/fingerprint.wasm"),
            "fingerprint_final.zkey": sha256("circuits/build/fingerprint_final.zkey"),
            "verification_key.json": sha256("circuits/build/verification_key.json"),
        },
    };
    const file = path.join(ROOT, "deployments", `${network}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(deployment, null, 2) + "\n");
    console.log(`\nSaved ${path.relative(ROOT, file)}`);

    if (network !== "hardhat") {
        setEnv(path.join(ROOT, ".env"), "VITE_CONTRACT_ADDRESS", address);
        setEnv(path.join(ROOT, "frontend", ".env"), "VITE_CONTRACT_ADDRESS", address);
        console.log("Updated VITE_CONTRACT_ADDRESS in .env and frontend/.env (restart the AI service and the dev server)");
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
