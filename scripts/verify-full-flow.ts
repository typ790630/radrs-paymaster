
import { 
    createSmartAccountClient
} from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPublicClient, http, encodeFunctionData, parseAbi, parseEther, type Hex, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const ENTRYPOINT_ADDRESS_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const BUNDLER_URL = process.env.EXPO_PUBLIC_BUNDLER_URL;
const PAYMASTER_ADDRESS = "0xcA0069bD0894432972D3b480ddc48d5A626f47E1"; // New Address
const RADRS_TOKEN_ADDRESS = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
const FACTORY_ADDRESS = "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985";
const BSC_RPC = "https://bsc-dataseed3.binance.org";

async function main() {
    if (!BUNDLER_URL) throw new Error("Bundler URL missing");

    const privateKey = process.env.PRIVATE_KEY as Hex;
    if (!privateKey) throw new Error("Private Key missing");

    const owner = privateKeyToAccount(privateKey);
    console.log("Signer:", owner.address);

    const publicClient = createPublicClient({
        chain: bsc,
        transport: http(BSC_RPC),
    });

    // 1. Initialize Smart Account
    const simpleAccount = await toSimpleSmartAccount({
        client: publicClient,
        owner: owner,
        entryPoint: {
            address: ENTRYPOINT_ADDRESS_V07,
            version: "0.7"
        },
        factoryAddress: FACTORY_ADDRESS,
    });

    console.log("Smart Account:", simpleAccount.address);

    // Setup Smart Account Client
    const smartAccountClient = createSmartAccountClient({
        account: simpleAccount,
        chain: bsc,
        bundlerTransport: http(BUNDLER_URL),
        paymaster: {
            getPaymasterData: async () => {
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

    // ABI
    const erc20Abi = parseAbi([
        "function balanceOf(address owner) view returns (uint256)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function transfer(address to, uint256 amount) returns (bool)"
    ]);

    const getBalance = async () => publicClient.readContract({
        address: RADRS_TOKEN_ADDRESS as Hex,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [simpleAccount.address]
    }) as Promise<bigint>;

    const getAllowance = async () => publicClient.readContract({
        address: RADRS_TOKEN_ADDRESS as Hex,
        abi: erc20Abi,
        functionName: "allowance",
        args: [simpleAccount.address, PAYMASTER_ADDRESS]
    }) as Promise<bigint>;

    console.log("\n=== STARTING VERIFICATION ===\n");

    // --- RESET ALLOWANCE ---
    console.log("1. Resetting Allowance to 0 (Testing 'Approve Only' logic)...");
    const balanceBeforeReset = await getBalance();
    
    // We send approve(0). This is an 'Approve Only' op, so it should be sponsored (Free).
    const resetData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [PAYMASTER_ADDRESS, 0n]
    });

    const gasPrice = await publicClient.getGasPrice();

    try {
        const resetHash = await smartAccountClient.sendTransaction({
            to: RADRS_TOKEN_ADDRESS as Hex,
            value: 0n,
            data: resetData,
            maxFeePerGas: gasPrice,
            maxPriorityFeePerGas: gasPrice
        });
        console.log("   Reset Tx Hash:", resetHash);
        await publicClient.waitForTransactionReceipt({ hash: resetHash });
    } catch (e) {
        console.error("   Reset Failed:", e);
        return;
    }

    const allowanceAfterReset = await getAllowance();
    const balanceAfterReset = await getBalance();
    
    console.log(`   Allowance: ${allowanceAfterReset} (Expected: 0)`);
    console.log(`   Cost: ${formatEther(balanceBeforeReset - balanceAfterReset)} RADRS`);
    
    if (allowanceAfterReset !== 0n) throw new Error("Reset failed!");
    // Note: It might cost small amount if my "Free" logic isn't working perfectly or if I didn't redeploy correctly.
    // But let's see.

    // --- STEP 1: APPROVE MAX ---
    console.log("\n2. Step 1: Sending 'Approve Max' UserOp (Should be Free)...");
    
    const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [PAYMASTER_ADDRESS, 115792089237316195423570985008687907853269984665640564039457584007913129639935n]
    });

    const balanceBeforeApprove = await getBalance();

    try {
        const approveHash = await smartAccountClient.sendTransaction({
            to: RADRS_TOKEN_ADDRESS as Hex,
            value: 0n,
            data: approveData,
            maxFeePerGas: gasPrice,
            maxPriorityFeePerGas: gasPrice
        });
        console.log("   Approve Tx Hash:", approveHash);
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
    } catch (e) {
        console.error("   Approve Failed:", e);
        return;
    }

    const allowanceAfterApprove = await getAllowance();
    const balanceAfterApprove = await getBalance();

    console.log(`   Allowance: ${allowanceAfterApprove} (Expected: MAX)`);
    console.log(`   Cost: ${formatEther(balanceBeforeApprove - balanceAfterApprove)} RADRS (Expected: 0)`);

    // --- STEP 2: TRANSFER ---
    console.log("\n3. Step 2: Sending 'Transfer' UserOp (Should Pay RADRS)...");
    
    const transferData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [owner.address, parseEther("1")]
    });

    const balanceBeforeTransfer = await getBalance();

    try {
        const txHash = await smartAccountClient.sendTransaction({
            to: RADRS_TOKEN_ADDRESS as Hex,
            value: 0n,
            data: transferData,
            maxFeePerGas: gasPrice,
            maxPriorityFeePerGas: gasPrice
        });
        console.log("   Transfer Tx Hash:", txHash);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
    } catch (e) {
        console.error("   Transfer Failed:", e);
        return;
    }

    const balanceAfterTransfer = await getBalance();
    // Cost = 1 RADRS (transfer) + Fee
    const totalDiff = balanceBeforeTransfer - balanceAfterTransfer;
    const feePaid = totalDiff - parseEther("1");

    console.log(`   Balance Diff: ${formatEther(totalDiff)} RADRS`);
    console.log(`   Fee Paid: ${formatEther(feePaid)} RADRS (Expected: > 0)`);

    if (feePaid <= 0n) console.warn("WARNING: No fee was paid? Check Paymaster logic.");
    else console.log("SUCCESS: Fee was paid correctly.");

    console.log("\n=== VERIFICATION COMPLETE ===");
}

main();
