
import { ethers } from "ethers";
import { CONFIG } from "../server/src/config.js";
import axios from "axios";

const { ENTRY_POINT_ADDRESS, RADRS_TOKEN_ADDRESS, PAYMASTER_ADDRESS, PORT, CHAIN_ID } = CONFIG;
const PAYMASTER_API_URL = `http://localhost:${PORT}`;

// User Address
const SENDER_ADDRESS = "0x9ADBbea6886A7DD09BF6Ddb26730F54772a3e946";

async function main() {
    console.log("Debug: Constructing Approve UserOp...");

    const provider = new ethers.JsonRpcProvider("https://bsc-dataseed1.binance.org");

    // 1. Construct CallData for Approve
    // RADRS.approve(PAYMASTER, MAX_UINT256)
    const erc20Interface = new ethers.Interface([
        "function approve(address spender, uint256 amount) returns (bool)"
    ]);
    const innerCallData = erc20Interface.encodeFunctionData("approve", [
        PAYMASTER_ADDRESS,
        ethers.MaxUint256
    ]);

    // SimpleAccount.execute(RADRS, 0, innerCallData)
    const accountInterface = new ethers.Interface([
        "function execute(address dest, uint256 value, bytes func)"
    ]);
    const callData = accountInterface.encodeFunctionData("execute", [
        RADRS_TOKEN_ADDRESS,
        0,
        innerCallData
    ]);

    console.log("CallData constructed:", callData);

    // 2. Create Dummy UserOp (partial)
    // We need nonce, initCode, etc.
    // Fetch nonce from EntryPoint
    const entryPointAbi = [
        "function getNonce(address sender, uint192 key) view returns (uint256)"
    ];
    const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, entryPointAbi, provider);
    const nonce = await entryPoint.getNonce(SENDER_ADDRESS, 0);
    console.log("Nonce:", nonce.toString());

    const userOp = {
        sender: SENDER_ADDRESS,
        nonce: "0x" + nonce.toString(16),
        initCode: "0x",
        callData: callData,
        callGasLimit: "0x" + (100000).toString(16),
        verificationGasLimit: "0x" + (100000).toString(16),
        preVerificationGas: "0x" + (50000).toString(16),
        maxFeePerGas: "0x" + (3000000000).toString(16),
        maxPriorityFeePerGas: "0x" + (3000000000).toString(16),
        paymasterAndData: "0x",
        signature: "0x" // Dummy signature
    };

    // 3. Request Sponsorship from Backend
    console.log("Requesting Sponsorship from Backend...");
    try {
        const response = await axios.post(`${PAYMASTER_API_URL}/paymaster/sponsor`, {
            chainId: 56,
            userOp: userOp,
            entryPoint: ENTRY_POINT_ADDRESS
        });

        const data = response.data;
        console.log("Sponsorship Response:", JSON.stringify(data, null, 2));

        if (data.paymasterAndData) {
            // Decode paymasterAndData to verify feeAmount
            // Format: paymaster(20) + feeToken(32) + feeAmount(32) + ...
            const paymasterAndData = data.paymasterAndData;
            const feeTokenHex = "0x" + paymasterAndData.slice(42, 106); // 20 bytes (40 chars) + 32 bytes (64 chars) -> wait.
            // paymasterAndData is hex string.
            // 0x + 20 bytes (40 chars) = paymaster address
            // Next 32 bytes (64 chars) = feeToken
            // Next 32 bytes (64 chars) = feeAmount
            
            const paymasterAddr = paymasterAndData.slice(0, 42);
            const feeToken = "0x" + paymasterAndData.slice(42, 106);
            const feeAmountHex = "0x" + paymasterAndData.slice(106, 170);
            
            const feeAmount = BigInt(feeAmountHex);
            console.log(`Decoded Fee Amount: ${feeAmount} RADRS`);
            
            if (feeAmount === 0n) {
                console.log("SUCCESS: Fee is 0! Approve is sponsored for free.");
            } else {
                console.error("FAILURE: Fee is NOT 0. Logic failed.");
            }
        }

    } catch (error: any) {
        console.error("Sponsorship Failed:", error.response ? error.response.data : error.message);
    }
}

main();
