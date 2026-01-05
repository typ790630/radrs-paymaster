
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const PAYMASTER_ADDRESS = "0x7Be3A50B2a062a8dD1b24C0D77D0Cc8D8b19618A"; // New Paymaster Address (Markup 1.2x)
const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

async function main() {
    if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY missing");

    // Connect to BSC Mainnet
    const provider = new ethers.JsonRpcProvider("https://bsc-dataseed3.binance.org");
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log("Using wallet:", wallet.address);
    const balance = await provider.getBalance(wallet.address);
    console.log("Balance:", ethers.formatEther(balance), "BNB");

    // ABI for EntryPoint's depositTo
    const entryPointAbi = [
        "function depositTo(address account) external payable"
    ];
    const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, entryPointAbi, wallet);

    // 3. Deposit funds to EntryPoint for Paymaster
    const depositAmount = ethers.parseEther("0.02");

    console.log("Funding Paymaster with 0.02 BNB...");
    
    try {
        const tx = await entryPoint.depositTo(PAYMASTER_ADDRESS, { value: depositAmount });
        console.log("Tx sent:", tx.hash);
        await tx.wait();
        console.log("Deposit confirmed!");
    } catch (error) {
        console.error("Deposit failed:", error);
    }
}

main();
