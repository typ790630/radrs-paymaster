import { ethers } from "ethers";
import * as dotenv from "dotenv";
import hre from "hardhat";

dotenv.config();

// Config
const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const RADRS_TOKEN = "0xe2188a2e0a41a50f09359e5fe714d5e643036f2a";
const FEE_COLLECTOR = "0xfb710006a8Ad08a636e919B02B2f9bBbcE524d96";
// The secure key generated in previous step
const PRIVATE_KEY = "0x1e8ace9044b9940f973c38b97c581c58e1c641caf7ae39889e50e0db204f42a2";

async function main() {
    console.log("\n🚀 Starting FAST Deployment...");
    
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org");
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`📍 Using Address: ${wallet.address}`);
    
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} BNB`);

    if (balance === 0n) {
        throw new Error("Funds not arrived yet or stolen!");
    }

    // 3. Deploy Contract
    console.log("----------------------------------------------------");
    const artifact = await hre.artifacts.readArtifact("RadrsPaymasterV3");
    
    console.log("📤 Deploying Paymaster V3...");
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    
    // Aggressive Gas Settings
    const gasPrice = ethers.parseUnits("3", "gwei"); 
    const deployTx = await factory.getDeployTransaction(ENTRY_POINT, wallet.address, RADRS_TOKEN, FEE_COLLECTOR, {
        gasPrice
    });

    const txResponse = await wallet.sendTransaction(deployTx);
    console.log(`🚀 Deploy Tx Sent: ${txResponse.hash}`);
    
    console.log("⏳ Waiting for confirmation...");
    const receipt = await txResponse.wait();
    
    if (!receipt) throw new Error("Deployment failed.");

    console.log("\n✅ DEPLOYMENT SUCCESSFUL!");
    console.log(`PAYMASTER_ADDRESS=${receipt.contractAddress}`);
    console.log(`VERIFYING_SIGNER=${wallet.address}`); 
    console.log("----------------------------------------------------");
    
    // 4. Auto Deposit (Gas Tank)
    const currentBalance = await provider.getBalance(wallet.address);
    const gasReserve = ethers.parseEther("0.0005"); 
    const depositAmount = currentBalance > gasReserve ? currentBalance - gasReserve : 0n;

    if (depositAmount > 0n) {
        console.log(`\n📥 Depositing remaining ${ethers.formatEther(depositAmount)} BNB to Paymaster Gas Tank...`);
        const entryPointAbi = ["function depositTo(address account) external payable"];
        const entryPoint = new ethers.Contract(ENTRY_POINT, entryPointAbi, wallet);
        try {
            const tx = await entryPoint.depositTo(receipt.contractAddress, { value: depositAmount, gasPrice });
            console.log(`   Tx: ${tx.hash}`);
            await tx.wait();
            console.log("   ✅ Deposit Confirmed!");
        } catch (e) {
            console.error("   ❌ Deposit failed", e);
        }
    }
}

main().catch(console.error);
