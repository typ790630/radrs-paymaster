
import { createPublicClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { bsc } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

// 1. Config
const RADRS_TOKEN = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const FACTORY = "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985";
const RPC = "https://bsc-dataseed3.binance.org";

async function main() {
    const privateKey = process.env.PRIVATE_KEY as Hex;
    if (!privateKey) throw new Error("Please set PRIVATE_KEY in .env");

    const owner = privateKeyToAccount(privateKey);
    console.log("---------------------------------------------------");
    console.log("1. 您的 EOA 钱包地址 (私钥对应):", owner.address);

    const publicClient = createPublicClient({
        chain: bsc,
        transport: http(RPC)
    });

    // 2. Calculate Smart Account Address
    const simpleAccount = await toSimpleSmartAccount({
        client: publicClient,
        owner: owner,
        entryPoint: {
            address: ENTRY_POINT,
            version: "0.7"
        },
        factoryAddress: FACTORY,
    });

    console.log("2. 您的 AA 智能账户地址 (实际扣费方):", simpleAccount.address);
    console.log("---------------------------------------------------");

    // 3. Check Balances
    const erc20Abi = parseAbi([
        "function balanceOf(address) view returns (uint256)"
    ]);

    const [eoaBalance, aaBalance] = await Promise.all([
        publicClient.readContract({
            address: RADRS_TOKEN,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [owner.address]
        }),
        publicClient.readContract({
            address: RADRS_TOKEN,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [simpleAccount.address]
        })
    ]);

    console.log(`EOA 余额: ${(Number(eoaBalance) / 1e18).toFixed(4)} RADRS`);
    console.log(`AA  余额: ${(Number(aaBalance) / 1e18).toFixed(4)} RADRS`);
    
    console.log("---------------------------------------------------");
    
    if (aaBalance < 100000000000000000n) {
        console.log("❌ 结论: AA 账户余额不足！");
        console.log("   App 报错是因为它检查的是 AA 账户的余额。");
        console.log("   请将 RADRS 从 EOA 地址转账到 AA 地址。");
    } else {
        console.log("✅ 结论: AA 账户余额充足。如果还报错，可能是代码检查逻辑有问题。");
    }
    console.log("---------------------------------------------------");
}

main().catch(console.error);
