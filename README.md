# pi-extensions

个人 pi 扩展 mono repo。根 `package.json` 作为本地 pi package，`pi.extensions` 决定实际加载哪些子包入口。

## 子 package

| Package | 入口 | 用途 | 来源 |
|---|---|---|---|
| `pi-add-dir` | `extensions/pi-add-dir/extensions/pi-add-dir/index.ts` | 向当前会话添加外部目录，并加载其上下文文件和 skills。 | Fork：<https://github.com/itisbryan/pi-add-dir> |
| `pi-auto-model-prompts` | `extensions/pi-auto-model-prompts/index.ts` | 按模型加载额外 system prompt。 | 自管 |
| `pi-co-authored-by` | `extensions/pi-co-authored-by/extensions/co-authored-by.ts` | agent 执行 `git commit` 时追加 commit trailer。 | 自管 |
| `pi-command-history` | `extensions/pi-command-history/extensions/index.ts` | 按工作目录持久化输入历史，支持快捷键回填。 | Fork：<https://github.com/ross-jill-ws/pi-command-history> |
| `pi-debug-cache` | `extensions/pi-debug-cache/index.ts` | 记录 system prompt hash、diff 和 prompt cache 调试信息。 | 自管 |
| `pi-dynamic-models` | `extensions/pi-dynamic-models/index.ts` | 自动发现 provider 远端模型，并用 registry 补全模型参数。 | 自管 |
| `simple-plannotator` | `extensions/simple-plannotator/extensions/index.ts` | 基于浏览器的代码审查和 Markdown 标注工具。 | Fork：<https://github.com/CNife/pi-extensions> |

新增、移除或改名任何子 package 时，必须同步更新本表和根 `package.json` 的 `pi.extensions`。

## 临时禁用某个插件

不想完全删除子包目录，只想临时禁用时，在根 `package.json` 的 `pi.extensions` 中注释或删除对应入口行即可。例如禁用 `pi-debug-cache`：

```diff
  "pi": {
    "extensions": [
-     "./extensions/pi-debug-cache/index.ts",
    ]
  }
```

重新加载 pi 即可生效。

## 本地使用

把本仓库作为本地 pi package 加到 `settings.json` 的 `packages`：

```json
{
  "packages": ["./pi-extensions"]
}
```

## 验证

```bash
bun install
bun run check
```
