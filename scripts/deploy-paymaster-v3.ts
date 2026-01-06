
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
  
  console.log("Deploying RadrsPaymasterV3 with the account:", wallet.address);

  const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"; // BSC Mainnet
  const RADRS_TOKEN = "0xe2188a2e0a41a50f09359e5fe714d5e643036f2a"; // RADRS Token
  const FEE_COLLECTOR = "0xfb710006a8Ad08a636e919B02B2f9bBbcE524d96"; // Project Fee Collector
  
  // Use existing signer or generate new one? Let's generate a new one to be safe and output it.
  const backendSigner = ethers.Wallet.createRandom();
  
  // Get Artifacts from Hardhat
  // Note: We need to compile first to get RadrsPaymasterV3 artifact
  const artifact = await hre.artifacts.readArtifact("RadrsPaymasterV3");
  
  // Deploy
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const paymaster = await factory.deploy(ENTRY_POINT, backendSigner.address, RADRS_TOKEN, FEE_COLLECTOR);

  console.log("Waiting for deployment...");
  await paymaster.waitForDeployment();

  const paymasterAddress = await paymaster.getAddress();

  console.log("\nDeployment Successful!");
  console.log("----------------------------------------------------");
  console.log(`PAYMASTER_SIGNER_KEY=${backendSigner.privateKey}`);
  console.log(`PAYMASTER_ADDRESS=${paymasterAddress}`);
  console.log(`RADRS_FEE_COLLECTOR=${FEE_COLLECTOR}`);
  console.log("----------------------------------------------------");
  console.log("Please update your .env file with these values!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
