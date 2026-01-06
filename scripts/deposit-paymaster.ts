import * as dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";

async function main() {
  // Load env
  const RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org";
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const PAYMASTER_ADDRESS = "0x74A0d7235747D9Ae98BA1dB6f0306Bf57a14cb3A"; // V3
  const ENTRY_POINT_ADDRESS = process.env.ENTRY_POINT_ADDRESS || "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY in .env");
  if (!PAYMASTER_ADDRESS) throw new Error("Missing PAYMASTER_ADDRESS in .env");

  // Setup Provider & Wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Using Wallet:", wallet.address);
  console.log("Paymaster:", PAYMASTER_ADDRESS);

  // EntryPoint Contract Interface
  const entryPointAbi = [
    "function depositTo(address account) external payable",
    "function balanceOf(address account) external view returns (uint256)",
  ];
  const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, entryPointAbi, wallet);

  // Check current balance
  const currentBalance = await entryPoint.balanceOf(PAYMASTER_ADDRESS);
  console.log(`Current Paymaster Balance: ${ethers.formatEther(currentBalance)} BNB`);

  // Amount to deposit
  const amountToDeposit = ethers.parseEther("0.05"); // 0.05 BNB
  
  // Check wallet balance
  const walletBalance = await provider.getBalance(wallet.address);
  if (walletBalance < amountToDeposit) {
      console.error(`Insufficient wallet balance. You have ${ethers.formatEther(walletBalance)} BNB, need ${ethers.formatEther(amountToDeposit)} BNB + Gas`);
      // Try depositing less if balance is low
      if (walletBalance > ethers.parseEther("0.005")) {
          console.log("Attempting smaller deposit of 0.005 BNB...");
          const smallAmount = ethers.parseEther("0.005");
          const tx = await entryPoint.depositTo(PAYMASTER_ADDRESS, { value: smallAmount });
          console.log(`Transaction sent: ${tx.hash}`);
          await tx.wait();
          console.log("Small Deposit Successful!");
          return;
      }
      return;
  }

  console.log(`Depositing 0.05 BNB to Paymaster via EntryPoint...`);

  // Execute Deposit
  try {
      const tx = await entryPoint.depositTo(PAYMASTER_ADDRESS, { value: amountToDeposit });
      console.log(`Transaction sent: ${tx.hash}`);
      await tx.wait();
      console.log("Deposit Successful!");
  } catch (error) {
      console.error("Deposit Failed:", error);
  }

  // Check new balance
  const newBalance = await entryPoint.balanceOf(PAYMASTER_ADDRESS);
  console.log(`New Paymaster Balance: ${ethers.formatEther(newBalance)} BNB`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
