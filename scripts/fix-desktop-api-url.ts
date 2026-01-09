
import fs from 'fs';
import path from 'path';

const DESKTOP_PROJECT_PATH = 'C:/Users/wangping/Desktop/RADRS-Wallet';
const servicePath = path.join(DESKTOP_PROJECT_PATH, 'services/aaRadrsService.ts');

if (!fs.existsSync(servicePath)) {
    console.error('Service file not found:', servicePath);
    process.exit(1);
}

let content = fs.readFileSync(servicePath, 'utf8');

console.log("Patching API URLs in aaRadrsService.ts...");

// Fix 1: Quote URL
// Old: const url = `${AA_RADRS_CONFIG.paymasterApiUrl}/paymaster/quote`;
// New: const url = `${AA_RADRS_CONFIG.paymasterApiUrl.replace(/\/$/, '')}/api/paymaster/quote`;

const targetQuote = /const url = `\$\{AA_RADRS_CONFIG\.paymasterApiUrl\}\/paymaster\/quote`;/;
if (targetQuote.test(content)) {
    content = content.replace(targetQuote, 'const url = `${AA_RADRS_CONFIG.paymasterApiUrl.replace(/\\/$/, "")}/api/paymaster/quote`;');
    console.log("✅ Fixed Quote URL");
} else {
    console.warn("⚠️ Could not find Quote URL pattern");
}

// Fix 2: Sponsor URL
// Old: const url = `${AA_RADRS_CONFIG.paymasterApiUrl}/paymaster/sponsor`;
// New: const url = `${AA_RADRS_CONFIG.paymasterApiUrl.replace(/\/$/, '')}/api/paymaster/sponsor`;

const targetSponsor = /const url = `\$\{AA_RADRS_CONFIG\.paymasterApiUrl\}\/paymaster\/sponsor`;/;
if (targetSponsor.test(content)) {
    content = content.replace(targetSponsor, 'const url = `${AA_RADRS_CONFIG.paymasterApiUrl.replace(/\\/$/, "")}/api/paymaster/sponsor`;');
    console.log("✅ Fixed Sponsor URL");
} else {
    console.warn("⚠️ Could not find Sponsor URL pattern");
}

// Fix 3: Fallback Logic
// Remove the fallback that strips /api, because now we explicitly add it.
// Actually, let's just make the fallback logic consistent.
// Old: const fallbackUrl = url.replace('/api/paymaster', '/paymaster');
// New: const fallbackUrl = url.replace('/api/paymaster', '/paymaster'); // This is still valid if Vercel routes differ

fs.writeFileSync(servicePath, content, 'utf8');
console.log("🎉 Successfully patched aaRadrsService.ts on Desktop!");
