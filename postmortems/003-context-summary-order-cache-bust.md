# Context summary 顺序不一致导致缓存前缀断裂

**日期**: 2026-08-09
**影响**: pi-title 在 `pi-context-prune` 主动归档后向 OpenAI Codex 生成标题时，标题请求缓存命中率为 0%，约 71K input token 未命中。
**发现人**: shelken

## 问题

pi-title 已读取 `context-prune-index` 并删除 Live 请求中被裁剪的 ToolResult，但没有复刻 `pi-context-prune` Context Hook 对 summary 的重定位。两次请求包含相同消息集合，消息顺序不同，缓存前缀仍然断裂。

## 现象

现场同轮数据：

```text
Live Request:  cacheRead=69120
Title Request: cacheRead=0 input=71311
```

Provider item 差分在第 215 项首次不一致。最小回归测试：

```bash
bun --filter @shelken/pi-title test -- src/title-request.test.ts
```

修复前，`relocates a committed summary before the context_prune housekeeping call` 失败：Title 把 summary 留在 `context_prune` 调用之后，Live 把它移到该调用之前。

## 根因

错误假设：读取 index 并删除相同 ToolResult，就能复刻 Live Context。

实际约束：`pi-context-prune` 的 Context Hook 还会删除持久化 summary，再按 `toolCallRefs` 把它插到最后一个被覆盖的 assistant toolCall 后。`context_prune` housekeeping 调用不在归档 index 内；summary 在该工具执行完成后才持久化，因此 Session 顺序与 Live 顺序不同。

缺失检查点：旧测试只比较过滤后的消息集合，没有比较完整顺序，也没有覆盖“归档工具调用夹在被覆盖调用和持久化 summary 之间”的场景。

## 修复

pi-title 继续执行定向兼容：

1. 删除 index 中的 ToolResult。
2. 读取 `context-prune-summary.details.toolCallRefs`。
3. 删除持久化位置的 summary。
4. 按 Live Hook 规则把完整提交的 summary 插回最后一个被覆盖 toolCall 后。

原 Session 的完整 Provider 前缀差分从不一致恢复为逐项一致。修复后的真实 OpenAI Codex E2E 运行两次，一次仍为 0%，一次为 `cacheRead=8704, input=951`（命中率 90.2%）；Provider 命中本身并非确定结果，本修复只消除可复现的消息顺序分叉，低命中率提醒继续保留。

## 预防

- 旁路重建 Context 时，逐项复刻目标 Hook 的过滤、注入和重排，不能只比较消息集合。
- 缓存前缀回归测试必须断言消息顺序，并包含 Hook 自身 housekeeping toolCall。
- Provider E2E 同时记录 `cacheRead`、`input` 和首个前缀差分位置；仅检查请求成功无效。
