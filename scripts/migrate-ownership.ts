
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const PAYMASTER_ADDRESS = "0x74A0d7235747D9Ae98BA1dB6f0306Bf57a14cb3A";
const RPC_URL = "https://bsc-dataseed3.binance.org";

// 1. OLD OWNER KEY (Compromised/Old Deployer) - Needed for permission
const OLD_PRIVATE_KEY = "0x013c44a3940c1c417b4600172f6a9be1fcda401c678b980b2baa809458057994";

// 2. NEW SAFE WALLET (Target Owner & Signer)
const NEW_WALLET_ADDRESS = "0x212643F63Aa738b20F1fe8Eb538345E40F0B1F2d";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const oldWallet = new ethers.Wallet(OLD_PRIVATE_KEY, provider);

const PAYMASTER_ABI = [
    "function setVerifyingSigner(address _newSigner) external",
    "function transferOwnership(address newOwner) external",
    "function verifyingSigner() view returns (address)",
    "function owner() view returns (address)"
];

async function migrateOwnership() {
    console.log("🚨 STARTING CRITICAL MIGRATION 🚨");
    console.log("-----------------------------------");
    console.log("Using OLD Owner:   ", oldWallet.address);
    console.log("Target NEW Owner:  ", NEW_WALLET_ADDRESS);
    console.log("Paymaster Contract:", PAYMASTER_ADDRESS);
    console.log("-----------------------------------");

    const paymaster = new ethers.Contract(PAYMASTER_ADDRESS, PAYMASTER_ABI, oldWallet);

    try {
        // 1. Check Permissions
        const currentOwner = await paymaster.owner();
        if (currentOwner.toLowerCase() !== oldWallet.address.toLowerCase()) {
            console.error("❌ Fatal: Old wallet is NOT the owner anymore. Migration aborted.");
            console.error("Current Owner:", currentOwner);
            return;
        }

        // 2. Update Signer (So the backend can work immediately)
        const currentSigner = await paymaster.verifyingSigner();
        if (currentSigner.toLowerCase() !== NEW_WALLET_ADDRESS.toLowerCase()) {
            console.log(`\n1️⃣  Updating Signer to ${NEW_WALLET_ADDRESS}...`);
            const tx1 = await paymaster.setVerifyingSigner(NEW_WALLET_ADDRESS);
            console.log("   Tx Sent:", tx1.hash);
            await tx1.wait();
            console.log("   ✅ Signer Updated!");
        } else {
            console.log("\n1️⃣  Signer is already correct. Skipping.");
        }

        // 3. Transfer Ownership (So we never need the old key again)
        console.log(`\n2️⃣  Transferring Ownership to ${NEW_WALLET_ADDRESS}...`);
        const tx2 = await paymaster.transferOwnership(NEW_WALLET_ADDRESS);
        console.log("   Tx Sent:", tx2.hash);
        await tx2.wait();
        console.log("   ✅ Ownership Transferred!");

        console.log("\n🎉 MIGRATION COMPLETE!");
        console.log("You can now safely delete the old private key.");
        console.log("Please restart your App to test transaction.");

    } catch (error: any) {
        console.error("\n❌ Migration Failed:", error.message);
        if (error.message.includes("insufficient funds")) {
            console.error("👉 Reason: Old wallet has no BNB for gas.");
            console.error("👉 Fix: Send 0.002 BNB to", oldWallet.address);
        }
    }
}

migrateOwnership();
