
import hre from "hardhat";

async function main() {
  console.log("HRE Keys:", Object.keys(hre));
  const ethers = (hre as any).ethers;
  console.log("HRE.ethers:", ethers ? "Present" : "Missing");
}

main();
