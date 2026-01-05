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

console.log("Reverting to Raw RPC to bypass Viem Estimation...");

// 1. Uncomment packUserOp
// We look for the commented out line and uncomment it.
const packRegex = /\/\/\s*const\s+packedUserOp\s*=\s*AARadrsService\.packUserOp\(signedUserOp\);\s*\/\/\s*Deprecated\s+by\s+sendUserOperation/g;
if (packRegex.test(content)) {
    console.log("Uncommenting packUserOp...");
    content = content.replace(packRegex, 'const packedUserOp = AARadrsService.packUserOp(signedUserOp);');
} else {
    // Try simpler match if exact string differs
    content = content.replace(/\/\/\s*const\s+packedUserOp\s*=/g, 'const packedUserOp =');
}

// 2. Replace sendUserOperation with request('eth_sendUserOperation')
// We need to match the block we just added/modified.
// It looks like:
// const txHash = await bundlerClient.sendUserOperation({
//    userOperation: signedUserOp,
//    entryPoint: AA_RADRS_CONFIG.entryPoint,
//    account: simpleAccount
// });

const sendOpRegex = /const\s+txHash\s*=\s*await\s+bundlerClient\.sendUserOperation\s*\(\s*{[\s\S]*?}\s*\);/g;

// We need to be careful because there are TWO occurrences (one in approve, one in sendTx).
// We'll replace them one by one or globally if the logic is identical.
// The logic IS identical for the raw send part (except the return value handling).

// Wait, bundlerClient.request returns the hash directly.
// sendUserOperation returns the hash directly too.

content = content.replace(sendOpRegex, 
`console.log("[AA Service] Sending via raw eth_sendUserOperation (Bypassing Viem Est)...");
            const txHash = await bundlerClient.request({
                method: 'eth_sendUserOperation',
                params: [
                    packedUserOp,
                    AA_RADRS_CONFIG.entryPoint as Address
                ]
            });`);

// 3. Fix the "return await bundlerClient.sendUserOperation" in sendTransactionWithRadrsGas
// It was:
// return await bundlerClient.sendUserOperation({
//    userOperation: signedUserOp,
//    entryPoint: AA_RADRS_CONFIG.entryPoint as Address,
//    account: simpleAccount
// });

const returnSendOpRegex = /return\s+await\s+bundlerClient\.sendUserOperation\s*\(\s*{[\s\S]*?}\s*\);/g;
content = content.replace(returnSendOpRegex, 
`console.log("[AA Service] Sending via raw eth_sendUserOperation (Bypassing Viem Est)...");
                return await bundlerClient.request({
                    method: 'eth_sendUserOperation',
                    params: [
                        packedUserOp,
                        AA_RADRS_CONFIG.entryPoint as Address
                    ]
                });`);

fs.writeFileSync(FULL_PATH, content, 'utf8');
console.log("Service reverted to Raw RPC.");
