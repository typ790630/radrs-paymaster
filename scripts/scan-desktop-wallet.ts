import * as fs from 'fs';
import * as path from 'path';

const TARGET_DIR = "C:/Users/wangping/Desktop/RADRS-Wallet";
const SEARCH_STRING = "v2/56/rpc";
const IGNORE_DIRS = ['node_modules', '.git', '.expo', 'android', 'ios'];

function searchInDirectory(dir: string) {
    if (!fs.existsSync(dir)) {
        console.log(`Directory not found: ${dir}`);
        return;
    }

    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (!IGNORE_DIRS.includes(file)) {
                searchInDirectory(fullPath);
            }
        } else if (stat.isFile()) {
            // Check extensions
            if (/\.(ts|tsx|js|json|env)$/.test(file)) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    if (content.includes(SEARCH_STRING)) {
                        console.log(`[MATCH] Found "${SEARCH_STRING}" in: ${fullPath}`);
                    }
                } catch (err) {
                    console.error(`Error reading ${fullPath}:`, err);
                }
            }
        }
    }
}

console.log(`Scanning ${TARGET_DIR} for "${SEARCH_STRING}"...`);
searchInDirectory(TARGET_DIR);
console.log("Scan complete.");
