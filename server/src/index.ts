
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// import dotenv from 'dotenv'; // REMOVE dotenv entirely for Vercel

// Load .env manually for Vercel if needed
/*
try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // dotenv.config({ path: join(__dirname, '../.env') });
} catch (e) {
    console.log("Environment loading failed (might be in Vercel runtime)", e);
}
*/

import express from 'express';
import cors from 'cors';
import { CONFIG } from './config.js';
import { createPublicClient, http, hexToBigInt, encodeAbiParameters, parseAbiParameters, type Hex, type LocalAccount, createWalletClient, decodeFunctionData, parseAbi, isAddressEqual, getAddress } from 'viem';
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
let signer: LocalAccount;
if (CONFIG.PAYMASTER_SIGNER_KEY) {
    signer = privateKeyToAccount(CONFIG.PAYMASTER_SIGNER_KEY);
    console.log("Paymaster Signer Address:", signer.address);
} else {
    console.warn("WARNING: PAYMASTER_SIGNER_KEY not set. Sponsor signing will fail.");
}

// Async wrapper to fetch activation status
async function checkActivation(sender: Hex): Promise<boolean> {
    try {
        const isActivated = await publicClient.readContract({
            address: CONFIG.PAYMASTER_ADDRESS as Hex,
            abi: [{
                type: 'function',
                name: 'isActivated',
                stateMutability: 'view',
                inputs: [{ name: 'account', type: 'address' }],
                outputs: [{ type: 'bool' }]
            }],
            functionName: 'isActivated',
            args: [sender]
        }) as boolean;
        return isActivated;
    } catch (e) {
        console.warn("Failed to check activation status, defaulting to true (charged)", e);
        return true; 
    }
}

// Updated calculateFees to accept activation status
async function calculateFeesAsync(userOp: any) {
    const { callGasLimit, verificationGasLimit, preVerificationGas, maxFeePerGas } = userOp;
    
    const cgl = callGasLimit ? hexToBigInt(callGasLimit) : 0n;
    const vgl = verificationGasLimit ? hexToBigInt(verificationGasLimit) : 0n;
    const pvg = preVerificationGas ? hexToBigInt(preVerificationGas) : 0n;
    const mfg = maxFeePerGas ? hexToBigInt(maxFeePerGas) : 0n;

    const totalGasLimit = cgl + vgl + pvg;
    const gasCostBNBWei = totalGasLimit * mfg;
    const gasCostBNB = Number(gasCostBNBWei) / 1e18;

    // Base RADRS Cost (Real Cost)
    let realRadrsCostRaw = (gasCostBNB / CONFIG.PRICE_RADRS_BNB);
    
    // Check Activation
    const isActivated = await checkActivation(userOp.sender as Hex);
    
    let finalRadrsFeeRaw = 0;
    
    if (!isActivated) {
        // First time free
        finalRadrsFeeRaw = 0;
        console.log(`[Fee] User ${userOp.sender} not activated -> Free`);
    } else {
        // Charged at Markup (e.g. 1.2x)
        // RADRS_SERVICE_FEE_BPS = 2000 => 20% => 1.2x
        const markup = 1 + (CONFIG.RADRS_SERVICE_FEE_BPS / 10000);
        finalRadrsFeeRaw = realRadrsCostRaw * markup;
        console.log(`[Fee] User ${userOp.sender} activated -> Charged ${markup}x`);
    }

    // Convert to BigInt Wei
    const realRadrsCostWei = BigInt(Math.floor(realRadrsCostRaw * 1e18));
    const finalRadrsFeeWei = BigInt(Math.floor(finalRadrsFeeRaw * 1e18));

    return {
        gasCostBNB: gasCostBNB.toFixed(6),
        radrsFee: finalRadrsFeeWei.toString(),
        realRadrsCost: realRadrsCostWei.toString(), // Keep this for backend logic
        feeRate: isActivated ? 1.2 : 0, 
        activated: isActivated
    };
}

// POST /paymaster/quote
const handleQuote = async (req: express.Request, res: express.Response) => {
    try {
        const { chainId, userOp } = req.body;
        
        if (chainId !== CONFIG.CHAIN_ID) {
            return res.status(400).json({ error: "Invalid Chain ID" });
        }

        const fees = await calculateFeesAsync(userOp);
        res.json(fees);
    } catch (error: any) {
        console.error("Quote Error:", error);
        res.status(500).json({ error: error.message });
    }
};

app.post('/paymaster/quote', handleQuote);
app.post('/api/paymaster/quote', handleQuote); // Add Vercel compatible route

// Handler for Sponsor Request
const handleSponsor = async (req: express.Request, res: express.Response) => {
    try {
        const { chainId, userOp, entryPoint } = req.body; // userOp might need to be sanitized

        if (chainId !== CONFIG.CHAIN_ID) {
            return res.status(400).json({ error: "Invalid Chain ID" });
        }

        if (!signer) {
            return res.status(500).json({ error: "Signer not configured" });
        }

        // 1. Calculate Fees (includes Activation Check)
        let { radrsFee, gasCostBNB, realRadrsCost, activated } = await calculateFeesAsync(userOp);

        // Security Check for Free Ops (Approve) or Activation
        // If fee is 0 (or activated is false), we verify balance just to be safe
        // BUT Requirement: "Skip balance check if activated=false"
        
        if (!activated) {
             console.log(`[Sponsor] New User ${userOp.sender} -> Skip Balance Check`);
             // Do NOT check balance.
        } else if (radrsFee === "0") {
             // Existing logic for other 0 fee cases (e.g. whitelist?)
             // ...
        } else {
             // Normal Paid User -> Check Balance & Allowance
             // Actually, contract checks this too, but failing early is nice.
             // But we are lazy here, let contract handle it to ensure atomicity.
             // We can check just to provide better error message.
        }
        
        if (radrsFee === "0" && activated) {
             // Only run this legacy check if it's supposed to be free but user IS activated (e.g. whitelist logic from V2)
             // For V3, radrsFee is 0 ONLY if !activated.
             // So this block might be redundant or unreachable in V3 logic unless we add other free conditions.
             // Let's keep it safe.
             try {
                 const sender = userOp.sender as Hex;
                 // Check Balance
                 const balance = await publicClient.readContract({
                     address: CONFIG.RADRS_TOKEN_ADDRESS as Hex,
                     abi: [{
                        type: 'function',
                        name: 'balanceOf',
                        stateMutability: 'view',
                        inputs: [{ name: 'account', type: 'address' }],
                        outputs: [{ type: 'uint256' }]
                     }],
                     functionName: 'balanceOf',
                     args: [sender]
                 }) as bigint;
                 
                 const minInitRadrs = 100n * 10n**18n; // Min 100 RADRS required
                 
                 if (balance < minInitRadrs) {
                     console.warn(`Sponsor Rejected: Balance ${balance} < ${minInitRadrs}`);
                     return res.status(400).json({ error: "Insufficient RADRS balance (Need 100+). 余额不足 (需要 100+ RADRS)." });
                 }
                 console.log(`Sponsor Approved: Balance ${balance} >= ${minInitRadrs}`);
             } catch (e) {
                 console.error("Balance check failed:", e);
                 return res.status(500).json({ error: "Failed to verify RADRS balance" });
             }
        }

        // 2. Prepare Sponsor Data
        const validUntil = Math.floor(Date.now() / 1000) + 3600; // 1 Hour
        const validAfter = 0;
        const feeToken = getAddress(CONFIG.RADRS_TOKEN_ADDRESS);
        
        // IMPORTANT: We now sign the REAL cost (base cost), not the final fee.
        // The contract will apply the markup logic based on activation status.
        // Wait, Paymaster V3 implementation:
        // "We will sign: (feeToken, realRadrsCost, receiver, validUntil, validAfter, payer)"
        // "Check Balance... require(balance >= chargeAmount)" -> chargeAmount depends on isActivated
        // So we sign 'realRadrsCost'.
        
        const feeAmountToSign = BigInt(realRadrsCost); 
        
        const receiver = getAddress(CONFIG.RADRS_FEE_COLLECTOR); // Updated to Collector
        const sender = getAddress(userOp.sender);
        
        // Payer Logic
        const payerInput = req.body.payer;
        const payer = payerInput ? getAddress(payerInput) : sender;

        // 3. EIP-712 Signing
        const domain = {
            name: 'RadrsPaymasterV3', // Updated Name V3
            version: '1',
            chainId: Number(CONFIG.CHAIN_ID),
            verifyingContract: CONFIG.PAYMASTER_ADDRESS as Hex,
        } as const;

        const message = {
            feeToken,
            feeAmount: feeAmountToSign, // Signing REAL cost
            receiver,
            validUntil,
            validAfter,
            payer
        };

        const typesWithPayer = {
            Sponsor: [
                { name: 'feeToken', type: 'address' },
                { name: 'feeAmount', type: 'uint256' },
                { name: 'receiver', type: 'address' },
                { name: 'validUntil', type: 'uint48' },
                { name: 'validAfter', type: 'uint48' },
                { name: 'payer', type: 'address' }
            ]
        } as const;

        const signature = await signer.signTypedData({
            domain,
            types: typesWithPayer,
            primaryType: 'Sponsor',
            message
        });

        // 4. Encode paymasterAndData
        const encodedData = encodeAbiParameters(
            parseAbiParameters('address, uint256, address, uint48, uint48, address, bytes'),
            [feeToken, feeAmountToSign, receiver, validUntil, validAfter, payer, signature]
        );

        const paymasterAndData = `${CONFIG.PAYMASTER_ADDRESS}${encodedData.slice(2)}` as Hex;

        console.log(`[DEBUG SPONSOR] Generated paymasterAndData length: ${paymasterAndData.length}`);
        console.log(`[DEBUG SPONSOR] Signature: ${signature}`);
        console.log(`[DEBUG SPONSOR] FeeAmountSigned (Real): ${feeAmountToSign}`);
        console.log(`[DEBUG SPONSOR] FeeAmountCharged (Est): ${radrsFee}`);

        // Return standardized response for frontend
        res.json({
            paymasterAndData,
            fee: radrsFee, // Frontend sees the final fee (0 or 1.2x)
            validUntil,
            radrsFee: radrsFee, 
            gasCostBNB
        });

    } catch (error: any) {
        console.error("Sponsor Error:", error);
        res.status(500).json({ error: error.message });
    }
};

// POST /api/paymaster/sponsor (New path for compatibility)
app.post('/api/paymaster/sponsor', handleSponsor);

// GET /api/paymaster/sponsor (Health check for browser)
app.get('/api/paymaster/sponsor', (req, res) => {
    res.json({ status: "ok", route: "/api/paymaster/sponsor", method: "GET" });
});

// POST /paymaster/sponsor (Legacy path)
app.post('/paymaster/sponsor', handleSponsor);

app.listen(Number(CONFIG.PORT), '0.0.0.0', () => {
    console.log(`Paymaster Service running on port ${CONFIG.PORT} (0.0.0.0)`);
    console.log(`[RADRS Paymaster] Using PAYMASTER_ADDRESS: ${CONFIG.PAYMASTER_ADDRESS}`);
});

// Vercel Serverless Export
export default app;
