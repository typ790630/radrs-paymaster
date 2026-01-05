
import { 
    createSmartAccountClient
} from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPublicClient, http, encodeFunctionData, parseAbi, parseEther, type Hex, formatEther, createWalletClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const ENTRYPOINT_ADDRESS_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const BUNDLER_URL = process.env.EXPO_PUBLIC_BUNDLER_URL || "";
const PAYMASTER_ADDRESS = process.env.EXPO_PUBLIC_RADRS_PAYMASTER_ADDRESS || "0x892EdBbc40b79B3C7784F395eDa83A32c2210b22";
const RADRS_TOKEN_ADDRESS = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
const FACTORY_ADDRESS = "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985";
const BSC_RPC = "https://bsc-dataseed3.binance.org";

async function main() {
    console.log("=== Testing New User Flow (Deploy + Approve) ===");

    // 1. Setup Clients
    const publicClient = createPublicClient({
        chain: bsc,
        transport: http(BSC_RPC)
    });

    const funderClient = createWalletClient({
        chain: bsc,
        transport: http(BSC_RPC),
        account: privateKeyToAccount(process.env.PRIVATE_KEY as Hex)
    });

    // 2. Create Random User
    const randomKey = generatePrivateKey();
    const owner = privateKeyToAccount(randomKey);
    console.log("New User Owner:", owner.address);

    const simpleAccount = await toSimpleSmartAccount({
        client: publicClient,
        owner: owner,
        entryPoint: {
            address: ENTRYPOINT_ADDRESS_V07,
            version: "0.7"
        },
        factoryAddress: FACTORY_ADDRESS,
    });
    console.log("Smart Account Address (Calculated):", simpleAccount.address);

    // 3. Fund with RADRS (but NO BNB)
    console.log("Funding Smart Account with 1 RADRS...");
    const erc20Abi = parseAbi([
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address) view returns (uint256)"
    ]);
    
    try {
        const tx = await funderClient.writeContract({
            address: RADRS_TOKEN_ADDRESS,
            abi: erc20Abi,
            functionName: "transfer",
            args: [simpleAccount.address, parseEther("1")],
        });
        console.log("Funding Tx Sent:", tx);
        await publicClient.waitForTransactionReceipt({ hash: tx });
        console.log("Funding Confirmed.");
    } catch (e: any) {
        console.error("Funding failed:", e.message);
        process.exit(1);
    }

    // 4. Setup Smart Account Client with Paymaster
    const smartAccountClient = createSmartAccountClient({
        account: simpleAccount,
        chain: bsc,
        bundlerTransport: http(BUNDLER_URL),
        paymaster: {
            getPaymasterData: async () => {
                console.log("⚡ Requesting Paymaster Sponsorship...");
                return {
                    paymaster: PAYMASTER_ADDRESS as Hex,
                    paymasterData: "0x" as Hex,
                } as any;
            },
            getPaymasterStubData: async () => {
                return {
                    paymaster: PAYMASTER_ADDRESS as Hex,
                    paymasterData: "0x" as Hex,
                } as any;
            }
        }
    });

    // 5. Send 'Approve Only' UserOp
    // This implies DEPLOYMENT + APPROVE in one op.
    // The Paymaster should verify it's an 'approve' call and SPONSOR it (Fee = 0).
    console.log("\nSending 'Approve Only' UserOp (Should trigger Deployment)...");
    
    const fees = await publicClient.estimateFeesPerGas();
    const gasPrice = fees.maxFeePerGas || fees.gasPrice || 3000000000n;
    console.log("Gas Price:", formatEther(gasPrice), "BNB");

    const approveData = encodeFunctionData({
        abi: parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]),
        functionName: "approve",
        args: [PAYMASTER_ADDRESS as Hex, 115792089237316195423570985008687907853269984665640564039457584007913129639935n]
    });

    try {
        const hash = await smartAccountClient.sendTransaction({
            to: RADRS_TOKEN_ADDRESS,
            data: approveData,
            value: 0n,
            maxFeePerGas: gasPrice,
            maxPriorityFeePerGas: gasPrice
        });
        console.log("UserOp Sent! Hash:", hash);
        
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log("Transaction Confirmed!");
        console.log("Gas Used:", receipt.gasUsed);

    } catch (e: any) {
        console.error("❌ UserOp Failed:", e.message);
        if (e.cause) console.error("Cause:", e.cause);
    }
}

main();
