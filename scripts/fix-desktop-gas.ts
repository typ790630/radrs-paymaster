
import fs from 'fs';
import path from 'path';

const DESKTOP_PROJECT_PATH = 'C:/Users/wangping/Desktop/RADRS-Wallet';
const servicePath = path.join(DESKTOP_PROJECT_PATH, 'services/aaRadrsService.ts');

if (!fs.existsSync(servicePath)) {
    console.error('Service file not found:', servicePath);
    process.exit(1);
}

let content = fs.readFileSync(servicePath, 'utf8');

console.log("Creating backup...");
fs.writeFileSync(servicePath + '.bak', content);

console.log("Patching Gas Limits...");

// 1. Fix the manual initialization
// Old: preVerificationGas: BigInt(50000),    // Optimized: 50k
// New: preVerificationGas: BigInt(150000),   // Boosted: 150k

const targetInit = /preVerificationGas:\s*BigInt\(50000\),.*$/m;
if (targetInit.test(content)) {
    content = content.replace(targetInit, 'preVerificationGas: BigInt(150000),    // Boosted: 150k (Fix for 51091 req)');
    console.log("✅ Fixed Gas Limit Initialization (50000 -> 150000)");
} else {
    console.warn("⚠️ Could not find 'preVerificationGas: BigInt(50000)' initialization. Already fixed?");
}

// 2. Fix the paranoid check in sendWithRetry
// Old: if (!partialUserOp.preVerificationGas) partialUserOp.preVerificationGas = BigInt(100000);
// New: Force update if < 150000

const targetCheck = /if\s*\(!partialUserOp\.preVerificationGas\)\s*partialUserOp\.preVerificationGas\s*=\s*BigInt\(100000\);/g;
const replacementCheck = `
        // FORCE ENSURE HIGH PVG
        if (!partialUserOp.preVerificationGas || partialUserOp.preVerificationGas < BigInt(150000)) {
            partialUserOp.preVerificationGas = BigInt(150000); 
        }`;

if (targetCheck.test(content)) {
    content = content.replace(targetCheck, replacementCheck);
    console.log("✅ Fixed Paranoid Check (Force 150000)");
} else {
    // Maybe it was modified by debug script differently?
    // Let's try to match the debug script output
    // The debug script added:
    // if (!partialUserOp.preVerificationGas) partialUserOp.preVerificationGas = BigInt(100000);
    // So regex should catch it.
    console.warn("⚠️ Could not find paranoid check to update.");
}

fs.writeFileSync(servicePath, content, 'utf8');
console.log("🎉 Successfully patched aaRadrsService.ts on Desktop!");
