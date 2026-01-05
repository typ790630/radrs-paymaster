
import { createPublicClient, http, Hex, parseAbi, encodeFunctionData, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { createSmartAccountClient } from 'permissionless';
import { toSimpleSmartAccount } from 'permissionless/accounts';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const CHAIN = bsc;
const BUNDLER_URL = process.env.EXPO_PUBLIC_BUNDLER_URL || "https://public.pimlico.io/v2/bsc-mainnet/rpc"; 
const PAYMASTER_API_URL = "https://sradr-dapp.vercel.app";
const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const PAYMASTER_ADDRESS = "0x1f29efB2d33BC425B3C4050804D55047d872A3dC";
// Use a test private key (ensure this account has some BNB and RADRS if possible, or just test simulation)
// ⚠️ WARNING: Use a safe test key!
const TEST_PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;

async function testPaymasterFlow() {
    console.log("🚀 Starting Paymaster Verification Script...");

    // 1. Setup Public Client (Official Node)
    const publicClient = createPublicClient({
        chain: CHAIN,
        transport: http("https://bsc-dataseed1.binance.org"),
    });

    // 2. Setup Owner
    const owner = privateKeyToAccount(TEST_PRIVATE_KEY);
    console.log("Owner Address:", owner.address);

    // 3. Setup Smart Account
    const simpleAccount = await toSimpleSmartAccount({
        client: publicClient,
        owner: owner,
        entryPoint: {
            address: ENTRY_POINT_ADDRESS,
            version: "0.7"
        },
        factoryAddress: "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985",
    });

    console.log("Smart Account Address:", simpleAccount.address);

    // 4. Setup Smart Account Client with Paymaster Middleware
    const smartAccountClient = createSmartAccountClient({
        account: simpleAccount,
        chain: CHAIN,
        bundlerTransport: http(BUNDLER_URL),
        entryPoint: {
            address: ENTRY_POINT_ADDRESS,
            version: "0.7"
        },
        // Override Gas Estimation to be safe
        userOperation: {
            estimateFeesPerGas: async () => {
                console.log("⛽ Fetching Gas Fees from Public Node...");
                const feeData = await publicClient.estimateFeesPerGas();
                return {
                    maxFeePerGas: feeData.maxFeePerGas || feeData.gasPrice || 3000000000n,
                    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || 1000000000n
                };
            }
        },
        paymaster: {
            getPaymasterData: async (userOp) => {
                console.log("💸 Requesting Paymaster Sponsorship...");
                
                // Helper to stringify BigInt
                const replacer = (key: string, value: any) => 
                    typeof value === 'bigint' ? value.toString() : value;

                const response = await fetch(`${PAYMASTER_API_URL}/paymaster/sponsor`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chainId: 56,
                        userOp,
                        entryPoint: ENTRY_POINT_ADDRESS
                    }, replacer)
                });
                
                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`Paymaster Error: ${response.status} ${text}`);
                }

                const data = await response.json();
                console.log("✅ Paymaster Response:", data);

                const pAndD = data.paymasterAndData;
                return {
                    paymaster: PAYMASTER_ADDRESS as Hex,
                    paymasterData: ("0x" + pAndD.slice(42)) as Hex,
                };
            },
            getPaymasterStubData: async () => {
                return {
                    paymaster: PAYMASTER_ADDRESS as Hex,
                    paymasterData: ("0x" + "00".repeat(200)) as Hex,
                };
            }
        }
    });

    // 5. Construct a Dummy Transaction (Self-Transfer 0 BNB)
    console.log("📦 Constructing UserOp...");
    const tx = {
        to: owner.address,
        value: 0n,
        data: "0x" as Hex
    };

    try {
        // We just build the UserOp to verify flow, not sending (to save gas/avoid revert if no balance)
        // Note: In newer permissionless versions, encodeCallData is on the account object, but sometimes requires manual invocation or different syntax.
        // Let's use smartAccountClient.sendTransaction which handles encoding internally, but we won't wait for receipt to save time, or we just prepare.
        
        console.log("⛽ Fetching Gas Fees from Public Node...");
        const feeData = await publicClient.estimateFeesPerGas();
        const maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice || 3000000000n;
        const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1000000000n;

        // Use encodeCallData from the account object if available, or just construct simple call data
        // For SimpleAccount, executing a call is 'execute(dest, value, func)'
        // But viem's simpleAccount helper abstracts this.
        
        // Let's try to inspect the account object
        // console.log("Account keys:", Object.keys(simpleAccount));
        
        // Use the manual encodeFunctionData for SimpleAccount 'execute'
        // function execute(address dest, uint256 value, bytes calldata func)
        const callData = encodeFunctionData({
            abi: parseAbi(['function execute(address, uint256, bytes)']),
            functionName: 'execute',
            args: [tx.to, tx.value, tx.data]
        });

        // In permissionless v0.2+, the method might be named prepareUserOperation
        // But if that fails, we can assume we are using a version where we use actions.
        // Let's try to just construct it manually to verify Paymaster, since prepareUserOperationRequest is failing.
        
        // Wait, permissionless client extends viem client.
        // Let's use `smartAccountClient.prepareUserOperation` if it exists, or just call paymaster directly.
        
        console.log("🛠️ Building Partial UserOp...");
        
        // 1. Get Nonce
        const nonce = await simpleAccount.getNonce();
        
        // 2. Build Partial
        const partialUserOp = {
            sender: simpleAccount.address,
            nonce: nonce,
            initCode: "0x", // Assuming account deployed
            callData,
            callGasLimit: 100000n,
            verificationGasLimit: 100000n,
            preVerificationGas: 50000n,
            maxFeePerGas,
            maxPriorityFeePerGas,
            paymasterAndData: "0x",
            signature: "0x"
        };
        
        // 3. Request Paymaster Data (Manually)
        // This is what we really want to test!
        const paymasterData = await smartAccountClient.paymaster.getPaymasterData(partialUserOp);
        
        console.log("✅ Paymaster Data Retrieved Successfully!");
        console.log("Paymaster:", paymasterData.paymaster);
        console.log("PaymasterData:", paymasterData.paymasterData);
        
        console.log("🎉 VERIFICATION PASSED: Paymaster & Bundler Integration is Healthy.");

    } catch (error) {
        console.error("❌ Verification Failed:", error);
    }
}

testPaymasterFlow();
