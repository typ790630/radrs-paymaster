import { ethers } from "ethers";
import * as dotenv from "dotenv";
import hre from "hardhat";

dotenv.config();

// Config
const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const RADRS_TOKEN = "0xe2188a2e0a41a50f09359e5fe714d5e643036f2a";
const FEE_COLLECTOR = "0xfb710006a8Ad08a636e919B02B2f9bBbcE524d96";

async function main() {
    console.log("\n🚀 Starting Secure Interactive Deployment...");
    console.log("----------------------------------------------------");

    // 1. Generate Fresh Wallet in Memory
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org");
    const wallet = ethers.Wallet.createRandom(provider);

    console.log("✅ NEW SECURE WALLET GENERATED (Memory Only)");
    console.log(`📍 Address:   ${wallet.address}`);
    console.log(`🔑 Private Key: ${wallet.privateKey}`);
    console.log("----------------------------------------------------");
    console.log("⚠️  ACTION REQUIRED: Please send EXACTLY 0.005 BNB to the address above.");
    console.log("⏳ Waiting for funds to arrive... (Checking every 3 seconds)");

    // 2. Wait for Funds
    let balance = 0n;
    while (balance < ethers.parseEther("0.004")) { // Wait for at least 0.004
        try {
            balance = await provider.getBalance(wallet.address);
            if (balance > 0n) {
                console.log(`   Current Balance: ${ethers.formatEther(balance)} BNB...`);
            }
            if (balance >= ethers.parseEther("0.004")) {
                console.log("\n💰 FUNDS RECEIVED! Proceeding to deployment immediately...");
                break;
            }
            await new Promise(r => setTimeout(r, 3000));
        } catch (e) {
            console.log("   Connection error, retrying...");
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    // 3. Deploy Contract
    console.log("----------------------------------------------------");
    console.log("🔨 Compiling contract...");
    // We assume artifact is already compiled, if not we might need to run compile task manually or skip
    // But let's try reading artifact directly
    const artifact = await hre.artifacts.readArtifact("RadrsPaymasterV3");
    
    console.log("📤 Deploying Paymaster V3...");
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    
    // Aggressive Gas Settings to beat any potential sweeper (though likely safe now)
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
    console.log(`VERIFYING_SIGNER=${wallet.address}`); // The new wallet is the signer
    console.log("----------------------------------------------------");
    
    // 4. Auto Deposit (Gas Tank)
    // We use whatever is left (minus some gas) to fund the paymaster
    const currentBalance = await provider.getBalance(wallet.address);
    const gasReserve = ethers.parseEther("0.001"); // Keep 0.001 for safety
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
            console.error("   ❌ Deposit failed (insufficient gas?)", e);
        }
    } else {
        console.log("\n⚠️ Not enough funds left for auto-deposit. Please deposit manually later.");
    }

    console.log("\n🎉 ALL DONE! Please save the PAYMASTER_ADDRESS and update your .env and Frontend Config.");
    console.log("🔒 You can discard this private key now, or keep it safe OFFLINE if you need to withdraw funds later.");
}

main().catch(console.error);
