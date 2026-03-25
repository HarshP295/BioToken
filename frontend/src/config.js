// frontend/src/config.js
import BioTokenDeploy from "../../deployments/hardhat.json"; // We'll default to local hardhat for dev
// We can dynamically load amoy.json based on environment later if needed.

export const CONTRACT_ADDRESS = BioTokenDeploy.BioToken.address;
export const CONTRACT_ABI = BioTokenDeploy.BioToken.abi;

export const CHAIN_OPTIONS = {
    // Polygon Amoy Testnet
    80002: {
        chainId: "0x13882",
        chainName: "Polygon Amoy Testnet",
        nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
        rpcUrls: ["https://rpc-amoy.polygon.technology/"],
        blockExplorerUrls: ["https://amoy.polygonscan.com/"],
    },
    // Local Hardhat Network (for dev)
    31337: {
        chainId: "0x7A69", // 31337
        chainName: "Hardhat Local",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: ["http://127.0.0.1:8545/"],
    }
};

// Toggle this to 80002 for production
export const TARGET_CHAIN_ID = 31337; 
