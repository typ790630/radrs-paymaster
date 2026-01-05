import * as fs from 'fs';
import * as path from 'path';

const TARGET_DIR = "C:/Users/wangping/Desktop/RADRS-Wallet";
const SERVICE_FILENAME = "services/aaRadrsService.ts";
const FULL_PATH = path.join(TARGET_DIR, SERVICE_FILENAME);

if (!fs.existsSync(FULL_PATH)) {
    console.error(`File not found: ${FULL_PATH}`);
    process.exit(1);
}

let content = fs.readFileSync(FULL_PATH, 'utf8');

console.log("Uncommenting packedUserOp definitions...");

// Replace commented out packedUserOp with active one
// We use a simple replace because the line is unique enough
const targetString = "// const packedUserOp = AARadrsService.packUserOp(signedUserOp); // Deprecated by sendUserOperation";
const replacementString = "const packedUserOp = AARadrsService.packUserOp(signedUserOp);";

if (content.includes(targetString)) {
    content = content.split(targetString).join(replacementString);
    console.log("Uncommented lines.");
} else {
    // Fallback: try a regex if the comment suffix is missing or different
    const regex = /\/\/\s*const\s+packedUserOp\s*=\s*AARadrsService\.packUserOp\(signedUserOp\);/g;
    if (regex.test(content)) {
        content = content.replace(regex, replacementString);
        console.log("Uncommented lines (regex).");
    } else {
        console.warn("Could not find commented out packedUserOp line.");
    }
}

fs.writeFileSync(FULL_PATH, content, 'utf8');
console.log("Fix applied.");
