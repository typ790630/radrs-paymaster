
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
    PAYMASTER_ADDRESS: (() => {
        const addr = process.env.PAYMASTER_ADDRESS;
        if (!addr) throw new Error("PAYMASTER_ADDRESS env not set");
        return addr as `0x${string}`;
    })(),
    RADRS_FEE_COLLECTOR: process.env.RADRS_FEE_COLLECTOR || "0xfb710006a8Ad08a636e919B02B2f9bBbcE524d96",
    RADRS_SERVICE_FEE_BPS: Number(process.env.RADRS_SERVICE_FEE_BPS ?? "2000"), // 20%
    
    // Signer
    PAYMASTER_SIGNER_KEY: (process.env.PAYMASTER_SIGNER_KEY) as `0x${string}`,

    // Pricing
    PRICE_RADRS_BNB: 0.0001, // 1 RADRS = 0.0001 BNB (Example)
    MARKUP: 1.2,
    VALID_DURATION: 300 // Seconds
};
