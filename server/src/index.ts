
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
import { CONFIG } from './config.js'; // Ensure we keep .js extension for ESM resolution in some setups, but usually ts-node handles it. 
// If it fails after deleting .js files, we might need to remove .js extension or configure ts-node.
// Let's try removing .js extension first as we are in ts-node context.
import { createPublicClient, http, hexToBigInt, encodeAbiParameters, parseAbiParameters, type Hex, type LocalAccount, createWalletClient, decodeFunctionData, parseAbi, isAddressEqual, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import axios from 'axios'; // For price fetching

const app = express();
app.use(cors());
app.use(express.json());

// Setup Viem Client
const publicClient = createPublicClient({
    chain: bsc,
    transport: http(CONFIG.RPC_URL)
});

// Price Cache
let cachedPrice = {
    price: 0,
    timestamp: 0
};

// Function to fetch real-time BNB Price
async function getBNBPrice(): Promise<number> {
    const now = Date.now();
    // Cache for 60 seconds
    if (cachedPrice.price > 0 && (now - cachedPrice.timestamp) < 60000) {
        return cachedPrice.price;
    }

    try {
        console.log("Fetching real-time BNB price...");
        // Use Binance Public API or CoinGecko
        const response = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT');
        if (response.data && response.data.price) {
            const price = parseFloat(response.data.price);
            cachedPrice = { price, timestamp: now };
            console.log(`Updated BNB Price: $${price}`);
            return price;
        }
    } catch (e) {
        console.error("Failed to fetch BNB price, using fallback:", e);
    }
    
    return 650; // Fallback to $650 if API fails
}

// Setup Signer (Force New Key for Emergency Fix)
// 0x1e8ace9044b9940f973c38b97c581c58e1c641caf7ae39889e50e0db204f42a2
const EMERGENCY_SIGNER_KEY = "0x1e8ace9044b9940f973c38b97c581c58e1c641caf7ae39889e50e0db204f42a2";
// const EMERGENCY_PAYMASTER_ADDRESS = "0xD0D46B98dFf2ee93Dfe708d4434f180383B2B939"; 

let signer: LocalAccount;
// Force use of the emergency key
signer = privateKeyToAccount(EMERGENCY_SIGNER_KEY as Hex);
console.log("Paymaster Signer Address (FORCED):", signer.address);

// Override CONFIG for Paymaster Address globally in this scope
CONFIG.PAYMASTER_ADDRESS = "0xD0D46B98dFf2ee93Dfe708d4434f180383B2B939";
console.log("Paymaster Address (FORCED):", CONFIG.PAYMASTER_ADDRESS);

/*
if (CONFIG.PAYMASTER_SIGNER_KEY) {
    signer = privateKeyToAccount(CONFIG.PAYMASTER_SIGNER_KEY);
    console.log("Paymaster Signer Address:", signer.address);
} else {
    console.warn("WARNING: PAYMASTER_SIGNER_KEY not set. Sponsor signing will fail.");
}
*/

// Safe Address Helper
    const safeAddress = (addr: any): `0x${string}` => {
        try {
            return getAddress(addr);
        } catch {
            // If validation fails (e.g. undefined, null, invalid hex), return a fallback or throw a clean error
            // For sender/payer, we might want to throw if it's critical, or return a zero address if optional
            // But getAddress throwing is usually what we want, just cleaner.
            // Let's return a Zero Address if invalid to prevent crash, but log warning.
            console.warn(`[WARNING] Invalid address: ${addr}, defaulting to Zero Address`);
            return "0x0000000000000000000000000000000000000000"; 
        }
    };

    // Async wrapper to fetch activation status
    async function checkActivation(sender: any): Promise<boolean> {
        try {
            const validSender = safeAddress(sender);
            if (validSender === "0x0000000000000000000000000000000000000000") return true; // Default to charged if invalid

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

// Function to fetch real-time RADRS Price from PancakeSwap (via DexScreener or similar API)
async function getRadrsPrice(): Promise<number> {
    const now = Date.now();
    // Use separate cache key logic if needed, or simple var
    // Let's implement a simple cache for RADRS too
    // Note: Reusing cachedPrice object structure for simplicity or create new one.
    // Let's make a new cache object for RADRS
    if (global.cachedRadrsPrice && (now - global.cachedRadrsPrice.timestamp) < 60000) {
        return global.cachedRadrsPrice.price;
    }

    try {
        console.log("Fetching real-time RADRS price from PancakeSwap/DexScreener...");
        // DexScreener API is free and reliable for PancakeSwap tokens
        const pairAddress = CONFIG.RADRS_TOKEN_ADDRESS; // Usually token address works for search
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${CONFIG.RADRS_TOKEN_ADDRESS}`);
        
        if (response.data && response.data.pairs && response.data.pairs.length > 0) {
            // Find the pair on BSC (chainId: 56 or 'bsc')
            const pair = response.data.pairs.find((p: any) => p.chainId === 'bsc' && p.dexId === 'pancakeswap');
            if (pair) {
                const price = parseFloat(pair.priceUsd);
                global.cachedRadrsPrice = { price, timestamp: now };
                console.log(`Updated RADRS Price: $${price}`);
                return price;
            }
        }
        console.warn("Could not find RADRS price on DexScreener, using fallback.");
    } catch (e) {
        console.error("Failed to fetch RADRS price:", e);
    }
    
    return 2.17; // Fallback to fixed price
}

// Global cache for RADRS (since I can't easily add top-level var with search-replace in middle of file)
declare global {
    var cachedRadrsPrice: { price: number, timestamp: number };
}

// Updated calculateFees to accept activation status
async function calculateFeesAsync(userOp: any) {
    const { callGasLimit, verificationGasLimit, preVerificationGas, maxFeePerGas } = userOp;
    
    // Safe BigInt Helper
    const safeBigInt = (val: any, defaultVal: bigint = 0n): bigint => {
        if (!val || val === "0x") return defaultVal;
        try {
            return hexToBigInt(val);
        } catch {
            try {
                return BigInt(val);
            } catch {
                return defaultVal;
            }
        }
    };

    const cgl = safeBigInt(callGasLimit);
    const vgl = safeBigInt(verificationGasLimit);
    const pvg = safeBigInt(preVerificationGas);
    const mfg = safeBigInt(maxFeePerGas);

    // --- FEE OPTIMIZATION ---
    // Cap the gas limits used for FEE CALCULATION to prevent overcharging.
    // The actual execution will still use the high limits from the UserOp for safety.
    // Caps: CGL 250k (Transfer~30k), VGL 200k (ECDSA~80k), PVG 100k (Base~50k)
    const CGL_CAP = 250000n;
    const VGL_CAP = 200000n;
    const PVG_CAP = 100000n;

    const cglForFee = cgl > CGL_CAP ? CGL_CAP : cgl;
    const vglForFee = vgl > VGL_CAP ? VGL_CAP : vgl;
    const pvgForFee = pvg > PVG_CAP ? PVG_CAP : pvg;

    const totalGasLimit = cglForFee + vglForFee + pvgForFee;
    const gasCostBNBWei = totalGasLimit * mfg;
    // Prevent division by zero or invalid math
    const gasCostBNB = Number(gasCostBNBWei) / 1e18;

    // Fetch Real-time BNB Price
    const bnbPrice = await getBNBPrice();
    // Fetch Real-time RADRS Price (PancakeSwap via DexScreener)
    const radrsPriceUsd = await getRadrsPrice();
    
    // Calculate Price Ratio: 1 RADRS = (RADRS_PRICE / BNB_PRICE) BNB
    const priceRadrsBnb = radrsPriceUsd / bnbPrice;
    
    // Base RADRS Cost (Real Cost)
    // let realRadrsCostRaw = (gasCostBNB / priceRadrsBnb);
    
    // Simplified: (GasCostBNB * BNB_Price) / RADRS_Price
    let realRadrsCostRaw = (gasCostBNB * bnbPrice) / radrsPriceUsd;
    
    // Check Activation
    const isActivated = await checkActivation(userOp.sender as Hex);
    
    let finalRadrsFeeRaw = 0;
    
    // Check if user has sufficient balance (Need 100+ RADRS)
    // We check this for EVERYONE (Free or Paid) to prevent spam from empty accounts
    // UNLESS it is the very first activation, but even then, they need tokens to be worth activating?
    // Actually, if it's activation, maybe we allow 0 balance?
    // Let's stick to the rule: "Insufficient RADRS balance (Need 100+)"
    
    // Fetch Balance for check
    let balance = 0n;
    try {
        balance = await publicClient.readContract({
             address: CONFIG.RADRS_TOKEN_ADDRESS as Hex,
             abi: [{
                type: 'function',
                name: 'balanceOf',
                stateMutability: 'view',
                inputs: [{ name: 'account', type: 'address' }],
                outputs: [{ type: 'uint256' }]
             }],
             functionName: 'balanceOf',
             args: [userOp.sender as Hex]
        }) as bigint;
    } catch (e) {
        console.warn("Failed to check balance in calc", e);
    }
    
    const minInitRadrs = 100n * 10n**18n; // Min 100 RADRS required
    if (balance < minInitRadrs) {
         // Throw error to be caught by API handler
         throw new Error("Insufficient RADRS balance (Need 100+). 余额不足 (需要 100+ RADRS).");
    }

    if (!isActivated) {
        // First time free
        finalRadrsFeeRaw = 0;
        console.log(`[Fee] User ${userOp.sender} not activated -> Free`);
    } else {
        // Charged at Markup (e.g. 1.2x)
        // RADRS_SERVICE_FEE_BPS = 2000 => 20% => 1.2x
        const bps = Number(CONFIG.RADRS_SERVICE_FEE_BPS) || 2000;
        const markup = 1 + (bps / 10000);
        finalRadrsFeeRaw = realRadrsCostRaw * markup;
        console.log(`[Fee] User ${userOp.sender} activated -> Charged ${markup}x`);
    }

    // Safe conversion for final values
    const toSafeWei = (val: number): bigint => {
        if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
             console.warn(`[WARNING] Value is NaN or Infinity: ${val}, defaulting to 0n`);
             return 0n;
        }
        try {
            return BigInt(Math.floor(val * 1e18));
        } catch (e) {
            console.error(`[ERROR] BigInt conversion failed for ${val}`, e);
            return 0n;
        }
    }

    // Convert to BigInt Wei
    const realRadrsCostWei = toSafeWei(realRadrsCostRaw);
    const finalRadrsFeeWei = toSafeWei(finalRadrsFeeRaw);

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
        // Include paymasterAddress in quote response for verification
        res.json({
            ...fees,
            paymasterAddress: CONFIG.PAYMASTER_ADDRESS
        });
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
        
        console.log(`[DEBUG] FeeToken Raw: ${CONFIG.RADRS_TOKEN_ADDRESS}`);
        console.log(`[DEBUG] Receiver Raw: ${CONFIG.RADRS_FEE_COLLECTOR}`);
        
        // Use safeAddress to prevent "undefined" string crash
        const feeToken = safeAddress(CONFIG.RADRS_TOKEN_ADDRESS);
        const receiver = safeAddress(CONFIG.RADRS_FEE_COLLECTOR); 
        
        if (feeToken === "0x0000000000000000000000000000000000000000" || receiver === "0x0000000000000000000000000000000000000000") {
             console.error("[CRITICAL] FeeToken or Receiver address is invalid (ZeroAddress). Check CONFIG.");
        }
        
        const feeAmountToSign = BigInt(realRadrsCost); 
        const sender = safeAddress(userOp.sender);
        
        // Payer Logic
        const payerInput = req.body.payer;
        // If payer is undefined/null/empty, fallback to sender.
        // If payer is provided but invalid, safeAddress will warn and return ZeroAddress, 
        // effectively making the signature invalid (which is better than 500 crash).
        const payer = (payerInput && payerInput !== "0x") ? safeAddress(payerInput) : sender;

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
        console.log(`[DEBUG SPONSOR] Using Paymaster Address: ${CONFIG.PAYMASTER_ADDRESS}`);
        console.log(`[DEBUG SPONSOR] Signature: ${signature}`);
        console.log(`[DEBUG SPONSOR] FeeAmountSigned (Real): ${feeAmountToSign}`);
        console.log(`[DEBUG SPONSOR] FeeAmountCharged (Est): ${radrsFee}`);

        // Return standardized response for frontend
        res.json({
            paymasterAndData,
            paymasterAddress: CONFIG.PAYMASTER_ADDRESS, // Send back address for verification
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
