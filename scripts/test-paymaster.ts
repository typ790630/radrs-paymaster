import { createPublicClient, http, parseAbi, encodeFunctionData, formatEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { createSmartAccountClient } from 'permissionless';
import { toSimpleSmartAccount } from 'permissionless/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

// --- Configuration ---
const BUNDLER_URL = "https://public.pimlico.io/v2/56/rpc"; // Force use of ID-based URL
// const BUNDLER_URL = process.env.EXPO_PUBLIC_BUNDLER_URL || "https://public.pimlico.io/v2/56/rpc"; 
const PAYMASTER_API_URL = "http://localhost:3000";
// const PAYMASTER_API_URL = "https://sradr-dapp.vercel.app";
// const PAYMASTER_API_URL = process.env.PAYMASTER_API_URL || "https://sradr-dapp.vercel.app";
const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"; // v0.7
const CHAIN = bsc;

// RADRS Token Address (BSC)
const RADRS_TOKEN_ADDRESS = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";

const PAYMASTER_ADDRESS = "0x74A0d7235747D9Ae98BA1dB6f0306Bf57a14cb3A";

async function main() {
    console.log("🚀 Starting Paymaster Test Script...");
    console.log(`🔌 Bundler URL: ${BUNDLER_URL}`);
    console.log(`🌍 Paymaster API: ${PAYMASTER_API_URL}`);
    console.log(`🏠 Paymaster Address: ${PAYMASTER_ADDRESS}`);

    // ... (rest of the script)1. Check Environment
    const privateKey = process.env.PRIVATE_KEY as Hex;
    if (!privateKey) {
        throw new Error("❌ PRIVATE_KEY is missing in .env");
    }

    // 2. Setup Clients
    const publicClient = createPublicClient({
        chain: CHAIN,
        transport: http("https://bsc-dataseed1.binance.org"),
    });

    const owner = privateKeyToAccount(privateKey);
    console.log(`👤 Signer: ${owner.address}`);

    // 3. Initialize Smart Account
    const simpleAccount = await toSimpleSmartAccount({
        client: publicClient,
        owner: owner,
        entryPoint: {
            address: ENTRY_POINT_ADDRESS,
            version: "0.7"
        },
        factoryAddress: "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985",
    });

    console.log(`Nb Smart Account: ${simpleAccount.address}`);

    // 4. Setup Smart Account Client with Paymaster Middleware
    const smartAccountClient = createSmartAccountClient({
        account: simpleAccount,
        chain: CHAIN,
        bundlerTransport: http(BUNDLER_URL),
        // Override Gas Estimation to ensure maxFeePerGas/maxPriorityFeePerGas are set
        userOperation: {
            estimateFeesPerGas: async () => {
                console.log("⛽ Fetching Gas Fees from Public Node...");
                const feeData = await publicClient.estimateFeesPerGas();
                // Fallback values if public node fails to return EIP-1559 data
                let maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice || 3000000000n;
                let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1000000000n;
                
                // Bump up gas price by 50% to satisfy Bundler minimums
                maxFeePerGas = (maxFeePerGas * 150n) / 100n;
                maxPriorityFeePerGas = (maxPriorityFeePerGas * 150n) / 100n;

                console.log(`   Gas Price (Bumped): ${formatEther(maxFeePerGas)} BNB`);
                return {
                    maxFeePerGas,
                    maxPriorityFeePerGas
                };
            }
        },
        paymaster: {
            getPaymasterData: async (userOp) => {
                console.log("💸 Requesting Paymaster Sponsorship...");
                
                // Helper to stringify BigInt
                const replacer = (key: string, value: any) => 
                    typeof value === 'bigint' ? value.toString() : value;

                try {
                    const response = await fetch(`${PAYMASTER_API_URL}/paymaster/sponsor`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chainId: CHAIN.id,
                            userOp,
                            entryPoint: ENTRY_POINT_ADDRESS
                        }, replacer)
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Paymaster API Error: ${response.status} ${text}`);
                    }

                    const data = await response.json();
                    console.log("✅ Paymaster Signature Received");
                    console.log("   Paymaster Address:", data.paymasterAndData.slice(0, 42));
                    console.log("   ValidUntil:", data.validUntil);
                    console.log("   Fee:", data.fee);
                    
                    return {
                        paymaster: data.paymasterAndData.slice(0, 42) as Hex, // First 20 bytes is address
                        paymasterData: ("0x" + data.paymasterAndData.slice(42)) as Hex, // Rest is data
                    };
                } catch (error) {
                    console.error("❌ Failed to fetch paymaster data:", error);
                    throw error;
                }
            },
            getPaymasterStubData: async (userOp) => {
                console.log("🛠️ Requesting Paymaster Stub Data (for Gas Estimation)...");
                // Reuse the same logic as getPaymasterData to get a valid signature
                // We provide some default gas limits if they are missing, just to get a valid signature
                const stubUserOp = {
                    ...userOp,
                    callGasLimit: userOp.callGasLimit || 100000n,
                    verificationGasLimit: userOp.verificationGasLimit || 100000n,
                    preVerificationGas: userOp.preVerificationGas || 50000n,
                    maxFeePerGas: userOp.maxFeePerGas || 3000000000n,
                    maxPriorityFeePerGas: userOp.maxPriorityFeePerGas || 1000000000n
                };

                const replacer = (key: string, value: any) => 
                    typeof value === 'bigint' ? value.toString() : value;

                try {
                    const response = await fetch(`${PAYMASTER_API_URL}/paymaster/sponsor`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chainId: CHAIN.id,
                            userOp: stubUserOp,
                            entryPoint: ENTRY_POINT_ADDRESS
                        }, replacer)
                    });

                    if (!response.ok) {
                        const text = await response.text();
                        console.warn(`Stub Data Request Failed: ${response.status} ${text}`);
                        // Fallback to dummy data if API fails, but this will likely cause AA33
                        return {
                             paymaster: PAYMASTER_ADDRESS as Hex,
                             paymasterData: ("0x" + "00".repeat(200)) as Hex,
                        };
                    }

                    const data = await response.json();
                    console.log("✅ Stub Data Received");
                    
                    return {
                        paymaster: data.paymasterAndData.slice(0, 42) as Hex,
                        paymasterData: ("0x" + data.paymasterAndData.slice(42)) as Hex,
                    };
                } catch (error) {
                    console.error("❌ Failed to fetch stub data:", error);
                    throw error;
                }
            }
        }
    });

    // 5. Test 1: Free Approve (Sponsor should return fee=0)
    console.log("\n🧪 Test 1: Free Approve (RADRS Token)");
    try {
        const approveData = encodeFunctionData({
            abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
            functionName: 'approve',
            args: [PAYMASTER_ADDRESS as Hex, 115792089237316195423570985008687907853269984665640564039457584007913129639935n] // Max Uint256
        });

        const txHash = await smartAccountClient.sendTransaction({
            to: RADRS_TOKEN_ADDRESS as Hex,
            value: 0n,
            data: approveData,
        });
        console.log(`✅ Approve Sent! Hash: ${txHash}`);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
    } catch (error: any) {
        console.error("❌ Approve Failed:", error);
        if (error.cause) console.error("Cause:", error.cause);
    }

    // 6. Test 2: Self-Transfer (Paid)
    console.log("\n🧪 Test 2: Self-Transfer 0 BNB (Paid)");

    try {
        const txHash = await smartAccountClient.sendTransaction({
            to: owner.address,
            value: 0n,
            data: "0x",
        });

        console.log(`✅ Transfer Sent! Hash: ${txHash}`);
        console.log(`🔗 Explorer: https://bscscan.com/tx/${txHash}`);
        
        console.log("Waiting for receipt...");
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`🎉 Transaction Confirmed in block ${receipt.blockNumber}`);
        
    } catch (error: any) {
        console.error("❌ Transfer Failed:", error.shortMessage || error.message);
        if (error.message.includes("AA33")) {
            console.error("👉 Error Hint: Paymaster reverted (AA33). This usually means the Paymaster Signature is invalid or expired.");
            console.error("   Check: 1. Server time sync. 2. Backend SIGNER_KEY matches Contract VerifyingSigner.");
        }
    }
}

main().catch(console.error);
