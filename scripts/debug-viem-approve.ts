
import { encodeFunctionData, parseAbi, pad } from 'viem';
import axios from 'axios';
import { CONFIG } from "../server/src/config.js";

const { ENTRY_POINT_ADDRESS, RADRS_TOKEN_ADDRESS, PAYMASTER_ADDRESS, CHAIN_ID } = CONFIG;
const PAYMASTER_API_URL = `http://localhost:${CONFIG.PORT}`;

const RADRS_TOKEN = RADRS_TOKEN_ADDRESS;

async function main() {
    console.log("Debug: Constructing Approve UserOp with VIEM...");

    // 1. Construct Inner CallData (Approve)
    const erc20Abi = parseAbi([
        "function approve(address spender, uint256 amount) returns (bool)"
    ]);
    
    const innerCallData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [PAYMASTER_ADDRESS as `0x${string}`, BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935")] // MaxUint256
    });

    console.log("Inner CallData:", innerCallData);

    // 2. Construct Outer CallData (ExecuteBatch)
    const accountAbi = parseAbi([
        "function executeBatch(address[] dest, uint256[] value, bytes[] func)"
    ]);

    const callData = encodeFunctionData({
        abi: accountAbi,
        functionName: "executeBatch",
        args: [
            [RADRS_TOKEN as `0x${string}`], 
            [0n], 
            [innerCallData]
        ]
    });

    console.log("UserOp CallData (Batch):", callData);

    // 3. Send to Backend
    const userOp = {
        sender: "0x9ADBbea6886A7DD09BF6Ddb26730F54772a3e946",
        nonce: "0x0",
        initCode: "0x",
        callData: callData,
        callGasLimit: "0x10000",
        verificationGasLimit: "0x10000",
        preVerificationGas: "0x10000",
        maxFeePerGas: "0x10000",
        maxPriorityFeePerGas: "0x10000",
        paymasterAndData: "0x",
        signature: "0x"
    };

    try {
        const response = await axios.post('http://localhost:3000/paymaster/sponsor', {
            chainId: 56,
            userOp: userOp,
            entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
        });
        
        console.log("Response:", JSON.stringify(response.data, null, 2));
    } catch (e: any) {
        console.error("Error:", e.response?.data || e.message);
    }
}

main();
