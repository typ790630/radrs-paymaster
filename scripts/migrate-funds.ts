
import { createPublicClient, createWalletClient, http, parseAbi, formatEther, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const NEW_PAYMASTER_ADDRESS = "0x74A0d7235747D9Ae98BA1dB6f0306Bf57a14cb3A";

// List of potentially old Paymasters
const OLD_PAYMASTERS = [
    "0x1d3E64c5a4fFfC4e46e70e22c33A1ddaD506c3Aa", // Found in check-paymaster-deposit.ts
    // Add any others if found
];

async function main() {
    console.log("🔍 Checking Paymaster Deposits...");
    
    const client = createPublicClient({
        chain: bsc,
        transport: http("https://bsc-dataseed1.binance.org"),
    });

    const walletClient = createWalletClient({
        chain: bsc,
        transport: http("https://bsc-dataseed1.binance.org"),
    });

    const privateKey = process.env.PRIVATE_KEY as Hex;
    if (!privateKey) throw new Error("Missing PRIVATE_KEY");
    const account = privateKeyToAccount(privateKey);

    const entryPointAbi = parseAbi([
        "function balanceOf(address account) view returns (uint256)",
        "function depositTo(address account) payable"
    ]);

    const paymasterAbi = parseAbi([
        "function withdrawTo(address withdrawAddress, uint256 amount) external"
    ]);

    // 1. Check New Paymaster
    const newBalance = await client.readContract({
        address: ENTRY_POINT_ADDRESS,
        abi: entryPointAbi,
        functionName: "balanceOf",
        args: [NEW_PAYMASTER_ADDRESS]
    }) as bigint;
    console.log(`\n🆕 New Paymaster (V3) [${NEW_PAYMASTER_ADDRESS}] Balance: ${formatEther(newBalance)} BNB`);

    // 2. Check Old Paymasters
    for (const oldAddr of OLD_PAYMASTERS) {
        const oldBalance = await client.readContract({
            address: ENTRY_POINT_ADDRESS,
            abi: entryPointAbi,
            functionName: "balanceOf",
            args: [oldAddr as Hex]
        }) as bigint;

        console.log(`\n👴 Old Paymaster [${oldAddr}] Balance: ${formatEther(oldBalance)} BNB`);

        if (oldBalance > 0n) {
            console.log("   ⚠️ Found funds in old Paymaster! Attempting to withdraw...");
            try {
                // Try to withdraw from Old Paymaster back to Owner
                // Note: This only works if 'account' is the owner of 'oldAddr'
                const hash = await walletClient.writeContract({
                    account,
                    address: oldAddr as Hex,
                    abi: paymasterAbi,
                    functionName: "withdrawTo",
                    args: [account.address, oldBalance]
                });
                console.log(`   ⏳ Withdraw Transaction Sent: ${hash}`);
                await client.waitForTransactionReceipt({ hash });
                console.log("   ✅ Funds Withdrawn to Owner Wallet.");
                
                // Optional: Automatically deposit to new Paymaster?
                // For safety, let's just withdraw to owner first, or ask user.
                // User said "归集到新的Paymaster", so let's try to deposit if withdraw succeeded.
                
                console.log(`   🔄 Forwarding ${formatEther(oldBalance)} BNB to New Paymaster...`);
                const depositHash = await walletClient.writeContract({
                    account,
                    address: ENTRY_POINT_ADDRESS,
                    abi: entryPointAbi,
                    functionName: "depositTo",
                    args: [NEW_PAYMASTER_ADDRESS],
                    value: oldBalance
                });
                console.log(`   ⏳ Deposit Transaction Sent: ${depositHash}`);
                await client.waitForTransactionReceipt({ hash: depositHash });
                console.log("   ✅ Funds Transferred to New Paymaster!");

            } catch (e: any) {
                console.error(`   ❌ Failed to withdraw/transfer: ${e.message}`);
                console.log("   (Ensure your private key is the owner of this contract)");
            }
        } else {
            console.log("   ✅ Empty.");
        }
    }

    // 3. Check Wallet Balance & Topup New Paymaster if needed
    const walletBalance = await client.getBalance({ address: account.address });
    console.log(`\n💰 Owner Wallet Balance: ${formatEther(walletBalance)} BNB`);

    if (newBalance < parseEther("0.01")) {
        console.log("⚠️ New Paymaster Balance is low (< 0.01 BNB).");
        if (walletBalance > parseEther("0.02")) {
             console.log("➕ Topping up 0.01 BNB from Wallet...");
             try {
                 const hash = await walletClient.writeContract({
                    account,
                    address: ENTRY_POINT_ADDRESS,
                    abi: entryPointAbi,
                    functionName: "depositTo",
                    args: [NEW_PAYMASTER_ADDRESS],
                    value: parseEther("0.01")
                 });
                 console.log(`   ⏳ Topup Transaction Sent: ${hash}`);
                 await client.waitForTransactionReceipt({ hash });
                 console.log("   ✅ Topup Successful!");
             } catch(e) {
                 console.error("   ❌ Topup Failed:", e);
             }
        } else {
            console.error("❌ Wallet balance too low to top up.");
        }
    } else {
        console.log("✅ New Paymaster Balance is sufficient.");
    }
}

main().catch(console.error);
