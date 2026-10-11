// frontend/src/config.js
// The ABI and default address come from deployments/amoy.json (committed,
// written by scripts/deploy.js), so a clean checkout builds without the
// git-ignored Hardhat artifacts/ folder.
import deployment from "../../deployments/amoy.json";

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || deployment.BioToken.address;
export const CONTRACT_ABI = deployment.BioToken.abi;
export const AMOY_RPC_URL = import.meta.env.VITE_AMOY_RPC_URL || "https://polygon-amoy.drpc.org";

// AI service base URL. VITE_AI_API_URL is a full URL; VITE_AI_API_HOST is a
// bare host name (what Render's Blueprint hands over), served over https.
function aiApiUrl() {
    const url = import.meta.env.VITE_AI_API_URL;
    const host = import.meta.env.VITE_AI_API_HOST;
    if (url) return url.replace(/\/+$/, "");
    if (host) return (/^https?:\/\//.test(host) ? host : `https://${host}`).replace(/\/+$/, "");
    return "http://localhost:8000";
}
export const AI_API_URL = aiApiUrl();

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
