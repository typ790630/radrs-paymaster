import * as fs from 'fs';
import * as path from 'path';

const FILES_TO_FIX = [
    "C:/Users/wangping/Desktop/RADRS-Wallet/config/aaRadrs.ts",
    "C:/Users/wangping/Desktop/RADRS-Wallet/scripts/correct-verify-aa.ts",
    "C:/Users/wangping/Desktop/RADRS-Wallet/scripts/verify-aa-flow.ts"
];

const WRONG_URL = "public.pimlico.io/v2/56/rpc";
const CORRECT_URL = "public.pimlico.io/v2/bsc-mainnet/rpc";

function fixFile(filePath: string) {
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }

    try {
        let content = fs.readFileSync(filePath, 'utf8');
        if (content.includes(WRONG_URL)) {
            console.log(`Fixing ${filePath}...`);
            const newContent = content.replace(new RegExp(WRONG_URL.replace(/\//g, '\\/'), 'g'), CORRECT_URL);
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`Fixed.`);
        } else {
            console.log(`No wrong URL found in ${filePath}`);
        }
    } catch (err) {
        console.error(`Error processing ${filePath}:`, err);
    }
}

// 1. Fix TS files
console.log("Starting code fixes...");
FILES_TO_FIX.forEach(fixFile);

// 2. Verify .env
const envPath = "C:/Users/wangping/Desktop/RADRS-Wallet/.env";
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes(WRONG_URL)) {
        console.log("Fixing .env file...");
        const newEnv = envContent.replace(new RegExp(WRONG_URL.replace(/\//g, '\\/'), 'g'), CORRECT_URL);
        fs.writeFileSync(envPath, newEnv, 'utf8');
        console.log(".env fixed.");
    } else if (envContent.includes(CORRECT_URL)) {
        console.log(".env is already correct.");
    } else {
        console.log(".env does not contain the public URL (might be using API key).");
    }
}

console.log("All fixes applied.");
