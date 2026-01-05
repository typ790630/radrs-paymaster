import express from 'express';
import cors from 'cors';
import { CONFIG } from './config.js';
import { createPublicClient, http, hexToBigInt, encodeAbiParameters, parseAbiParameters, decodeFunctionData, parseAbi, isAddressEqual, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
const app = express();
app.use(cors());
app.use(express.json());
// Setup Viem Client
const publicClient = createPublicClient({
    chain: bsc,
    transport: http(CONFIG.RPC_URL)
});
// Setup Signer
let signer;
if (CONFIG.PAYMASTER_SIGNER_KEY) {
    signer = privateKeyToAccount(CONFIG.PAYMASTER_SIGNER_KEY);
    console.log("Paymaster Signer Address:", signer.address);
}
else {
    console.warn("WARNING: PAYMASTER_SIGNER_KEY not set. Sponsor signing will fail.");
}
// Helper to calculate fees
function calculateFees(userOp) {
    const { callGasLimit, verificationGasLimit, preVerificationGas, maxFeePerGas } = userOp;
    // Parse hex to bigint
    const cgl = hexToBigInt(callGasLimit);
    const vgl = hexToBigInt(verificationGasLimit);
    const pvg = hexToBigInt(preVerificationGas);
    const mfg = hexToBigInt(maxFeePerGas);
    // Calculate estimated BNB cost
    // Total Gas Limit = call + verification + preVerification
    const totalGasLimit = cgl + vgl + pvg;
    const gasCostBNBWei = totalGasLimit * mfg;
    // Convert to BNB (1e18)
    const gasCostBNB = Number(gasCostBNBWei) / 1e18;
    // Calculate RADRS Fee
    // radrsFee = gasCostBNB / priceRADRSinBNB * 1.2
    let radrsFeeRaw = (gasCostBNB / CONFIG.PRICE_RADRS_BNB) * CONFIG.MARKUP;
    // Check for Approve(Paymaster) to make it FREE
    try {
        const callDataHex = userOp.callData;
        let isApprove = false;
        console.log(`[DEBUG SPONSOR] sender: ${userOp.sender}`);
        console.log(`[DEBUG SPONSOR] callData: ${callDataHex}`);
        const simpleAccountAbi = parseAbi([
            'function execute(address dest, uint256 value, bytes func)',
            'function executeBatch(address[] dest, uint256[] value, bytes[] func)'
        ]);
        const erc20Abi = parseAbi([
            'function approve(address spender, uint256 amount)'
        ]);
        let innerCalls = [];
        // Try to decode as execute or executeBatch
        try {
            const decodedOuter = decodeFunctionData({
                abi: simpleAccountAbi,
                data: callDataHex
            });
            if (decodedOuter.functionName === 'execute') {
                innerCalls.push({
                    dest: decodedOuter.args[0],
                    value: decodedOuter.args[1],
                    data: decodedOuter.args[2]
                });
            }
            else if (decodedOuter.functionName === 'executeBatch') {
                const dests = decodedOuter.args[0];
                const values = decodedOuter.args[1];
                const datas = decodedOuter.args[2];
                if (dests && values && datas && dests.length === values.length) {
                    for (let i = 0; i < dests.length; i++) {
                        innerCalls.push({
                            dest: dests[i],
                            value: values[i],
                            data: datas[i]
                        });
                    }
                }
            }
        }
        catch (decodeError) {
            console.log(`[DEBUG SPONSOR] Failed to decode outer callData: ${decodeError}`);
            // Fallback: Check if it's a direct execute(address, uint256, bytes) with different signature?
            // Or maybe it's a direct call to 'approve'? (Unlikely for AA but good to check)
        }
        for (const call of innerCalls) {
            const isRadrs = isAddressEqual(call.dest, CONFIG.RADRS_TOKEN_ADDRESS);
            let isApproveFunc = false;
            let spender = null;
            // Check for 'approve(address,uint256)' selector: 0x095ea7b3
            if (call.data.startsWith('0x095ea7b3')) {
                try {
                    const decodedInner = decodeFunctionData({
                        abi: erc20Abi,
                        data: call.data
                    });
                    if (decodedInner.functionName === 'approve') {
                        isApproveFunc = true;
                        spender = decodedInner.args[0];
                    }
                }
                catch (e) { }
            }
            if (isRadrs && isApproveFunc && spender) {
                const spenderLower = spender.toLowerCase();
                const paymasterLower = CONFIG.PAYMASTER_ADDRESS.toLowerCase();
                if (spenderLower === paymasterLower) {
                    isApprove = true;
                }
            }
        }
        console.log(`[DEBUG SPONSOR] Final Decision isApprove: ${isApprove}`);
        if (isApprove) {
            radrsFeeRaw = 0;
            console.log(`[DEBUG SPONSOR] radrsFee set to 0`);
        }
        else {
            console.log(`[DEBUG SPONSOR] radrsFee: ${radrsFeeRaw}`);
        }
    }
    catch (e) {
        console.warn("Failed to parse callData for optimization", e);
    }
    // Convert to RADRS Wei (1e18)
    const radrsFeeWei = BigInt(Math.floor(radrsFeeRaw * 1e18));
    return {
        gasCostBNB: gasCostBNB.toFixed(6),
        radrsFee: radrsFeeWei.toString()
    };
}
// POST /paymaster/quote
app.post('/paymaster/quote', async (req, res) => {
    try {
        const { chainId, userOp } = req.body;
        if (chainId !== CONFIG.CHAIN_ID) {
            return res.status(400).json({ error: "Invalid Chain ID" });
        }
        const fees = calculateFees(userOp);
        res.json(fees);
    }
    catch (error) {
        console.error("Quote Error:", error);
        res.status(500).json({ error: error.message });
    }
});
// POST /paymaster/sponsor
app.post('/paymaster/sponsor', async (req, res) => {
    try {
        const { chainId, userOp, entryPoint } = req.body; // userOp might need to be sanitized
        if (chainId !== CONFIG.CHAIN_ID) {
            return res.status(400).json({ error: "Invalid Chain ID" });
        }
        if (!signer) {
            return res.status(500).json({ error: "Signer not configured" });
        }
        // 1. Calculate Fees (Logic now includes Approve detection)
        let { radrsFee, gasCostBNB } = calculateFees(userOp);
        // Security Check for Free Ops (Approve)
        if (radrsFee === "0") {
            try {
                const sender = userOp.sender;
                // Check Balance
                const balance = await publicClient.readContract({
                    address: CONFIG.RADRS_TOKEN_ADDRESS,
                    abi: [{
                            type: 'function',
                            name: 'balanceOf',
                            stateMutability: 'view',
                            inputs: [{ name: 'account', type: 'address' }],
                            outputs: [{ type: 'uint256' }]
                        }],
                    functionName: 'balanceOf',
                    args: [sender]
                });
                const minInitRadrs = 100n * 10n ** 18n; // Min 100 RADRS required to sponsor approve
                if (balance < minInitRadrs) {
                    console.warn(`Sponsor Rejected: Balance ${balance} < ${minInitRadrs}`);
                    // Return bilingual error for frontend display
                    return res.status(400).json({ error: "Insufficient RADRS balance (Need 100+). 余额不足 (需要 100+ RADRS)." });
                }
                console.log(`Sponsor Approved: Balance ${balance} >= ${minInitRadrs}`);
            }
            catch (e) {
                console.error("Balance check failed:", e);
                // If check fails, do we block? Yes, safer.
                return res.status(500).json({ error: "Failed to verify RADRS balance" });
            }
        }
        // 2. Prepare Sponsor Data
        const validUntil = Math.floor(Date.now() / 1000) + 3600; // 1 Hour
        const validAfter = 0;
        const feeToken = getAddress(CONFIG.RADRS_TOKEN_ADDRESS);
        const feeAmount = BigInt(radrsFee);
        const receiver = getAddress(CONFIG.RADRS_FEE_RECEIVER);
        const sender = getAddress(userOp.sender);
        // 3. EIP-712 Signing
        // Domain
        const domain = {
            name: 'RadrsPaymaster',
            version: '1',
            chainId: CONFIG.CHAIN_ID,
            verifyingContract: CONFIG.PAYMASTER_ADDRESS,
        };
        const message = {
            feeToken,
            feeAmount,
            receiver,
            validUntil,
            validAfter,
            sender
        };
        const typesWithSender = {
            Sponsor: [
                { name: 'feeToken', type: 'address' },
                { name: 'feeAmount', type: 'uint256' },
                { name: 'receiver', type: 'address' },
                { name: 'validUntil', type: 'uint48' },
                { name: 'validAfter', type: 'uint48' },
                { name: 'sender', type: 'address' }
            ]
        };
        const signature = await signer.signTypedData({
            domain,
            types: typesWithSender,
            primaryType: 'Sponsor',
            message
        });
        // 4. Encode paymasterAndData
        // Format: paymasterAddress + abi.encode(feeToken, feeAmount, receiver, validUntil, validAfter, signature)
        // We prepend the Paymaster Address here.
        // The Client MUST strip it if using EntryPoint v0.7 separate fields, 
        // OR use it to verify the address matches.
        const encodedData = encodeAbiParameters(parseAbiParameters('address, uint256, address, uint48, uint48, bytes'), [feeToken, feeAmount, receiver, validUntil, validAfter, signature]);
        const paymasterAndData = `${CONFIG.PAYMASTER_ADDRESS}${encodedData.slice(2)}`;
        console.log(`[DEBUG SPONSOR] Generated paymasterAndData length: ${paymasterAndData.length}`);
        console.log(`[DEBUG SPONSOR] Signature: ${signature}`);
        console.log(`[DEBUG SPONSOR] ValidUntil: ${validUntil}`);
        console.log(`[DEBUG SPONSOR] FeeAmount: ${feeAmount}`);
        // Return standardized response for frontend
        res.json({
            paymasterAndData,
            fee: radrsFee, // Standardized as string
            validUntil,
            radrsFee: radrsFee, // Keep for backward compatibility
            gasCostBNB
        });
    }
    catch (error) {
        console.error("Sponsor Error:", error);
        res.status(500).json({ error: error.message });
    }
});
app.listen(Number(CONFIG.PORT), '0.0.0.0', () => {
    console.log(`Paymaster Service running on port ${CONFIG.PORT} (0.0.0.0)`);
    console.log(`Paymaster Address (Config): ${CONFIG.PAYMASTER_ADDRESS}`);
});
// Vercel Serverless Export
// @ts-ignore
module.exports = app;
//# sourceMappingURL=index.js.map