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

console.log("Adding 'account: simpleAccount' to sendUserOperation calls...");

// The pattern to match is the sendUserOperation call block
// We need to inject `account: simpleAccount,` into the object.

// Case 1: In sendTransactionWithRadrsGas
const case1Regex = /(return\s+await\s+bundlerClient\.sendUserOperation\s*\(\s*{\s*userOperation:\s*signedUserOp,\s*entryPoint:\s*AA_RADRS_CONFIG\.entryPoint\s+as\s+Address)/;
if (case1Regex.test(content)) {
    console.log("Fixing Case 1 (sendTransactionWithRadrsGas)...");
    content = content.replace(case1Regex, '$1,\n                    account: simpleAccount');
} else {
    // Fallback regex if formatting slightly differs
    const case1RegexRelaxed = /(bundlerClient\.sendUserOperation\s*\(\s*{\s*userOperation:\s*signedUserOp,\s*entryPoint:\s*AA_RADRS_CONFIG\.entryPoint\s+as\s+Address)/;
    if (case1RegexRelaxed.test(content)) {
         console.log("Fixing Case 1 (Relaxed)...");
         content = content.replace(case1RegexRelaxed, '$1,\n                    account: simpleAccount');
    } else {
        console.warn("Case 1 not matched. Check manual inspection.");
    }
}

// Case 2: In approveRadrs
const case2Regex = /(const\s+txHash\s*=\s*await\s+bundlerClient\.sendUserOperation\s*\(\s*{\s*userOperation:\s*signedUserOp,\s*entryPoint:\s*AA_RADRS_CONFIG\.entryPoint)/;
if (case2Regex.test(content)) {
    console.log("Fixing Case 2 (approveRadrs)...");
    content = content.replace(case2Regex, '$1,\n            account: simpleAccount');
} else {
    console.warn("Case 2 not matched. Check manual inspection.");
}

fs.writeFileSync(FULL_PATH, content, 'utf8');
console.log("Fix applied.");
