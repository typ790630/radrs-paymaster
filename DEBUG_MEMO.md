# 🐛 技术排查备忘录：关于 "RADRS 余额不足" 误报问题

**致：** 钱包开发团队 (Builder)
**日期：** 2026-01-03
**优先级：** 🔴 紧急 (Blocker)

---

## 1. 问题定性

用户反馈 App 提示 "RADRS 余额不足"，但实际上这是一个 **误报**。
根本原因是 App 端的 **RPC 网络连接失败 (`net::ERR_ABORTED`)**，导致前端代码无法读取链上余额（读取失败被错误处理为余额 0）。

**关键证据：**
*   App 报错日志显示：`net::ERR_ABORTED https://bsc-dataseed3.binance.org/` (说明该节点在测试设备上不可访问)。
*   链上数据查询显示：该用户的 Smart Account 余额充足。

---

## 2. 链上数据验证 (证据)

我们在后端环境使用脚本直接查询了用户的 Smart Account 状态，结果如下：

*   **EOA 地址**: `0x07fFF633120E55411b6e8bc85D6Fda60F9671fE4` (私钥对应)
*   **AA Smart Account**: `0x2C8e27CA6193522d5315F98734dC65412DB0c324` (实际扣费方)
*   **实际余额**: **491.4790 RADRS** ✅ (远超 0.1 的门槛)

**结论：账户里有钱，是 App 读不到。**

---

## 3. 本地代码复现 (Proof of Concept)

为了排除 `viem` 库或合约 ABI 的问题，我们在本地编写了与 App `aaRadrsService.ts` 逻辑完全一致的测试脚本 `debug-frontend-read.ts`，并使用 `https://binance.llamarpc.com` 作为 RPC。

**测试结果：**
```bash
Target Address: 0x2C8e27CA6193522d5315F98734dC65412DB0c324
Viem Read Result: 491479014500000000000 (成功读到 491 RADRS)
SUCCESS: Viem can read balance via LlamaRPC.
```

**结论：前端代码逻辑是正确的，问题仅在于 App 运行时的网络环境配置。**

---

## 4. 修复方案 (Action Items)

请务必按顺序执行以下操作：

### 步骤 1：强制更换高可用 RPC
由于 `bsc-dataseed3` 在部分网络环境下不稳定（被墙或 CORS 问题），请在代码中 **硬编码** 更换为 `LlamaRPC` 进行测试。

**修改文件**: `client/src/services/aaRadrsService.ts`

```typescript
export class AaRadrsService {
    constructor() {
        // 🔴 强制指定 LlamaRPC，暂时不要读取 Config，排除 Config 没更新的可能性
        this.publicClient = createPublicClient({
            chain: CHAIN,
            transport: http("https://binance.llamarpc.com"), 
        });
        
        // 打印日志确认生效
        console.log("🔥 Current RPC:", "https://binance.llamarpc.com");
    }
    // ...
}
```

### 步骤 2：添加调试日志 (关键)
请在 `sendTransactionWithRadrsGas` 方法中，在检查余额 **之前**，加入以下日志，并将输出截图：

```typescript
console.log("---------------- DEBUG START ----------------");
console.log("1. My Smart Account:", account.address);
console.log("2. Checking Token:", RADRS_TOKEN_ADDRESS);

try {
    const rawBalance = await this.publicClient.readContract({
        address: RADRS_TOKEN_ADDRESS as Hex,
        abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
        functionName: "balanceOf",
        args: [account.address]
    });
    console.log("3. Read Result:", rawBalance.toString());
} catch (e) {
    console.error("❌ READ FAILED:", e);
}
console.log("---------------- DEBUG END ------------------");
```

### 步骤 3：环境重置
React Native 的缓存非常顽固。修改代码后，请务必执行：
1.  停止 Metro Bundler。
2.  运行 `npx expo start --clear`。
3.  在手机上卸载 App 并重新安装 (如果可能)。

---

**预期结果：**
一旦控制台打印出 `Read Result: 491479...`，App 的余额不足报错将自动消失，交易流程将恢复正常。
