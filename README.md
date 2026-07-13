# pi-extensions

个人 pi 扩展 mono repo。根 `package.json` 作为本地 pi package，`pi.extensions` 决定实际加载哪些子包入口。

## 子 package

| Package | npm | 入口 | 用途 |
|---|---|---|---|
| `pi-add-dir` | `@shelken/pi-add-dir` | `extensions/pi-add-dir/index.ts` | 向当前会话添加外部目录，并加载其上下文文件和 skills。 |
| `pi-auto-model-prompts` | `@shelken/pi-auto-model-prompts` | `extensions/pi-auto-model-prompts/index.ts` | 按模型加载额外 system prompt。 |
| `pi-co-authored-by` | `@shelken/pi-co-authored-by` | `extensions/pi-co-authored-by/index.ts` | agent 执行 `git commit` 时追加 Co-Authored-By / Generated-By trailer。 |
| `pi-command-history` | `@shelken/pi-command-history` | `extensions/pi-command-history/index.ts` | 按工作目录持久化输入历史，支持快捷键回填。 |
| `pi-dynamic-models` | `@shelken/pi-dynamic-models` | `extensions/pi-dynamic-models/index.ts` | 自动发现 provider 远端模型，并用 models.dev registry 补全模型参数。 |
| `simple-plannotator` | `@shelken/simple-plannotator` | `extensions/simple-plannotator/index.ts` | 基于浏览器的代码审查和 Markdown 标注（`/pnr` `/pna` `/pnl`）。 |

新增、移除或改名任何子 package 时，必须同步更新本表和根 `package.json` 的 `pi.extensions`。

子包用法、配置与初始来源见各自目录下的 `README.md`。

## 临时禁用某个插件

不想完全删除子包目录，只想临时禁用时，在根 `package.json` 的 `pi.extensions` 中注释或删除对应入口行即可。例如禁用 `pi-command-history`：

```diff
  "pi": {
    "extensions": [
-     "./extensions/pi-command-history/index.ts",
    ]
  }
```

重新加载 pi 即可生效。

## 本地使用

把本仓库作为本地 pi package 加到 `{pi-agent-dir}/settings.json` 的 `packages`：

```json
{
  "packages": ["/path/to/pi-extensions"]
}
```

修改后在 pi 中 `/reload` 即可加载。只加载根 `package.json` 的 `pi.extensions` 里列出的入口。

## 验证

```bash
bun install
just verify
```

## 版本与发布

子包独立 semver，用 changesets 管理。表格中有 npm 名的 public 子包经 CI 发 npm；其余 private 子包只打 tag。

流程与命令见 [`docs/versioning.md`](docs/versioning.md)。
