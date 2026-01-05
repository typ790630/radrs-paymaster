
import { createSmartAccountClient, SmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPublicClient, createWalletClient, http, fallback, type Hex, encodeFunctionData, parseAbi, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bundlerActions, entryPoint07Address } from 'viem/account-abstraction';
import { BUNDLER_URL, CHAIN, PAYMASTER_ADDRESS, RADRS_TOKEN_ADDRESS, ENTRY_POINT_ADDRESS, PAYMASTER_API_URL } from "../config.ts";

// Interface for Transaction
interface TransactionRequest {
    to: Hex;
    value: bigint;
    data: Hex;
}

export class AaRadrsService {
    private publicClient;

    constructor() {
        // Use standard RPC for read operations (faster/cheaper than Bundler)
        this.publicClient = createPublicClient({
            chain: CHAIN,
            transport: fallback([
                http("https://bsc-dataseed1.binance.org"),
                http("https://bsc-dataseed1.defibit.io"),
                http("https://bsc-dataseed1.ninicoin.io"),
            ]),
        });
    }

    // Initialize Smart Account
    async createAccount(privateKey: Hex) {
        const owner = privateKeyToAccount(privateKey);
        
        const simpleAccount = await toSimpleSmartAccount({
            client: this.publicClient,
            owner: owner,
            entryPoint: {
                address: ENTRY_POINT_ADDRESS,
                version: "0.7"
            },
            factoryAddress: "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985", // SimpleAccountFactory v0.7
        });

        return simpleAccount;
    }

    // Call Backend Quote
    async getQuote(userOp: any) {
        try {
            const response = await fetch(`${PAYMASTER_API_URL}/paymaster/quote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chainId: 56,
                    userOp
                })
            });
            return await response.json() as any;
        } catch (e) {
            console.error("Quote failed", e);
            return null;
        }
    }

    // Send Transaction (Single or Batch) using RADRS as Gas
    async sendTransactionWithRadrsGas(
        privateKey: Hex, 
        txOrTxs: TransactionRequest | TransactionRequest[],
        onStatusUpdate?: (status: "CHECKING" | "APPROVING" | "WAITING_APPROVAL" | "SENDING_TX") => void,
        requiredTokenAmount: bigint = 0n
    ) {
        // Debug Log
        console.log("Using Bundler URL:", BUNDLER_URL);
        console.log("Using Paymaster Address (Config):", PAYMASTER_ADDRESS);
        console.log("Using Paymaster API (CRITICAL CHECK):", PAYMASTER_API_URL); // Highlight this log
        if (PAYMASTER_API_URL.includes("localhost")) {
            console.error("⚠️ WARNING: STILL USING LOCALHOST! PLEASE RESTART METRO BUNDLER WITH --clear");
        }

        if (onStatusUpdate) onStatusUpdate("CHECKING");
        
        const account = await this.createAccount(privateKey);
        const ownerAccount = privateKeyToAccount(privateKey); // EOA
        console.log("我的 Smart Account 地址:", account.address);
        console.log("我的 EOA 地址:", ownerAccount.address);
        
        // 1. Check Balances & Determine Payer
        const erc20Abi = parseAbi([
            "function balanceOf(address account) view returns (uint256)",
            "function allowance(address owner, address spender) view returns (uint256)",
            "function approve(address spender, uint256 amount) returns (bool)"
        ]);

        const aaBalance = await this.publicClient.readContract({
            address: RADRS_TOKEN_ADDRESS as Hex,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account.address]
        }) as bigint;

        const eoaBalance = await this.publicClient.readContract({
            address: RADRS_TOKEN_ADDRESS as Hex,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [ownerAccount.address]
        }) as bigint;

        console.log(`[AA Service] RADRS Balance - AA: ${aaBalance}, EOA: ${eoaBalance}`);

        let payer: Hex = account.address; // Default to AA
        let useEoaPayment = false;
        const MIN_REQUIRED = parseEther("100"); // 100 RADRS Min

        if (aaBalance >= MIN_REQUIRED) {
            console.log("[AA Service] Using AA Wallet for Gas Payment.");
            payer = account.address;
        } else if (eoaBalance >= MIN_REQUIRED) {
            console.log("[AA Service] AA Wallet empty. Using EOA Wallet for Gas Payment.");
            payer = ownerAccount.address;
            useEoaPayment = true;
        } else {
            // Throw descriptive error
            throw new Error(`Insufficient RADRS Balance. AA: ${aaBalance}, EOA: ${eoaBalance}. Need 100+ RADRS.`);
        }

        // Prepare Transactions
        let finalTxs: TransactionRequest[] = Array.isArray(txOrTxs) ? [...txOrTxs] : [txOrTxs];

        // 2. Check Paymaster Allowance
        const allowance = await this.publicClient.readContract({
            address: RADRS_TOKEN_ADDRESS as Hex,
            abi: erc20Abi,
            functionName: "allowance",
            args: [payer, PAYMASTER_ADDRESS as Hex]
        }) as bigint;

        console.log(`[AA Service] Payer (${payer}) Allowance: ${allowance}`);

        // 3. Inject Approve if needed
        if (allowance < parseEther("500")) { // Threshold: 500 RADRS
             console.log("[AA Service] Allowance low. Initiating Approval...");
             if (onStatusUpdate) onStatusUpdate("APPROVING");
             
             if (useEoaPayment) {
                 // EOA must approve via standard transaction
                 console.log("[AA Service] Sending EOA Approve Transaction...");
                 try {
                     const walletClient = createWalletClient({
                         account: ownerAccount,
                         chain: CHAIN,
                         transport: http("https://bsc-dataseed1.binance.org")
                     });
                     
                     const hash = await walletClient.writeContract({
                         address: RADRS_TOKEN_ADDRESS as Hex,
                         abi: erc20Abi,
                         functionName: "approve",
                         args: [PAYMASTER_ADDRESS as Hex, 115792089237316195423570985008687907853269984665640564039457584007913129639935n]
                     });
                     console.log(`[AA Service] EOA Approve Tx: ${hash}`);
                     // Wait for confirmation
                     await this.publicClient.waitForTransactionReceipt({ hash });
                     console.log("[AA Service] EOA Approve Confirmed.");
                 } catch (e) {
                     console.error("EOA Approve Failed:", e);
                     throw new Error("Failed to approve Paymaster from EOA. Please check BNB balance.");
                 }
             } else {
                 // AA can approve via Batch
                 console.log("[AA Service] Injecting AA Approve Transaction...");
                 const approveTx = {
                     to: RADRS_TOKEN_ADDRESS as Hex,
                     value: 0n,
                     data: encodeFunctionData({
                         abi: erc20Abi,
                         functionName: "approve",
                         args: [PAYMASTER_ADDRESS as Hex, 115792089237316195423570985008687907853269984665640564039457584007913129639935n] // Max Uint256
                     })
                 };
                 finalTxs.unshift(approveTx);
             }
        }
        
        // Setup Smart Account Client
        const smartAccountClient = createSmartAccountClient({
            account,
            chain: CHAIN, // This is 'bsc' (id: 56)
            bundlerTransport: http(BUNDLER_URL),
            entryPoint: {
                address: ENTRY_POINT_ADDRESS,
                version: "0.7"
            },
            paymaster: {
                getPaymasterData: async (userOp) => {
                    console.log("Requesting Paymaster Data...");
                    try {
                        // Helper to stringify BigInt (Prevent "Do not know how to serialize a BigInt")
                        const replacer = (key: string, value: any) => 
                            typeof value === 'bigint' ? value.toString() : value;

                        const response = await fetch(`${PAYMASTER_API_URL}/paymaster/sponsor`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chainId: 56,
                                userOp,
                                entryPoint: ENTRY_POINT_ADDRESS,
                                payer: payer // Pass the determined payer
                            }, replacer)
                        });
                        
                        const data = await response.json() as any;
                        if (data.error) throw new Error(data.error);
                        
                        console.log("Paymaster Sponsor Success:", data);
                        
                        const pAndD = data.paymasterAndData as string;
                        const paymasterData = ("0x" + pAndD.slice(42)) as Hex;

                        return {
                            paymaster: PAYMASTER_ADDRESS as Hex,
                            paymasterData: paymasterData,
                        };
                    } catch (error) {
                        console.error("Paymaster Sponsor Failed:", error);
                        throw error;
                    }
                },
                getPaymasterStubData: async (userOp) => {
                     return {
                        paymaster: PAYMASTER_ADDRESS as Hex,
                        paymasterData: ("0x" + "00".repeat(200)) as Hex,
                     } as any;
                }
            }
        });

        if (onStatusUpdate) onStatusUpdate("SENDING_TX");

        console.log(`[AA Service] Sending ${finalTxs.length} transactions (Batch)...`);
        
        // sanitize
        const transactions = finalTxs.map(t => ({
            to: t.to,
            value: t.value || 0n,
            data: t.data
        }));

        try {
            console.log("[AA Service] Sending via Bundler (Auto Gas Estimation)...");
            
            // Send Transactions (Bundler will handle gas estimation now that URL is fixed)
            const txHash = await smartAccountClient.sendTransactions({
                transactions
            });
            return txHash;
        } catch (error: any) {
            console.error("[AA Service] Transaction Failed:", error);

            // Handle "Method not found" specifically by forcing a fallback or helpful error
            if (error.message?.includes("Method not found") || error.code === -32601) {
                console.error("❌ CRITICAL: App is still using the wrong Bundler URL!");
                console.error("Please run: npx expo start --clear");
            }

            // Handle "chain not supported" error specifically
            if (error.message?.includes("chain \"bsc-mainnet\" is not supported")) {
                 console.error("❌ CRITICAL: Bundler Chain Mismatch!");
                 console.warn("⚠️ Trying to force 'binance' chain definition if possible, but this requires deep config changes.");
            }
            
            // Auto Retry for Nonce Error
            if (error.message && (error.message.includes("AA25") || error.message.includes("nonce"))) {
                console.warn("[AA Service] Nonce Error detected. Retrying with delay...");
                await new Promise(r => setTimeout(r, 2000)); // Wait 2s
                // Re-calculate gas limit for retry? Or reuse? Let's assume reuse for now or keep it simple
                const txHashRetry = await smartAccountClient.sendTransactions({
                    transactions
                });
                return txHashRetry;
            }
            throw error;
        }
    }
}
