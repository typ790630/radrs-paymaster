
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

const BUNDLER_URL = process.env.EXPO_PUBLIC_BUNDLER_URL;

async function main() {
    if (!BUNDLER_URL) {
        throw new Error("❌ EXPO_PUBLIC_BUNDLER_URL not set in .env");
    }

    console.log(`Checking Bundler URL: ${BUNDLER_URL.replace(/apikey=[\w-]+/, "apikey=HIDDEN")}`);

    const client = createPublicClient({
        chain: bsc,
        transport: http(BUNDLER_URL),
    });

    try {
        const chainId = await client.getChainId();
        console.log(`✅ Connection Success! Chain ID: ${chainId} (BSC Mainnet is 56)`);
        
        // Try a bundler specific method if possible, or just standard RPC
        // Pimlico usually supports standard eth methods + debug ones.
        // Let's check supported entrypoints which is a standard 4337 method
        try {
            const entryPoints = await client.request({ 
                method: 'eth_supportedEntryPoints' as any 
            });
            console.log("✅ Bundler supports EntryPoints:", entryPoints);
        } catch (e: any) {
            console.log("⚠️ Could not fetch EntryPoints (might be strictly an RPC node or method not supported):", e.message);
        }

    } catch (error: any) {
        console.error("❌ Connection Failed:", error.message);
        process.exit(1);
    }
}

main();
