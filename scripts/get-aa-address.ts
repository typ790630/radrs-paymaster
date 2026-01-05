import { createPublicClient, http, parseAbi, type Hex, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { bsc } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration
const ENTRYPOINT_ADDRESS_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const FACTORY_ADDRESS = "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985";
const RADRS_TOKEN_ADDRESS = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
const RPC_URL = "https://bsc-dataseed3.binance.org";

async function main() {
    console.log("=== AA Wallet Address Lookup ===");

    const privateKey = process.env.PRIVATE_KEY as Hex;
    if (!privateKey) {
        throw new Error("PRIVATE_KEY not found in .env");
    }

    const publicClient = createPublicClient({
        chain: bsc,
        transport: http(RPC_URL),
    });

    // 1. Get EOA (User Wallet)
    const owner = privateKeyToAccount(privateKey);
    console.log(`\n1. EOA Wallet (Private Key Owner):`);
    console.log(`   Address: ${owner.address}`);

    // 2. Calculate AA Address
    const simpleAccount = await toSimpleSmartAccount({
        client: publicClient,
        owner: owner,
        entryPoint: {
            address: ENTRYPOINT_ADDRESS_V07,
            version: "0.7"
        },
        factoryAddress: FACTORY_ADDRESS,
    });
    
    console.log(`\n2. AA Wallet (Smart Contract):`);
    console.log(`   Address: ${simpleAccount.address}`);
    console.log(`   Note: This address is generated from your EOA address.`);
    console.log(`         It is a Smart Contract deployed on-chain (or counterfactual).`);

    // 3. Check Balances
    console.log(`\n=== Balances Check ===`);
    
    const erc20Abi = parseAbi([
        "function balanceOf(address) view returns (uint256)"
    ]);

    // EOA Balance
    const eoaBnb = await publicClient.getBalance({ address: owner.address });
    const eoaRadrs = await publicClient.readContract({
        address: RADRS_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner.address]
    });

    console.log(`\n[EOA] ${owner.address}`);
    console.log(`   BNB:   ${formatEther(eoaBnb)}`);
    console.log(`   RADRS: ${formatEther(eoaRadrs)}`);

    // AA Balance
    const aaBnb = await publicClient.getBalance({ address: simpleAccount.address });
    const aaRadrs = await publicClient.readContract({
        address: RADRS_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [simpleAccount.address]
    });

    console.log(`\n[AA]  ${simpleAccount.address}`);
    console.log(`   BNB:   ${formatEther(aaBnb)}`);
    console.log(`   RADRS: ${formatEther(aaRadrs)}`);

    console.log(`\n=== Conclusion ===`);
    if (aaRadrs === 0n && eoaRadrs > 0n) {
        console.log("⚠️  Your RADRS are in your EOA wallet, but the Paymaster deducts from your AA wallet!");
        console.log("   Please transfer RADRS from EOA -> AA.");
    } else if (aaRadrs > 0n) {
        console.log("✅ Your AA wallet has RADRS balance.");
    } else {
        console.log("❌ Both wallets have 0 RADRS.");
    }
}

main().catch(console.error);
