
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const RPC_URL = "https://bsc-dataseed1.binance.org";
  const PAYMASTER_ADDRESS = "0x1f29efB2d33BC425B3C4050804D55047d872A3dC";
  
  // Data from the failed request in screenshot
  const SENDER = "0x9ADBbea6886A7DD09BF6Ddb26730F54772a3e946";
  const VALID_UNTIL = 1767507692; // From screenshot
  const VALID_AFTER = 0;
  const FEE_AMOUNT = 0;
  
  // Config
  const RADRS_TOKEN = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
  const RECEIVER = "0xfb710006a8Ad08a636e919B02B2f9bBbcE524d96";
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // 1. Check Signer on Contract
  const abi = [
    "function verifyingSigner() view returns (address)",
    "function getHash(address feeToken, uint256 feeAmount, address receiver, uint48 validUntil, uint48 validAfter, address sender) view returns (bytes32)"
  ];
  const paymaster = new ethers.Contract(PAYMASTER_ADDRESS, abi, provider);
  
  const onChainSigner = await paymaster.verifyingSigner();
  console.log("On-Chain Signer: ", onChainSigner);
  
  const SERVER_SIGNER = "0x6c1CA32792f0daF03c0852BdD2f5652b25bbDD16";
  console.log("Server Signer:   ", SERVER_SIGNER);
  
  if (onChainSigner.toLowerCase() !== SERVER_SIGNER.toLowerCase()) {
      console.error("❌ SIGNER MISMATCH! The contract is using a different signer.");
      return;
  }
  console.log("✅ Signer matches.");

  // 2. Re-create the Hash
  console.log("\n--- Calculating Hash ---");
  
  // On-Chain
  const onChainHash = await paymaster.getHash(
      RADRS_TOKEN,
      FEE_AMOUNT,
      RECEIVER,
      VALID_UNTIL,
      VALID_AFTER,
      SENDER
  );
  console.log("On-Chain Hash: ", onChainHash);

  // Local (Ethers v6)
  const domain = {
    name: 'RadrsPaymaster',
    version: '1',
    chainId: 56,
    verifyingContract: PAYMASTER_ADDRESS
  };

  const types = {
    Sponsor: [
        { name: 'feeToken', type: 'address' },
        { name: 'feeAmount', type: 'uint256' },
        { name: 'receiver', type: 'address' },
        { name: 'validUntil', type: 'uint48' },
        { name: 'validAfter', type: 'uint48' },
        { name: 'sender', type: 'address' }
    ]
  };

  const value = {
    feeToken: RADRS_TOKEN,
    feeAmount: FEE_AMOUNT,
    receiver: RECEIVER,
    validUntil: VALID_UNTIL,
    validAfter: VALID_AFTER,
    sender: SENDER
  };

  const localHash = ethers.TypedDataEncoder.hash(domain, types, value);
  console.log("Local Hash:    ", localHash);

  if (onChainHash !== localHash) {
      console.error("❌ HASH MISMATCH!");
  } else {
      console.log("✅ Hash matches.");
  }
  
  // 3. Verify Signature
  // I need the PRIVATE KEY to sign and verify.
  const PRIVATE_KEY = process.env.PAYMASTER_SIGNER_KEY;
  if (!PRIVATE_KEY) {
      console.warn("Skipping signature generation (No Private Key)");
      return;
  }
  
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const signature = await wallet.signTypedData(domain, types, value);
  console.log("\nGenerated Signature:", signature);
  
  const recovered = ethers.verifyTypedData(domain, types, value, signature);
  console.log("Recovered Signer:  ", recovered);
  
  if (recovered.toLowerCase() === onChainSigner.toLowerCase()) {
      console.log("✅ Signature Verification PASSED locally.");
  } else {
      console.error("❌ Signature Verification FAILED locally.");
  }
}

main().catch(console.error);
