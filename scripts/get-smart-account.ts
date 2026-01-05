
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { bsc } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

// Config
const ENTRYPOINT_ADDRESS_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const FACTORY_ADDRESS = "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985";
const BUNDLER_URL = process.env.EXPO_PUBLIC_BUNDLER_URL || "https://api.pimlico.io/v1/bsc/rpc?apikey=public"; 
const BSC_RPC = "https://bsc-dataseed1.binance.org";

async function main() {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("PRIVATE_KEY not found in .env");

    const publicClient = createPublicClient({
        chain: bsc,
        transport: http(BSC_RPC), // Use Standard RPC for reading address
    });

    const owner = privateKeyToAccount(privateKey as `0x${string}`);
    console.log("EOA Signer Address:", owner.address);

    const simpleAccount = await toSimpleSmartAccount({
        client: publicClient,
        owner: owner,
        entryPoint: {
            address: ENTRYPOINT_ADDRESS_V07,
            version: "0.7"
        },
        factoryAddress: FACTORY_ADDRESS,
    });

    console.log("--------------------------------------------------");
    console.log("Your Smart Account Address:", simpleAccount.address);
    console.log("--------------------------------------------------");
    console.log("Please send RADRS tokens to this address to pay for gas.");
}

main();
