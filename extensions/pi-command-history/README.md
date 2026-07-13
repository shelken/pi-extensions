# pi-command-history

按工作目录持久化输入历史；跨 session 用快捷键回填。

初始 fork 自 [ross-jill-ws/pi-command-history](https://github.com/ross-jill-ws/pi-command-history)。

## 功能

| 类型 | 名称 | 作用 |
|---|---|---|
| 快捷键 | `shift+up` | 更早的一条历史 |
| 快捷键 | `shift+down` | 更新的一条；回到末尾时恢复原编辑内容 |

- 非空输入都会记（含 `/` 命令）
- 重复内容移到最新；每个目录最多 500 条（load 时压缩）
- 文件：`~/.pi/folder-history/*.jsonl`（每行 `{ cwd, text }`）
- 文件名把 `/` 换成 `-` 可能碰撞，靠行内 `cwd` 隔离

## 安装

```bash
pi install npm:@shelken/pi-command-history
```

装好后 `/reload`，在同一工作目录输入几条，用 `shift+up` 试回填。

## 配置

无配置文件。

## 验证

```bash
bun --filter @shelken/pi-command-history test
```
