
import { createPublicClient, http } from "viem";
import { BUNDLER_URL, CHAIN } from "../client/src/config.ts";

async function main() {
    console.log("Verifying Client Configuration...");
    console.log("Bundler URL:", BUNDLER_URL);

    if (BUNDLER_URL.includes("apikey=public")) {
        console.warn("WARNING: Still using 'public' API key. This is expected to fail on BSC Mainnet.");
    }

    const client = createPublicClient({
        chain: CHAIN,
        transport: http(BUNDLER_URL),
    });

    try {
        const chainId = await client.getChainId();
        console.log("✅ Connection Successful!");
        console.log("Chain ID:", chainId);
        
        // Verify EntryPoint support (Pimlico specific)
        try {
            const entryPoints = await client.request({ 
                method: 'eth_supportedEntryPoints' as any 
            });
            console.log("✅ Bundler is active. Supported EntryPoints:", entryPoints);
        } catch (e: any) {
            console.error("❌ Bundler check failed:", e.message);
            process.exit(1);
        }

    } catch (e: any) {
        console.error("❌ Connection Failed:", e.message);
        console.error("Please check your API Key in client/src/config.ts");
        process.exit(1);
    }
}

main();
