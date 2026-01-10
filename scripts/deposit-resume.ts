import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const PAYMASTER_ADDRESS = "0xD0D46B98dFf2ee93Dfe708d4434f180383B2B939"; // V3 Secure
const PRIVATE_KEY = "0xc2756917374343326361e0543b43327625311c75bd78b7d85a075d54ab6b6f0f";

async function main() {
    console.log("🚀 Resuming Deposit Process (0.1 BNB)...");
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org");
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`📍 Wallet: ${wallet.address}`);
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} BNB`);

    if (balance === 0n) throw new Error("Funds not found!");

    const gasReserve = ethers.parseEther("0.0005");
    const depositAmount = balance > gasReserve ? balance - gasReserve : 0n;

    if (depositAmount <= 0n) throw new Error("Balance too low for gas");

    console.log(`📥 Depositing ${ethers.formatEther(depositAmount)} BNB...`);
    
    const entryPointAbi = ["function depositTo(address account) external payable"];
    const entryPoint = new ethers.Contract(ENTRY_POINT, entryPointAbi, wallet);
    const gasPrice = ethers.parseUnits("3", "gwei");

    const tx = await entryPoint.depositTo(PAYMASTER_ADDRESS, { value: depositAmount, gasPrice });
    console.log(`🚀 Tx Sent: ${tx.hash}`);
    await tx.wait();
    console.log("✅ Deposit Confirmed!");
}

main().catch(console.error);
