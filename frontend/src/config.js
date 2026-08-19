// frontend/src/config.js
import BioTokenArtifact from "../../artifacts/contracts/BioToken.sol/BioToken.json";

// We can dynamically load amoy.json based on environment later if needed.

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
export const CONTRACT_ABI = BioTokenArtifact.abi;
export const AMOY_RPC_URL = import.meta.env.VITE_AMOY_RPC_URL || "https://polygon-amoy.drpc.org";

export const CHAIN_OPTIONS = {
    // Polygon Amoy Testnet
    80002: {
        chainId: "0x13882",
        chainName: "Polygon Amoy Testnet",
        nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
        rpcUrls: [AMOY_RPC_URL],
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
export const TARGET_CHAIN_ID = 80002; 
