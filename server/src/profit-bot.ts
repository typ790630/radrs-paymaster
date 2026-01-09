
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

// Configuration
const PAYMASTER_ADDRESS = "0xD0D46B98dFf2ee93Dfe708d4434f180383B2B939"; // V3 (Secure)
const RADRS_TOKEN_ADDRESS = "0xe2188a2e0a41a50f09359e5fe714d5e643036f2a";
const FEE_COLLECTOR = "0xfb710006a8Ad08a636e919B02B2f9bBbcE524d96"; // Your Wallet
const RPC_URL = "https://bsc-dataseed3.binance.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x12a2a13ae697e350f58582f5275484c8dfd05b49eeda0f344e42fad807d67376"; // Fallback to safe key if env missing

if (!PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not found in .env");
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// ABIs
const PAYMASTER_ABI = [
    "function withdrawTokensTo(address token, address target, uint256 amount) external"
];
const ERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)"
];

async function withdrawProfits() {
    console.log(`\n[${new Date().toISOString()}] ⏰ Starting Automated Profit Withdrawal...`);
    
    try {
        const paymaster = new ethers.Contract(PAYMASTER_ADDRESS, PAYMASTER_ABI, signer);
        const radrs = new ethers.Contract(RADRS_TOKEN_ADDRESS, ERC20_ABI, provider);

        // 1. Check Balance
        const balance = await (radrs as any).balanceOf(PAYMASTER_ADDRESS);
        console.log(`   💰 Paymaster RADRS Balance: ${ethers.formatEther(balance)}`);

        if (balance <= 0n) {
            console.log("   ⚠️ No RADRS to withdraw.");
            return;
        }

        // 2. Withdraw All (Since all RADRS in Paymaster ARE profits/revenue)
        // Note: Paymaster only holds RADRS from user payments. It doesn't need RADRS to operate (it needs BNB).
        console.log(`   🔄 Withdrawing ${ethers.formatEther(balance)} RADRS to ${FEE_COLLECTOR}...`);
        
        const tx = await (paymaster as any).withdrawTokensTo(RADRS_TOKEN_ADDRESS, FEE_COLLECTOR, balance);
        console.log(`   ✅ Tx Sent: ${tx.hash}`);
        
        await tx.wait();
        console.log("   🎉 Withdrawal Confirmed!");

    } catch (error) {
        console.error("   ❌ Withdrawal Failed:", error);
    }
}

// Schedule: 1st, 5th, 10th, 15th, 20th, 25th of every month at 9:00 AM
// Cron format: Minute Hour Day Month DayOfWeek
cron.schedule("0 9 1,5,10,15,20,25 * *", () => {
    withdrawProfits();
});

console.log("🤖 Profit Auto-Withdrawal Bot Started.");
console.log("📅 Scheduled for: 1st, 5th, 10th, 15th, 20th, 25th at 9:00 AM");
console.log("⚠️ NOTE: This bot only runs when your computer is ON and this script is RUNNING.");
console.log("👉 Press Ctrl+C to stop.");

// Run once immediately for testing (Optional)
// withdrawProfits();
