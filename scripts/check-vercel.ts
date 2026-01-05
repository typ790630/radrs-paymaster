
// import fetch from 'node-fetch'; // Use built-in fetch in newer Node.js

const API_URL = "https://sradr-dapp.vercel.app/paymaster/quote";
// const API_URL = "http://localhost:3000/paymaster/quote"; // Local Test

async function checkVercel() {
    console.log(`Checking Vercel Deployment at: ${API_URL}`);

    const dummyUserOp = {
        sender: "0x9ADBbea6886A7DD09BF6Ddb26730F54772a3e946",
        nonce: "0x0",
        initCode: "0x",
        callData: "0x",
        callGasLimit: "0x10000",
        verificationGasLimit: "0x10000",
        preVerificationGas: "0x10000",
        maxFeePerGas: "0x100000000", // 4 gwei
        maxPriorityFeePerGas: "0x100000000",
        paymasterAndData: "0x",
        signature: "0x"
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chainId: 56,
                userOp: dummyUserOp
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log("✅ Vercel Service is ALIVE!");
            console.log("Response:", data);
            
            if (data.radrsFee && data.gasCostBNB) {
                console.log("✅ Fee Calculation Works (Environment Variables Likely Correct)");
            } else {
                console.warn("⚠️ Response format unexpected:", data);
            }
        } else {
            console.error(`❌ Request Failed: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error("Response Body:", text);
        }

    } catch (error) {
        console.error("❌ Network Error:", error);
    }
}

checkVercel();
