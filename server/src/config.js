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
    PAYMASTER_ADDRESS: process.env.PAYMASTER_ADDRESS || "0x1f29efB2d33BC425B3C4050804D55047d872A3dC", // V6 Address (Fixed Offset for PackedUserOp)
    RADRS_FEE_RECEIVER: process.env.RADRS_FEE_RECEIVER || "0xfb710006a8Ad08a636e919B02B2f9bBbcE524d96",
    // Signer
    PAYMASTER_SIGNER_KEY: process.env.PAYMASTER_SIGNER_KEY, // Must be provided in .env
    // Pricing
    PRICE_RADRS_BNB: 0.0001, // 1 RADRS = 0.0001 BNB (Example)
    MARKUP: 1.2,
    VALID_DURATION: 300 // Seconds
};
//# sourceMappingURL=config.js.map