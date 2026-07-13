# pi-add-dir

将会话外目录加入当前 pi session：加载 `AGENTS.md` / `CLAUDE.md`、发现 skills，并跨重启持久化。

初始 fork 自 [itisbryan/pi-add-dir](https://github.com/itisbryan/pi-add-dir)；本仓库已大幅简化（去掉 smart suggestions / monorepo 推荐 / 扩展探测等）。

## 能力

| 类型 | 名称 | 说明 |
|---|---|---|
| 命令 | `/add-dir [path]` | 添加目录；无参时交互输入路径 |
| 命令 | `/remove-dir [path\|label]` | 移除目录 |
| 命令 | `/dirs` | 列出已添加目录 |
| 工具 | `add_directory` | 让 agent 请求添加目录 |
| 工具 | `search_external_files` | 在外部目录中按文件名/glob 搜索 |

Skills 通过 `resources_discover` 注册为 `/skill:name`。

## 安装

从 npm 安装：

```bash
pi install npm:@shelken/pi-add-dir
```

本 monorepo 根 `package.json` 的 `pi.extensions` 也已包含入口。本地使用时可直接引用整个仓库：

```json
{
  "packages": ["/path/to/pi-extensions"]
}
```

## 验证

```bash
bun --filter pi-add-dir test
```
