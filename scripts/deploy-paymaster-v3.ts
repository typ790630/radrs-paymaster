
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
  
  // Use existing signer (Your New Safe Wallet)
  // This ensures the backend (which has this key) can sign valid quotes.
  const backendSignerAddress = wallet.address;
  
  // Get Artifacts from Hardhat
  // Note: We need to compile first to get RadrsPaymasterV3 artifact
  const artifact = await hre.artifacts.readArtifact("RadrsPaymasterV3");
  
  // Deploy with manual gas overrides to prevent over-estimation
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  // Force 1.1 Gwei gas price (Try to be as cheap as possible)
  const gasPrice = ethers.parseUnits("1.1", "gwei");
  // Force reasonable gas limit (3M) 
  const gasLimit = 3000000;
  
  console.log("Deploying with gasPrice:", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("Deploying with gasLimit:", gasLimit);

  // Manually build and send transaction to bypass estimateGas check
  const deployTx = await factory.getDeployTransaction(ENTRY_POINT, backendSignerAddress, RADRS_TOKEN, FEE_COLLECTOR, {
      gasPrice: gasPrice,
      gasLimit: gasLimit
  });

  const txResponse = await wallet.sendTransaction(deployTx);
  console.log(`Deploy Tx Sent: ${txResponse.hash}`);
  
  console.log("Waiting for deployment...");
  const receipt = await txResponse.wait();
  
  if(!receipt) throw new Error("Deployment failed: No receipt");
  
  const paymasterAddress = receipt.contractAddress;

  console.log("\nDeployment Successful!");
  console.log("----------------------------------------------------");
  console.log(`PAYMASTER_ADDRESS=${paymasterAddress}`);
  console.log(`VERIFYING_SIGNER=${backendSignerAddress}`);
  console.log(`OWNER=${wallet.address}`);
  console.log("----------------------------------------------------");

  // Automatic Deposit
  const DEPOSIT_AMOUNT = ethers.parseEther("0.001"); 
  console.log(`\nDepositing ${ethers.formatEther(DEPOSIT_AMOUNT)} BNB to EntryPoint for Paymaster...`);
  
  // EntryPoint Interface (Minimal)
  const entryPointAbi = ["function depositTo(address account) external payable"];
  const entryPointContract = new ethers.Contract(ENTRY_POINT, entryPointAbi, wallet);
  
  try {
    const tx = await entryPointContract.depositTo(paymasterAddress, { value: DEPOSIT_AMOUNT });
    console.log(`Deposit Tx sent: ${tx.hash}`);
    await tx.wait();
    console.log("✅ Deposit confirmed!");
  } catch (err) {
    console.error("❌ Deposit failed. You may need to deposit manually via Etherscan.", err);
  }

  console.log("----------------------------------------------------");
  console.log("✅ Step 1: Update .env (PAYMASTER_ADDRESS)");
  console.log("✅ Step 2: Deposit BNB to this new Paymaster");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
