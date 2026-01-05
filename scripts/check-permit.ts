
import { ethers } from "ethers";

async function main() {
    const provider = new ethers.JsonRpcProvider("https://bsc-dataseed1.binance.org");
    const tokenAddress = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
    
    const abi = [
        "function DOMAIN_SEPARATOR() view returns (bytes32)",
        "function nonces(address owner) view returns (uint256)",
        "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)"
    ];
    
    const token = new ethers.Contract(tokenAddress, abi, provider);
    
    try {
        await token.DOMAIN_SEPARATOR();
        console.log("RADRS supports Permit (DOMAIN_SEPARATOR found)");
    } catch (e: any) {
        console.log("RADRS likely DOES NOT support Permit:", e.message);
    }
}

main();
