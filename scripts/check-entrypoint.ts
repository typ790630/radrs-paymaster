
import { ethers } from "ethers";

async function main() {
    const provider = new ethers.JsonRpcProvider("https://bsc-dataseed1.binance.org");
    const epAddress = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
    
    console.log("Checking EntryPoint at:", epAddress);
    const code = await provider.getCode(epAddress);
    console.log("Code length:", code.length);
    if (code === "0x") {
        console.error("NO CODE at EntryPoint address!");
    } else {
        console.log("Code exists.");
    }
}

main();
