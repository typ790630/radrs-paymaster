import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function searchFiles(dir, pattern) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') {
                searchFiles(filePath, pattern);
            }
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
            const content = fs.readFileSync(filePath, 'utf8');
            if (content.includes(pattern)) {
                console.log(`FOUND IN: ${filePath}`);
                const lines = content.split('\n');
                lines.forEach((line, index) => {
                    if (line.includes(pattern)) {
                        console.log(`  Line ${index + 1}: ${line.trim()}`);
                    }
                });
            }
        }
    });
}

console.log("Searching for 'executeSwap' in client directory...");
searchFiles(path.join(__dirname, '../client'), 'executeSwap');
