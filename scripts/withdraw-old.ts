import hre from "hardhat";
import { ethers } from "ethers";

async function main() {
  const KNOWN_OLD_ADDRESSES = [
    "0x892EdBbc40b79B3C7784F395eDa83A32c2210b22",
    "0x7Be3A50B2a062a8dD1b24C0D77D0Cc8D8b19618A"
  ];
  
  // Allow overriding via env
  let targetAddresses = [...KNOWN_OLD_ADDRESSES];
  if (process.env.OLD_PAYMASTER) {
    targetAddresses = [process.env.OLD_PAYMASTER];
  }

  const RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org";
  const PRIVATE_KEY = process.env.PRIVATE_KEY;

  if (!PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not found in .env");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Using account:", wallet.address);

  const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
  // EntryPoint ABI just to check balance
  const entryPointAbi = [
    "function balanceOf(address account) view returns (uint256)"
  ];
  const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, entryPointAbi, provider);

  // Paymaster ABI for withdrawTo
  const paymasterAbi = [
    "function withdrawTo(address payable withdrawAddress, uint256 amount) external",
    "function owner() view returns (address)"
  ];

  for (const paymasterAddr of targetAddresses) {
    console.log(`\nChecking Paymaster: ${paymasterAddr}`);
    
    try {
        const balance = await entryPoint.balanceOf(paymasterAddr);
        console.log(`  Balance in EntryPoint: ${ethers.formatEther(balance)} BNB`);

        if (balance > BigInt(0)) {
            console.log("  Found funds! Attempting withdrawal...");
            const paymaster = new ethers.Contract(paymasterAddr, paymasterAbi, wallet);
            
            // Try to withdraw
            try {
                const tx = await paymaster.withdrawTo(wallet.address, balance);
                console.log(`  Transaction sent: ${tx.hash}`);
                await tx.wait();
                console.log("  Withdrawal Successful!");
            } catch (err: any) {
                console.error("  Withdrawal Failed. Are you the owner?");
                // Extract reason if possible
                if (err.reason) console.error("  Reason:", err.reason);
                
                try {
                    const owner = await paymaster.owner();
                    console.log("  Contract Owner:", owner);
                    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
                        console.warn("  WARNING: You are not the owner of this Paymaster.");
                    }
                } catch (e) {}
            }
        } else {
            console.log("  No funds to withdraw.");
        }
    } catch (error: any) {
        console.error(`  Failed to check ${paymasterAddr}:`, error.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
