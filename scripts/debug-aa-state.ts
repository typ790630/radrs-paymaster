
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { bsc } from "viem/chains";

// Config
const AA_ADDRESS = "0x9ADBbea6886A7DD09BF6Ddb26730F54772a3e946"; // From screenshot
const RADRS_ADDRESS = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
const PAYMASTER_ADDRESS = "0x7Be3A50B2a062a8dD1b24C0D77D0Cc8D8b19618A";

async function main() {
    const client = createPublicClient({
        chain: bsc,
        transport: http("https://bsc-dataseed1.binance.org"),
    });

    const abi = parseAbi([
        "function balanceOf(address) view returns (uint256)",
        "function allowance(address, address) view returns (uint256)",
        "function decimals() view returns (uint8)"
    ]);

    console.log(`🔍 Checking State for AA: ${AA_ADDRESS}`);

    const [balance, allowance, decimals] = await client.multicall({
        contracts: [
            { address: RADRS_ADDRESS, abi, functionName: "balanceOf", args: [AA_ADDRESS] },
            { address: RADRS_ADDRESS, abi, functionName: "allowance", args: [AA_ADDRESS, PAYMASTER_ADDRESS] },
            { address: RADRS_ADDRESS, abi, functionName: "decimals" }
        ]
    });

    const bal = balance.result!;
    const all = allowance.result!;
    const dec = decimals.result!;

    console.log(`\n💰 RADRS Balance: ${formatUnits(bal, dec)}`);
    console.log(`🔓 Allowance to Paymaster: ${formatUnits(all, dec)}`);

    if (bal < 10n * 10n**BigInt(dec)) {
        console.log("⚠️ Balance is low (< 10 RADRS).");
    } else {
        console.log("✅ Balance seems sufficient.");
    }

    if (all < 1000n * 10n**BigInt(dec)) {
        console.log("ℹ️ Allowance is low. The frontend WILL try to send an Approve UserOp.");
    } else {
        console.log("✅ Allowance is high. The frontend SHOULD SKIP the Approve step.");
    }
}

main().catch(console.error);
