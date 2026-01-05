
import hre from "hardhat";
import { ethers } from "ethers";

// Configuration
const OLD_PAYMASTER = "0x3ca3Da0fA3C50365847EaA4Db57eAdF8B083Aa43";
const NEW_PAYMASTER = "0xcaD766Bd28aAde4c8F1AAF3DB911a57c3F002a14";
const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

async function main() {
  console.log("Starting Fund Migration...");

  let deployer;
  let provider;

  // @ts-ignore
  if (hre.ethers) {
     console.log("Using hre.ethers...");
     // @ts-ignore
     [deployer] = await hre.ethers.getSigners();
     // @ts-ignore
     provider = hre.ethers.provider;
  } else {
     console.log("Using manual ethers setup...");
     const rpcUrl = "https://bsc-dataseed1.binance.org";
     const privateKey = process.env.PRIVATE_KEY;
     if (!privateKey) throw new Error("Missing PRIVATE_KEY");
     
     provider = new ethers.JsonRpcProvider(rpcUrl);
     deployer = new ethers.Wallet(privateKey, provider);
  }

  console.log(`Using account: ${deployer.address}`);
  
  // ABI for EntryPoint
  const entryPointAbi = [
    "function balanceOf(address account) view returns (uint256)",
    "function depositTo(address account) payable"
  ];
  const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, entryPointAbi, deployer);
  
  // ABI for Paymaster
  const paymasterAbi = [
    "function withdrawTo(address withdrawAddress, uint256 amount) external",
    "function deposit() external payable"
  ];

  // Check Deposits
  const oldDeposit = await entryPoint.balanceOf(OLD_PAYMASTER);
  console.log(`Old Paymaster Deposit: ${ethers.formatEther(oldDeposit)} BNB`);
  
  const newDeposit = await entryPoint.balanceOf(NEW_PAYMASTER);
  console.log(`New Paymaster Deposit: ${ethers.formatEther(newDeposit)} BNB`);

  // Migrate
  if (oldDeposit > 0n) {
      console.log("Migrating funds from Old...");
      const oldContract = new ethers.Contract(OLD_PAYMASTER, paymasterAbi, deployer);
      
      const withdrawTx = await oldContract.withdrawTo(deployer.address, oldDeposit);
      console.log(`Withdraw tx sent: ${withdrawTx.hash}`);
      await withdrawTx.wait();
      console.log("Withdraw successful.");
  } else {
      console.log("Old Paymaster has no deposit.");
  }

  // Deposit to New (ensure at least 0.01 BNB)
  const targetBalance = ethers.parseEther("0.01");
  const currentNewDeposit = await entryPoint.balanceOf(NEW_PAYMASTER);
  
  if (currentNewDeposit < targetBalance) {
      const depositAmount = targetBalance - currentNewDeposit;
      console.log(`Depositing ${ethers.formatEther(depositAmount)} BNB to New Paymaster...`);
      
      const newContract = new ethers.Contract(NEW_PAYMASTER, paymasterAbi, deployer);
      
      // Try deposit() function on Paymaster first (if exists)
      try {
          const depositTx = await newContract.deposit({ value: depositAmount });
          console.log(`Deposit tx sent: ${depositTx.hash}`);
          await depositTx.wait();
          console.log("Deposit successful via Paymaster.deposit()");
      } catch (e) {
          console.log("Paymaster.deposit() failed or not present, trying EntryPoint.depositTo()...");
          const depositTx = await entryPoint.depositTo(NEW_PAYMASTER, { value: depositAmount });
          console.log(`Deposit tx sent: ${depositTx.hash}`);
          await depositTx.wait();
          console.log("Deposit successful via EntryPoint.depositTo()");
      }
  }

  const finalDeposit = await entryPoint.balanceOf(NEW_PAYMASTER);
  console.log(`Final New Paymaster Deposit: ${ethers.formatEther(finalDeposit)} BNB`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
