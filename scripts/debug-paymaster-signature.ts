
import { createPublicClient, http, parseAbi, type Hex, getAddress, hashTypedData, domainSeparator } from 'viem';
import { bsc } from 'viem/chains';
import * as dotenv from 'dotenv';

dotenv.config();

const PAYMASTER_ADDRESS = "0x1d3E64c5a4fFfC4e46e70e22c33A1ddaD506c3Aa";
const RPC_URL = "https://bsc-dataseed3.binance.org";
const RADRS_TOKEN = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
const RECEIVER = "0xfb710006a8Ad08a636e919B02B2f9bBbcE524d96";

async function main() {
    console.log("🔍 Debugging Paymaster Signature Logic...");

    const publicClient = createPublicClient({
        chain: bsc,
        transport: http(RPC_URL)
    });

    // 1. Define Test Data
    const feeToken = getAddress(RADRS_TOKEN);
    const feeAmount = 123456789n;
    const receiver = getAddress(RECEIVER);
    const validUntil = 2000000000n; // Future
    const validAfter = 0n;
    const payer = getAddress("0x2C8e27CA6193522d5315F98734dC65412DB0c324"); // Some address (sender)

    console.log("\n📋 Test Parameters:");
    console.log(`   FeeToken:   ${feeToken}`);
    console.log(`   FeeAmount:  ${feeAmount}`);
    console.log(`   Receiver:   ${receiver}`);
    console.log(`   ValidUntil: ${validUntil}`);
    console.log(`   ValidAfter: ${validAfter}`);
    console.log(`   Payer:      ${payer}`);

    // 2. Calculate Local Hash (simulating Backend)
    const domain = {
        name: 'RadrsPaymasterV2',
        version: '1',
        chainId: 56,
        verifyingContract: PAYMASTER_ADDRESS as Hex,
    } as const;

    const types = {
        Sponsor: [
            { name: 'feeToken', type: 'address' },
            { name: 'feeAmount', type: 'uint256' },
            { name: 'receiver', type: 'address' },
            { name: 'validUntil', type: 'uint48' },
            { name: 'validAfter', type: 'uint48' },
            { name: 'payer', type: 'address' }
        ]
    } as const;

    const message = {
        feeToken,
        feeAmount,
        receiver,
        validUntil: Number(validUntil),
        validAfter: Number(validAfter),
        payer
    };

    const localHash = hashTypedData({
        domain,
        types,
        primaryType: 'Sponsor',
        message
    });

    console.log(`\n💻 Local Hash (Backend Logic):    ${localHash}`);

    // 3. Call Contract getHash (On-Chain Logic)
    let contractHash: Hex;
    try {
        contractHash = await publicClient.readContract({
            address: PAYMASTER_ADDRESS,
            abi: parseAbi([
                "function getHash(address feeToken, uint256 feeAmount, address receiver, uint48 validUntil, uint48 validAfter, address payer) view returns (bytes32)"
            ]),
            functionName: "getHash",
            args: [feeToken, feeAmount, receiver, Number(validUntil), Number(validAfter), payer]
        });

        console.log(`🔗 Contract Hash (On-Chain Logic): ${contractHash}`);
    } catch (e: any) {
        console.error("\n❌ Failed to call getHash on contract:", e.shortMessage || e.message);
        return;
    }

    // 4. Brute Force Check Variations
    console.log("\n🕵️  Probing Variations...");

    const combinations = [
        { label: "Current (RadrsPaymasterV2, v1)", name: "RadrsPaymasterV2", version: "1", hasPayer: true },
        { label: "V1 Name (RadrsPaymaster, v1)", name: "RadrsPaymaster", version: "1", hasPayer: true },
        { label: "V1 Struct (RadrsPaymasterV2, v1, No Payer)", name: "RadrsPaymasterV2", version: "1", hasPayer: false },
        { label: "V1 Name & Struct (RadrsPaymaster, v1, No Payer)", name: "RadrsPaymaster", version: "1", hasPayer: false },
        
        // Variations
        { label: "Radrs Paymaster (Space)", name: "Radrs Paymaster", version: "1", hasPayer: true },
        { label: "Radrs Paymaster V2", name: "Radrs Paymaster V2", version: "1", hasPayer: true },
        { label: "Version 2", name: "RadrsPaymasterV2", version: "2", hasPayer: true },
        { label: "Version v1", name: "RadrsPaymasterV2", version: "v1", hasPayer: true },
        { label: "Version 0.0.1", name: "RadrsPaymasterV2", version: "0.0.1", hasPayer: true },
        
        // Chain ID Variations? (Maybe deployed with hardcoded chainID?)
        { label: "ChainID 97 (Testnet)", name: "RadrsPaymasterV2", version: "1", hasPayer: true, chainId: 97 },
    ];

    for (const combo of combinations) {
        const domain = {
            name: combo.name,
            version: combo.version,
            chainId: (combo as any).chainId || 56,
            verifyingContract: PAYMASTER_ADDRESS as Hex,
        } as const;

        let types: any;
        let message: any;

        if (combo.hasPayer) {
            types = {
                Sponsor: [
                    { name: 'feeToken', type: 'address' },
                    { name: 'feeAmount', type: 'uint256' },
                    { name: 'receiver', type: 'address' },
                    { name: 'validUntil', type: 'uint48' },
                    { name: 'validAfter', type: 'uint48' },
                    { name: 'payer', type: 'address' }
                ]
            };
            message = {
                feeToken,
                feeAmount,
                receiver,
                validUntil: Number(validUntil),
                validAfter: Number(validAfter),
                payer
            };
        } else {
             types = {
                Sponsor: [
                    { name: 'feeToken', type: 'address' },
                    { name: 'feeAmount', type: 'uint256' },
                    { name: 'receiver', type: 'address' },
                    { name: 'validUntil', type: 'uint48' },
                    { name: 'validAfter', type: 'uint48' }
                ]
            };
            message = {
                feeToken,
                feeAmount,
                receiver,
                validUntil: Number(validUntil),
                validAfter: Number(validAfter)
            };
        }

        const hash = hashTypedData({
            domain,
            types,
            primaryType: 'Sponsor',
            message
        });

        const match = hash === contractHash;
        console.log(`   [${match ? '✅' : '❌'}] ${combo.label}`);
        console.log(`       Hash: ${hash}`);

    // 5. Verify Signature Recovery
    console.log("\n🔐 Verifying Signature Recovery...");
    
    if (!process.env.PAYMASTER_SIGNER_KEY) {
        console.log("❌ PAYMASTER_SIGNER_KEY missing in .env");
        return;
    }

    const { privateKeyToAccount } = await import('viem/accounts');
    const signer = privateKeyToAccount(process.env.PAYMASTER_SIGNER_KEY as Hex);
    console.log(`   Signer Address: ${signer.address}`);

    const signature = await signer.signTypedData({
        domain: {
            name: 'RadrsPaymasterV2',
            version: '1',
            chainId: 56,
            verifyingContract: PAYMASTER_ADDRESS as Hex,
        },
        types: {
            Sponsor: [
                { name: 'feeToken', type: 'address' },
                { name: 'feeAmount', type: 'uint256' },
                { name: 'receiver', type: 'address' },
                { name: 'validUntil', type: 'uint48' },
                { name: 'validAfter', type: 'uint48' },
                { name: 'payer', type: 'address' }
            ]
        },
        primaryType: 'Sponsor',
        message: {
            feeToken,
            feeAmount,
            receiver,
            validUntil: Number(validUntil),
            validAfter: Number(validAfter),
            payer
        }
    });
    console.log(`   Signature:      ${signature}`);

    const recovered = await publicClient.readContract({
        address: PAYMASTER_ADDRESS,
        abi: parseAbi([
             "function verifyingSigner() view returns (address)",
             // We can't call _validatePaymasterUserOp directly, but we can verify hash recovery if we deploy a helper or just trust the hash match + recover lib.
             // But wait, we can verify if the signature is valid for the hash using recoverAddress from viem
        ]),
        functionName: "verifyingSigner"
    });
    console.log(`   On-Chain Signer: ${recovered}`);

    const { recoverTypedDataAddress } = await import('viem');
    const recoveredLocal = await recoverTypedDataAddress({
        domain: {
            name: 'RadrsPaymasterV2',
            version: '1',
            chainId: 56,
            verifyingContract: PAYMASTER_ADDRESS as Hex,
        },
        types: {
            Sponsor: [
                { name: 'feeToken', type: 'address' },
                { name: 'feeAmount', type: 'uint256' },
                { name: 'receiver', type: 'address' },
                { name: 'validUntil', type: 'uint48' },
                { name: 'validAfter', type: 'uint48' },
                { name: 'payer', type: 'address' }
            ]
        },
        primaryType: 'Sponsor',
        message: {
            feeToken,
            feeAmount,
            receiver,
            validUntil: Number(validUntil),
            validAfter: Number(validAfter),
            payer
        },
        signature
    });
    
    console.log(`   Recovered Local: ${recoveredLocal}`);
    
    if (recoveredLocal.toLowerCase() === recovered.toLowerCase()) {
        console.log("✅ Signature is VALID locally.");
    } else {
        console.log("❌ Signature is INVALID locally.");
    }
}
}

main().catch(console.error);
