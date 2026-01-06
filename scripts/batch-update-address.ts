
import fs from 'fs';
import path from 'path';

const OLD_ADDR = "0x1f29efB2d33BC425B3C4050804D55047d872A3dC";
const NEW_ADDR = "0x1d3E64c5a4fFfC4e46e70e22c33A1ddaD506c3Aa";

const files = [
    "server/src/config.ts",
    "scripts/withdraw-old-paymaster.ts",
    "scripts/fix-desktop-wallet.ts",
    "scripts/debug-frontend-read.ts",
    "scripts/verify-paymaster-integration.ts",
    "scripts/check-paymaster-deposit.ts",
    "scripts/check-userop-status.ts",
    "scripts/debug-server-repro.ts",
    "scripts/debug-aa24.ts"
];

const rootDir = process.cwd();

files.forEach(file => {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        if (content.includes(OLD_ADDR)) {
            // Global replace just in case, though usually one per file for config
            const newContent = content.split(OLD_ADDR).join(NEW_ADDR);
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`✅ Updated: ${file}`);
        } else {
            console.log(`⚠️  Skipped (Not found): ${file}`);
        }
    } else {
        console.log(`❌ Missing: ${file}`);
    }
});
