
import hre from "hardhat";
import { ethers } from "ethers";

async function main() {
  const RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org";
  const PRIVATE_KEY = process.env.PRIVATE_KEY;

  if (!PRIVATE_KEY || PRIVATE_KEY.length < 64) {
      throw new Error("PRIVATE_KEY not found or invalid in .env");
  }

  // Setup Provider & Wallet manually to bypass hardhat-ethers plugin issues
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  console.log("Deploying contracts with the account:", wallet.address);

  const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"; // BSC Mainnet
  
  // Generate a new signer for the backend
  const backendSigner = ethers.Wallet.createRandom();
  
  // Get Artifacts from Hardhat
  const artifact = await hre.artifacts.readArtifact("RadrsPaymaster");
  
  // Deploy
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const paymaster = await factory.deploy(ENTRY_POINT, backendSigner.address);

  console.log("Waiting for deployment...");
  await paymaster.waitForDeployment();

  const paymasterAddress = await paymaster.getAddress();

  console.log("\nDeployment Successful!");
  console.log("----------------------------------------------------");
  console.log(`PAYMASTER_SIGNER_KEY=${backendSigner.privateKey}`);
  console.log(`PAYMASTER_ADDRESS=${paymasterAddress}`);
  console.log("----------------------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
