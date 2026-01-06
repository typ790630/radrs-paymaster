
import { createPublicClient, http, parseAbi, encodeFunctionData, formatEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { createSmartAccountClient } from 'permissionless';
import { toSimpleSmartAccount } from 'permissionless/accounts';
import * as dotenv from 'dotenv';
import { ethers } from 'ethers'; // Use ethers for some quick utils if needed

dotenv.config();

// --- Configuration ---
const BUNDLER_URL = "https://public.pimlico.io/v2/56/rpc"; 
const PAYMASTER_API_URL = "http://localhost:3000";
const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"; 
const CHAIN = bsc;

// Addresses
const RADRS_TOKEN_ADDRESS = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
const PAYMASTER_ADDRESS = "0x74A0d7235747D9Ae98BA1dB6f0306Bf57a14cb3A"; // V3 Address

// Utils
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("🚀 Starting Paymaster V3 Flow Test...");
    console.log(`🔌 Bundler URL: ${BUNDLER_URL}`);
    console.log(`🌍 Paymaster API: ${PAYMASTER_API_URL}`);
    console.log(`🏠 Paymaster Address: ${PAYMASTER_ADDRESS}`);

    // 1. Setup Clients
    const privateKey = process.env.PRIVATE_KEY as Hex;
    if (!privateKey) throw new Error("Missing PRIVATE_KEY");

    const owner = privateKeyToAccount(privateKey);
    console.log(`👤 Signer (Owner): ${owner.address}`);

    const publicClient = createPublicClient({
        chain: CHAIN,
        transport: http("https://bsc-dataseed1.binance.org"),
    });

    // 2. Initialize Smart Account
    const simpleAccount = await toSimpleSmartAccount({
        client: publicClient,
        owner: owner,
        entryPoint: {
            address: ENTRY_POINT_ADDRESS,
            version: "0.7"
        },
        factoryAddress: "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985",
    });

    const senderAddress = simpleAccount.address;
    console.log(`🤖 Smart Account (Sender): ${senderAddress}`);

    // 3. Check Activation Status
    const isActivated = await publicClient.readContract({
        address: PAYMASTER_ADDRESS as Hex,
        abi: parseAbi(['function isActivated(address) view returns (bool)']),
        functionName: 'isActivated',
        args: [senderAddress]
    }) as boolean;

    console.log(`📊 Current Activation Status: ${isActivated ? "✅ Activated (Charged)" : "🆕 Not Activated (Free)"}`);

    // 4. Setup Smart Account Client
    const smartAccountClient = createSmartAccountClient({
        account: simpleAccount,
        chain: CHAIN,
        bundlerTransport: http(BUNDLER_URL),
        userOperation: {
            estimateFeesPerGas: async () => {
                // Manually estimate to ensure high enough limits
                const feeData = await publicClient.estimateFeesPerGas();
                let maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice || 3000000000n;
                let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1000000000n;
                
                // Bump by 50%
                maxFeePerGas = (maxFeePerGas * 150n) / 100n;
                maxPriorityFeePerGas = (maxPriorityFeePerGas * 150n) / 100n;
                
                return { maxFeePerGas, maxPriorityFeePerGas };
            }
        },
        paymaster: {
            getPaymasterData: async (userOp) => {
                console.log("💸 Requesting Paymaster Sponsorship...");
                const replacer = (key: string, value: any) => typeof value === 'bigint' ? value.toString() : value;

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
                    console.log(`   ✅ Signed! Fee Quote: ${formatEther(BigInt(data.radrsFee || 0))} RADRS`);
                    return {
                        paymaster: data.paymasterAndData.slice(0, 42) as Hex,
                        paymasterData: ("0x" + data.paymasterAndData.slice(42)) as Hex,
                    };
                } catch (error) {
                    console.error("❌ Failed to fetch paymaster data:", error);
                    throw error;
                }
            },
            getPaymasterStubData: async (userOp) => {
                 // Return dummy stub to pass initial validation
                 return {
                     paymaster: PAYMASTER_ADDRESS as Hex,
                     paymasterData: ("0x" + "00".repeat(150)) as Hex // Dummy signature length
                 };
            }
        }
    });

    // 5. Execute Transaction: Self-Transfer 0 BNB
    // This will trigger activation if not active, or charge fee if active.
    console.log("\n🧪 Executing Transaction (Self-Transfer)...");

    try {
        const txHash = await smartAccountClient.sendTransaction({
            to: senderAddress,
            value: 0n,
            data: "0x"
        });

        console.log(`🚀 Transaction Sent! Hash: ${txHash}`);
        console.log(`🔗 Explorer: https://bscscan.com/tx/${txHash}`);

        console.log("⏳ Waiting for receipt...");
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`✅ Transaction Confirmed in block ${receipt.blockNumber}`);

        // 6. Check Activation Status Again
        const isActivatedNow = await publicClient.readContract({
            address: PAYMASTER_ADDRESS as Hex,
            abi: parseAbi(['function isActivated(address) view returns (bool)']),
            functionName: 'isActivated',
            args: [senderAddress]
        }) as boolean;

        console.log(`📊 New Activation Status: ${isActivatedNow ? "✅ Activated (Charged)" : "🆕 Not Activated (Should be Impossible)"}`);
        
        if (!isActivated && isActivatedNow) {
            console.log("🎉 SUCCESS: User was successfully activated (Free Transaction)!");
        } else if (isActivated && isActivatedNow) {
             console.log("💰 SUCCESS: User was already activated and charged fee (Paid Transaction)!");
        }

    } catch (error: any) {
        console.error("❌ Transaction Failed:", error);
        if (error.message && error.message.includes("AA33")) {
             console.log("👉 Paymaster Revert (AA33): Likely signature mismatch or insufficient funds/allowance if charged.");
        }
    }
}

main().catch(console.error);
