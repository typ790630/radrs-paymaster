
import { ethers } from "ethers";
import "dotenv/config";

const RPC_URL = process.env.RPC_URL || "https://bsc-dataseed1.binance.org";
const RADRS_ADDRESS = "0xe2188a2e0a41a50f09359e5fe714d5e643036f2a"; // Fixed RADRS address
const USER_INPUT = "0x9ADBbea6886A7DD09BF6Ddb26730F54772a3e946"; // The one user provided just now
const PREVIOUS_KNOWN_USER = "0x9ADBea8686A7D0D89BF6Ddb26730F54772a3e946"; // The one from previous context

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    // ERC20 ABI
    const abi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)"
    ];

    const radrs = new ethers.Contract(RADRS_ADDRESS, abi, provider);
    const symbol = await radrs.symbol();
    const decimals = await radrs.decimals();

    console.log(`Checking balance for Token: ${symbol} (${RADRS_ADDRESS})`);

    // List of addresses to check
    const addressesToCheck = [USER_INPUT];
    const PAYMASTER_ADDRESS = "0x3ca3Da0fA3C50365847EaA4Db57eAdF8B083Aa43";

    for (const rawAddr of addressesToCheck) {
        console.log(`\n--------------------------------------------------`);
        console.log(`Input Address: ${rawAddr}`);
        try {
            const addr = ethers.getAddress(rawAddr); // Checksum validation
            console.log(`Normalized:    ${addr}`);
            
            const balance = await radrs.balanceOf(addr);
            const fmt = ethers.formatUnits(balance, decimals);
            console.log(`Balance:       ${fmt} ${symbol}`);

            const allowance = await radrs.allowance(addr, PAYMASTER_ADDRESS);
            const fmtAllowance = ethers.formatUnits(allowance, decimals);
            console.log(`Allowance to Paymaster (${PAYMASTER_ADDRESS}): ${fmtAllowance} ${symbol}`);

            if (allowance < ethers.parseUnits("1", decimals)) {
                console.log(`⚠️  WARNING: Allowance is 0 or very low. You need to Approve!`);
            } else {
                console.log(`✅ Allowance seems sufficient.`);
            }

        } catch (e: any) {
            console.log(`❌ Invalid Address Format or Error: ${e.message}`);
            // If it failed, maybe it's just a typo in the hex string, let's try to ignore checksum if length is correct?
            // But if length is wrong, it's definitely wrong.
            if (rawAddr.length !== 42) {
                 console.log(`   Length check: ${rawAddr.length} chars (Expected 42)`);
            }
        }
    }
}

main().catch(console.error);
