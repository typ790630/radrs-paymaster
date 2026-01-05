import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const OLD_PAYMASTER = "0x1E2957Db9e5bdFA80b79cb318ae8F77e3FA9213F";
  const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
  const RPC_URL = "https://bsc-dataseed3.binance.org";
  const PRIVATE_KEY = process.env.PRIVATE_KEY;

  if (!PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not found in .env");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Using signer: ${signer.address}`);

  // BasePaymaster ABI (only what we need)
  const PAYMASTER_ABI = [
    "function withdrawTo(address withdrawAddress, uint256 amount) external"
  ];

  // EntryPoint ABI (only what we need)
  const ENTRY_POINT_ABI = [
    "function balanceOf(address account) external view returns (uint256)"
  ];

  const entryPoint = new ethers.Contract(ENTRY_POINT, ENTRY_POINT_ABI, provider);
  
  // Check balance in EntryPoint
  const balance = await entryPoint.balanceOf(OLD_PAYMASTER);
  console.log(`Old Paymaster Balance: ${ethers.formatEther(balance)} BNB`);

  if (balance === 0n) {
    console.log("No funds to withdraw.");
    return;
  }

  // Withdraw
  console.log("Withdrawing...");
  const paymaster = new ethers.Contract(OLD_PAYMASTER, PAYMASTER_ABI, signer);
  
  const tx = await paymaster.withdrawTo(signer.address, balance);
  console.log(`Tx sent: ${tx.hash}`);
  await tx.wait();

  console.log("Withdrawn successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
