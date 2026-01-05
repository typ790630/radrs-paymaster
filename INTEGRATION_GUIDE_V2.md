
# RADRS Paymaster 集成对接文档 (v2.0)

本文档描述了如何集成 RADRS 代币作为 Gas 费的支付服务。
系统由 **Node.js 后端服务** 和 **Paymaster 智能合约** 组成。

## 1. 系统架构

*   **Paymaster Contract**: 部署在 BSC 主网，负责验证签名并扣除 RADRS。
*   **Paymaster Service (Backend)**: 提供 HTTP API，负责计算费用、签名 UserOp。
*   **Client (Wallet)**: 调用后端 API 获取签名，并发起交易。

## 2. 后端服务 (Node.js)

### 启动服务
1. 进入 `server` 目录。
2. 安装依赖: `npm install`
3. 配置 `.env`:
   ```env
   PAYMASTER_SIGNER_KEY=0x... (你的私钥)
   RADRS_FEE_RECEIVER=0x... (接收 RADRS 的地址)
   ```
4. 启动: `npm start` (默认端口 3000)

### API 接口

#### 1. 估算费用 (Quote)
`POST /paymaster/quote`

用于在前端展示预计的手续费。

**请求:**
```json
{
  "chainId": 56,
  "userOp": { ... } // Partial UserOp with gas limits
}
```

**响应:**
```json
{
  "radrsFee": "1230000000000000000", // 1.23 RADRS (Wei)
  "gasCostBNB": "0.000123"            // 估算的 BNB 成本
}
```

#### 2. 获取赞助签名 (Sponsor)
`POST /paymaster/sponsor`

在发送交易前调用，获取 Paymaster 的签名数据。

**请求:**
```json
{
  "chainId": 56,
  "userOp": { ... },
  "entryPoint": "0x..."
}
```

**响应:**
```json
{
  "paymasterAndData": "0x...",       // 直接填入 userOp.paymasterAndData
  "radrsFee": "1230000000000000000",
  "gasCostBNB": "0.000123"
}
```

## 3. 前端集成 (Client)

请参考 `client/src/services/aaRadrsService.ts` 中的实现。

### 关键代码示例

```typescript
// 1. 获取 Paymaster 数据
const paymasterMiddleware = {
    getPaymasterData: async (userOp) => {
        const response = await fetch(`${PAYMASTER_API_URL}/paymaster/sponsor`, {
            method: 'POST',
            body: JSON.stringify({ chainId: 56, userOp })
        });
        const data = await response.json();
        return {
            paymaster: PAYMASTER_ADDRESS,
            paymasterData: data.paymasterAndData
        };
    }
};

// 2. 创建 SmartAccountClient 时注入
const smartAccountClient = createSmartAccountClient({
    // ...
    paymaster: paymasterMiddleware
});
```

## 4. 首次授权 (Approve)

系统已针对 `RADRS.approve(Paymaster)` 交易做了特殊处理：**免手续费**。
当用户的 UserOp 是授权给 Paymaster 时，后端会自动返回 0 费用的签名，确保新用户在没有 BNB 和已授权的情况下也能启动。

## 5. 部署与配置

1. **部署合约**:
   运行 `npx hardhat run scripts/deploy-paymaster-v2.ts --network bscMainnet`。
   记录输出的 `RadrsPaymaster` 地址。

2. **配置后端**:
   在 `server/src/config.ts` 或 `.env` 中更新 `PAYMASTER_ADDRESS` 和 `PAYMASTER_SIGNER_KEY`。

3. **配置前端**:
   在 `client/src/config.ts` 中更新 `PAYMASTER_ADDRESS` 和 `PAYMASTER_API_URL`。

4. **充值**:
   记得向 Paymaster 合约地址充值 BNB (通过 EntryPoint depositTo)，否则无法代付 Gas。
