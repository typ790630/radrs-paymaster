
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

const PAYMASTER_ADDRESS = "0x719DF2711f9552338527755Dd4c8cC1B8Ff17132";
const RADRS_TOKEN = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
const SMART_ACCOUNT = "0x2C8e27CA6193522d5315F98734dC65412DB0c324";
const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

async function main() {
    const provider = new ethers.JsonRpcProvider("https://bsc-dataseed1.binance.org");

    console.log("--- Paymaster Status ---");
    // Check EntryPoint deposit for Paymaster
    const entryPointAbi = ["function balanceOf(address account) view returns (uint256)"];
    const entryPoint = new ethers.Contract(ENTRY_POINT, entryPointAbi, provider);
    const deposit = await entryPoint.balanceOf(PAYMASTER_ADDRESS);
    console.log(`Paymaster Deposit in EntryPoint: ${ethers.formatEther(deposit)} BNB`);

    // Check RADRS balance of Smart Account
    const erc20Abi = ["function balanceOf(address account) view returns (uint256)"];
    const radrs = new ethers.Contract(RADRS_TOKEN, erc20Abi, provider);
    const userBalance = await radrs.balanceOf(SMART_ACCOUNT);
    console.log(`User Smart Account RADRS Balance: ${ethers.formatEther(userBalance)} RADRS`);
    
    if (userBalance === 0n) {
        console.warn("WARNING: Smart Account has 0 RADRS. Please send RADRS to:", SMART_ACCOUNT);
    } else {
        console.log("✅ Smart Account funded with RADRS.");
    }
}

main();
