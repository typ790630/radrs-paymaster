
import fs from 'fs';
import path from 'path';

const DESKTOP_PROJECT_PATH = 'C:/Users/wangping/Desktop/RADRS-Wallet';
const configPath = path.join(DESKTOP_PROJECT_PATH, 'config/aaRadrs.ts');

if (!fs.existsSync(configPath)) {
    console.error('Config file not found:', configPath);
    process.exit(1);
}

let content = fs.readFileSync(configPath, 'utf8');

console.log("Updating aaRadrs.ts on Desktop...");

// Fix: Point to Vercel (Root)
// Old: paymasterApiBase: EXPO_PUBLIC_PAYMASTER_API_URL || EXPO_PUBLIC_PAYMASTER_API_BASE || 'https://radrs-paymaster.vercel.app/api',
// New: paymasterApiBase: 'https://radrs-paymaster.vercel.app',

const targetUrl = /paymasterApiBase: EXPO_PUBLIC_PAYMASTER_API_URL \|\| EXPO_PUBLIC_PAYMASTER_API_BASE \|\| 'https:\/\/radrs-paymaster\.vercel\.app\/api',/;
if (targetUrl.test(content)) {
    content = content.replace(targetUrl, "paymasterApiBase: 'https://radrs-paymaster.vercel.app',");
    console.log("✅ Updated paymasterApiBase to Vercel (Root)");
} else {
    // Try simpler match if the complex one fails (e.g. quotes or spaces differ)
    const simpleTarget = /paymasterApiBase: .*'https:\/\/radrs-paymaster\.vercel\.app\/api',/;
    if (simpleTarget.test(content)) {
        content = content.replace(simpleTarget, "paymasterApiBase: 'https://radrs-paymaster.vercel.app',");
        console.log("✅ Updated paymasterApiBase (Simple Match)");
    } else {
        console.warn("⚠️ Could not find paymasterApiBase definition to patch.");
    }
}

fs.writeFileSync(configPath, content, 'utf8');
console.log("🎉 Successfully patched aaRadrs.ts on Desktop!");
