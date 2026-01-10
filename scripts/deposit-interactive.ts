import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const PAYMASTER_ADDRESS = "0xD0D46B98dFf2ee93Dfe708d4434f180383B2B939"; // V3 Secure

async function main() {
    console.log("\n🚀 Starting Interactive Paymaster Deposit...");
    console.log("----------------------------------------------------");

    // 1. Generate Fresh Wallet
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org");
    const wallet = ethers.Wallet.createRandom(provider);

    console.log("✅ TEMP WALLET GENERATED");
    console.log(`📍 Address:   ${wallet.address}`);
    console.log(`🔑 Private Key: ${wallet.privateKey}`); // BACKUP IN CASE OF CRASH
    console.log("----------------------------------------------------");
    console.log("⚠️  ACTION: Please send 0.01 BNB (or more) to the address above.");
    console.log("⏳ Waiting for funds... (Checking every 3s)");

    // 2. Wait for Funds
    let balance = 0n;
    while (balance < ethers.parseEther("0.005")) { 
        try {
            balance = await provider.getBalance(wallet.address);
            if (balance > 0n) {
                console.log(`   Balance: ${ethers.formatEther(balance)} BNB...`);
            }
            if (balance >= ethers.parseEther("0.005")) {
                console.log("\n💰 FUNDS RECEIVED! Depositing to Paymaster...");
                break;
            }
            await new Promise(r => setTimeout(r, 3000));
        } catch (e) {
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    // 3. Deposit to Paymaster via EntryPoint
    const gasReserve = ethers.parseEther("0.001"); // Reserve for gas fee
    const depositAmount = balance - gasReserve;

    console.log(`📥 Depositing ${ethers.formatEther(depositAmount)} BNB to Paymaster...`);
    
    const entryPointAbi = ["function depositTo(address account) external payable"];
    const entryPoint = new ethers.Contract(ENTRY_POINT, entryPointAbi, wallet);
    
    const gasPrice = ethers.parseUnits("3", "gwei");

    try {
        const tx = await entryPoint.depositTo(PAYMASTER_ADDRESS, { 
            value: depositAmount,
            gasPrice
        });
        console.log(`🚀 Tx Sent: ${tx.hash}`);
        await tx.wait();
        console.log("✅ Deposit Confirmed! Paymaster is refueled.");
    } catch (e) {
        console.error("❌ Deposit failed:", e);
    }
}

main().catch(console.error);
