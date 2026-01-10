import { createPublicClient, http, parseAbi, formatEther } from 'viem';
import { bsc } from 'viem/chains';
import * as dotenv from 'dotenv';

// Load env
dotenv.config({ path: 'server/.env' }); // Try server env first
// Or use default hardcoded for safety check
const RADRS_TOKEN = "0xe2188a2e0a41a50f09359e5fe714d5e643036f2a"; // 当前配置的地址
const USER_AA_ADDRESS = "0x95Cd77c418Ad171443B956518938A41cB0e095Cd"; // 您截图里的地址

async function main() {
    console.log("🔍 Checking Real On-Chain Balance...");
    console.log(`Token: ${RADRS_TOKEN}`);
    console.log(`User (AA): ${USER_AA_ADDRESS}`);

    const client = createPublicClient({
        chain: bsc,
        transport: http("https://bsc-dataseed1.binance.org")
    });

    try {
        const balance = await client.readContract({
            address: RADRS_TOKEN,
            abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
            functionName: "balanceOf",
            args: [USER_AA_ADDRESS]
        });

        console.log("------------------------------------------------");
        console.log(`✅ On-Chain Balance: ${formatEther(balance)} RADRS`);
        console.log("------------------------------------------------");

        if (balance < 50n * 10n**18n) {
            console.error("❌ Balance is indeed LESS than 50!");
        } else {
            console.log("✅ Balance is SUFFICIENT (>= 50). Backend logic is wrong.");
        }

    } catch (e) {
        console.error("Error fetching balance:", e);
    }
}

main();
