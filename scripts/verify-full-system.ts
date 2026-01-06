import { createPublicClient, http, encodeFunctionData, parseAbi, parseEther, createWalletClient, encodeAbiParameters, parseAbiParameters } from "viem";
import { createBundlerClient } from "viem/account-abstraction";
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
// Pimlico uses "binance" for BSC Mainnet
const BUNDLER_URL = "https://public.pimlico.io/v2/binance/rpc"; 

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

    // Initialize SmartAccountClient EARLY (needed for approval)
    const smartAccountClient = createSmartAccountClient({
        account: simpleAccount,
        chain: bsc,
        bundlerTransport: http(BUNDLER_URL),
        entryPoint: { address: ENTRY_POINT_ADDRESS, version: "0.7" },
    });

    // CHECK BNB BALANCE
    const aaBnbBalance = await publicClient.getBalance({ address: simpleAccount.address });
    console.log(`   AA BNB Balance: ${aaBnbBalance}`);

    // 3.1 Unblock Deadlock: If AA needs to approve but has no allowance, it needs BNB to pay for the Approve UserOp
    // because Paymaster will fail validation if allowance is 0.
    if (allowance < parseEther("100")) {
        console.log("   ⚠️ Allowance too low. Paymaster validation will fail if we don't approve first.");
        
        // 1. Fund AA if needed
        if (aaBnbBalance < parseEther("0.002")) {
            console.log("   --> AA has insufficient BNB for Approval. Sending 0.002 BNB from EOA...");
            const walletClient = createWalletClient({ account: owner, chain: bsc, transport: http("https://bsc-dataseed1.binance.org") });
            const hash = await walletClient.sendTransaction({
                to: simpleAccount.address,
                value: parseEther("0.002")
            });
            console.log(`   💸 Sent BNB: ${hash}`);
            await publicClient.waitForTransactionReceipt({ hash });
            console.log("   ✅ AA Funded.");
        }

        // 2. Send Approve UserOp (Paid by BNB, No Paymaster)
        console.log("   --> Sending Approve UserOp (Paid by BNB)...");
        
        // Construct Approve Call
        const approveCall = {
            to: RADRS_TOKEN_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "approve",
                args: [PAYMASTER_ADDRESS, 115792089237316195423570985008687907853269984665640564039457584007913129639935n]
            })
        };

        try {
            // Use prepareUserOperation -> Sign -> Raw Send pattern (since direct sendUserOperation fails)
            const gasPrice = await publicClient.getGasPrice();
            
            let approveUserOp = await smartAccountClient.prepareUserOperation({
                account: simpleAccount,
                calls: [approveCall],
                maxFeePerGas: gasPrice,
                maxPriorityFeePerGas: gasPrice
            });

            // Sign
            const signature = await simpleAccount.signUserOperation(approveUserOp);
            approveUserOp.signature = signature;

            // Raw Send
            const bundlerRpc = createPublicClient({ chain: bsc, transport: http(BUNDLER_URL) });
            
            const rawApproveUserOp = {
                sender: approveUserOp.sender,
                nonce: "0x" + BigInt(approveUserOp.nonce).toString(16),
                factory: approveUserOp.factory,
                factoryData: approveUserOp.factoryData,
                callData: approveUserOp.callData,
                callGasLimit: "0x" + BigInt(approveUserOp.callGasLimit).toString(16),
                verificationGasLimit: "0x" + BigInt(approveUserOp.verificationGasLimit).toString(16),
                preVerificationGas: "0x" + BigInt(approveUserOp.preVerificationGas).toString(16),
                maxFeePerGas: "0x" + BigInt(approveUserOp.maxFeePerGas).toString(16),
                maxPriorityFeePerGas: "0x" + BigInt(approveUserOp.maxPriorityFeePerGas).toString(16),
                // No Paymaster fields for self-pay
                signature: approveUserOp.signature,
            };

            console.log("   🚀 Sending Raw Approve UserOp...");
            const txHash = await bundlerRpc.request({
                method: "eth_sendUserOperation",
                params: [rawApproveUserOp, ENTRY_POINT_ADDRESS],
            });
            
            console.log(`   ✅ Approve UserOp Sent: ${txHash}`);
            
            // Wait for receipt
            const bundlerClientForWait = createBundlerClient({
                chain: bsc,
                transport: http(BUNDLER_URL),
                entryPoint: { address: ENTRY_POINT_ADDRESS, version: "0.7" },
            });
            await bundlerClientForWait.waitForUserOperationReceipt({ hash: txHash });
            console.log("   ✅ Approval Confirmed.");
        } catch (e: any) {
            console.log("   ❌ Approval Failed:", e.message);
            // If approval fails, Main test will likely fail with AA33, but let's proceed to see.
        }
    }

    // 4. Create UserOp (Main Paymaster Test)
    console.log("3️⃣  Creating UserOp (Main Test)...");
    
    let calls = [];
    // No need to prepend Approve anymore, we did it above.

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
    
    // Create a raw bundler client for final submission
    const bundlerClient = createBundlerClient({
        chain: bsc,
        transport: http(BUNDLER_URL),
        entryPoint: { address: ENTRY_POINT_ADDRESS, version: "0.7" },
    });

    // 5. Send
    console.log("4️⃣  Sending UserOp...");

    try {
        // Fetch gas price manually to ensure maxFeePerGas is set
        const gasPrice = await publicClient.getGasPrice();
        console.log(`   Gas Price: ${gasPrice}`);
        
        // A. Prepare Basic UserOp (Gas Estimation without Paymaster)
        // This will estimate gas limits assuming the user pays (AA has funds).
        // Since AA has funds, this should succeed.
        let userOp = await smartAccountClient.prepareUserOperation({
            account: simpleAccount,
            calls: calls,
            maxFeePerGas: gasPrice,
            maxPriorityFeePerGas: gasPrice
        });

        console.log("   ✅ UserOp Prepared (Gas Estimated).");
        // DEBUG: Log the userOp keys to verify structure
        console.log("   🔍 UserOp Keys:", Object.keys(userOp));
        console.log("   🔍 UserOp callData:", userOp.callData ? "Present" : "MISSING");
        console.log("   🔍 UserOp maxFeePerGas:", userOp.maxFeePerGas);

        // B. Request Paymaster Sponsorship (New API)
        console.log("   📡 Requesting Paymaster Data from Vercel...");
        const res = await fetch(`${PAYMASTER_API_URL}/api/paymaster/sponsor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chainId: 56,
                userOp,
                entryPoint: ENTRY_POINT_ADDRESS,
                payer: payer
            }, (k, v) => typeof v === 'bigint' ? v.toString() : v)
        });
        
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        // C. Apply Paymaster Data (Patching existing userOp)
        // The Paymaster API returns a packed 'paymasterAndData' (v0.6 style or v0.7 packed?)
        // EntryPoint 0.7 requires split fields for JSON-RPC usually, but let's check what we got.
        // We need to unpack it if we are sending to a v0.7 Bundler that expects split fields.
        
        const pmDataHex = data.paymasterAndData as `0x${string}`;
        // v0.7 Packing: [paymaster(20)] [valGasLimit(16)] [postOpGasLimit(16)] [paymasterData]
        
        // Ensure it's long enough to be v0.7 packed (20 + 16 + 16 = 52 bytes = 104 hex chars + '0x')
        if (pmDataHex.length < 106) {
            throw new Error("Paymaster returned invalid data length for v0.7");
        }

        const paymaster = pmDataHex.slice(0, 42) as `0x${string}`;
        let paymasterVerificationGasLimit = BigInt("0x" + pmDataHex.slice(42, 74));
        let paymasterPostOpGasLimit = BigInt("0x" + pmDataHex.slice(74, 106));
        const paymasterData = ("0x" + pmDataHex.slice(106)) as `0x${string}`;

        // Fix: If Paymaster API returns MaxUint128 (placeholder), replace with reasonable defaults
        // AA94 error occurs if these are too high.
        const MAX_Reasonable_Gas = 10000000n; // 10M
        if (paymasterVerificationGasLimit > MAX_Reasonable_Gas) {
            console.log("   ⚠️ Paymaster returned MaxUint gas limit. Cap to 300,000.");
            paymasterVerificationGasLimit = 300000n;
        }
        if (paymasterPostOpGasLimit > MAX_Reasonable_Gas) {
            console.log("   ⚠️ Paymaster returned MaxUint PostOp limit. Cap to 0 (assuming no PostOp).");
            paymasterPostOpGasLimit = 0n;
        }

        userOp.paymaster = paymaster;
        userOp.paymasterVerificationGasLimit = paymasterVerificationGasLimit;
        userOp.paymasterPostOpGasLimit = paymasterPostOpGasLimit;
        userOp.paymasterData = paymasterData;

        // Note: Do NOT reset gas limits to 0. Use the estimated values from step A.
        userOp.callGasLimit = BigInt(userOp.callGasLimit);
        userOp.verificationGasLimit = BigInt(userOp.verificationGasLimit);
        userOp.preVerificationGas = BigInt(userOp.preVerificationGas);
        userOp.maxFeePerGas = BigInt(userOp.maxFeePerGas);
        userOp.maxPriorityFeePerGas = BigInt(userOp.maxPriorityFeePerGas);

        console.log("   ✅ Paymaster Data Applied (v0.7 Unpacked).");

        // D. Sign & Send (Raw Mode - Bypass smartAccountClient estimation)
        console.log("   ✍️  Signing UserOp...");
        
        // 1. Sign
        const signature = await simpleAccount.signUserOperation(userOp);
        userOp.signature = signature;

        // 2. Prepare for Raw Send (v0.7 JSON-RPC Format)
        // Use split fields: factory/factoryData, paymaster/paymasterData, etc.
        const rawUserOp = {
            sender: userOp.sender,
            nonce: "0x" + BigInt(userOp.nonce).toString(16),
            
            // Factory
            factory: userOp.factory,
            factoryData: userOp.factoryData,
            
            callData: userOp.callData,
            
            // Gas Limits
            callGasLimit: "0x" + BigInt(userOp.callGasLimit).toString(16),
            verificationGasLimit: "0x" + BigInt(userOp.verificationGasLimit).toString(16),
            preVerificationGas: "0x" + BigInt(userOp.preVerificationGas).toString(16),
            maxFeePerGas: "0x" + BigInt(userOp.maxFeePerGas).toString(16),
            maxPriorityFeePerGas: "0x" + BigInt(userOp.maxPriorityFeePerGas).toString(16),
            
            // Paymaster (Split fields)
            paymaster: userOp.paymaster,
            paymasterVerificationGasLimit: "0x" + BigInt(userOp.paymasterVerificationGasLimit).toString(16),
            paymasterPostOpGasLimit: "0x" + BigInt(userOp.paymasterPostOpGasLimit).toString(16),
            paymasterData: userOp.paymasterData,
            
            signature: userOp.signature,
        };

        console.log("   🚀 Sending UserOp via Raw eth_sendUserOperation...");
        
        // Use a raw client connected to Bundler URL
        const bundlerRpc = createPublicClient({
            chain: bsc,
            transport: http(BUNDLER_URL),
        });

        const hash = await bundlerRpc.request({
            method: "eth_sendUserOperation",
            params: [rawUserOp, ENTRY_POINT_ADDRESS],
        });
        
        console.log(`   🎉 UserOp Sent! Hash: ${hash}`);
        console.log(`   Waiting for receipt...`);
        
        // Wait for receipt using the bundler client (it knows how to poll for UserOp receipt)
        // Actually, standard publicClient doesn't have waitForUserOperationReceipt.
        // We can use the bundlerClient we created earlier OR just poll manually if needed.
        // But let's reuse the bundlerClient we created on line 149 (if it exists) or create a new one.
        
        const bundlerClientForWait = createBundlerClient({
            chain: bsc,
            transport: http(BUNDLER_URL),
            entryPoint: { address: ENTRY_POINT_ADDRESS, version: "0.7" },
        });

        const receipt = await bundlerClientForWait.waitForUserOperationReceipt({ hash });
        console.log(`   ✅ Transaction Confirmed! Status: ${receipt.receipt.status}`);
    } catch (e: any) {
        console.error("   ❌ Transaction Failed:", e.message || e);
        if (e.details) console.error("   Details:", e.details);
    }
}

main().catch(console.error);
