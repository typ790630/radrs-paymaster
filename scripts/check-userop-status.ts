
import { createPublicClient, http, createClient } from "viem";
import { bsc } from "viem/chains";

const BUNDLER_URL = "https://api.pimlico.io/v2/56/rpc?apikey=pim_iQCirstXBmWBPpMs9B9MHw";
const USER_OP_HASH = "0xd72524291fda16257ec907706f930e96fde39892b2375a76b7a38c6a5e3f042d";

async function main() {
    console.log("Checking UserOp Status...");
    console.log("UserOp Hash:", USER_OP_HASH);

    // Create raw client for Bundler RPC
    const bundlerClient = createClient({
        chain: bsc,
        transport: http(BUNDLER_URL),
    });

    const publicClient = createPublicClient({
        chain: bsc,
        transport: http("https://bsc-dataseed1.binance.org"),
    });

    try {
        console.log("Fetching UserOp Receipt...");
        
        // Manual RPC call to avoid library version issues
        const receipt = await bundlerClient.request({
            method: 'eth_getUserOperationReceipt' as any,
            params: [USER_OP_HASH]
        }) as any;

        if (!receipt) {
            console.log("❌ UserOp Receipt not found (might be pending or failed before entry)");
            return;
        }

        console.log("✅ UserOp Receipt Found!");
        console.log("---------------------------------------------------");
        console.log("Success:", receipt.success);
        console.log("Transaction Hash:", receipt.receipt.transactionHash);
        console.log("Block Number:", receipt.receipt.blockNumber);
        console.log("Actual Gas Cost:", BigInt(receipt.actualGasCost).toString());
        console.log("Actual Gas Used:", BigInt(receipt.actualGasUsed).toString());
        console.log("Reason (if failed):", receipt.reason || "N/A");
        
        // Check Transaction Status on Chain
        const txReceipt = await publicClient.getTransactionReceipt({
            hash: receipt.receipt.transactionHash
        });

        console.log("\n🔗 On-Chain Transaction Status:");
        console.log("Status:", txReceipt.status);
        console.log("From:", txReceipt.from);
        console.log("To:", txReceipt.to);
        
        // Try to decode logs to see RADRS transfer
        console.log("\nChecking Logs for Paymaster Transfer...");
        const RADRS_TOKEN = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
        const PAYMASTER = "0x1d3E64c5a4fFfC4e46e70e22c33A1ddaD506c3Aa";
        
        const transferLogs = txReceipt.logs.filter(log => 
            log.address.toLowerCase() === RADRS_TOKEN.toLowerCase()
        );

        if (transferLogs.length > 0) {
            console.log(`✅ Found ${transferLogs.length} RADRS Token Transfer events!`);
            transferLogs.forEach((log, index) => {
                console.log(`Log #${index + 1}:`, log.topics);
                // Topic 0: Transfer(address,address,uint256) = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
                if (log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") {
                    const from = "0x" + log.topics[1]?.slice(26);
                    const to = "0x" + log.topics[2]?.slice(26);
                    console.log(`  From: ${from}`);
                    console.log(`  To:   ${to}`);
                    if (to.toLowerCase() === PAYMASTER.toLowerCase()) {
                         console.log("  🎯 THIS IS THE PAYMENT TO PAYMASTER!");
                    }
                }
            });
        } else {
            console.log("⚠️ No RADRS Token Transfer events found in this transaction.");
        }

    } catch (error) {
        console.error("Error fetching receipt:", error);
    }
}

main();
