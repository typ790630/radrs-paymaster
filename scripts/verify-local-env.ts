
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

// Load Config
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS || process.env.EXPO_PUBLIC_PAYMASTER_ADDRESS;
const PAYMASTER_API_URL = process.env.PAYMASTER_API_URL || process.env.EXPO_PUBLIC_PAYMASTER_API_URL;
const RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed3.binance.org";

// Expected V2 Address
const EXPECTED_ADDRESS = "0x74A0d7235747D9Ae98BA1dB6f0306Bf57a14cb3A";

async function main() {
    console.log("🔍 Verifying Local Environment & Paymaster Configuration...\n");

    // 1. Check Env Vars
    if (!PAYMASTER_ADDRESS) {
        console.error("❌ PAYMASTER_ADDRESS not found in .env");
    } else {
        console.log(`✅ PAYMASTER_ADDRESS: ${PAYMASTER_ADDRESS}`);
        if (PAYMASTER_ADDRESS.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
            console.error(`❌ Paymaster Address mismatch! Expected: ${EXPECTED_ADDRESS}, Got: ${PAYMASTER_ADDRESS}`);
            console.error("👉 Please update .env to use the V3 address: 0x74A0d7235747D9Ae98BA1dB6f0306Bf57a14cb3A");
        }
    }

    if (!PAYMASTER_API_URL) {
        console.error("❌ PAYMASTER_API_URL not found in .env");
    } else {
        console.log(`✅ PAYMASTER_API_URL: ${PAYMASTER_API_URL}`);
    }

    // 2. Check API Response
    if (PAYMASTER_API_URL) {
        try {
            console.log("\n📡 Checking Paymaster API Quote...");
            // Dummy Quote Request
            const response = await axios.post(`${PAYMASTER_API_URL}/paymaster/quote`, {
                chainId: 56,
                userOp: {
                    sender: "0x0000000000000000000000000000000000000000",
                    callGasLimit: "0x0",
                    verificationGasLimit: "0x0",
                    preVerificationGas: "0x0",
                    maxFeePerGas: "0x0",
                    maxPriorityFeePerGas: "0x0"
                }
            });
            
            if (response.data && response.data.paymasterAddress) {
                const apiAddr = response.data.paymasterAddress;
                console.log(`✅ API Returned Paymaster Address: ${apiAddr}`);
                
                if (apiAddr.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
                    console.error("\n⚠️  Paymaster 地址不一致：请统一前端 .env 与 Paymaster 服务配置");
                    console.error(`   - .env / Config: ${PAYMASTER_ADDRESS}`);
                    console.error(`   - API Response:  ${apiAddr}`);
                    console.error("👉 Fix: Update PAYMASTER_ADDRESS in server .env and restart server.");
                } else {
                    console.log("✅ API Address matches Config Address!");
                }
            } else {
                console.warn("⚠️ API response did not contain 'paymasterAddress' field.");
            }

        } catch (e: any) {
            console.error("❌ Failed to call Paymaster API:", e.message);
            if (e.code === "ECONNREFUSED") {
                console.error("👉 Is the server running? (npx ts-node server/src/index.ts)");
            }
        }
    }
}

main();
