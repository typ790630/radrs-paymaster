
import { createPublicClient, http, encodeFunctionData, parseAbi, type Hex } from 'viem';
import { bsc } from 'viem/chains';
import axios from 'axios';
import { CONFIG } from '../server/src/config.js';

const { ENTRY_POINT_ADDRESS, RADRS_TOKEN_ADDRESS, PAYMASTER_ADDRESS, PORT, CHAIN_ID } = CONFIG;
const PAYMASTER_API_URL = `http://localhost:${PORT}`;
const SENDER_ADDRESS = "0x9ADBbea6886A7DD09BF6Ddb26730F54772a3e946";

async function main() {
    console.log("Simulating Wallet Request (executeBatch)...");

    // 1. Construct Inner Call (Approve)
    const erc20Abi = parseAbi(['function approve(address spender, uint256 amount)']);
    const innerCallData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [PAYMASTER_ADDRESS as `0x${string}`, 115792089237316195423570985008687907853269984665640564039457584007913129639935n] // MaxUint256
    });

    // 2. Construct Outer Call (executeBatch)
    // Most wallets use executeBatch even for single calls
    const simpleAccountAbi = parseAbi([
        'function executeBatch(address[] dest, uint256[] value, bytes[] func)'
    ]);
    
    const callData = encodeFunctionData({
        abi: simpleAccountAbi,
        functionName: 'executeBatch',
        args: [
            [RADRS_TOKEN_ADDRESS as `0x${string}`],
            [0n],
            [innerCallData]
        ]
    });

    console.log("Constructed callData (executeBatch):", callData);

    // 3. Create UserOp
    const userOp = {
        sender: SENDER_ADDRESS,
        nonce: "0x0",
        initCode: "0x",
        callData: callData,
        callGasLimit: "0x" + (100000).toString(16),
        verificationGasLimit: "0x" + (100000).toString(16),
        preVerificationGas: "0x" + (50000).toString(16),
        maxFeePerGas: "0x" + (3000000000).toString(16),
        maxPriorityFeePerGas: "0x" + (3000000000).toString(16),
        paymasterAndData: "0x",
        signature: "0x"
    };

    // 4. Send to Paymaster
    try {
        const response = await axios.post(`${PAYMASTER_API_URL}/paymaster/sponsor`, {
            chainId: 56,
            userOp: userOp,
            entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
        });

        console.log("Response:", JSON.stringify(response.data, null, 2));

        if (response.data.radrsFee === "0" || response.data.fee === "0") {
             console.log("SUCCESS: Fee is 0. executeBatch detected correctly.");
        } else {
             console.error("FAILURE: Fee is NOT 0. Detection failed.");
        }

    } catch (error: any) {
        console.error("Error Message:", error.message);
        if (error.response) {
            console.error("Response Status:", error.response.status);
            console.error("Response Data:", error.response.data);
        } else if (error.request) {
            console.error("No Response Received");
        } else {
            console.error("Error Config:", error.config);
        }
    }
}

main();
