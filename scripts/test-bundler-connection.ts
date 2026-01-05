
import { createClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { bundlerActions } from 'viem/account-abstraction';

const urls = [
    "https://public.pimlico.io/v2/bsc-mainnet/rpc",
    "https://public.pimlico.io/v2/56/rpc",
    "https://api.pimlico.io/v2/bsc-mainnet/rpc?apikey=pim_iQCirstXBmWBPpMs9B9MHw",
    "https://api.pimlico.io/v2/56/rpc?apikey=pim_iQCirstXBmWBPpMs9B9MHw"
];

async function testConnection(url: string) {
    console.log(`\n---------------------------------------------------`);
    console.log(`Testing URL: ${url}`);
    
    const client = createClient({
        chain: bsc,
        transport: http(url)
    }).extend(bundlerActions);

    try {
        const chainId = await client.getChainId();
        console.log(`✅ Connected! Chain ID: ${chainId}`);
        
        try {
            const entryPoints = await client.supportedEntryPoints();
            console.log(`✅ Supported EntryPoints:`, entryPoints);
        } catch (e: any) {
            console.warn(`⚠️ supportedEntryPoints failed: ${e.message?.split('\n')[0]}`);
        }

    } catch (e: any) {
        // Extract useful error info
        const msg = e.details || e.shortMessage || e.message;
        console.error(`❌ Connection Failed: ${msg?.split('\n')[0]}`);
    }
}

async function main() {
    for (const url of urls) {
        await testConnection(url);
    }
}

main();
