import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const PAYMASTER_ADDRESS = "0xD0D46B98dFf2ee93Dfe708d4434f180383B2B939"; // V3 Secure

async function main() {
    console.log("\n🚀 Starting SAFE Interactive Deposit...");
    console.log("----------------------------------------------------");

    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org");
    const wallet = ethers.Wallet.createRandom(provider);

    console.log("🔑 PRIVATE KEY (SAVE THIS FIRST!!!):");
    console.log(wallet.privateKey);
    console.log("----------------------------------------------------");
    console.log("✅ ADDRESS TO FUND:");
    console.log(wallet.address);
    console.log("----------------------------------------------------");
    console.log("⚠️  ACTION: Send 0.01 BNB to the address above.");
    console.log("⏳ Waiting for funds...");

    // Wait loop
    let balance = 0n;
    while (balance < ethers.parseEther("0.005")) { 
        try {
            balance = await provider.getBalance(wallet.address);
            if (balance > 0n) console.log(`   Balance: ${ethers.formatEther(balance)} BNB`);
            if (balance >= ethers.parseEther("0.005")) break;
            await new Promise(r => setTimeout(r, 3000));
        } catch (e) { await new Promise(r => setTimeout(r, 3000)); }
    }

    console.log("\n💰 Funds received! Depositing to Paymaster...");
    
    // Deposit Logic
    const gasReserve = ethers.parseEther("0.001");
    const depositAmount = balance - gasReserve;
    const entryPointAbi = ["function depositTo(address account) external payable"];
    const entryPoint = new ethers.Contract(ENTRY_POINT, entryPointAbi, wallet);
    const gasPrice = ethers.parseUnits("3", "gwei");

    try {
        const tx = await entryPoint.depositTo(PAYMASTER_ADDRESS, { value: depositAmount, gasPrice });
        console.log(`🚀 Deposit Tx: ${tx.hash}`);
        await tx.wait();
        console.log("✅ SUCCESS! Paymaster Refueled.");
    } catch (e) {
        console.error("❌ Failed:", e);
    }
}

main().catch(console.error);
