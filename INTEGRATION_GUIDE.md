# RADRS Gas Paymaster 集成简明指南 (BSC Mainnet)

**版本**: v1.0 | **网络**: BSC Mainnet

## 🚨 最新重要更新 (2026-01-03) - 请务必阅读

### 1. 关键修复已部署
我们刚刚推送了几个关键修复，解决了之前的 `Unauthorized` 和潜在的 `Gas price too low` 错误：
- **RPC 节点更换**：已从 Ankr 切换到更稳定的 BSC 官方节点，并增加了自动故障转移 (Fallback)。
- **Gas 估算优化**：在前端估算 Gas Price 时增加了 **20% 的缓冲**，防止因网络波动导致交易被拒。
- **错误捕获增强**：增加了详细的错误日志打印。

### 2. 对接测试流程
请开发/测试人员按以下步骤操作：
1.  **拉取最新代码**：确保 `client/src/config.ts` 和 `client/src/services/aaRadrsService.ts` 是最新版本。
2.  **重启服务**：执行 `npx expo start -c` 清除缓存。
3.  **重试交易**：再次尝试开启 "使用 RADRS 支付 Gas"。
    - **如果成功**：🎉 问题解决。
    - **如果失败**：请务必打开浏览器控制台 (Console)，找到红色的 `Approve failed detailed:` 报错，并**截图完整展开的错误信息**。这是定位问题的关键。

---

## 1. 核心合约地址

| 名称 | 地址 | 说明 |
| :--- | :--- | :--- |
| **Paymaster** | **`0x7Be3A50B2a062a8dD1b24C0D77D0Cc8D8b19618A`** | **代付合约 (v2)** |
| RADRS Token | `0xe2188A2E0a41A50F09359E5FE714D5e643036f2A` | 支付代币 |
| EntryPoint | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | v0.7 标准 |
| feeReceiver | `0xfb710006a8Ad08a636e919B02B2f9bBbcE524d96` | 收款地址 |

## 2. 收费规则

1.  **普通交易**: `Fee = Gas(BNB) * 汇率 * 1.2` (含 20% 服务费)。
2.  **授权交易**: `Fee = 0` (仅限 `approve(paymaster)`).

## 3. 客户端集成配置

```typescript
const config = {
  chainId: 56,
  entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  radrsToken: "0xe2188A2E0a41A50F09359E5FE714D5e643036f2A",
  paymaster: "0x7Be3A50B2a062a8dD1b24C0D77D0Cc8D8b19618A", 
  rpcUrl: "https://bsc-dataseed1.binance.org" // 建议配置 Fallback (使用官方节点)
};
```

## 4. 交易构造流程

**前提**: UserOp 的 `paymasterAndData` 字段需填入 Paymaster 地址。

**流程 A: 首次使用 (两步)**
1.  **授权**: 发送仅含 `RADRS.approve(paymaster, MAX)` 的 UserOp。
    *   *Paymaster 验证*: 识别为 Approve 操作 -> **免 Gas**。
2.  **业务**: 授权上链后，发送业务 UserOp (如转账)。
    *   *Paymaster 验证*: 检查 RADRS 余额 > (Gas费 + 转账额) -> **扣除 RADRS**。

**流程 B: 后续使用 (一步)**
1.  直接发送业务 UserOp。

## 5. 错误处理与排查

前端需捕获以下 Revert 并在界面提示：

*   `INSUFFICIENT_RADRS_BALANCE`: **余额不足** (提示充值)。
*   `INSUFFICIENT_RADRS_ALLOWANCE`: **未授权** (提示先授权)。

### 常见问题排查 (Troubleshooting)

如果后端脚本验证通过（使用 `correct-verify-aa.ts`），但前端依然报错，请执行以下检查：

#### 1. 重启开发服务器 (重要)
旧的 RPC 配置可能缓存在 Metro Bundler 中，请务必执行：
```bash
npx expo start -c
```

#### 2. 前端验证步骤
1.  进入 Swap 界面，开启 "使用 RADRS 代币支付 Gas"。
2.  观察控制台日志，确认连接的 RPC 节点是否已切换到新的列表 (使用 `bsc-dataseed` 系列)。
3.  如果仍然报错，请检查浏览器控制台的 **Network** 标签页，确认请求是否被本地代理或 VPN 拦截。

#### 4. 深度调试 (Deep Debugging)

如果仍然报错且提示模糊，请按以下步骤抓取底层错误：

1.  **拉取最新代码**：确保 `aaRadrsService.ts` 包含详细的错误捕获逻辑。
2.  **重启服务**：`npx expo start -c`。
3.  **浏览器控制台**：
    *   在 Chrome/Edge 按 F12 打开控制台。
    *   复现错误。
    *   搜索红色报错日志：`Approve failed detailed`。
4.  **关键字段分析**：
    *   `shortMessage`: 通常包含核心原因 (如 `AA23 reverted`).
    *   `details`: 包含链上 Revert 原因。
    *   `metaMessages`: 包含 Bundler 返回的元数据。

