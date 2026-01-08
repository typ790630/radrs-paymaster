
import { createPublicClient, createClient, http, parseAbi, encodeAbiParameters, parseAbiParameters, createWalletClient, type Hex, getAddress, encodeFunctionData, toHex } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { bundlerActions } from 'viem/account-abstraction';
import { toSimpleSmartAccount } from 'permissionless/accounts';
import { createSmartAccountClient } from 'permissionless';

// Config
const PAYMASTER_ADDRESS = "0x1f29efB2d33BC425B3C4050804D55047d872A3dC";
const PAYMASTER_SIGNER_KEY = "0x51522ba5d94939fd40a8436b029d6457b02648a0891e7197df550a82a249b0d8";
const RADRS_TOKEN_ADDRESS = "0xe2188a2e0a41a50f09359e5fe714d5e643036f2a";
const FEE_COLLECTOR = "0xfb710006a8Ad08a636e919B02B2f9bBbcE524d96";
const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const BUNDLER_URL = "https://public.pimlico.io/v2/56/rpc";
const RPC_URL = "https://bsc-rpc.publicnode.com";

async function main() {
    console.log("Debug AA94 Script with Permissionless Client");
    
    // 1. Setup
    const signer = privateKeyToAccount(PAYMASTER_SIGNER_KEY);
    const userKey = generatePrivateKey();
    const user = privateKeyToAccount(userKey);
    console.log("User:", user.address);

    const publicClient = createPublicClient({
        chain: bsc,
        transport: http(RPC_URL)
    });

    const simpleAccount = await toSimpleSmartAccount({
        client: publicClient,
        owner: user,
        entryPoint: {
            address: ENTRY_POINT,
            version: "0.7"
        },
        factoryAddress: "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985",
    });

    console.log("Sender AA:", simpleAccount.address);

    // 2. Mock Paymaster Logic
    const getPaymasterData = async (userOp: any) => {
        console.log("Mocking Paymaster Response...");
        
        const validUntil = Math.floor(Date.now() / 1000) + 3600;
        const validAfter = 0;
        const feeToken = RADRS_TOKEN_ADDRESS;
        const feeAmount = 0n; // Free
        const receiver = FEE_COLLECTOR;
        const payer = simpleAccount.address;

        const domain = {
            name: 'RadrsPaymasterV3',
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
                { name: 'payer', type: 'address' }
            ]
        } as const;

        const message = {
            feeToken,
            feeAmount,
            receiver,
            validUntil,
            validAfter,
            payer
        };

        const signature = await signer.signTypedData({
            domain,
            types,
            primaryType: 'Sponsor',
            message
        });

        const encodedData = encodeAbiParameters(
            parseAbiParameters('address, uint256, address, uint48, uint48, address, bytes'),
            [feeToken, feeAmount, receiver, validUntil, validAfter, payer, signature]
        );

        // Client logic from aaRadrsService.ts:
        // const paymasterAndData = `${CONFIG.PAYMASTER_ADDRESS}${encodedData.slice(2)}` as Hex;
        // const pAndD = data.paymasterAndData as string;
        // const paymasterData = ("0x" + pAndD.slice(42)) as Hex;
        
        // So effectively:
        const paymasterData = encodedData; 

        return {
            paymaster: PAYMASTER_ADDRESS as Hex,
            paymasterData: paymasterData as Hex,
            paymasterVerificationGasLimit: 100000n, // Explicit limit
            paymasterPostOpGasLimit: 0n,
        };
    };

    // 3. Create Smart Account Client
    const smartAccountClient = createSmartAccountClient({
        account: simpleAccount,
        chain: bsc,
        bundlerTransport: http(BUNDLER_URL),
        paymaster: {
            getPaymasterData,
            getPaymasterStubData: async (userOp) => {
                // Call real paymaster logic for stub to get valid signature
                // Or use the same mock logic
                console.log("Mocking Stub with Valid Signature...");
                return await getPaymasterData(userOp);
            }
        }
    });

    // 4. Send Transaction
    console.log("Sending Transaction...");
    try {
        const txHash = await smartAccountClient.sendTransaction({
            to: user.address,
            value: 0n,
            data: "0x",
        });
        console.log("Transaction Sent:", txHash);
    } catch (e: any) {
        // Log Full Error Structure
        console.error("Transaction Failed:", e.message || e);
        if(e.details) console.error("Details:", e.details);
        // Sometimes error is nested
        if (e.cause) {
            console.error("Cause:", e.cause);
            if ((e.cause as any).data) console.error("Cause Data:", (e.cause as any).data);
        }
    }
}

main();
