# pi-co-authored-by

agent 通过 bash 工具执行 `git commit` 时，自动追加：

- `Co-Authored-By: <model> <noreply@pi.dev>`
- `Generated-By: pi <version>`

实现方式：session 级临时 `core.hooksPath` + `prepare-commit-msg` hook。

初始 fork 自 [bruno-garcia/pi-co-authored-by](https://github.com/bruno-garcia/pi-co-authored-by)；本仓库有本地改动。

## 验证

```bash
bun --filter pi-co-authored-by test
```
