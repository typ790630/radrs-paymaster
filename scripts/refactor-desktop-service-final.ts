import * as fs from 'fs';
import * as path from 'path';

const TARGET_DIR = "C:/Users/wangping/Desktop/RADRS-Wallet";
const SERVICE_FILENAME = "aaRadrsService.ts";

function findFile(dir: string, filename: string): string | null {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') {
                const found = findFile(fullPath, filename);
                if (found) return found;
            }
        } else {
            if (file === filename) return fullPath;
        }
    }
    return null;
}

const filePath = findFile(TARGET_DIR, SERVICE_FILENAME);
if (!filePath) {
    console.error("File not found");
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

console.log("Applying global refactoring...");

// 1. Replace ALL createClient...extend(bundlerActions) with createBundlerClient
// Use a loop or global regex
const clientRegex = /createClient\s*\(\s*{([\s\S]*?)}\s*\)\s*\.extend\(bundlerActions\)/g;
content = content.replace(clientRegex, 'createBundlerClient({$1})');

// 2. Refactor approveRadrs to remove fetch
// Find the block inside approveRadrs that does fetch
// We look for: const response = await fetch(AA_RADRS_CONFIG.bundlerUrl, ...
// And replace it with sendUserOperation

const fetchRegex = /const\s+response\s*=\s*await\s*fetch\s*\(\s*AA_RADRS_CONFIG\.bundlerUrl,\s*{[\s\S]*?body:\s*JSON\.stringify\({[\s\S]*?params:\s*\[\s*packedUserOp,\s*([\w\._]+)\s*\][\s\S]*?}\)\s*}\s*\);[\s\S]*?const\s+responseData\s*=\s*await\s*response\.json\(\);[\s\S]*?const\s+txHash\s*=\s*responseData\.result;/;

if (fetchRegex.test(content)) {
    console.log("Replacing manual fetch in approveRadrs...");
    content = content.replace(fetchRegex, 
`console.log("[AA Service] Sending Auto-Approve via bundlerClient...");
        const txHash = await bundlerClient.sendUserOperation({
            userOperation: signedUserOp,
            entryPoint: $1
        });`);
} else {
    console.log("Manual fetch pattern in approveRadrs not found (or already fixed).");
    // Fallback: check if we just need to replace a smaller chunk if the regex was too specific
    if (content.includes("fetch(AA_RADRS_CONFIG.bundlerUrl")) {
        console.warn("WARNING: Manual fetch still present but regex missed it. Trying simpler replacement.");
        
        // Simpler replacement: Comment out fetch and add sendUserOperation
        // We assume 'signedUserOp' and 'bundlerClient' are available in scope
        content = content.replace(
            /const\s+response\s*=\s*await\s*fetch\(AA_RADRS_CONFIG\.bundlerUrl[\s\S]*?const\s+txHash\s*=\s*responseData\.result;/g,
            `const txHash = await bundlerClient.sendUserOperation({ userOperation: signedUserOp, entryPoint: AA_RADRS_CONFIG.entryPoint as Address });`
        );
    }
}

// 3. Comment out packedUserOp if it's no longer used
content = content.replace(
    /const\s+packedUserOp\s*=\s*AARadrsService\.packUserOp\(signedUserOp\);/g, 
    '// const packedUserOp = AARadrsService.packUserOp(signedUserOp); // Deprecated by sendUserOperation'
);

// 4. Ensure no remaining bundlerClient.request({ method: 'eth_sendUserOperation' ... })
// This handles any that weren't caught by the previous script (e.g. if I missed one)
const requestRegex = /bundlerClient\.request\s*\(\s*{\s*method:\s*'eth_sendUserOperation',\s*params:\s*\[\s*packedUserOp,\s*([\w\._]+(?:\s+as\s+Address)?)\s*\]\s*}\s*\)/g;
content = content.replace(requestRegex, 'bundlerClient.sendUserOperation({\n                    userOperation: signedUserOp,\n                    entryPoint: $1\n                })');

fs.writeFileSync(filePath, content, 'utf8');
console.log("Refactoring complete.");
