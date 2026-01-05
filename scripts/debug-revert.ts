
import { ethers } from "ethers";
import "dotenv/config";

// Colors
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

// Constants from User Report
const USER_AA_ADDRESS = "0x9ADBea8686A7D0D89BF6Ddb26730F54772a3e946".toLowerCase(); // Normalize to avoid checksum error
const PAYMASTER_ADDRESS = "0x3ca3Da0fA3C50365847EaA4Db57eAdF8B083Aa43";
const RADRS_TOKEN = "0xe2188a2e0a41a50f09359e5fe714d5e643036f2a";
// 110.684218999999984 RADRS -> wei
const FEE_AMOUNT_STR = "110.684218999999984";
const FEE_AMOUNT_WEI = ethers.parseUnits(FEE_AMOUNT_STR, 18); // Assuming 18 decimals

const RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org";

async function main() {
    console.log(`${YELLOW}🔍 Debugging Paymaster Revert for User: ${USER_AA_ADDRESS}${RESET}`);
    console.log(`   Paymaster: ${PAYMASTER_ADDRESS}`);
    console.log(`   Required Fee: ${FEE_AMOUNT_STR} RADRS (${FEE_AMOUNT_WEI.toString()} wei)`);

    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // 1. Check RADRS Balance
    console.log(`\n${YELLOW}1. Checking RADRS Balance...${RESET}`);
    const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function allowance(address, address) view returns (uint256)",
        "function decimals() view returns (uint8)"
    ];
    const radrsContract = new ethers.Contract(RADRS_TOKEN, erc20Abi, provider);

    try {
        const balance = await radrsContract.balanceOf(USER_AA_ADDRESS);
        const decimals = await radrsContract.decimals();
        const balanceFmt = ethers.formatUnits(balance, decimals);
        
        console.log(`   User Balance: ${balanceFmt} RADRS`);
        
        if (balance < FEE_AMOUNT_WEI) {
            console.log(`${RED}❌ FAILURE: Insufficient Balance! Needed ${FEE_AMOUNT_STR}, has ${balanceFmt}${RESET}`);
        } else {
            console.log(`${GREEN}✅ Balance Sufficient${RESET}`);
        }
    } catch (e: any) {
        console.log(`${RED}❌ Error checking balance: ${e.message}${RESET}`);
    }

    // 2. Check Allowance
    console.log(`\n${YELLOW}2. Checking Allowance...${RESET}`);
    try {
        const allowance = await radrsContract.allowance(USER_AA_ADDRESS, PAYMASTER_ADDRESS);
        const allowanceFmt = ethers.formatUnits(allowance, 18);
        
        console.log(`   Allowance to New Paymaster (${PAYMASTER_ADDRESS}): ${allowanceFmt} RADRS`);
        
        if (allowance < FEE_AMOUNT_WEI) {
            console.log(`${RED}❌ FAILURE: Insufficient Allowance! Needed ${FEE_AMOUNT_STR}, has ${allowanceFmt}${RESET}`);
            console.log(`${YELLOW}   👉 User needs to approve ${PAYMASTER_ADDRESS}${RESET}`);
        } else {
            console.log(`${GREEN}✅ Allowance Sufficient${RESET}`);
        }
        
        // Check old paymaster just in case
        const OLD_PAYMASTER = "0x892EdBbc40b79B3C7784F395eDa83A32c2210b22"; // or the other one
        const oldAllowance = await radrsContract.allowance(USER_AA_ADDRESS, OLD_PAYMASTER);
        console.log(`   (Debug) Allowance to Old Paymaster (${OLD_PAYMASTER}): ${ethers.formatUnits(oldAllowance, 18)} RADRS`);
        
    } catch (e: any) {
        console.log(`${RED}❌ Error checking allowance: ${e.message}${RESET}`);
    }

    // 3. Check Paymaster Verifying Signer
    console.log(`\n${YELLOW}3. Checking Paymaster Configuration...${RESET}`);
    const paymasterAbi = ["function verifyingSigner() view returns (address)"];
    const paymasterContract = new ethers.Contract(PAYMASTER_ADDRESS, paymasterAbi, provider);
    
    try {
        const signer = await paymasterContract.verifyingSigner();
        console.log(`   On-chain Verifying Signer: ${signer}`);
        // We can't verify if this matches the backend private key without the key, 
        // but we assume the backend logs showed "Signer: ..." matching this.
    } catch (e: any) {
        console.log(`${RED}❌ Error reading Paymaster state: ${e.message}${RESET}`);
    }

}

main().catch(console.error);
