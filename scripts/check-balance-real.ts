import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    const RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org";
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    const walletAddress = "0x212643F63Aa738b20F1fe8Eb538345E40F0B1F2d";
    const balance = await provider.getBalance(walletAddress);
    
    console.log("------------------------------------------------");
    console.log(`Address: ${walletAddress}`);
    console.log(`Balance: ${balance.toString()} Wei`);
    console.log(`Balance: ${ethers.formatEther(balance)} BNB`);
    console.log("------------------------------------------------");
}

main().catch(console.error);
