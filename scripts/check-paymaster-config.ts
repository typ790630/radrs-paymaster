
import { createPublicClient, http, type Hex, parseAbi } from "viem";
import { bsc } from "viem/chains";

const PAYMASTER_ADDRESS = "0x3ca3Da0fA3C50365847EaA4Db57eAdF8B083Aa43";
const EXPECTED_SIGNER = "0x6c1CA32792f0daF03c0852BdD2f5652b25bbDD16";

async function main() {
    const client = createPublicClient({
        chain: bsc,
        transport: http("https://bsc-dataseed1.binance.org"),
    });

    const abi = parseAbi([
        "function verifyingSigner() view returns (address)",
        "function RADRS_TOKEN_ADDRESS() view returns (address)"
    ]);

    console.log("Checking Paymaster Config on-chain...");

    try {
        const signer = await client.readContract({
            address: PAYMASTER_ADDRESS,
            abi,
            functionName: "verifyingSigner"
        });
        
        console.log(`On-chain Signer:   ${signer}`);
        console.log(`Expected Signer:   ${EXPECTED_SIGNER}`);
        
        if (signer.toLowerCase() !== EXPECTED_SIGNER.toLowerCase()) {
            console.error("❌ Signer MISMATCH! Please update env or redeploy.");
        } else {
            console.log("✅ Signer matches.");
        }

        const token = await client.readContract({
            address: PAYMASTER_ADDRESS,
            abi,
            functionName: "RADRS_TOKEN_ADDRESS"
        });
        console.log(`On-chain Token:    ${token}`);

    } catch (e) {
        console.error("Failed to read contract:", e);
    }
}

main();
