# pi-co-authored-by

agent 用 bash 跑 `git commit` 时，自动追加 trailer：

```text
Co-Authored-By: <model> <noreply@pi.dev>
Generated-By: pi <version>
```

实现：session 级临时 `core.hooksPath` + `prepare-commit-msg`；结束时清理。

初始 fork 自 [bruno-garcia/pi-co-authored-by](https://github.com/bruno-garcia/pi-co-authored-by)。

## 功能

- 只挂钩 `bash` 工具调用
- 模型名取当前 session；没有则 `unknown`
- 与仓库已有 hook 兼容（先跑临时 hook，再链式原 hook）

## 安装

```bash
pi install npm:@shelken/pi-co-authored-by
```

装好后 `/reload`。之后 agent 提交即可，无需额外命令。

## 配置

无配置文件。

## 验证

```bash
bun --filter @shelken/pi-co-authored-by test
```
