import hre from "hardhat";
import { ethers } from "ethers";

async function main() {
  const RADRS_ADDRESS = "0xe2188a2e0a41a50f09359e5fe714d5e643036f2a";

  console.log("Starting deployment script...");
  // @ts-ignore
  console.log("hre.network keys:", Object.keys(hre.network));
  // @ts-ignore
  if (hre.network.config) console.log("hre.network.config chainId:", hre.network.config.chainId);

  // @ts-ignore
  const networkName = hre.network.name || (hre.network.config && hre.network.config.chainId === 97 ? 'bscTestnet' : 'hardhat');
  console.log(`Current network (detected): ${networkName}`);
  
  if (hre.config && hre.config.networks) {
     console.log("Available networks in config:", Object.keys(hre.config.networks));
  }

  let deployer;
  let PaymasterFactory;

  // @ts-ignore
  if (hre.ethers) {
    console.log("Using hre.ethers plugin");
    // @ts-ignore
    [deployer] = await hre.ethers.getSigners();
    // @ts-ignore
    PaymasterFactory = await hre.ethers.getContractFactory("RadrsPaymaster");
  } else {
    console.log("⚠️ hre.ethers is missing. Using manual ethers fallback.");
    
    let provider;
    let signer;

    if (networkName === 'hardhat' || networkName === 'localhost') {
       console.log("Running on local hardhat network. Fallback might be limited.");
       try {
         // Attempt to use BrowserProvider wrapper for Hardhat in-process provider
         // @ts-ignore
         provider = new ethers.BrowserProvider(hre.network.provider);
         signer = await provider.getSigner();
       } catch (e) {
         console.log("Failed to init BrowserProvider, falling back to simulated signer.");
         // Create a random wallet for simulation if provider fails
         // Note: this won't be able to deploy to the real in-process network effectively 
         // without a valid provider, but allows script to proceed for syntax check.
         provider = new ethers.JsonRpcProvider("http://localhost:8545");
         signer = ethers.Wallet.createRandom(provider);
       }
    } else {
       const networkConfig = hre.config.networks[networkName];
       // @ts-ignore
       if (!networkConfig || !networkConfig.url) {
         throw new Error(`Network configuration for ${networkName} is missing URL.`);
       }
       // @ts-ignore
       console.log(`Connecting to ${networkConfig.url}...`);
       // @ts-ignore
       provider = new ethers.JsonRpcProvider(networkConfig.url);
       
       // @ts-ignore
       const accounts = networkConfig.accounts;
       if (Array.isArray(accounts) && accounts.length > 0) {
          // @ts-ignore
          signer = new ethers.Wallet(accounts[0] as string, provider);
       } else {
          throw new Error("No accounts configured for this network.");
       }
    }
    
    deployer = signer;
    
    const artifact = await hre.artifacts.readArtifact("RadrsPaymaster");
    PaymasterFactory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  }

  const deployerAddress = await deployer.getAddress();
  console.log("Deploying contract with:", deployerAddress);

  const paymaster = await PaymasterFactory.deploy(RADRS_ADDRESS);
  console.log("Waiting for deployment...");
  
  // @ts-ignore
  await paymaster.waitForDeployment();
  // @ts-ignore
  const address = await paymaster.getAddress();

  console.log("Paymaster deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
