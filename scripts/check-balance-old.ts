
import { ethers } from "ethers";

const RPC_URL = "https://bsc-dataseed3.binance.org";
const OLD_ADDRESS = "0x07fFF633120E55411b6e8bc85D6Fda60F9671fE4";

async function check() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const balance = await provider.getBalance(OLD_ADDRESS);
    console.log(`Balance of ${OLD_ADDRESS}: ${ethers.formatEther(balance)} BNB`);
}

check();
