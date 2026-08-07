# 绕过主循环的扩展请求未过 convertToLlm，缓存前缀断裂

**日期**: 2026-08-07
**影响**: pi-title 自动标题请求在含 custom 消息（context-prune 摘要、web-search 结果）的会话中缓存命中率暴跌（47%，~97K 未命中 token），且难以察觉（history 只记 cacheHitRate，无告警）
**发现人**: 会话中分析 08-07 01:37 低缓存率记录时定位

## 问题

pi-title 在 `agent_settled` 时用 `provider.streamSimple` 发起只读标题请求，复用 live 轮缓存前缀以省 token。但标题请求的 messages 直接从 `buildSessionContext()` 取，**未过 `convertToLlm`**，把 role:"custom" 的消息（context-prune-summary、web-search-results 等）原样传给 provider。所有 provider 的转换器（codebuddy/qwenwork/zed/grok/内置 openai-completions）只认 user/assistant/toolResult 三种 role，custom 被静默丢弃 → 标题请求丢失从第一个 custom 消息起的所有上下文 → 缓存前缀从该点断裂 → 之后全部 cache miss。

## 现象

最小复现路径：会话中发生 context-prune（注入 custom 摘要）或 web 搜索（注入 custom 结果）→ 标题触发 → history 记录 `cacheHitRate` 骤降。

08-07 01:37 现场数据（session 019fd99a）：
```
live 轮 agent_end:  cacheRead=135168 input=1297   (99% 命中)
标题请求:          cacheRead=88320  input=97628  (47% 命中)
```
- cacheRead=88320 ≈ 第一个 custom 消息（00:40 context-prune-summary）之前的内容
- input=97628 ≈ 该点之后累积内容（含 01:25 搜索 30K 字符）
- 00:40 有 `custom_message context-prune-summary` 注入，01:25 有 `web-search-results` 注入

## 根因

**错误假设**（两个叠加）：
1. pi-title 代码注释假设"`buildSessionContext()` 输出与 live 轮发给 provider 的消息字节级一致"。实际 live 轮消息在到达 provider 前经 `convertToLlm`（pi-agent-core agent-loop.js:185，sdk.js:139 注入）把 custom→user、bashExecution→user。provider 侧转换器因此**从不需要**处理 custom role，只认 3 种标准 role —— 这是设计前提，不是 provider 缺陷。
2. 认为"provider 收到什么，live 轮就发什么"。实际 provider 只收到 convertToLlm 之后的标准消息；标题请求直传原始消息是旁路，跳过主循环必经的转换。

**缺失检查点**：
- pi-title 测试只覆盖纯函数（state/title/history），未覆盖"标题请求 messages 构造 == live 轮转换后消息"这一前缀一致性契约
- history 只记 cacheHitRate，无阈值告警（warnThreshold 是修复 4b5ac61 才加的，且只对标题请求自身命中率告警，未对照 live 轮）

## 修复

pi-title generateTitle 里 messages 先过 `convertToLlm` 再传 provider，与 live 轮前缀对齐：
```ts
messages: [...(convertToLlm(messages) as unknown as Message[]), titleMessage]
```
补 3 个测试（title-request.test.ts）覆盖 custom→user、bashExecution→user、普通消息不变。全仓 verify 通过（tsc + 196 tests）。

## 预防

- [ ] **扩展绕过主循环直接调 `provider.streamSimple` 时，messages 必须先过 `convertToLlm`**（与 pi-agent-core agent-loop 的转换点一致），否则任何含 custom 消息的会话缓存前缀必断
- [ ] 扩展里凡是"重建消息发给 provider"的路径，对照 `dist/core/agent-loop.js` 的 `streamAssistantResponse`（transformContext → convertToLlm → streamFn）逐项对齐，不能只对齐 systemPrompt/tools
- [ ] 前缀缓存类扩展（pi-title 模式）的测试必须含"custom/bashExecution 消息存在时前缀一致性"用例，纯函数测试覆盖不到
- [ ] 对 provider 侧"丢弃未知 role"不要视为缺陷去改——它是"live 轮消息已 user 化"前提下的正确行为；修复应在旁路调用方，不在 provider
