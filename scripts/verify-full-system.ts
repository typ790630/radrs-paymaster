import { createPublicClient, http, encodeFunctionData, parseAbi, parseEther, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import * as dotenv from "dotenv";

dotenv.config();

// Config
const PAYMASTER_API_URL = "https://radrs-paymaster.vercel.app";
const PAYMASTER_ADDRESS = "0x30B8333A8a283045869A6A81C95D688061A0a289"; // V2 (Fixed)
const RADRS_TOKEN_ADDRESS = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const BUNDLER_URL = "https://public.pimlico.io/v2/56/rpc"; // Public for test (Chain ID 56)

// Helper
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
    console.log("🚀 Starting Full E2E Test (Client -> Vercel -> Contract)...");

    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    if (!privateKey) throw new Error("Missing PRIVATE_KEY");

    const owner = privateKeyToAccount(privateKey);
    const publicClient = createPublicClient({
        chain: bsc,
        transport: http("https://bsc-dataseed1.binance.org"),
    });

    // 1. Setup AA
    console.log("1️⃣  Initializing Smart Account...");
    const simpleAccount = await toSimpleSmartAccount({
        client: publicClient,
        owner: owner,
        entryPoint: {
            address: ENTRY_POINT_ADDRESS,
            version: "0.7",
        },
        factoryAddress: "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985",
    });
    console.log(`   AA Address: ${simpleAccount.address}`);
    console.log(`   EOA Address (Payer): ${owner.address}`);

    // 2. Check Balances
    console.log("2️⃣  Checking Balances...");
    const erc20Abi = parseAbi([
        "function balanceOf(address) view returns (uint256)",
        "function allowance(address,address) view returns (uint256)",
        "function approve(address,uint256) returns (bool)",
        "function transfer(address,uint256) returns (bool)"
    ]);

    const aaBalance = await publicClient.readContract({
        address: RADRS_TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [simpleAccount.address]
    }) as bigint;
    const eoaBalance = await publicClient.readContract({
        address: RADRS_TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [owner.address]
    }) as bigint;

    console.log(`   AA Balance: ${parseEther(aaBalance.toString()) > 0 ? aaBalance : "0 (EMPTY)"}`);
    console.log(`   EOA Balance: ${eoaBalance}`);

    let payer = simpleAccount.address;
    if (aaBalance < parseEther("10")) {
        console.log("   👉 AA is empty. Will use EOA as Payer.");
        payer = owner.address;
    } else {
        console.log("   👉 AA has funds. Will use AA as Payer.");
    }

    // 3. Check Allowance (Crucial for EOA payment)
    const allowance = await publicClient.readContract({
        address: RADRS_TOKEN_ADDRESS, abi: erc20Abi, functionName: "allowance", args: [payer, PAYMASTER_ADDRESS]
    }) as bigint;
    
    console.log(`   Allowance for Paymaster: ${allowance}`);

    // If using AA, we must inject approval if allowance is low
    // If using EOA, we must approve from EOA
    if (allowance < parseEther("100")) {
        console.log("   ⚠️ Allowance too low.");
        if (payer === owner.address) {
            console.log("   --> Approving from EOA (Owner)...");
            const walletClient = createWalletClient({ account: owner, chain: bsc, transport: http("https://bsc-dataseed1.binance.org") });
            const hash = await walletClient.writeContract({
                address: RADRS_TOKEN_ADDRESS, abi: erc20Abi, functionName: "approve", 
                args: [PAYMASTER_ADDRESS, 115792089237316195423570985008687907853269984665640564039457584007913129639935n]
            });
            console.log(`   Approve Tx Sent: ${hash}`);
            await publicClient.waitForTransactionReceipt({ hash });
            console.log("   ✅ EOA Approved.");
        } else {
            console.log("   --> Using AA. We will inject an Approve transaction into the batch.");
        }
    }

    // 4. Create UserOp
    console.log("3️⃣  Creating UserOp...");

    let calls = [];

    // If AA needs to approve Paymaster, prepend it
    if (payer === simpleAccount.address && allowance < parseEther("100")) {
         console.log("   --> Prepending AA Approve(Paymaster)...");
         calls.push({
             to: RADRS_TOKEN_ADDRESS,
             value: 0n,
             data: encodeFunctionData({
                 abi: erc20Abi,
                 functionName: "approve",
                 args: [PAYMASTER_ADDRESS, 115792089237316195423570985008687907853269984665640564039457584007913129639935n]
             })
         });
    }

    // Actual Action (Transfer 0 RADRS to self)
    calls.push({
        to: RADRS_TOKEN_ADDRESS,
        value: 0n,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer", // Transfer instead of approve to be cleaner
            args: [simpleAccount.address, 0n]
        })
    });
    
    const smartAccountClient = createSmartAccountClient({
        account: simpleAccount,
        chain: bsc,
        bundlerTransport: http(BUNDLER_URL),
        entryPoint: { address: ENTRY_POINT_ADDRESS, version: "0.7" },
        paymaster: {
            getPaymasterData: async (userOp) => {
                console.log("   📡 Requesting Paymaster Data from Vercel...");
                const res = await fetch(`${PAYMASTER_API_URL}/paymaster/sponsor`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chainId: 56,
                        userOp,
                        entryPoint: ENTRY_POINT_ADDRESS,
                        payer: payer // <--- THE NEW FIELD
                    }, (k, v) => typeof v === 'bigint' ? v.toString() : v)
                });
                
                const data = await res.json();
                if (data.error) {
                    console.error("   ❌ Paymaster Error:", data.error);
                    throw new Error(data.error);
                }
                console.log("   ✅ Paymaster Signed!");
                return {
                    paymaster: PAYMASTER_ADDRESS,
                    paymasterData: ("0x" + data.paymasterAndData.slice(42)) as `0x${string}`
                };
            },
            getPaymasterStubData: async () => ({
                paymaster: PAYMASTER_ADDRESS,
                paymasterData: ("0x" + "00".repeat(100)) as `0x${string}` // Dummy length
            })
        }
    });

    // 5. Send
    console.log("4️⃣  Sending UserOp...");
    try {
        // Fetch gas price manually to ensure maxFeePerGas is set
        const gasPrice = await publicClient.getGasPrice();
        console.log(`   Gas Price: ${gasPrice}`);
        
        // We will construct the userOp manually to inspect it
         // Fix: encodeCallData might be on the client or we use simpleAccount directly?
         // simpleAccount is a SimpleSmartAccount implementation.
         // Let's check if it handles batching automatically via encodeCallData.
         // Wait, 'permissionless' accounts expose encodeCallData but maybe it expects array?
         
         // Let's try to use the client helper
         // If calls.length > 1, we need executeBatch
         // If calls.length == 1, we need execute
         
         let callData;
          // toSimpleSmartAccount returns an object that has encodeCallData method
          // that takes `args` which is the transaction object or array of objects.
          
          // Debug: Check if encodeCallData exists
           // Ah, in permissionless v0.2, it is called `encodeCalls`
           if (typeof simpleAccount.encodeCalls !== 'function') {
                console.error("❌ simpleAccount.encodeCalls is NOT a function. Available keys:", Object.keys(simpleAccount));
                throw new Error("Account implementation mismatch");
           }
 
           callData = await simpleAccount.encodeCalls(calls);
          
          // Fix: In permissionless v0.2, helper methods might be different or accessed differently.
           // `prepareUserOperation` is the standard name.
           // However, let's look at `smartAccountClient`. It is extended with `bundlerActions`.
           
           // If `prepareUserOperationRequest` is missing, maybe it's `prepareUserOperation`?
           // Or maybe we don't need to manually prepare if we use `sendUserOperation`?
           // BUT `sendUserOperation` expects a fully formed struct, so we usually need `prepare`.
           
           // Let's inspect available methods on client again
           // console.log(Object.keys(smartAccountClient));
           
           // Try `prepareUserOperation` (without Request suffix)
           const userOp = await smartAccountClient.prepareUserOperation({
               callData, // Note: In v0.2, callData is passed directly, not nested in userOperation object?
               // Wait, check docs: prepareUserOperation({ account, calls }) -> UserOp
               // OR prepareUserOperation({ userOperation: { callData } })
               
               // Let's try the modern signature:
               account: simpleAccount,
               calls: calls,
               maxFeePerGas: gasPrice,
               maxPriorityFeePerGas: gasPrice
           });

        // Sign and send
        const hash = await smartAccountClient.sendUserOperation({
            userOperation: userOp
        });
        
        console.log(`   🎉 UserOp Sent! Hash: ${hash}`);
        console.log(`   Waiting for receipt...`);
        const receipt = await smartAccountClient.waitForUserOperationReceipt({ hash });
        console.log(`   ✅ Transaction Confirmed! Status: ${receipt.receipt.status}`);
    } catch (e: any) {
        console.error("   ❌ Transaction Failed:", e.message || e);
    }
}

main().catch(console.error);
