import * as dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";

async function main() {
  // Load env
  const RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org";
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const OLD_PAYMASTER_ADDRESS = "0x1f29efB2d33BC425B3C4050804D55047d872A3dC"; 
  const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY in .env");

  // Setup Provider & Wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Using Wallet (Owner):", wallet.address);
  console.log("Old Paymaster:", OLD_PAYMASTER_ADDRESS);

  // Paymaster ABI (BasePaymaster has withdrawTo)
  const paymasterAbi = [
    "function withdrawTo(address payable withdrawAddress, uint256 amount) external",
    "function owner() view returns (address)",
    "function getDeposit() view returns (uint256)" // Helper often in BasePaymaster, but we can check EntryPoint directly
  ];
  
  // EntryPoint ABI
  const entryPointAbi = [
    "function balanceOf(address account) external view returns (uint256)",
  ];

  const paymaster = new ethers.Contract(OLD_PAYMASTER_ADDRESS, paymasterAbi, wallet);
  const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, entryPointAbi, wallet);

  // 1. Check Owner
  try {
      const owner = await paymaster.owner();
      console.log("Paymaster Owner:", owner);
      if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
          console.error("❌ You are NOT the owner of this Paymaster. Cannot withdraw.");
          return;
      }
  } catch (e) {
      console.error("Could not fetch owner (might differ in ABI):", e);
  }

  // 2. Check Balance in EntryPoint
  const balance = await entryPoint.balanceOf(OLD_PAYMASTER_ADDRESS);
  console.log(`Paymaster Deposit in EntryPoint: ${ethers.formatEther(balance)} BNB`);

  if (balance === 0n) {
      console.log("Balance is 0. Nothing to withdraw.");
      return;
  }

  // 3. Withdraw
  console.log("Withdrawing all funds to owner...");
  try {
      // withdrawTo(target, amount)
      const tx = await paymaster.withdrawTo(wallet.address, balance);
      console.log(`Withdraw Transaction sent: ${tx.hash}`);
      await tx.wait();
      console.log("✅ Withdraw Successful!");
  } catch (error) {
      console.error("Withdraw Failed:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
