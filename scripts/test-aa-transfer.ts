import { 
    createSmartAccountClient
} from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPublicClient, http, encodeFunctionData, parseAbi, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const ENTRYPOINT_ADDRESS_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const BUNDLER_URL = process.env.EXPO_PUBLIC_BUNDLER_URL;
const PAYMASTER_ADDRESS = "0xcA0069bD0894432972D3b480ddc48d5A626f47E1";
const RADRS_TOKEN_ADDRESS = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
const FACTORY_ADDRESS = "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985";
const BSC_RPC = "https://bsc-dataseed1.binance.org";

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

    // 2. Setup Client with Paymaster (Fixing the middleware error)
    const clientWithPaymaster = createSmartAccountClient({
        account: simpleAccount,
        chain: bsc,
        bundlerTransport: http(BUNDLER_URL),
        // FIX: Use 'paymaster' instead of 'middleware' for permissionless v0.2+ (and definitely v0.5+)
        paymaster: {
            getPaymasterData: async () => {
                console.log("⚡ Sponsoring UserOp with RADRS Paymaster...");
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

    const gasPrice = await publicClient.getGasPrice();
    
    // 3. Send Transfer UserOp
    console.log("Sending Transfer UserOp...");
    
    // Example: Transfer 1 RADRS to self
    const erc20Abi = parseAbi([
        "function transfer(address to, uint256 amount) returns (bool)"
    ]);
    
    const transferAmount = parseEther("1");
    const transferData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [owner.address, transferAmount]
    });

    try {
        const txHash = await clientWithPaymaster.sendTransaction({
            to: RADRS_TOKEN_ADDRESS as Hex,
            value: 0n,
            data: transferData,
            maxFeePerGas: gasPrice,
            maxPriorityFeePerGas: gasPrice
        });

        console.log("✅ Transfer UserOperation Sent!");
        console.log("Transaction Hash:", txHash);
        console.log(`View on BscScan: https://bscscan.com/tx/${txHash}`);
    } catch (error: any) { // FIX: Type 'error' as 'any' or 'unknown'
        console.error("❌ Transfer Transaction Failed:", error);
        if (error.cause) console.error("Cause:", error.cause);
    }
}

main();
