
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function main() {
  const PAYMASTER_ADDRESS = "0xcaD766Bd28aAde4c8F1AAF3DB911a57c3F002a14"; 
  const EXPECTED_SIGNER = "0x6c1CA32792f0daF03c0852BdD2f5652b25bbDD16";
  const RPC_URL = "https://bsc-dataseed1.binance.org"; 

  // 1. Load Artifact
  const artifactPath = path.resolve("artifacts/contracts/RadrsPaymaster.sol/RadrsPaymaster.json");
  if (!fs.existsSync(artifactPath)) {
      console.error("Artifact not found at:", artifactPath);
      return;
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const abi = artifact.abi;

  // 2. Connect
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const paymaster = new ethers.Contract(PAYMASTER_ADDRESS, abi, provider);

  console.log("Reading verifyingSigner...");
  const onChainSigner = await paymaster.verifyingSigner();
  console.log("On-Chain Signer:", onChainSigner);

  if (onChainSigner.toLowerCase() !== EXPECTED_SIGNER.toLowerCase()) {
      console.error("❌ SIGNER MISMATCH!");
      console.error("Expected:", EXPECTED_SIGNER);
      console.error("Actual:  ", onChainSigner);
      return;
  }
  console.log("✅ Signer matches.");

  // 3. Check Hash Logic
  const RADRS_TOKEN = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
  const RECEIVER = "0xfb710006a8Ad08a636e919B02B2f9bBbcE524d96";
  const SENDER = "0x9ADBbea6886A7DD09BF6Ddb26730F54772a3e946";
  const FEE_AMOUNT = 0;
  const VALID_UNTIL = 1767502067; 
  const VALID_AFTER = 0;

  console.log("Calling getHash on-chain...");
  const hash = await paymaster.getHash(
      RADRS_TOKEN,
      FEE_AMOUNT,
      RECEIVER,
      VALID_UNTIL,
      VALID_AFTER,
      SENDER
  );
  console.log("On-Chain Hash:", hash);

  // 4. Local Hash
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
  console.log("Local Hash:   ", localHash);

  if (hash !== localHash) {
      console.error("❌ HASH MISMATCH!");
  } else {
      console.log("✅ Hash calculation matches.");
  }
}

main().catch(console.error);
