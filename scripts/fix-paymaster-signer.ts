
import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import * as dotenv from 'dotenv';

dotenv.config();

const PAYMASTER_ADDRESS = "0x1d3E64c5a4fFfC4e46e70e22c33A1ddaD506c3Aa";
const RPC_URL = "https://bsc-dataseed3.binance.org"; // Tried 1, failed. Using 3.

async function main() {
    console.log("🔍 Checking Paymaster Signer Configuration...");

    // 1. Get Local Configured Signer
    const signerKey = process.env.PAYMASTER_SIGNER_KEY as Hex;
    if (!signerKey) {
        console.error("❌ Error: PAYMASTER_SIGNER_KEY is missing in .env");
        console.log("   Please add PAYMASTER_SIGNER_KEY=... to your .env file.");
        return;
    }
    const localSigner = privateKeyToAccount(signerKey);
    console.log(`🔑 Local Signer Address (from .env): ${localSigner.address}`);

    // 2. Get Contract State
    const publicClient = createPublicClient({
        chain: bsc,
        transport: http(RPC_URL)
    });

    const abi = parseAbi([
        "function verifyingSigner() view returns (address)",
        "function owner() view returns (address)",
        "function setVerifyingSigner(address _newSigner)"
    ]);

    const onChainSigner = await publicClient.readContract({
        address: PAYMASTER_ADDRESS,
        abi: abi,
        functionName: "verifyingSigner"
    });
    console.log(`zz On-Chain Signer Address:        ${onChainSigner}`);

    const owner = await publicClient.readContract({
        address: PAYMASTER_ADDRESS,
        abi: abi,
        functionName: "owner"
    });
    console.log(`👑 Paymaster Owner:                  ${owner}`);

    // 3. Compare
    if (onChainSigner.toLowerCase() === localSigner.address.toLowerCase()) {
        console.log("✅ Configuration Match! The chain is already using your local signer.");
        return;
    }

    console.log("⚠️  Mismatch Detected!");
    console.log("   The Paymaster contract expects signatures from a different address.");

    // 4. Fix it (Update Chain)
    const deployerKey = process.env.PRIVATE_KEY as Hex;
    if (!deployerKey) {
        console.error("❌ Cannot fix: PRIVATE_KEY (Owner) is missing in .env");
        return;
    }
    const deployer = privateKeyToAccount(deployerKey);
    
    if (deployer.address.toLowerCase() !== owner.toLowerCase()) {
        console.error(`❌ Cannot fix: Your PRIVATE_KEY address (${deployer.address}) is NOT the owner.`);
        return;
    }

    console.log("\n🛠️  Attempting to update verifyingSigner on-chain...");
    
    const walletClient = createWalletClient({
        account: deployer,
        chain: bsc,
        transport: http(RPC_URL)
    });

    try {
        const hash = await walletClient.writeContract({
            address: PAYMASTER_ADDRESS,
            abi: abi,
            functionName: "setVerifyingSigner",
            args: [localSigner.address]
        });
        
        console.log(`⏳ Transaction Sent: ${hash}`);
        console.log("   Waiting for confirmation...");
        
        await publicClient.waitForTransactionReceipt({ hash });
        console.log("✅ Success! VerifyingSigner updated to:", localSigner.address);
        console.log("👉 Now your backend (using .env key) should work with the contract.");

    } catch (error) {
        console.error("❌ Update Failed:", error);
    }
}

main().catch(console.error);
