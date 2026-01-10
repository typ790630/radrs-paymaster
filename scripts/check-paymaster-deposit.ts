import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const PAYMASTER_ADDRESS = "0xD0D46B98dFf2ee93Dfe708d4434f180383B2B939"; // V3 Secure

const ENTRY_POINT_ABI = [
    "function balanceOf(address account) external view returns (uint256)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org");
    const entryPoint = new ethers.Contract(ENTRY_POINT, ENTRY_POINT_ABI, provider);

    console.log("Checking Paymaster Deposit...");
    const balance = await entryPoint.balanceOf(PAYMASTER_ADDRESS);
    
    console.log("------------------------------------------------");
    console.log(`Paymaster: ${PAYMASTER_ADDRESS}`);
    console.log(`Deposit:   ${balance.toString()} Wei`);
    console.log(`Deposit:   ${ethers.formatEther(balance)} BNB`);
    console.log("------------------------------------------------");
}

main().catch(console.error);
