
import { ethers } from "ethers";

async function main() {
    const provider = new ethers.JsonRpcProvider("https://bsc-dataseed1.binance.org");
    const factoryAddress = "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985";
    
    console.log("Checking Factory at:", factoryAddress);
    const code = await provider.getCode(factoryAddress);
    if (code === "0x") {
        console.error("NO CODE at Factory address!");
    } else {
        console.log("Factory code exists.");
    }
}

main();
