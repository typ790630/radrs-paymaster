import { ethers } from "ethers";
import "dotenv/config";

const RPC_URL = "https://bsc-dataseed3.binance.org";
const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

// Old Paymaster Addresses to check
const OLD_PAYMASTERS = [
    "0x30B8333A8a283045869A6A81C95D688061A0a289", // V8
    "0x7Be3A50B2a062a8dD1b24C0D77D0Cc8D8b19618A", // V1
    "0x3ca3Da0fA3C50365847EaA4Db57eAdF8B083Aa43", // Another one
    "0x1f29efB2d33BC425B3C4050804D55047d872A3dC", // Failed signer one
    "0x1d3E64c5a4fFfC4e46e70e22c33A1ddaD506c3Aa"  // V2 (Now Old)
];

async function main() {
    if (!process.env.PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const entryPointAbi = [
        "function balanceOf(address account) external view returns (uint256)",
        "function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external"
    ];
    const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, entryPointAbi, wallet);

    // Paymaster ABI (to call withdrawStake or direct withdraw if supported, but usually funds are in EntryPoint)
    // Actually, to withdraw from EntryPoint, the PAYMASTER contract itself must call entryPoint.withdrawTo().
    // So we need to call paymaster.withdrawTo(beneficiary, amount).
    const paymasterAbi = [
        "function withdrawTo(address payable withdrawAddress, uint256 amount) external",
        "function owner() view returns (address)"
    ];

    console.log(`Checking old paymasters for funds...`);

    for (const pmAddr of OLD_PAYMASTERS) {
        try {
            const balance = await entryPoint.balanceOf(pmAddr);
            console.log(`[${pmAddr}] Balance: ${ethers.formatEther(balance)} BNB`);

            if (balance > 0n) {
                console.log(`   💰 Found funds! Attempting to withdraw...`);
                
                const paymaster = new ethers.Contract(pmAddr, paymasterAbi, wallet);
                // Check owner
                try {
                    const owner = await paymaster.owner();
                    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
                        console.log(`   ❌ Cannot withdraw: Wallet is not owner (Owner: ${owner})`);
                        continue;
                    }
                } catch (e) {
                    console.log(`   ⚠️ Could not verify owner, trying anyway...`);
                }

                // Withdraw
                try {
                    const tx = await paymaster.withdrawTo(wallet.address, balance);
                    console.log(`   ⏳ Withdraw Tx Sent: ${tx.hash}`);
                    await tx.wait();
                    console.log(`   ✅ Withdrawn successfully!`);
                } catch (e: any) {
                    console.log(`   ❌ Withdraw failed: ${e.message}`);
                }
            }
        } catch (e) {
            console.log(`   ❌ Error checking ${pmAddr}:`, e);
        }
    }
}

main().catch(console.error);
