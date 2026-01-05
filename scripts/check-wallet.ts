
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    const pk = process.env.PRIVATE_KEY;
    console.log("Private Key length:", pk ? pk.length : "undefined");
    if (pk) {
        const wallet = new ethers.Wallet(pk);
        console.log("Address from .env:", wallet.address);
        
        const provider = new ethers.JsonRpcProvider("https://bsc-dataseed1.binance.org");
        try {
            const balance = await provider.getBalance(wallet.address);
            console.log("BSC Mainnet Balance:", ethers.formatEther(balance), "BNB");

            // Check RADRS Balance
            const radrsAbi = ["function balanceOf(address) view returns (uint256)"];
            const radrsContract = new ethers.Contract("0xe2188a2e0a41a50f09359e5fe714d5e643036f2a", radrsAbi, provider);
            const radrsBal = await radrsContract.balanceOf(wallet.address);
            console.log("RADRS Balance:", ethers.formatEther(radrsBal), "RADRS");
        } catch (e: any) {
            console.error("Error checking balance:", e.message);
        }
    } else {
        console.log("No PRIVATE_KEY in .env");
    }
}

main();
