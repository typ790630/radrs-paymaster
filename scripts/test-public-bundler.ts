
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";

async function main() {
    const publicUrl = "https://api.pimlico.io/v1/binance/rpc?apikey=public";
    console.log("Testing Public Bundler URL:", publicUrl);

    const client = createPublicClient({
        chain: bsc,
        transport: http(publicUrl),
    });

    try {
        const chainId = await client.getChainId();
        console.log("Chain ID:", chainId);
        
        // Try a bundler method
        try {
            const entryPoints = await client.request({ 
                method: 'eth_supportedEntryPoints' as any 
            });
            console.log("Supported EntryPoints:", entryPoints);
        } catch (e: any) {
            console.error("Bundler method failed:", e.message);
        }

    } catch (e: any) {
        console.error("Connection failed:", e.message);
    }
}

main();
