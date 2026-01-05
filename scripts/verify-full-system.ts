
import { ethers } from "ethers";
import "dotenv/config";
import { createPublicClient, http, hexToBigInt } from "viem";
import { bsc } from "viem/chains";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

// Configuration
const SERVER_URL = "http://localhost:3000";
const RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Contract Addresses (from your env/code)
const PAYMASTER_ADDRESS = "0x5C0bD096AA299955991610B12D4539aeb8CEc0e7";
const RADRS_TOKEN = "0xe2188a2e0a41a50f09359e5fe714d5e643036f2a";
const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

// Colors for output
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function log(msg: string, color: string = RESET) {
    console.log(`${color}${msg}${RESET}`);
}

async function main() {
    log("🚀 Starting Full System Verification...", GREEN);

    if (!PRIVATE_KEY) {
        log("❌ PRIVATE_KEY not found in .env", RED);
        process.exit(1);
    }

    // 1. Setup Provider & Wallet
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    log(`✅ Wallet loaded: ${wallet.address}`, GREEN);

    // 2. Check Paymaster Chain State
    log("\n🔍 Checking Paymaster On-Chain State...", YELLOW);
    const paymasterAbi = [
        "function verifyingSigner() view returns (address)",
        "function owner() view returns (address)"
    ];
    const paymasterContract = new ethers.Contract(PAYMASTER_ADDRESS, paymasterAbi, provider);
    
    try {
        const signer = await paymasterContract.verifyingSigner();
        log(`   Verifying Signer: ${signer}`, GREEN);
        
        // Check EntryPoint Balance
        const epAbi = ["function balanceOf(address) view returns (uint256)"];
        const epContract = new ethers.Contract(ENTRY_POINT, epAbi, provider);
        const balance = await epContract.balanceOf(PAYMASTER_ADDRESS);
        const balanceBNB = ethers.formatEther(balance);
        
        if (parseFloat(balanceBNB) < 0.01) {
            log(`⚠️  Paymaster Balance Low: ${balanceBNB} BNB`, RED);
            log(`   Please run: npx hardhat run scripts/deposit-paymaster.ts`, YELLOW);
        } else {
            log(`✅ Paymaster Balance: ${balanceBNB} BNB`, GREEN);
        }
    } catch (e: any) {
        log(`❌ Failed to read Paymaster state: ${e.message}`, RED);
        return;
    }

    // 3. Check Server Connectivity
    log("\n🌐 Checking Backend Server...", YELLOW);
    let serverRunning = false;
    try {
        await fetch(`${SERVER_URL}/paymaster/quote`, { 
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chainId: 56, userOp: {} }) // Intentionally bad req to check connectivity
        });
        serverRunning = true;
    } catch (e: any) {
        // 500 or 400 is fine, means server is there. Connection refused is bad.
        if (e.cause && e.cause.code === 'ECONNREFUSED') {
            serverRunning = false;
        } else {
            serverRunning = true;
        }
    }

    if (!serverRunning) {
        log("❌ Server not running on port 3000. Please start it with 'npm start' in server directory.", RED);
        return;
    } else {
        log("✅ Server is already running.", GREEN);
    }

    // 4. Functional Test: Quote & Sponsor
    log("\n🧪 Testing API Logic...", YELLOW);
    
    // Mock UserOp
    const mockUserOp = {
        sender: wallet.address,
        nonce: "0x0",
        initCode: "0x",
        callData: "0x",
        callGasLimit: "0x" + (50000).toString(16),
        verificationGasLimit: "0x" + (100000).toString(16),
        preVerificationGas: "0x" + (21000).toString(16),
        maxFeePerGas: "0x" + (3000000000).toString(16), // 3 gwei
        maxPriorityFeePerGas: "0x" + (1000000000).toString(16), // 1 gwei
        paymasterAndData: "0x",
        signature: "0x"
    };

    try {
        // A. Get Quote
        const quoteRes = await fetch(`${SERVER_URL}/paymaster/quote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chainId: 56, userOp: mockUserOp })
        });
        const quoteData = await quoteRes.json() as any;
        
        if (quoteData.error) throw new Error(quoteData.error);
        log(`✅ Quote Received: ${quoteData.radrsFee} RADRS for ${quoteData.gasCostBNB} BNB`, GREEN);

        // B. Get Sponsor
        const sponsorRes = await fetch(`${SERVER_URL}/paymaster/sponsor`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chainId: 56, userOp: mockUserOp, entryPoint: ENTRY_POINT })
        });
        const sponsorData = await sponsorRes.json() as any;
        
        if (sponsorData.error) throw new Error(sponsorData.error);
        log(`✅ Sponsor Data Received!`, GREEN);
        console.log(`   PaymasterAndData: ${sponsorData.paymasterAndData.slice(0, 60)}...`);

        // 5. Verify Signature Logic
        log("\n🔐 Verifying Signature...", YELLOW);
        
        // Decode paymasterAndData
        // paymasterAndData = paymaster (20) + abi.encode(...)
        const pnd = sponsorData.paymasterAndData;
        const paymasterAddrFromData = pnd.slice(0, 42);
        
        if (paymasterAddrFromData.toLowerCase() !== PAYMASTER_ADDRESS.toLowerCase()) {
            throw new Error(`Address mismatch! Got ${paymasterAddrFromData}, expected ${PAYMASTER_ADDRESS}`);
        }

        const encodedParams = "0x" + pnd.slice(42);
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
            ['address', 'uint256', 'address', 'uint48', 'uint48', 'bytes'],
            encodedParams
        );
        
        const [feeToken, feeAmount, receiver, validUntil, validAfter, signature] = decoded;
        
        log(`   Decoded Fee: ${feeAmount} RADRS`, RESET);
        log(`   Valid Until: ${validUntil}`, RESET);

        // Reconstruct Hash
        const domain = {
            name: 'RadrsPaymaster',
            version: '1',
            chainId: 56,
            verifyingContract: PAYMASTER_ADDRESS
        };

        const types = {
            Sponsor: [
                { name: 'feeToken', type: 'address' },
                { name: 'feeAmount', type: 'uint256' },
                { name: 'receiver', type: 'address' },
                { name: 'validUntil', type: 'uint48' },
                { name: 'validAfter', type: 'uint48' },
                { name: 'sender', type: 'address' }
            ]
        };

        const message = {
            feeToken,
            feeAmount,
            receiver,
            validUntil,
            validAfter,
            sender: mockUserOp.sender
        };

        const recoveredSigner = ethers.verifyTypedData(domain, types, message, signature);
        
        const onChainSigner = await paymasterContract.verifyingSigner();
        
        if (recoveredSigner.toLowerCase() === onChainSigner.toLowerCase()) {
            log(`✅ Signature Valid! Matches on-chain signer: ${onChainSigner}`, GREEN);
        } else {
            log(`❌ Signature Invalid!`, RED);
            log(`   Recovered: ${recoveredSigner}`, RED);
            log(`   Expected:  ${onChainSigner}`, RED);
        }

        // 6. Check User RADRS Balance
        log("\n💰 Checking User RADRS Balance...", YELLOW);
        const radrsAbi = [
            "function balanceOf(address) view returns (uint256)",
            "function allowance(address, address) view returns (uint256)"
        ];
        const radrsContract = new ethers.Contract(RADRS_TOKEN, radrsAbi, provider);
        const userRadrs = await radrsContract.balanceOf(wallet.address);
        const allowance = await radrsContract.allowance(wallet.address, PAYMASTER_ADDRESS);

        if (userRadrs >= feeAmount) {
             log(`✅ User has enough RADRS: ${ethers.formatEther(userRadrs)}`, GREEN);
        } else {
             log(`❌ User RADRS insufficient. Have: ${ethers.formatEther(userRadrs)}, Need: ${ethers.formatEther(feeAmount)}`, RED);
             log(`   Contract will revert with InsufficientBalance(${feeAmount}, ${userRadrs})`, RED);
        }

        if (allowance >= feeAmount) {
             log(`✅ Paymaster Allowance OK: ${ethers.formatEther(allowance)}`, GREEN);
        } else {
             log(`❌ Paymaster Allowance insufficient. Current: ${ethers.formatEther(allowance)}`, RED);
             log(`   Contract will revert with InsufficientAllowance(${feeAmount}, ${allowance})`, RED);
             log(`   User needs to approve RADRS to ${PAYMASTER_ADDRESS}`, YELLOW);
        }

    } catch (e: any) {
        log(`❌ Test Failed: ${e.message}`, RED);
    }
}

main().catch(console.error);
