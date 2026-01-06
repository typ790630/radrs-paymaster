
import fs from 'fs';
import path from 'path';

const WALLET_DIR = "C:/Users/wangping/Desktop/RADRS-Wallet";

function fixFile(filePath: string, replacements: { old: string | RegExp, new: string }[]) {
    const fullPath = path.join(WALLET_DIR, filePath);
    if (!fs.existsSync(fullPath)) {
        console.error(`❌ File not found: ${fullPath}`);
        return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    let modified = false;

    replacements.forEach(r => {
        if (content.match(r.old)) {
            content = content.replace(r.old, r.new);
            modified = true;
            console.log(`✅ Fixed match in ${filePath}`);
        }
    });

    if (modified) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`💾 Saved ${filePath}`);
    } else {
        console.log(`ℹ️ No changes needed for ${filePath}`);
    }
}

function main() {
    console.log("🚀 Starting Fix for RADRS-Wallet (Desktop)...");

    // 1. Fix .env
    fixFile(".env", [
        {
            old: /EXPO_PUBLIC_BUNDLER_URL=https:\/\/api\.pimlico\.io\/v2\/56\/rpc\?apikey=[a-zA-Z0-9_]+/,
            new: "EXPO_PUBLIC_BUNDLER_URL=https://public.pimlico.io/v2/bsc-mainnet/rpc"
        },
        {
            old: /EXPO_PUBLIC_BUNDLER_URL=https:\/\/api\.pimlico\.io\/v2\/56\/rpc/,
            new: "EXPO_PUBLIC_BUNDLER_URL=https://public.pimlico.io/v2/bsc-mainnet/rpc"
        }
    ]);

    // 2. Fix config/aaRadrs.ts
    fixFile("config/aaRadrs.ts", [
        {
            old: /https:\/\/api\.pimlico\.io\/v2\/56\/rpc/g,
            new: "https://public.pimlico.io/v2/bsc-mainnet/rpc"
        },
        {
            old: /0x7Be3A50B2a062a8dD1b24C0D77D0Cc8D8b19618A/g, // V1 Paymaster
            new: "0x1d3E64c5a4fFfC4e46e70e22c33A1ddaD506c3Aa"  // New Paymaster
        },
        {
            old: /0x1f29efB2d33BC425B3C4050804D55047d872A3dC/g, // V2 (Failed Signer) Paymaster
            new: "0x1d3E64c5a4fFfC4e46e70e22c33A1ddaD506c3Aa"
        },
        {
            old: /https:\/\/radrs-paymaster-backend\.vercel\.app\/api/g, // Old API
            new: "https://sradr-dapp.vercel.app" // New API
        }
    ]);

    console.log("\n🎉 Fixes applied! Please restart your Wallet App (Metro Bundler) now.");
    console.log("Run: npx expo start --clear");
}

main();
