import axios from 'axios';

// Config
const API_URL = "https://radrs-paymaster.vercel.app/api/paymaster/sponsor";
const EXPECTED_PAYMASTER = "0xD0D46B98dFf2ee93Dfe708d4434f180383B2B939"; // New Secure Address
const CHAIN_ID = 56;

async function testBackend() {
    console.log("🚀 Testing Vercel Backend Fix...");
    console.log(`URL: ${API_URL}`);
    console.log("----------------------------------------------------");

    // Mock UserOp (Minimal for signing)
    // Use a real address that likely has RADRS (from your screenshot)
    const mockUserOp = {
        sender: "0x9ADBbea6886A7DD09BF6Ddb26730F54772a3e946", 
        nonce: "0x0",
        initCode: "0x",
        callData: "0x",
        callGasLimit: "0x10000",
        verificationGasLimit: "0x10000",
        preVerificationGas: "0x10000",
        maxFeePerGas: "0x100000",
        maxPriorityFeePerGas: "0x100000",
        paymasterAndData: "0x",
        signature: "0x"
    };

    try {
        const response = await axios.post(API_URL, {
            chainId: CHAIN_ID,
            userOp: mockUserOp,
            entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
        });

        const data = response.data;
        console.log("✅ Response Received:");
        console.log(`   Paymaster Address: ${data.paymasterAddress}`);
        
        // Validation
        if (data.paymasterAddress.toLowerCase() === EXPECTED_PAYMASTER.toLowerCase()) {
            console.log("\n🎉 SUCCESS: Backend is returning the NEW Paymaster Address!");
        } else {
            console.error(`\n❌ FAIL: Backend is still returning OLD address: ${data.paymasterAddress}`);
            console.error(`   Expected: ${EXPECTED_PAYMASTER}`);
        }

        if (data.paymasterAndData && data.paymasterAndData.length > 100) {
            console.log("✅ Signature generated successfully.");
        } else {
            console.error("❌ Signature generation failed (paymasterAndData missing or invalid).");
        }

    } catch (error: any) {
        console.error("\n❌ Request Failed:");
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Data:`, error.response.data);
        } else {
            console.error(`   Error: ${error.message}`);
        }
    }
}

testBackend();
