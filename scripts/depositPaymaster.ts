
import { createPublicClient, createWalletClient, http, parseAbi, formatEther, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const RPC_URL = process.env.RPC_URL_BSC || process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;

// Addresses
const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

// ⚠️ Note: The user requested 0x1d3... (V2), but the active V3 is 0x74A... 
// We default to the Env var if set, otherwise the requested hardcoded one.
const PAYMASTER_ADDRESS = (process.env.PAYMASTER_ADDRESS || "0x1d3E64c5a4fFfC4e46e70e22c33A1ddaD506c3Aa") as Hex;

async function main() {
    console.log("🚀 Starting Paymaster Deposit Script...");
    console.log(`🔗 RPC URL: ${RPC_URL}`);
    console.log(`🏠 Paymaster Address: ${PAYMASTER_ADDRESS}`);

    if (!PRIVATE_KEY) {
        throw new Error("❌ Missing PRIVATE_KEY in .env file");
    }

    // 1. Setup Clients
    const account = privateKeyToAccount(PRIVATE_KEY);
    console.log(`👤 Payer Wallet: ${account.address}`);

    const publicClient = createPublicClient({
        chain: bsc,
        transport: http(RPC_URL)
    });

    const walletClient = createWalletClient({
        chain: bsc,
        transport: http(RPC_URL),
        account
    });

    // 2. Define ABIs
    // EntryPoint.balanceOf(account) -> returns the deposit of that account in EntryPoint
    // EntryPoint.depositTo(account) -> deposits BNB to that account
    const entryPointAbi = parseAbi([
        "function balanceOf(address account) view returns (uint256)",
        "function depositTo(address account) payable"
    ]);

    // 3. Check Pre-Deposit Balance
    console.log("\n📊 Checking current deposit...");
    const balanceBefore = await publicClient.readContract({
        address: ENTRY_POINT_ADDRESS,
        abi: entryPointAbi,
        functionName: "balanceOf",
        args: [PAYMASTER_ADDRESS]
    });
    console.log(`💰 Current Deposit: ${formatEther(balanceBefore)} BNB`);

    // 4. Send Deposit Transaction
    const amountToDeposit = parseEther("0.1"); // 0.1 BNB
    console.log(`\n💸 Depositing ${formatEther(amountToDeposit)} BNB to Paymaster...`);

    try {
        const hash = await walletClient.writeContract({
            address: ENTRY_POINT_ADDRESS,
            abi: entryPointAbi,
            functionName: "depositTo",
            args: [PAYMASTER_ADDRESS],
            value: amountToDeposit
        });

        console.log(`✅ Transaction Sent! Hash: ${hash}`);
        console.log(`🔗 Explorer: https://bscscan.com/tx/${hash}`);
        console.log("⏳ Waiting for confirmation...");

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        
        if (receipt.status === 'success') {
            console.log("✅ Transaction Confirmed!");
        } else {
            console.error("❌ Transaction Reverted!");
        }

        // 5. Check Post-Deposit Balance
        console.log("\n📊 Checking new deposit...");
        const balanceAfter = await publicClient.readContract({
            address: ENTRY_POINT_ADDRESS,
            abi: entryPointAbi,
            functionName: "balanceOf",
            args: [PAYMASTER_ADDRESS]
        });
        console.log(`💰 New Deposit: ${formatEther(balanceAfter)} BNB`);
        console.log(`📈 Increased by: ${formatEther(balanceAfter - balanceBefore)} BNB`);

    } catch (error: any) {
        console.error("\n❌ Deposit Failed:", error.message || error);
        // Hint for common errors
        if (error.message?.includes("insufficient funds")) {
            console.error("👉 Hint: Your wallet does not have enough BNB + Gas.");
        }
    }
}

main().catch(console.error);
