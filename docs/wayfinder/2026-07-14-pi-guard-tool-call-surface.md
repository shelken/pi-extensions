# pi-guard：tool_call 拦截面（研究）

- **日期**：2026-07-14
- **票**：[摸清 pi tool_call 对 bash/read/write/edit 的拦截面](https://github.com/shelken/pi-extensions/issues/5)
- **pi 版本**：`@earendil-works/pi-coding-agent@0.80.7`（本机 global bun）
- **源码根**：npm 包 `packages/coding-agent` → GitHub [earendil-works/pi](https://github.com/earendil-works/pi)

## 结论（规格可直接写死）

| 项 | 值 |
|---|---|
| Hook | `pi.on("tool_call", handler)` |
| 收窄 | `isToolCallEventType("bash"\|"read"\|"write"\|"edit", event)`（**不要**用 `event.toolName === "..."`，会与 custom tool 的 `string` 重叠） |
| Block | `return { block: true, reason?: string }` |
| 放行 | `return undefined` / 不返回 / `{ block: false }` |
| 多 handler | 按扩展加载顺序串行；**第一个** `block: true` 立即返回，后续不跑 |
| 改参 | 原地 mutate `event.input`（pi-guard **不需要**） |
| 路径形态 | `tool_call` 时是模型传入的 **原始 path**（相对或绝对）；**尚未** `resolveToCwd` |
| cwd | `ctx.cwd` |
| 与用户 shell | 用户 `!` 走 `user_bash`，**不是** agent `bash` tool_call |

## 工具名与 input 字段

均来自 `dist/core/tools/{bash,read,write,edit}.d.ts` schema。

### `bash`

```ts
{ command: string; timeout?: number }
```

- 拦截看：`event.input.command`
- `timeout` 与权限无关，忽略即可

### `read`

```ts
{ path: string; offset?: number; limit?: number }
```

- 拦截看：`event.input.path`
- offset/limit 忽略

### `write`

```ts
{ path: string; content: string }
```

- 拦截看：`event.input.path`
- 不要扫 `content`

### `edit`

```ts
{
  path: string;
  edits: Array<{ oldText: string; newText: string }>
}
```

- 拦截看：`event.input.path`
- 不要扫 edits 文本

### 路径别名注意

- **Schema 字段名是 `path`**，不是 `file_path`
- 渲染层兼容 `file_path`（`args?.file_path ?? args?.path`），但 typed `tool_call` input 以 schema 为准
- 实现规格：**只认 `input.path`**；若为空则跳过（与 defender 一致）

## 类型与返回值（源码）

`ToolCallEvent` / `ToolCallEventResult`（`dist/core/extensions/types.d.ts`）：

```ts
// 基座
{ type: "tool_call"; toolCallId: string }

// 例
{ type: "tool_call"; toolCallId: string; toolName: "bash"; input: BashToolInput }

// 返回
{ block?: boolean; reason?: string }
```

`emitToolCall`（`dist/core/extensions/runner.js`）：任一 handler 返回 `block: true` 则立刻 `return result`。

## 文档示例（官方）

`docs/extensions.md` → `tool_call`：

```ts
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
  if (isToolCallEventType("bash", event)) {
    if (event.input.command.includes("rm -rf")) {
      return { block: true, reason: "Dangerous command" };
    }
  }
  if (isToolCallEventType("read", event)) {
    // event.input.path
  }
});
```

## 推荐实现骨架（规格用，非本票交付代码）

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("bash", event)) {
      // 1) deny_commands vs event.input.command
      // 2) deny_paths 扫 command 全文（~ 展开后子串/通配）
      // return { block: true, reason }
    }
    if (
      isToolCallEventType("read", event) ||
      isToolCallEventType("write", event) ||
      isToolCallEventType("edit", event)
    ) {
      // deny_paths vs event.input.path（相对 path 用 ctx.cwd 归一后再比）
    }
  });
}
```

路径匹配时应用 **`resolveToCwd` 同语义**（`~` + 相对 cwd），但匹配发生在 guard 内，不依赖工具 execute 阶段。

## 参考：pi-defender 怎么挂

本机 `pi-defender/src/index.ts`：

- bash：`isToolCallEventType("bash", event)` → `event.input.command`
- write/edit：`event.toolName !== "write" && !== "edit"`（未用 type guard）→ `event.input.path`
- read：`isToolCallEventType("read", event)` → `event.input.path`
- block：`{ block: true, reason }` + 可选 `ctx.ui.notify`

pi-guard 应统一用 `isToolCallEventType`，更简单、类型更稳。

## 已知缺口（写入 map 雾区，本票不扩 scope）

map 已定只拦 bash + read/write/edit。下列 **内置工具也能触达路径/内容**，当前不在拦截面：

| 工具 | 相关字段 |
|---|---|
| `grep` | `path?`, `pattern`, … |
| `find` | `path?`, `pattern` |
| `ls` | `path?` |

机密文件仍可能被 `grep`/`find`/`ls` 间接暴露。是否补拦留给后续决策，不在本票改 destination。

## 非目标

- `user_bash`（人类 `!` 命令）— 不是 agent tool
- 改写 `event.input` — guard 只 block
- `tool_result` 事后修改 — 太晚，拦不住执行

## 证据索引

| 内容 | 位置（本机 npm 0.80.7） |
|---|---|
| tool_call 文档 | `docs/extensions.md` § tool_call |
| Event / Result 类型 | `dist/core/extensions/types.d.ts` |
| block 短路 | `dist/core/extensions/runner.js` `emitToolCall` |
| bash/read/write/edit schema | `dist/core/tools/{bash,read,write,edit}.d.ts` |
| 路径 resolve | `dist/core/tools/path-utils.d.ts`（`resolveToCwd`） |
| 上游仓库 | https://github.com/earendil-works/pi （packages/coding-agent） |
