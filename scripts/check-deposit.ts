
import { createPublicClient, http, parseAbi } from "viem";
import { bsc } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

const ENTRYPOINT_ADDRESS_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const PAYMASTER_ADDRESS = "0x48DC18175a32e195e8582A1953340F555F6D6A3F";
const BSC_RPC = "https://bsc-dataseed1.binance.org";

async function main() {
    const client = createPublicClient({
        chain: bsc,
        transport: http(BSC_RPC),
    });

    console.log(`Checking deposit for Paymaster: ${PAYMASTER_ADDRESS}`);
    console.log(`EntryPoint: ${ENTRYPOINT_ADDRESS_V07}`);

    const entryPointAbi = parseAbi([
        "function balanceOf(address account) external view returns (uint256)",
        "function getDepositInfo(address account) external view returns (uint112 deposit, bool staked, uint112 stake, uint32 unstakeDelaySec, uint48 withdrawTime)"
    ]);

    const balance = await client.readContract({
        address: ENTRYPOINT_ADDRESS_V07,
        abi: entryPointAbi,
        functionName: "balanceOf",
        args: [PAYMASTER_ADDRESS]
    });

    console.log(`Deposit Balance (balanceOf): ${balance.toString()} wei (${Number(balance) / 1e18} BNB)`);

    const info = await client.readContract({
        address: ENTRYPOINT_ADDRESS_V07,
        abi: entryPointAbi,
        functionName: "getDepositInfo",
        args: [PAYMASTER_ADDRESS]
    });

    console.log("Deposit Info:", info);

    // Check balances
    const deployerAccount = (await import("viem/accounts")).privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
    const deployerBalance = await client.getBalance({ address: deployerAccount.address });
    console.log(`Deployer (EOA) Balance: ${deployerBalance.toString()} wei (${Number(deployerBalance)/1e18} BNB)`);

    // Smart Account Address (from logs)
    const smartAccount = "0x2C8e27CA6193522d5315F98734dC65412DB0c324";
    const saBalance = await client.getBalance({ address: smartAccount });
    console.log(`Smart Account Balance: ${saBalance.toString()} wei (${Number(saBalance)/1e18} BNB)`);

    // Check RADRS Balance & Allowance
    const RADRS_TOKEN = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
    const erc20Abi = parseAbi([
        "function balanceOf(address account) external view returns (uint256)",
        "function allowance(address owner, address spender) external view returns (uint256)"
    ]);

    const radrsBalance = await client.readContract({
        address: RADRS_TOKEN,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [smartAccount]
    });
    console.log(`RADRS Balance: ${radrsBalance.toString()} wei (${Number(radrsBalance)/1e18} RADRS)`);

    const allowance = await client.readContract({
        address: RADRS_TOKEN,
        abi: erc20Abi,
        functionName: "allowance",
        args: [smartAccount, PAYMASTER_ADDRESS]
    });
    console.log(`RADRS Allowance to Paymaster: ${allowance.toString()} wei`);
}

main().catch(console.error);
