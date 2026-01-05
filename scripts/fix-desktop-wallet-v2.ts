import * as fs from 'fs';
import * as path from 'path';

const WALLET_DIR = "C:/Users/wangping/Desktop/RADRS-Wallet";
const WRONG_URL_PART = "bsc-mainnet/rpc"; // more lenient match
const TARGET_URL_PART = "56/rpc";

const IGNORE_DIRS = ['node_modules', '.git', '.expo', 'android', 'ios'];

function replaceInFile(filePath: string) {
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        // Check for specific pimlico URL with bsc-mainnet
        if (content.includes("pimlico.io/v2/bsc-mainnet/rpc")) {
            console.log(`Fixing URL in ${filePath}`);
            content = content.replace(/pimlico\.io\/v2\/bsc-mainnet\/rpc/g, "pimlico.io/v2/56/rpc");
            fs.writeFileSync(filePath, content);
        }
    }
}

function scanAndFix(dir: string) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (!IGNORE_DIRS.includes(file)) scanAndFix(fullPath);
        } else {
            if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.env') || file.endsWith('.js')) {
                replaceInFile(fullPath);
            }
        }
    }
}

console.log("Starting URL replacement...");
scanAndFix(WALLET_DIR);
console.log("URL replacement complete.");

// Find aaRadrsService to check for fetch
function findFile(dir: string, filename: string): string | null {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (!IGNORE_DIRS.includes(file)) {
                const found = findFile(fullPath, filename);
                if (found) return found;
            }
        } else {
            if (file === filename) return fullPath;
        }
    }
    return null;
}

const serviceFile = findFile(WALLET_DIR, 'aaRadrsService.ts');
if (serviceFile) {
    console.log(`Found service file: ${serviceFile}`);
    const content = fs.readFileSync(serviceFile, 'utf8');
    
    // Check for manual fetch of UserOperation
    // Pattern: fetch(...) and body includes eth_sendUserOperation
    if (content.includes('fetch(') && (content.includes('eth_sendUserOperation') || content.includes('bundlerUrl'))) {
        console.log("POTENTIAL ISSUE: Found manual fetch() usage in aaRadrsService.ts");
        console.log("Reading file content for review...");
        console.log("--- START FILE CONTENT ---");
        console.log(content);
        console.log("--- END FILE CONTENT ---");
    } else {
        console.log("Service file does not appear to use manual fetch for UserOps.");
    }
} else {
    console.log("Could not find aaRadrsService.ts");
}
