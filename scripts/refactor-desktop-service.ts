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
    console.error(`Could not find ${SERVICE_FILENAME} in ${TARGET_DIR}`);
    process.exit(1);
}

console.log(`Found service file at: ${filePath}`);

let content = fs.readFileSync(filePath, 'utf8');
let modified = false;

// 1. Ensure imports
if (!content.includes('createBundlerClient')) {
    console.log("Adding createBundlerClient import...");
    // Try to add to existing viem import or add new one
    if (content.includes('import {') && content.includes('} from "viem/account-abstraction";')) {
         content = content.replace('} from "viem/account-abstraction";', ', createBundlerClient } from "viem/account-abstraction";');
    } else {
         // Add at top
         content = `import { createBundlerClient } from "viem/account-abstraction";\n` + content;
    }
    modified = true;
}

// 2. Replace bundlerClient creation
// Old: createClient({ ... }).extend(bundlerActions)
// New: createBundlerClient({ ... })

// Regex to find the creation block. It might be multiline.
// We look for .extend(bundlerActions)
if (content.includes('.extend(bundlerActions)')) {
    console.log("Refactoring bundlerClient creation...");
    content = content.replace(/createClient\s*\(\s*{([\s\S]*?)}\s*\)\s*\.extend\(bundlerActions\)/, 'createBundlerClient({$1})');
    modified = true;
}

// 3. Replace send logic
// Old: bundlerClient.request({ method: 'eth_sendUserOperation', params: [packedUserOp, entryPoint] })
// New: bundlerClient.sendUserOperation({ userOperation: signedUserOp, entryPoint: entryPoint })

if (content.includes("method: 'eth_sendUserOperation'")) {
    console.log("Refactoring sendUserOperation call...");
    
    // We need to capture the variable name used for the signed user op.
    // In the previous read, it was 'signedUserOp'.
    
    // Pattern: 
    // const packedUserOp = AARadrsService.packUserOp(signedUserOp);
    // ... request ...
    
    // We'll replace the whole block if possible, or just the request part.
    // To be safe, let's just replace the request part and comment out the pack line if we find it.
    
    // Replace pack line
    content = content.replace(
        /const\s+packedUserOp\s*=\s*AARadrsService\.packUserOp\(signedUserOp\);/g, 
        '// const packedUserOp = AARadrsService.packUserOp(signedUserOp); // Deprecated by sendUserOperation'
    );
    
    // Replace request call
    // Note: The original code returned await bundlerClient.request(...)
    // We want return await bundlerClient.sendUserOperation(...)
    
    const requestRegex = /bundlerClient\.request\s*\(\s*{\s*method:\s*'eth_sendUserOperation',\s*params:\s*\[\s*packedUserOp,\s*([\w\._]+(?:\s+as\s+Address)?)\s*\]\s*}\s*\)/;
    
    if (requestRegex.test(content)) {
        content = content.replace(requestRegex, 'bundlerClient.sendUserOperation({\n                    userOperation: signedUserOp,\n                    entryPoint: $1\n                })');
        modified = true;
    } else {
        console.warn("Could not match bundlerClient.request pattern exactly. Please check regex.");
        // Try a broader replacement if the specific one fails, or just warn.
        // Let's print the relevant section to debug if it fails
        const index = content.indexOf("eth_sendUserOperation");
        console.log("Context around eth_sendUserOperation:", content.substring(index - 100, index + 200));
    }
}

if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("File updated successfully.");
} else {
    console.log("No changes needed or patterns not matched.");
}
