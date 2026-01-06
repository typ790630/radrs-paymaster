
import { ethers } from "ethers";
import "dotenv/config";

const RPC_URL = "https://bsc-dataseed3.binance.org";

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    if (!process.env.PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    console.log(`Deployer Address: ${wallet.address}`);
    const balance = await provider.getBalance(wallet.address);
    console.log(`BNB Balance:      ${ethers.formatEther(balance)} BNB`);

    // List of addresses to check
    const addressesToCheck = [
        wallet.address, // Deployer
        "0x2C8e27CA6193522d5315F98734dC65412DB0c324" // The user smart account from logs
    ];
    const PAYMASTER_ADDRESS = "0x1d3E64c5a4fFfC4e46e70e22c33A1ddaD506c3Aa";

    // ERC20 ABI
    const abi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)"
    ];

    const radrs = new ethers.Contract("0xe2188a2e0a41a50f09359e5fe714d5e643036f2a", abi, provider);
    const symbol = await radrs.symbol();
    const decimals = await radrs.decimals();

    console.log(`Checking balance for Token: ${symbol}`);

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
        } catch (e: any) {
            console.log(`❌ Error: ${e.message}`);
        }
    }
}

main().catch(console.error);
