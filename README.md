# Radrs Paymaster

A custom Paymaster implementation for BSC that allows users to pay gas fees using RADRS tokens.

## Features

- **Gasless Approval**: Users don't need BNB to approve the Paymaster. The Paymaster sponsors the `approve` transaction.
- **RADRS as Gas**: Users pay transaction fees in RADRS tokens.
- **Two-Step Flow**:
  1. **Step 1**: "Approve Only" UserOp (Sponsored by Paymaster, User pays 0).
  2. **Step 2**: Business UserOp (User pays RADRS fee).

## Contracts

- **RadrsPaymaster.sol**: The core logic.
  - Address: `0xcA0069bD0894432972D3b480ddc48d5A626f47E1` (BSC Mainnet)
  - Token: `RADRS` (`0xe2188A2E0a41A50F09359E5FE714D5e643036f2A`)
  - Fee Receiver: `0xfb710006a8Ad08a636e919B02B2f9bBbcE524d96`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   Copy `.env.example` to `.env` and fill in your details.
   ```bash
   cp .env.example .env
   ```
   - `EXPO_PUBLIC_BUNDLER_URL`: Your Pimlico or other bundler URL for BSC.
   - `PRIVATE_KEY`: The private key of the testing wallet (must have RADRS for fees).

## Testing

Run the verification script to confirm the full two-step flow (Free Approve + Paid Transfer):

```bash
npx ts-node scripts/verify-full-flow.ts
```

Or run the standard test:

```bash
npx ts-node scripts/test-radrs-gas.ts
```

This script will:
1. Check if the Smart Account is deployed.
2. Check RADRS allowance.
3. If allowance is low, send an **Approve UserOp** (Sponsored).
4. Send a **Transfer UserOp** (Fee paid in RADRS).

## Client Integration

See `client/src/services/aaRadrsService.ts` for the frontend integration logic.
The `sendTransactionWithRadrsGas` function handles the auto-approve flow.
