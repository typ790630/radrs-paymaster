
import { ethers } from "ethers";
import "dotenv/config";

const RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Addresses
const OLD_PAYMASTER = "0x5C0bD096AA299955991610B12D4539aeb8CEc0e7";
const NEW_PAYMASTER = "0x3ca3Da0fA3C50365847EaA4Db57eAdF8B083Aa43";

async function main() {
    if (!PRIVATE_KEY) throw new Error("No Private Key");
    
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log(`Migrating funds from ${OLD_PAYMASTER} to ${NEW_PAYMASTER}`);
    
    // 1. Check Old Balance (EntryPoint)
    const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
    const epAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function depositTo(address) payable",
        "function withdrawTo(address, uint256)"
    ];
    const epContract = new ethers.Contract(ENTRY_POINT, epAbi, wallet);
    
    const oldBalance = await epContract.balanceOf(OLD_PAYMASTER);
    console.log(`Old Paymaster Balance: ${ethers.formatEther(oldBalance)} BNB`);
    
    if (oldBalance > 0n) {
        console.log("Withdrawing from Old Paymaster...");
        // We need to call withdrawTo on the Paymaster contract itself, NOT EntryPoint directly?
        // Wait, BasePaymaster has `withdrawTo`? Yes.
        const pmAbi = ["function withdrawTo(address, uint256)"];
        const oldPmContract = new ethers.Contract(OLD_PAYMASTER, pmAbi, wallet);
        
        try {
            const tx = await oldPmContract.withdrawTo(wallet.address, oldBalance);
            await tx.wait();
            console.log("Withdrawal successful.");
        } catch (e) {
            console.log("Withdrawal failed (maybe not owner?):", e);
            // Fallback: If we can't withdraw, we just skip (maybe not enough gas or permission)
        }
    }
    
    // 2. Deposit to New Paymaster
    // We can deposit directly to EntryPoint for the paymaster
    const depositAmount = ethers.parseEther("0.05"); // Target amount
    const currentNewBalance = await epContract.balanceOf(NEW_PAYMASTER);
    
    if (currentNewBalance < depositAmount) {
        const toDeposit = depositAmount - currentNewBalance;
        console.log(`Depositing ${ethers.formatEther(toDeposit)} BNB to New Paymaster...`);
        const tx = await epContract.depositTo(NEW_PAYMASTER, { value: toDeposit });
        await tx.wait();
        console.log("Deposit successful.");
    } else {
        console.log("New Paymaster already has sufficient funds.");
    }
}

main().catch(console.error);
