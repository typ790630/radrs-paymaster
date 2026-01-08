
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

// 1. Old Key (from .env)
const oldKey = "0x013c44a3940c1c417b4600172f6a9be1fcda401c678b980b2baa809458057994";
const oldAccount = privateKeyToAccount(oldKey);
console.log("🚫 旧钱包地址 (已泄露/被标记):", oldAccount.address);

// 2. Generate New Key
const newKey = generatePrivateKey();
const newAccount = privateKeyToAccount(newKey);

console.log("\n✅ 新钱包已生成!");
console.log("---------------------------------------------------");
console.log("私钥 (Private Key):", newKey);
console.log("地址 (Address):    ", newAccount.address);
console.log("---------------------------------------------------");
console.log("\n⚠️ 请务必保存好这个新私钥，不要再发给任何人，也不要提交到 GitHub！");
console.log("👉 现在，请尝试往这个【新地址】转入 BNB。");
