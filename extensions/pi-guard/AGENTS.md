# pi-guard

硬禁止 agent 危险 bash 与机密路径（read/write/edit）。

## 目录结构

`index.ts`: 扩展入口
`evaluate.ts`: `evaluateGuard` 与 Policy 类型
`policy.ts`: 内置清单、YAML 层解析与合并
`tests/`: 测试
`package.json` / `README.md` / `LICENSE`: 包元数据

## 基本约束

- 测试禁止执行真实危险命令；匹配逻辑用纯函数 + 隔离 fixture（假 HOME / 临时 cwd）
- 不得在测试中读写开发者真实 home 机密路径（如真实 `~/.ssh`）
- 配置路径：`{pi-agent-dir}/permissions.yaml` 与 `.pi/permissions.yaml`
- factory 不读盘；加载在 session_start 或首次 tool_call
