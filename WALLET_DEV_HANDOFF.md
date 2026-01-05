# 📱 钱包前端接入指南 (Wallet Integration Guide)

## ⚠️ 紧急操作项 (Critical Actions)

请钱包开发团队立即执行以下更新，以修复 "INSUFFICIENT_FUNDS" 和 "Deposit" 错误：

1.  **更新配置文件 (`config.ts`)**:
    将 Paymaster 地址更新为新部署的合约地址：
    ```typescript
    export const PAYMASTER_ADDRESS = "0x3ca3Da0fA3C50365847EaA4Db57eAdF8B083Aa43";
    // 确保 API 地址指向您的后端服务
    export const PAYMASTER_API_URL = "http://localhost:3000"; // 或您的公网IP
    ```

2.  **清除缓存重启 (强制)**:
    由于 Expo/Metro 缓存机制，旧配置可能未生效。请务必执行：
    ```bash
    # Expo / React Native
    npx expo start -c
    # 或
    npm start -- --reset-cache
    ```

---

## 🔄 交互流程说明 (Interaction Flow)

系统已升级为 **"首次授权免费 + 后续自动扣费"** 模式。前端只需处理标准的 ERC-20 Approval 逻辑。

### 场景 A: 用户首次使用 (RADRS 授权不足)
1.  前端检测到用户 `RADRS` 对 `PAYMASTER_ADDRESS` 的 `allowance` 不足。
2.  前端构造一个 `approve(PAYMASTER_ADDRESS, MaxUint)` 的 UserOp。
3.  前端请求 `/paymaster/sponsor` 接口。
    *   ✅ **后端自动识别**：这是一个 Approve 操作。
    *   ✅ **后端免费赞助**：返回 `feeAmount = 0` 的签名。
4.  前端提交 UserOp，用户无需支付 Gas，也无需支付 RADRS。

### 场景 B: 用户日常使用 (转账/Swap)
1.  前端检测到 `allowance` 充足。
2.  前端构造业务 UserOp (例如 `transfer`)。
3.  前端请求 `/paymaster/sponsor` 接口。
    *   ✅ **后端计算费用**：`GasCostBNB * 1.2` 换算为 RADRS。
    *   ✅ **后端返回签名**：包含需扣除的 RADRS 金额。
4.  前端提交 UserOp。
    *   Paymaster 替用户支付 BNB Gas。
    *   Paymaster 从用户账户扣除 RADRS。

---

## 🛠 API 接口规范

### 1. 获取费用估算 (可选，用于展示)
`POST /paymaster/quote`
```json
// Request
{
  "chainId": 56,
  "userOp": { ... } // 包含 gasLimits
}

// Response
{
  "radrsFee": "1500000000000000000", // 1.5 RADRS
  "gasCostBNB": "0.0003"
}
```

### 2. 获取代付签名 (核心)
`POST /paymaster/sponsor`
```json
// Request
{
  "chainId": 56,
  "userOp": { ... },
  "entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
}

// Response
{
  "paymasterAndData": "0xD76f...<signature>", // 直接填入 UserOp
  "radrsFee": "...",
  "gasCostBNB": "..."
}
```
