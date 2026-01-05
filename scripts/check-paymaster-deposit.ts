
import { createPublicClient, http, parseAbi } from "viem";
import { bsc } from "viem/chains";

const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const PAYMASTER_ADDRESS = "0x1f29efB2d33BC425B3C4050804D55047d872A3dC";

async function main() {
    const client = createPublicClient({
        chain: bsc,
        transport: http("https://bsc-dataseed1.binance.org"),
    });

    const entryPointAbi = parseAbi([
        "function balanceOf(address account) view returns (uint256)",
        "function getDepositInfo(address account) view returns (uint256 deposit, bool staked, uint112 stake, uint32 unstakeDelaySec, uint48 withdrawTime)"
    ]);

    console.log("Checking Paymaster Deposit...");
    const deposit = await client.readContract({
        address: ENTRY_POINT_ADDRESS,
        abi: entryPointAbi,
        functionName: "balanceOf",
        args: [PAYMASTER_ADDRESS]
    });

    console.log("Paymaster:", PAYMASTER_ADDRESS);
    console.log("Deposit (BNB):", (Number(deposit) / 1e18).toFixed(6));
    
    if (deposit < 10000000000000000n) { // 0.01 BNB
        console.log("⚠️ WARNING: Deposit is low!");
    } else {
        console.log("✅ Deposit looks sufficient.");
    }
}

main().catch(console.error);
