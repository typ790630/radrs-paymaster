
import { createPublicClient, http, fallback, encodeFunctionData, parseAbi } from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";

// Config from client/src/config.ts
const CHAIN = bsc;
const BUNDLER_URL = "https://public.pimlico.io/v2/bsc-mainnet/rpc"; // Fixed URL
const PAYMASTER_ADDRESS = "0x1d3E64c5a4fFfC4e46e70e22c33A1ddaD506c3Aa"; // Fixed Address
const RADRS_TOKEN_ADDRESS = "0xe2188a2e0a41a50f09359e5fe714d5e643036f2a"; // Fixed Address (Checksummed)
const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

async function main() {
    console.log("--- Debugging Frontend Logic ---");

    // 1. Setup Public Client (with Fallback)
    console.log("1. Setting up Public Client...");
    const publicClient = createPublicClient({
        chain: CHAIN,
        transport: fallback([
            http("https://bsc-dataseed1.binance.org"),
            http("https://bsc-dataseed2.binance.org"),
            http("https://rpc.ankr.com/bsc"),
        ]),
    });

    try {
        const blockNumber = await publicClient.getBlockNumber();
        console.log("   ✅ Connected to BSC. Block:", blockNumber.toString());
    } catch (e) {
        console.error("   ❌ Failed to connect to BSC:", e);
        return;
    }

    // 2. Create Account (Random Private Key to simulate new user)
    console.log("\n2. Creating Smart Account (Random Key)...");
    // Generate random key
    const privateKey = "0x" + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join("") as `0x${string}`;
    const owner = privateKeyToAccount(privateKey);
    console.log("   EOA:", owner.address);

    const simpleAccount = await toSimpleSmartAccount({
        client: publicClient,
        owner: owner,
        entryPoint: {
            address: ENTRY_POINT_ADDRESS,
            version: "0.7"
        },
        factoryAddress: "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985",
    });
    console.log("   AA Address:", simpleAccount.address);

    // 3. Check Balance
    console.log("\n3. Checking Balance...");
    const erc20Abi = parseAbi([
        "function balanceOf(address owner) view returns (uint256)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)"
    ]);

    const balance = await publicClient.readContract({
        address: RADRS_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [simpleAccount.address]
    });
    console.log("   Balance:", balance.toString());

    // 4. Try to Send Approve UserOp (Simulate "Authorization")
    console.log("\n4. Attempting 'Approve' UserOp...");
    
    const smartAccountClient = createSmartAccountClient({
        account: simpleAccount,
        chain: CHAIN,
        bundlerTransport: http(BUNDLER_URL),
        paymaster: {
            getPaymasterData: async () => {
                // If using public bundler, we might need real paymaster data or just use empty for simulation?
                // Wait, if we use public bundler, we usually don't have a paymaster unless we are the paymaster.
                // The error 'chain not supported' suggests the BUNDLER URL is pointing to a node that doesn't support BSC.
                // Public Pimlico URL is correct for BSC Mainnet.
                
                // Let's try returning dummy data that the specific paymaster expects, or just empty if not strict.
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

    const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [PAYMASTER_ADDRESS, 115792089237316195423570985008687907853269984665640564039457584007913129639935n]
    });

    const fees = await publicClient.estimateFeesPerGas();
    const gasPrice = fees.maxFeePerGas || fees.gasPrice || 3000000000n; 

    try {
        console.log("   Sending UserOp to Bundler...");
        const hash = await smartAccountClient.sendTransaction({
            to: RADRS_TOKEN_ADDRESS,
            value: 0n,
            data: approveData,
            maxFeePerGas: gasPrice,
            maxPriorityFeePerGas: gasPrice
        });
        console.log("   ✅ UserOp Sent! Hash:", hash);
    } catch (e: any) {
        console.error("   ❌ UserOp Failed:");
        // Print detailed error
        if (e.message) console.error("   Message:", e.message);
        if (e.details) console.error("   Details:", e.details);
        if (e.shortMessage) console.error("   Short:", e.shortMessage);
    }
}

main().catch(console.error);
