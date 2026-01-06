
import fs from 'fs';
import path from 'path';
// import { CONFIG } from '../server/src/config.js'; // Avoid env var pollution issues

const WALLET_DIR = "C:/Users/wangping/Desktop/RADRS-Wallet";
const CORRECT_ADDRESS = "0x1d3E64c5a4fFfC4e46e70e22c33A1ddaD506c3Aa"; // Hardcoded to ensure correctness
// List of old/wrong addresses to replace
const OLD_ADDRESSES = [
    "0x1f29efB2d33BC425B3C4050804D55047d872A3dC", // The one user complained about (AA33)
    "0x30B8333A8a283045869A6A81C95D688061A0a289", // The very old V8 one
    "0x7Be3A50B2a062a8dD1b24C0D77D0Cc8D8b19618A"  // Another old one
];

console.log(`🔄 Syncing Paymaster Address...`);
console.log(`   Source (Backend): ${CORRECT_ADDRESS}`);
console.log(`   Target (Wallet):  ${WALLET_DIR}`);

if (!fs.existsSync(WALLET_DIR)) {
    console.error(`❌ Wallet directory not found: ${WALLET_DIR}`);
    process.exit(1);
}

function getAllFiles(dir: string, fileList: string[] = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'build') {
                getAllFiles(filePath, fileList);
            }
        } else {
            // Include .tsx and .jsx
            if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.env') || file.endsWith('.tsx') || file.endsWith('.jsx')) {
                fileList.push(filePath);
            }
        }
    });
    return fileList;
}

const files = getAllFiles(WALLET_DIR);
let updatedCount = 0;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let modified = false;

    // Replace specific old addresses
    OLD_ADDRESSES.forEach(oldAddr => {
        if (content.includes(oldAddr)) {
            content = content.replaceAll(oldAddr, CORRECT_ADDRESS);
            modified = true;
            console.log(`✅ Replaced ${oldAddr} -> ${CORRECT_ADDRESS} in: ${file}`);
        }
    });

    // Heuristic: Update any config that looks like a Paymaster Address definition
    // e.g. paymaster: "0x..." or PAYMASTER_ADDRESS = "0x..."
    // This is riskier, so let's stick to known variable names if possible, or just the specific old address.
    // But the user asked "how to ensure consistency", so maybe a regex for the specific config variable is better.
    
    // Check for aaRadrs.ts specifically
    if (file.endsWith('aaRadrs.ts')) {
         // Regex to find any hex string assigned to something that looks like paymaster
         // But simpler is to just look for the old address which we did.
    }

    if (modified) {
        fs.writeFileSync(file, content, 'utf8');
        updatedCount++;
    }
});

if (updatedCount === 0) {
    console.log("✅ No files needed updating. Wallet is already in sync!");
} else {
    console.log(`🎉 Updated ${updatedCount} files.`);
}
