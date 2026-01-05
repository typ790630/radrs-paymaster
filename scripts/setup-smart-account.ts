
import { createPublicClient, createWalletClient, http, parseEther, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import * as dotenv from "dotenv";

dotenv.config();

const ENTRYPOINT_ADDRESS_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const PAYMASTER_ADDRESS = "0x719DF2711f9552338527755Dd4c8cC1B8Ff17132";
const FACTORY_ADDRESS = "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985";
const RADRS_TOKEN = "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A";
const BUNDLER_URL = process.env.EXPO_PUBLIC_BUNDLER_URL;
const BSC_RPC = "https://bsc-dataseed1.binance.org";

async function main() {
    const publicClient = createPublicClient({
        chain: bsc,
        transport: http(BSC_RPC),
    });

    const deployerAccount = privateKeyToAccount(process.env.PRIVATE_KEY as Hex);
    const walletClient = createWalletClient({
        account: deployerAccount,
        chain: bsc,
        transport: http(BSC_RPC),
    });

    console.log(`Deployer: ${deployerAccount.address}`);

    // 1. Initialize Smart Account
    const simpleAccount = await toSimpleSmartAccount({
        client: publicClient,
        owner: deployerAccount,
        entryPoint: {
            address: ENTRYPOINT_ADDRESS_V07,
            version: "0.7"
        },
        factoryAddress: FACTORY_ADDRESS
    });
    
    const smartAccountAddress = simpleAccount.address;
    console.log(`Smart Account: ${smartAccountAddress}`);

    // Check Balance first
    const saBalance = await publicClient.getBalance({ address: smartAccountAddress });
    console.log(`Smart Account Balance: ${Number(saBalance)/1e18} BNB`);

    if (saBalance < parseEther("0.002")) {
        // 2. Fund Smart Account with 0.003 BNB (for Approval Tx Gas)
        console.log("Funding Smart Account with 0.003 BNB...");
        const tx1 = await walletClient.sendTransaction({
            to: smartAccountAddress,
            value: parseEther("0.003")
        });
        console.log(`Funded Smart Account: ${tx1}`);
        await publicClient.waitForTransactionReceipt({ hash: tx1 });
    } else {
        console.log("Smart Account already funded.");
    }

    // Check Paymaster Deposit
    const entryPointAbi = parseAbi([
        "function depositTo(address account) external payable",
        "function balanceOf(address account) external view returns (uint256)"
    ]);

    const pmDeposit = await publicClient.readContract({
        address: ENTRYPOINT_ADDRESS_V07,
        abi: entryPointAbi,
        functionName: "balanceOf",
        args: [PAYMASTER_ADDRESS]
    });
    console.log(`Paymaster Deposit: ${Number(pmDeposit)/1e18} BNB`);

    if (pmDeposit < parseEther("0.02")) {
        // 3. Fund Paymaster Deposit (0.01 BNB)
        console.log("Funding Paymaster Deposit on EntryPoint (0.01 BNB)...");
        const tx2 = await walletClient.writeContract({
            address: ENTRYPOINT_ADDRESS_V07,
            abi: entryPointAbi,
            functionName: "depositTo",
            args: [PAYMASTER_ADDRESS],
            value: parseEther("0.01")
        });
        console.log(`Funded Paymaster Deposit: ${tx2}`);
        await publicClient.waitForTransactionReceipt({ hash: tx2 });
    } else {
        console.log("Paymaster already has sufficient deposit.");
    }

    // Check Allowance
    const erc20Abi = parseAbi([
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) external view returns (uint256)"
    ]);
    
    const allowance = await publicClient.readContract({
        address: RADRS_TOKEN,
        abi: erc20Abi,
        functionName: "allowance",
        args: [smartAccountAddress, PAYMASTER_ADDRESS]
    });

    if (allowance === 0n) {
        // 4. Execute Approve Transaction (using BNB for gas)
        console.log("Approving Paymaster to spend RADRS...");
        
        const smartAccountClient = createSmartAccountClient({
            account: simpleAccount,
            chain: bsc,
            bundlerTransport: http(BUNDLER_URL),
        });

        // Explicitly fetching gas price to avoid estimation errors if any
        const gasPrice = await publicClient.getGasPrice();

        const txHash = await smartAccountClient.sendTransaction({
            to: RADRS_TOKEN,
            data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "approve",
                args: [PAYMASTER_ADDRESS, maxUint256]
            }),
            value: 0n,
            maxFeePerGas: gasPrice,
            maxPriorityFeePerGas: gasPrice
        });

        console.log(`Approval UserOp Sent! Tx Hash: ${txHash}`);
        
        // Wait for it
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`Approval Confirmed in block ${receipt.blockNumber}`);
    } else {
        console.log("Paymaster already approved.");
    }
}

import { encodeFunctionData, maxUint256 } from "viem";

main().catch(console.error);
