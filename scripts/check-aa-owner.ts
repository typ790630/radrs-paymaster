
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    const RPC_URL = "https://bsc-dataseed1.binance.org";
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const SENDER_ADDRESS = "0x9ADBbea6886A7DD09BF6Ddb26730F54772a3e946"; // From logs

    if (!PRIVATE_KEY) {
        console.error("No PRIVATE_KEY in .env");
        return;
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log("Wallet Address (Signer):", wallet.address);
    console.log("Target AA Address:", SENDER_ADDRESS);

    // Check if SENDER_ADDRESS is a SimpleAccount and who is the owner
    // SimpleAccount has an `owner()` function.
    const abi = ["function owner() view returns (address)"];
    const contract = new ethers.Contract(SENDER_ADDRESS, abi, provider);

    try {
        const owner = await contract.owner();
        console.log("AA Account Owner:", owner);

        if (owner.toLowerCase() === wallet.address.toLowerCase()) {
            console.log("✅ Owner matches Private Key.");
        } else {
            console.error("❌ OWNER MISMATCH!");
            console.error("Expected (Wallet):", wallet.address);
            console.error("Actual (Contract):", owner);
            console.log("This is likely the cause of AA24 (Invalid UserOp Signature).");
        }
    } catch (e) {
        console.error("Failed to read owner from AA Account:", e);
        console.log("Maybe the account is not deployed or not a SimpleAccount?");
        
        // Check code
        const code = await provider.getCode(SENDER_ADDRESS);
        console.log("Code length:", code.length);
        if (code === "0x") {
            console.log("⚠️ Account is NOT deployed.");
        }
    }
}

main().catch(console.error);
