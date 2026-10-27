# simple-plannotator

浏览器里做代码审查和 Markdown 标注。UI 依赖 `@plannotator/pi-extension`，首次用命令时再加载。

初始 fork 自 [CNife/pi-extensions](https://github.com/CNife/pi-extensions)。

## 功能

| 命令 | 作用 |
|---|---|
| `/pnr` | 审查当前仓库 git 改动 |
| `/pna <file.md\|folder/>` | 标注 markdown 文件或目录（目录最多深 8 层，扫 `.md`/`.mdx`） |
| `/pnl` | 标注最近一条 assistant 消息 |

路径支持 `~`、去掉 `@` 前缀和首尾引号。有反馈时会作为 follow-up 发回 session。

## 安装

```bash
pi install npm:@shelken/simple-plannotator
```

装好后 `/reload`，再跑 `/pnr` 打开浏览器。

## 配置

无配置文件。

## 验证

```bash
bun --filter @shelken/simple-plannotator test
```
