# simple-plannotator

基于浏览器的代码审查和 Markdown 标注。依赖 `@plannotator/pi-extension` 提供 UI 与服务端能力。

初始 fork 自 [CNife/pi-extensions](https://github.com/CNife/pi-extensions)。

## 命令

| 命令 | 作用 |
|---|---|
| `/pnr` | 审查本地 git 改动 |
| `/pna <file.md\|folder/>` | 标注 markdown 文件或目录 |
| `/pnl` | 标注最近一条 assistant 消息 |

## 验证

```bash
bun --filter simple-plannotator test
```
