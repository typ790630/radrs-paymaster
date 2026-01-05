
import { createPublicClient, http, fallback, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import { toSimpleSmartAccount } from "permissionless/accounts";

// Constants
const RADRS_TOKEN_ADDRESS = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
const PAYMASTER_ADDRESS = "0x7Be3A50B2a062a8dD1b24C0D77D0Cc8D8b19618A";
const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

const client = createPublicClient({
    chain: bsc,
    transport: http("https://bsc-dataseed1.binance.org"),
});

async function run() {
    const owner = privateKeyToAccount("0x1111111111111111111111111111111111111111111111111111111111111111");

    const simpleAccount = await toSimpleSmartAccount({
        client,
        owner,
        entryPoint: {
            address: ENTRY_POINT_ADDRESS,
            version: "0.7"
        },
        factoryAddress: "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985",
    });

    console.log("Account Keys:", Object.keys(simpleAccount));

    const smartAccountClient = createPublicClient({
        chain: bsc,
        transport: http("https://bsc-dataseed1.binance.org"),
    });

    // Manually construct call data if encodeCallData is missing
    // Standard SimpleAccount execute: 0xb61d27f6 + address + value + bytes
    // But we want to see what permissionless DOES.
    
    // Let's try to use the client to prepare a UserOp if possible, 
    // or just inspect how we can generate callData.
    
    // Check for encodeCallData or encodeCalls
    if ('encodeCalls' in simpleAccount) {
        const approveData = "0x095ea7b30000000000000000000000007be3a50b2a062a8dd1b24c0d77d0cc8d8b19618affffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as Hex;
        const callData = await simpleAccount.encodeCalls([{
            to: RADRS_TOKEN_ADDRESS,
            value: 0n,
            data: approveData
        }]);
        console.log("Generated CallData:", callData);
    } else {
        console.log("encodeCallData not found on account object.");
    }
}

run();
