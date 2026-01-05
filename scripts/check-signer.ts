import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
dotenv.config();

const key = process.env.PAYMASTER_SIGNER_KEY as `0x${string}`;
if (!key) {
    console.log("No PAYMASTER_SIGNER_KEY found");
} else {
    const account = privateKeyToAccount(key);
    console.log("Signer Address:", account.address);
}
