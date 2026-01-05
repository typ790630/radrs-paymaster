
import { createClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { bundlerActions } from 'viem/account-abstraction';

// 1. The URL appearing in your error screenshot (The WRONG one)
const OLD_URL = "https://api.pimlico.io/v2/56/rpc?apikey=pim_iQCirstXBmWBPpMs9B9MHw";

// 2. The URL currently configured in code (The CORRECT one)
const NEW_URL = "https://public.pimlico.io/v2/bsc-mainnet/rpc";
// Try api.pimlico.io with correct format too
const PRIVATE_V2_URL = "https://api.pimlico.io/v2/bsc-mainnet/rpc?apikey=pim_iQCirstXBmWBPpMs9B9MHw";

async function testUrl(name: string, url: string) {
    console.log(`\n🔵 Testing ${name}: ${url}`);
    const client = createClient({
        chain: bsc,
        transport: http(url)
    }).extend(bundlerActions);

    try {
        const chainId = await client.getChainId();
        console.log(`   ✅ Connection Success! Chain ID: ${chainId}`);
        
        try {
            const entryPoints = await client.supportedEntryPoints();
            console.log(`   ✅ Bundler Method (supportedEntryPoints) works!`);
        } catch (e: any) {
            console.log(`   ❌ Bundler Method Failed: ${e.message?.slice(0, 100)}...`);
            console.log(`   👉 CONCLUSION: This URL does NOT support Bundler methods.`);
        }
    } catch (e: any) {
        console.log(`   ❌ Connection Failed: ${e.message?.slice(0, 100)}...`);
    }
}

async function main() {
    console.log("=== DIAGNOSTIC SCRIPT: WHY DOES IT FAIL? ===");
    
    await testUrl("OLD URL (56/rpc - From Screenshot)", OLD_URL);
    await testUrl("NEW PUBLIC URL (bsc-mainnet/rpc)", NEW_URL);
    await testUrl("NEW PRIVATE URL (bsc-mainnet/rpc)", PRIVATE_V2_URL);

    console.log("\n============================================");
    console.log("👇 RESULTS ANALYSIS 👇");
    console.log("If 'OLD URL' fails and 'NEW URL' succeeds, it means:");
    console.log("YOUR APP IS STILL USING THE OLD CODE!");
    console.log("Please restart Metro Bundler with: npx expo start --clear");
}

main();
