
import fs from 'fs';
import path from 'path';

const DESKTOP_PROJECT_PATH = 'C:/Users/wangping/Desktop/RADRS-Wallet';
const configPath = path.join(DESKTOP_PROJECT_PATH, 'config.ts');

if (!fs.existsSync(configPath)) {
    console.error('Config file not found:', configPath);
    process.exit(1);
}

let content = fs.readFileSync(configPath, 'utf8');

console.log("Updating Desktop Config...");

// Fix: Point to Vercel instead of localhost
// Old: http://localhost:3000
// New: https://radrs-paymaster.vercel.app

const targetUrl = /export const PAYMASTER_API_URL = .*$/m;
if (targetUrl.test(content)) {
    content = content.replace(targetUrl, 'export const PAYMASTER_API_URL = "https://radrs-paymaster.vercel.app";');
    console.log("✅ Updated PAYMASTER_API_URL to Vercel");
} else {
    console.warn("⚠️ Could not find PAYMASTER_API_URL definition");
}

fs.writeFileSync(configPath, content, 'utf8');
console.log("🎉 Successfully patched config.ts on Desktop!");
