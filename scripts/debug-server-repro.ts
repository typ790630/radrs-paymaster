
import { createPublicClient, http, getAddress, createWalletClient, parseAbiParameters, encodeAbiParameters, hexToBigInt } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    const PRIVATE_KEY = process.env.PAYMASTER_SIGNER_KEY as `0x${string}`;
    const PAYMASTER_ADDRESS = "0x1d3E64c5a4fFfC4e46e70e22c33A1ddaD506c3Aa";
    const RADRS_TOKEN = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
    const RECEIVER = "0xfb710006a8Ad08a636e919B02B2f9bBbcE524d96";
    const SENDER = "0x9ADBbea6886A7DD09BF6Ddb26730F54772a3e946";
    
    // Values from failure
    const feeAmount = 0n;
    const validUntil = 1767507692;
    const validAfter = 0;

    const account = privateKeyToAccount(PRIVATE_KEY);

    const domain = {
        name: 'RadrsPaymaster',
        version: '1',
        chainId: 56,
        verifyingContract: PAYMASTER_ADDRESS,
    } as const;

    const types = {
        Sponsor: [
            { name: 'feeToken', type: 'address' },
            { name: 'feeAmount', type: 'uint256' },
            { name: 'receiver', type: 'address' },
            { name: 'validUntil', type: 'uint48' },
            { name: 'validAfter', type: 'uint48' },
            { name: 'sender', type: 'address' }
        ]
    } as const;

    const message = {
        feeToken: getAddress(RADRS_TOKEN),
        feeAmount: feeAmount,
        receiver: getAddress(RECEIVER),
        validUntil: validUntil,
        validAfter: validAfter,
        sender: getAddress(SENDER)
    };

    console.log("Signing with Viem...");
    console.log("Signer:", account.address);
    console.log("Domain:", domain);
    console.log("Message:", message);

    const signature = await account.signTypedData({
        domain,
        types,
        primaryType: 'Sponsor',
        message
    });

    console.log("Viem Signature:", signature);
    
    // Now verify with Ethers logic (simulating contract/debug script)
    // We can't easily import ethers here due to module type conflict in this env, 
    // but we can print the signature and compare with the one from debug-aa24.ts
}

main().catch(console.error);
