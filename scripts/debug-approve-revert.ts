
import { ethers } from "ethers";
import axios from "axios";
import "dotenv/config";

const PAYMASTER_API = "http://localhost:3000/paymaster/sponsor";
const RADRS_TOKEN = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
const PAYMASTER_ADDRESS = "0x3ca3Da0fA3C50365847EaA4Db57eAdF8B083Aa43";
const USER_AA = "0x9ADBbea6886A7DD09BF6Ddb26730F54772a3e946";

async function main() {
    console.log("Debugging Approve Detection Logic...");

    // 1. Construct CallData for RADRS.approve(Paymaster, MAX)
    const erc20Interface = new ethers.Interface([
        "function approve(address spender, uint256 amount)"
    ]);
    const innerCallData = erc20Interface.encodeFunctionData("approve", [
        PAYMASTER_ADDRESS,
        ethers.MaxUint256
    ]);

    // 2. Construct Execute CallData (SimpleAccount.execute)
    const accountInterface = new ethers.Interface([
        "function execute(address dest, uint256 value, bytes calldata func)"
    ]);
    const userOpCallData = accountInterface.encodeFunctionData("execute", [
        RADRS_TOKEN,
        0,
        innerCallData
    ]);

    console.log("Constructed CallData:", userOpCallData);

    // 3. Mock UserOp
    const userOp = {
        sender: USER_AA,
        nonce: "0x0",
        initCode: "0x",
        callData: userOpCallData,
        callGasLimit: "0x10000",
        verificationGasLimit: "0x10000",
        preVerificationGas: "0x1000",
        maxFeePerGas: "0x100000000",
        maxPriorityFeePerGas: "0x100000000",
        signature: "0x"
    };

    try {
        console.log("Sending to Backend...");
        const response = await axios.post(PAYMASTER_API, {
            chainId: 56,
            userOp: userOp,
            entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
        });

        const data = response.data;
        console.log("Response:", data);

        if (BigInt(data.fee || data.radrsFee) === 0n) {
            console.log("✅ SUCCESS: Backend detected Approve and set Fee to 0.");
        } else {
            console.log("❌ FAILURE: Backend did NOT set Fee to 0. Fee:", data.fee);
        }

        // 4. Simulate on Chain
        console.log("\nSimulating on Chain...");
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "https://bsc-dataseed1.binance.org");
        const entryPointAddress = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
        const entryPointAbi = [
            "function simulateValidation(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp) external view"
        ];
        const entryPoint = new ethers.Contract(entryPointAddress, entryPointAbi, provider);

        // Update UserOp with Paymaster Data
        const signedUserOp = {
            ...userOp,
            paymasterAndData: data.paymasterAndData
        };

        try {
            // simulateValidation ALWAYS reverts (with ValidationResult or FailedOp).
            // We expect it to revert with ValidationResult (which means success in EP 0.6, but 0.7 uses return?)
            // EntryPoint 0.7: simulateValidation returns (ValidationResult, StakeInfo). It is a VIEW function but often reverts to avoid gas?
            // Wait, EP 0.7 `simulateValidation` is `external view`? No, it's `external`.
            // But standard behavior is to Revert with result.
            // Let's call it.
            await entryPoint.simulateValidation.staticCall(signedUserOp);
            console.log("✅ Simulation Result: Success (No Revert)"); 
        } catch (e: any) {
            // Check for AA33
            const message = e.message || "";
            if (message.includes("AA33")) {
                console.log(`❌ FAILED with Paymaster Error: ${message}`);
                // Try to extract reason
                const match = message.match(/AA33: (.*?)["']?$/);
                if (match) {
                    console.log(`   👉 REASON: ${match[1]}`);
                }
            } else if (message.includes("ValidationResult")) {
                 console.log("✅ Simulation Result: Success (ValidationResult caught)");
            } else {
                console.log(`❌ FAILED with Unknown Error:`, e);
                // Log full error for deep debug
                // console.log(JSON.stringify(e, null, 2));
            }
        }

    } catch (e: any) {
        console.error("Error calling backend:", e.response ? e.response.data : e.message);
    }
}

main();
