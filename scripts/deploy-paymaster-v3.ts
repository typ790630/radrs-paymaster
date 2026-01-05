
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
  
  // We should REUSE the existing backend signer key if possible to avoid changing .env
  // Or just generate a new one. The prompt implies we can update config.
  // Let's reuse the one from .env if it exists, otherwise generate.
  let signerAddress = "";
  let signerKey = "";
  
  if (process.env.PAYMASTER_SIGNER_KEY) {
      const existingSigner = new ethers.Wallet(process.env.PAYMASTER_SIGNER_KEY);
      signerAddress = existingSigner.address;
      signerKey = existingSigner.privateKey;
      console.log("Using existing signer from .env:", signerAddress);
  } else {
      const backendSigner = ethers.Wallet.createRandom();
      signerAddress = backendSigner.address;
      signerKey = backendSigner.privateKey;
      console.log("Generated NEW signer:", signerAddress);
  }
  
  // Get Artifacts from Hardhat
  const artifact = await hre.artifacts.readArtifact("RadrsPaymaster");
  
  // Deploy
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const paymaster = await factory.deploy(ENTRY_POINT, signerAddress);

  console.log("Waiting for deployment...");
  await paymaster.waitForDeployment();

  const paymasterAddress = await paymaster.getAddress();

  console.log("\nDeployment Successful (v3 - with Custom Errors)!");
  console.log("----------------------------------------------------");
  console.log(`PAYMASTER_SIGNER_KEY=${signerKey}`);
  console.log(`PAYMASTER_ADDRESS=${paymasterAddress}`);
  console.log("----------------------------------------------------");
  console.log("IMPORTANT: Update your .env and client config with these values!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
