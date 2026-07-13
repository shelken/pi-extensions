# pi-command-history

按工作目录持久化输入历史。同一目录下跨 session 可用 `shift+up` / `shift+down` 回填。

初始 fork 自 [ross-jill-ws/pi-command-history](https://github.com/ross-jill-ws/pi-command-history)。

## 快捷键

| 快捷键 | 作用 |
|---|---|
| `shift+up` | 更早的历史 |
| `shift+down` | 更新的历史 |
| `ctrl+up` / `ctrl+down` | 同上（兼容别名） |

- 用户输入都会保存（含 `/` 命令）
- 去重：重复输入会移到最新
- 每个目录最多 500 条
- 文件：`~/.pi/folder-history/*.jsonl`

## 验证

```bash
bun --filter pi-command-history test
```
