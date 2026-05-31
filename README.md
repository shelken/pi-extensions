# pi-extensions

个人 pi 扩展 mono repo。

## 当前启用

- `pi-auto-model-prompts`: 按模型加载额外 system prompt。
- `pi-debug-cache`: 记录会话 system prompt 与缓存调试信息。
- `pi-co-authored-by`: 在 agent 执行 `git commit` 时追加提交 trailer。

## 本地使用

把本仓库作为本地 pi package 加到 `settings.json` 的 `packages`：

```json
{
  "packages": ["./pi-extensions"]
}
```

`package.json` 的 `pi.extensions` 决定实际加载哪些扩展。

## 验证

```bash
bun install
bun run check
```
