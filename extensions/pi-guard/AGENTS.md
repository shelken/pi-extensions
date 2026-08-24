# pi-guard

硬禁止 agent 危险 bash 与机密路径（read/write/edit）

## 目录结构

`index.ts`: 扩展入口（session_start / tool_call）
`evaluate.ts`: `evaluateGuard` 与 Policy 类型
`command-match.ts`: deny_commands（简单命令 argv）
`match.ts`: 路径 needle / home 展开 / reason
`policy.ts`: 内置清单、YAML 层解析与合并
`config-load.ts`: permissions.yaml 路径与磁盘加载
`tests/`: 测试
`package.json` / `README.md` / `LICENSE`: 包元数据

## 基本约束

- 测试禁止执行真实危险命令；匹配逻辑用纯函数 + 隔离 fixture（假 HOME / 临时 cwd）
- 不得在测试中读写开发者真实 home 机密路径（如真实 `~/.ssh`）
- 配置路径：`{pi-agent-dir}/permissions.yaml` 与 `.pi/permissions.yaml`
- 内置的规则的引入必须通用且合理, 重点关注哪些命令和文件本身不应该被执行和读取
