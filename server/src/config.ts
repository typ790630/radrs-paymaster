
import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
    PORT: process.env.PORT || 3000,
    CHAIN_ID: 56,
    // Change to a more globally accessible RPC
    RPC_URL: "https://bsc-rpc.publicnode.com",
    
    // Addresses
    ENTRY_POINT_ADDRESS: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
    RADRS_TOKEN_ADDRESS: "0xe2188a2e0a41a50f09359e5fe714d5e643036f2a",
    PAYMASTER_ADDRESS: "0x30B8333A8a283045869A6A81C95D688061A0a289", // Hardcode V8 to ensure no env issues on Vercel
    RADRS_FEE_RECEIVER: process.env.RADRS_FEE_RECEIVER || (() => { throw new Error("RADRS_FEE_RECEIVER is not set in .env") })(),
    
    // Signer
    PAYMASTER_SIGNER_KEY: (process.env.PAYMASTER_SIGNER_KEY || "0x51522ba5d94939fd40a8436b029d6457b02648a0891e7197df550a82a249b0d8") as `0x${string}`, // Must be provided in .env

    // Pricing
    PRICE_RADRS_BNB: 0.0001, // 1 RADRS = 0.0001 BNB (Example)
    MARKUP: 1.2,
    VALID_DURATION: 300 // Seconds
};
