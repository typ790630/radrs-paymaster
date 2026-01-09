
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS || "0x74A0d7235747D9Ae98BA1dB6f0306Bf57a14cb3A";
const RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed3.binance.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY; // This is the NEW key (0x12a2...)

if (!PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not found in .env");
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const PAYMASTER_ABI = [
    "function setVerifyingSigner(address _newSigner) external",
    "function verifyingSigner() view returns (address)",
    "function owner() view returns (address)"
];

async function updateSigner() {
    console.log("🔄 Updating Paymaster Signer...");
    console.log("Paymaster:", PAYMASTER_ADDRESS);
    console.log("Wallet (New Admin):", wallet.address);

    const paymaster = new ethers.Contract(PAYMASTER_ADDRESS, PAYMASTER_ABI, wallet);

    try {
        // 1. Check Current Signer
        const currentSigner = await paymaster.verifyingSigner();
        console.log("Current Signer on Chain:", currentSigner);

        // 2. Check Owner
        const owner = await paymaster.owner();
        console.log("Contract Owner:", owner);

        if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
            console.error("❌ ERROR: The current wallet is NOT the owner of the Paymaster contract.");
            console.error(`   Owner: ${owner}`);
            console.error(`   You:   ${wallet.address}`);
            console.error("   You cannot update the signer unless you use the Original Deployer Key (Old Key).");
            console.error("   SOLUTION: Switch PRIVATE_KEY in .env back to the OLD key temporarily to run this script.");
            return;
        }

        // 3. Update Signer to match Wallet (Self)
        if (currentSigner.toLowerCase() === wallet.address.toLowerCase()) {
            console.log("✅ Signer is already correct. No action needed.");
            return;
        }

        console.log(`📝 Setting new signer to: ${wallet.address}...`);
        const tx = await paymaster.setVerifyingSigner(wallet.address);
        console.log("Tx Sent:", tx.hash);
        await tx.wait();
        console.log("🎉 Successfully updated verifyingSigner!");

    } catch (error: any) {
        console.error("❌ Update Failed:", error.message);
    }
}

updateSigner();
