---
name: pi-extension-diagnose
description: Diagnose pi packages/extensions that appear installed but do not take effect. Use when user says a pi plugin/extension/command/tool/hook is not working, not loaded, not firing, missing after reload/update, or behavior differs between git/package/local installs.
---

# Pi Extension Diagnose

## 目标

建立可重复信号，区分四类问题：

1. package 未被 settings 启用
2. package 启用但 extension entry 未被发现/加载
3. extension 加载但事件/工具/命令未触发
4. extension 触发了，但被调用方式绕过或输出被误判

## 快速流程

### 1. 先复现，保留证据

- 运行用户描述的最小操作。
- 记录实际输出，不要先猜。
- 对 git hook/commit 类扩展，检查最终对象：

```bash
git log -1 --format=full
git log -1 --format=%B | sed -n l
```

### 2. 查 package 是否启用

```bash
PI_OFFLINE=1 pi list
```

同时查 settings 结构，不读取敏感值：

```bash
jq '{packages, extensions}' "$PI_CODING_AGENT_DIR/settings.json"
```

注意：`-npm:foo` / `-git:...` 表示禁用项，不是启用项。

### 3. 查入口是否能被 pi 发现

package path 必须满足至少一种：

- 根 `package.json` 有 `pi.extensions`
- 根有 `index.ts` / `index.js`
- `extensions/` 下一层有 extension 文件或带 `pi` manifest 的子目录

检查：

```bash
jq '.pi' package.json
for p in $(jq -r '.pi.extensions[]?' package.json); do test -e "$p" && echo "ok $p" || echo "missing $p"; done
```

本地 mono repo 优先看根 `package.json`，不要只看子包自己的 `package.json`。

### 4. 区分“当前 agent 工具”与“真实 pi 会话”

当前 harness 的工具调用不一定经过被测 pi extension。需要时用嵌套 pi 会话复现：

```bash
PI_OFFLINE=1 pi -p --tools bash --append-system-prompt 'Run exactly one bash command and stop.' 'run: <command>'
```

如果嵌套 pi 生效、当前工具不生效，问题是 harness 路径差异，不是 extension 失败。

### 5. 查事件是否匹配

常见事件：

- agent 工具调用：`tool_call`
- 用户 `!` bash：`user_bash`
- 工具结果：`tool_result`
- session 生命周期：`session_start` / `session_shutdown`

确认事件对象字段：

```ts
pi.on("tool_call", async (event, ctx) => {
  if (event.toolName !== "bash") return;
});
```

不要把 `tool_call` 当成 shell alias；它只改 pi 内部工具事件。

### 6. 查调用方式是否绕过扩展

git commit 注入类最常见绕过：

```bash
/usr/bin/git commit ...     # 绕过 shell function
command git commit ...      # 绕过 shell function
sh -c 'git commit ...'      # 可能绕过当前 wrapper
```

优先用 plain command 验证：

```bash
git commit --allow-empty -m 'test extension'
git log -1 --format=full
```

### 7. reload/update 后重新验证

pi extension 修改后：

1. `/reload` 或重启新对话
2. 必要时 `pi update`
3. 再跑同一最小复现命令

不要把旧会话结果当作 reload 后结果。

## 修复前假设清单

至少列 3 个可证伪假设：

1. settings 未启用或被 `-source` 禁用
2. entry path 不存在或 manifest 指向目录/路径错误
3. extension 加载失败但错误被 startup 日志淹没
4. 事件类型/API 已变更
5. 测试命令绕过了 extension 的拦截方式
6. 当前 harness 工具调用未经过 pi extension runner

## 完成标准

- 能展示最小复现从失败到成功。
- 有真实输出支持结论。
- 如果改代码，运行相关测试和 `pi list`/实际行为验证。
- 如问题来自用法绕过，更新 README 或 AGENTS 里的硬规则。
