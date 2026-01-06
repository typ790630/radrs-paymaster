
import { createPublicClient, http, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

// Config
const PAYMASTER_API_URL = "https://radrs-paymaster.vercel.app";
const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

async function main() {
    console.log("🏥 Checking Paymaster API Health...");

    // 1. Basic Connectivity
    try {
        console.log(`   Testing GET ${PAYMASTER_API_URL}/api/paymaster/sponsor ...`);
        const res = await fetch(`${PAYMASTER_API_URL}/api/paymaster/sponsor`);
        const data = await res.json();
        console.log("   ✅ Health Check Response:", data);
    } catch (e: any) {
        console.error("   ❌ Health Check Failed:", e.message);
    }

    // 2. Functional Test (Sponsorship)
    console.log("\n🧪 Testing Sponsorship Logic...");
    
    // Mock Data
    const mockUserOp = {
        sender: "0x2C8e27CA6193522d5315F98734dC65412DB0c324",
        nonce: "0x0",
        initCode: "0x",
        callData: "0x",
        callGasLimit: "0x1",
        verificationGasLimit: "0x1",
        preVerificationGas: "0x1",
        maxFeePerGas: "0x1",
        maxPriorityFeePerGas: "0x1",
        paymasterAndData: "0x",
        signature: "0x"
    };

    try {
        console.log("   Sending Mock UserOp for Sponsorship...");
        const res = await fetch(`${PAYMASTER_API_URL}/api/paymaster/sponsor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chainId: 56,
                userOp: mockUserOp,
                entryPoint: ENTRY_POINT_ADDRESS,
                payer: mockUserOp.sender // Use sender as payer
            })
        });

        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            console.error("   ❌ Failed to parse JSON:", text.slice(0, 100));
            return;
        }

        if (res.ok) {
            console.log("   ✅ Sponsorship Success!");
            console.log("   Paymaster Data:", data.paymasterAndData ? `${data.paymasterAndData.slice(0, 30)}...` : "Missing");
        } else {
            console.log("   ⚠️ Sponsorship Returned Error (Expected if balance low):");
            console.log("   Status:", res.status);
            console.log("   Error:", data.error || data);
            
            if (data.error && (data.error.includes("balance") || data.error.includes("余额"))) {
                 console.log("   ✅ Logic Verified: Paymaster correctly checked balance.");
            } else if (res.status === 500) {
                 console.log("   ❌ Server Error: Check backend logs.");
            }
        }

    } catch (e: any) {
        console.error("   ❌ Request Failed:", e.message);
    }
}

main().catch(console.error);
