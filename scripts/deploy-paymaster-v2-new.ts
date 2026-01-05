import hre from "hardhat";
import { ethers } from "ethers";

async function main() {
  console.log("Starting deployment of RadrsPaymasterV2...");

  // 1. 读取配置
  const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"; // v0.7
  
  let deployer;
  let RadrsPaymasterFactory;

  // @ts-ignore
  if (hre.ethers) {
     console.log("Using hre.ethers plugin...");
     // @ts-ignore
     [deployer] = await hre.ethers.getSigners();
     // @ts-ignore
     RadrsPaymasterFactory = await hre.ethers.getContractFactory("RadrsPaymasterV2");
  } else {
     console.log("⚠️ hre.ethers missing, using manual fallback...");
     
     // @ts-ignore
     // Manual network detection from argv
     let targetNetwork = 'hardhat';
     const networkArgIndex = process.argv.indexOf('--network');
     if (networkArgIndex !== -1 && process.argv[networkArgIndex + 1]) {
        targetNetwork = process.argv[networkArgIndex + 1];
     } else if (process.env.HARDHAT_NETWORK) {
        targetNetwork = process.env.HARDHAT_NETWORK;
     } else if ((hre.network as any).name) {
        targetNetwork = (hre.network as any).name;
     }
     
     console.log("Debug: Target network:", targetNetwork);

     let rpcUrl = "";
     let privateKey = "";

     if (targetNetwork === 'bscTestnet') {
        rpcUrl = process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/";
        privateKey = process.env.PRIVATE_KEY || "";
     } else if (targetNetwork === 'bsc' || targetNetwork === 'bscMainnet') {
        rpcUrl = "https://bsc-dataseed3.binance.org"; // Try dataseed3
        privateKey = process.env.PRIVATE_KEY || "";
     } else if (targetNetwork === 'hardhat' || targetNetwork === 'localhost') {
        rpcUrl = "http://127.0.0.1:8545";
        // Localhost usually doesn't need specific private key, can use random or default
     } else {
         // Try to read from config as last resort, handling potential complex objects
         // @ts-ignore
         const netConfig = hre.config.networks[targetNetwork];
         if (netConfig) {
             // @ts-ignore
             rpcUrl = typeof netConfig.url === 'string' ? netConfig.url : "";
             // @ts-ignore
             if (Array.isArray(netConfig.accounts) && typeof netConfig.accounts[0] === 'string') {
                 // @ts-ignore
                 privateKey = netConfig.accounts[0];
             }
         }
     }

     if (!rpcUrl) {
        throw new Error(`Could not determine RPC URL for network: ${targetNetwork}`);
     }

     // @ts-ignore
     const provider = new ethers.JsonRpcProvider(rpcUrl);
     
     if (privateKey) {
        // @ts-ignore
        deployer = new ethers.Wallet(privateKey, provider);
     } else {
        if (targetNetwork === 'hardhat' || targetNetwork === 'localhost') {
            console.log("Using random wallet for local testing");
            deployer = ethers.Wallet.createRandom(provider);
        } else {
            throw new Error("No private key found in .env");
        }
     }
     
     const artifact = await hre.artifacts.readArtifact("RadrsPaymasterV2");
     const RadrsPaymasterFactory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);

     console.log(`Deploying contract with: ${deployer.address}`);
     const balance = await provider.getBalance(deployer.address);
     console.log(`Account balance: ${ethers.formatEther(balance)} ETH`);

     if (balance === 0n) {
        throw new Error("Deployer account has 0 balance. Please fund it.");
     }

     console.log(`Using EntryPoint: ${ENTRY_POINT_ADDRESS}`);
     const VERIFYING_SIGNER = process.env.PAYMASTER_SIGNER_PUBLIC_KEY || "0x6c1CA32792f0daF03c0852BdD2f5652b25bbDD16"; // Must match server!
     console.log(`Using Verifying Signer: ${VERIFYING_SIGNER}`);
     
     console.log("Waiting for deployment...");

     // @ts-ignore
     const paymaster = await RadrsPaymasterFactory.deploy(ENTRY_POINT_ADDRESS, VERIFYING_SIGNER);
     
     // @ts-ignore
     await paymaster.waitForDeployment();
     
     // @ts-ignore
     const paymasterAddress = await paymaster.getAddress();
     console.log("Paymaster V2 deployed to:", paymasterAddress);
     
     // Deposit some BNB to paymaster if needed (optional)
     console.log("Depositing 0.001 BNB to paymaster for gas...");
     const tx = await deployer.sendTransaction({
         to: paymasterAddress,
         value: ethers.parseEther("0.001")
     });
     await tx.wait();
     console.log("Deposited.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
