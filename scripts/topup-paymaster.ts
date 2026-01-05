
import hre from "hardhat";
import { ethers } from "ethers";

// Configuration
const NEW_PAYMASTER = "0xcaD766Bd28aAde4c8F1AAF3DB911a57c3F002a14";
const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

async function main() {
  console.log("Topping up Paymaster...");

  let deployer;
  
  // @ts-ignore
  if (hre.ethers) {
     console.log("Using hre.ethers...");
     // @ts-ignore
     [deployer] = await hre.ethers.getSigners();
  } else {
     console.log("Using manual ethers setup...");
     const rpcUrl = "https://bsc-dataseed1.binance.org";
     const privateKey = process.env.PRIVATE_KEY;
     if (!privateKey) throw new Error("Missing PRIVATE_KEY");
     
     const provider = new ethers.JsonRpcProvider(rpcUrl);
     deployer = new ethers.Wallet(privateKey, provider);
  }

  console.log(`Using account: ${deployer.address}`);

  const paymasterAbi = ["function deposit() external payable"];
  const paymasterContract = new ethers.Contract(NEW_PAYMASTER, paymasterAbi, deployer);

  const entryPointAbi = ["function balanceOf(address account) view returns (uint256)"];
  const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, entryPointAbi, deployer);
  
  // Check Current Deposit
  const currentDeposit = await entryPoint.balanceOf(NEW_PAYMASTER);
  console.log(`Current Deposit: ${ethers.formatEther(currentDeposit)} BNB`);

  // Deposit 0.05 BNB
  const amount = ethers.parseEther("0.05");
  console.log(`Depositing ${ethers.formatEther(amount)} BNB...`);

  const tx = await paymasterContract.deposit({ value: amount });
  console.log(`Tx sent: ${tx.hash}`);
  await tx.wait();

  const finalDeposit = await entryPoint.balanceOf(NEW_PAYMASTER);
  console.log(`New Deposit: ${ethers.formatEther(finalDeposit)} BNB`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
