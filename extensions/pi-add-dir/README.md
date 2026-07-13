# pi-add-dir

把会话外目录加入当前 pi session：注入 `AGENTS.md` / `CLAUDE.md`，发现 skills，并跨重启恢复。

初始 fork 自 [itisbryan/pi-add-dir](https://github.com/itisbryan/pi-add-dir)（本仓库已去掉 smart suggestions 等）。

## 功能

| 类型 | 名称 | 作用 |
|---|---|---|
| 命令 | `/add-dir [path]` | 添加目录；无参则交互输入。支持 `~` |
| 命令 | `/remove-dir [path\|label]` | 移除目录 |
| 命令 | `/dirs` | 列出已添加目录与上下文 |
| 工具 | `add_directory` | agent 请求添加目录 |
| 工具 | `search_external_files` | 在已添加目录中按名/glob 搜索 |

外部 skills（`.pi/skills`、`.agents/skills`、`.claude/skills`）注册为 `/skill:<name>`。状态写入 session entry `add-dir:state`。

## 安装

```bash
pi install npm:@shelken/pi-add-dir
```

装好后 `/reload`。也可把整个 mono 仓库加进 `settings.json` 的 `packages`。

## 配置

无配置文件。

## 验证

```bash
bun --filter @shelken/pi-add-dir test
```
