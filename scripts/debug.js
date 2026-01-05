
import hre from "hardhat";

async function main() {
  console.log("HRE keys:", Object.keys(hre));
  console.log("Is ethers in HRE?", !!hre.ethers);
}

main().catch(console.error);
