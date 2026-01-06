import { createPublicClient, http, fallback, type Hex } from 'viem';
import { bsc } from 'viem/chains';

// Configuration
export const CHAIN = bsc;
export const CHAIN_ID = 56;

// ==========================================
// 🔧 DEBUG: Switch to Public Bundler if API Key fails
// ==========================================
const usePublicBundler = true; // Set to true to test Public Endpoint

const API_KEY = "pim_iQCirstXBmWBPpMs9B9MHw"; // Your Pimlico Key

const PRIVATE_BUNDLER = `https://api.pimlico.io/v2/bsc-mainnet/rpc?apikey=${API_KEY}`;
const PUBLIC_BUNDLER = "https://public.pimlico.io/v2/bsc-mainnet/rpc"; // Using bsc-mainnet format

// If EXPO_PUBLIC_BUNDLER_URL is set (via .env), use it. Otherwise use logic.
export const BUNDLER_URL = process.env.EXPO_PUBLIC_BUNDLER_URL || (usePublicBundler ? PUBLIC_BUNDLER : PRIVATE_BUNDLER);

console.log("[Config] Using Bundler:", BUNDLER_URL);

// RadrsPaymaster Deployed Address (Verified)
// FORCE HARDCODED ADDRESS TO AVOID CACHE ISSUES
export const PAYMASTER_ADDRESS = "0x1d3E64c5a4fFfC4e46e70e22c33A1ddaD506c3Aa"; // v2: White-listed Approve

// Backend API URL
// Ensure this points to Vercel, NOT localhost
export const PAYMASTER_API_URL = "https://radrs-paymaster.vercel.app";

export const RADRS_TOKEN_ADDRESS = "0xe2188a2e0a41a50f09359e5fe714d5e643036f2a";

// EntryPoint v0.7.0 (Must match the Factory version!)
export const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"; 

export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http("https://bsc-dataseed1.binance.org"), // Only use the official one
});
