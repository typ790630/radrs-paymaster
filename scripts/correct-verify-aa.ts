
import { createPublicClient, http, fallback, encodeFunctionData, parseAbi } from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";

// 1. Configuration
const CHAIN = bsc;
const BUNDLER_URL = "https://api.pimlico.io/v1/binance/rpc?apikey=pim_iQCirstXBmWBPpMs9B9MHw";
const PAYMASTER_ADDRESS = "0x7Be3A50B2a062a8dD1b24C0D77D0Cc8D8b19618A";
const RADRS_TOKEN_ADDRESS = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

async function main() {
    console.log("🚀 Starting Correct AA Verification Script...");

    // 2. Setup Public Client
    const publicClient = createPublicClient({
        chain: CHAIN,
        transport: fallback([
            http("https://bsc-dataseed1.binance.org"),
            http("https://bsc-dataseed2.binance.org"),
            http("https://rpc.ankr.com/bsc"),
        ]),
    });

    // 3. Setup Account (Using a random key for demo)
    // In production, use the user's real private key
    const privateKey = "0x" + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join("") as `0x${string}`;
    const owner = privateKeyToAccount(privateKey);
    console.log("👤 EOA:", owner.address);

    const simpleAccount = await toSimpleSmartAccount({
        client: publicClient,
        owner: owner,
        entryPoint: {
            address: ENTRY_POINT_ADDRESS,
            version: "0.7"
        },
        factoryAddress: "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985",
    });
    console.log("✅ AA Address:", simpleAccount.address);

    // 4. Setup Smart Account Client (THE FIX IS HERE)
    const smartAccountClient = createSmartAccountClient({
        account: simpleAccount, // <--- CRITICAL: Must provide the account here!
        chain: CHAIN,
        bundlerTransport: http(BUNDLER_URL),
        paymaster: {
            getPaymasterData: async () => {
                return {
                    paymaster: PAYMASTER_ADDRESS,
                    paymasterData: "0x",
                } as any;
            },
            getPaymasterStubData: async () => {
                return {
                    paymaster: PAYMASTER_ADDRESS,
                    paymasterData: "0x",
                } as any;
            }
        }
    });

    // 5. Prepare UserOp (Approve)
    const erc20Abi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);
    const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [PAYMASTER_ADDRESS, 115792089237316195423570985008687907853269984665640564039457584007913129639935n]
    });

    // 6. Send Transaction
    console.log("⚡ Sending 'Approve' UserOp...");
    try {
        const fees = await publicClient.estimateFeesPerGas();
        const gasPrice = fees.maxFeePerGas || fees.gasPrice || 3000000000n;

        const hash = await smartAccountClient.sendTransaction({
            to: RADRS_TOKEN_ADDRESS,
            value: 0n,
            data: approveData,
            maxFeePerGas: gasPrice,
            maxPriorityFeePerGas: gasPrice
        });
        console.log("✅ SUCCESS! UserOp Hash:", hash);
        console.log("Wait for receipt...");
        
        // Wait
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log("✅ Transaction Confirmed on Chain:", receipt.transactionHash);

    } catch (e: any) {
        console.error("❌ FAILED:", e.message || e);
    }
}

main().catch(console.error);
