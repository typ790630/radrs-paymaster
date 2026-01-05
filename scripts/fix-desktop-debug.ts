
import fs from 'fs';
import path from 'path';

const DESKTOP_PROJECT_PATH = 'C:/Users/wangping/Desktop/RADRS-Wallet';
const servicePath = path.join(DESKTOP_PROJECT_PATH, 'services/aaRadrsService.ts');

if (!fs.existsSync(servicePath)) {
    console.error('Service file not found:', servicePath);
    process.exit(1);
}

let content = fs.readFileSync(servicePath, 'utf8');

// We will inject detailed logging into sendWithRetry to debug the UserOp fields
// and ensure we are passing what we think we are passing.

const targetString = "const sendWithRetry = async (attemptsLeft: number): Promise<{ userOpHash: string; txHash: string }> => {";
const replacementString = `const sendWithRetry = async (attemptsLeft: number): Promise<{ userOpHash: string; txHash: string }> => {
        // --- DEBUG: Inspect partialUserOp ---
        console.log("[AA DEBUG] partialUserOp Keys:", Object.keys(partialUserOp));
        console.log("[AA DEBUG] callData:", partialUserOp.callData);
        console.log("[AA DEBUG] gasLimits:", {
            call: partialUserOp.callGasLimit,
            ver: partialUserOp.verificationGasLimit,
            pre: partialUserOp.preVerificationGas,
            maxFee: partialUserOp.maxFeePerGas
        });

        // FORCE ENSURE FIELDS (Paranoid Fix)
        if (!partialUserOp.callGasLimit) partialUserOp.callGasLimit = BigInt(800000);
        if (!partialUserOp.verificationGasLimit) partialUserOp.verificationGasLimit = BigInt(500000);
        if (!partialUserOp.preVerificationGas) partialUserOp.preVerificationGas = BigInt(100000);
        if (!partialUserOp.callData) {
             console.error("❌ CRITICAL: callData is MISSING in partialUserOp!");
             // Fallback: Re-encode if possible or throw
             throw new Error("Internal Error: callData missing for UserOp");
        }
`;

if (content.includes(targetString)) {
    // Only replace if we haven't already (check for DEBUG log)
    if (!content.includes("[AA DEBUG] partialUserOp Keys")) {
        content = content.replace(targetString, replacementString);
        console.log("✅ Injected Debug Logging into sendWithRetry");
    } else {
        console.log("⚠️ Debug logging already present.");
    }
} else {
    console.error("❌ Could not find sendWithRetry function definition.");
}

// Also fix the callData scoping issue if it exists (although code looked ok)
// We will replace the "let callData;" declaration with "let callData: Hex = '0x';"
// to ensure it's never undefined.

const callDataDecl = "let callData;";
if (content.includes(callDataDecl)) {
    // content = content.replace(callDataDecl, "let callData: Hex = '0x';");
    // Actually, let's be more specific to the Manual Mode block
    // It's around line 1131 in the file we read
}

fs.writeFileSync(servicePath, content, 'utf8');
console.log("Done.");
