# pi-guard

硬禁止 agent 危险 bash 命令与机密路径读写。

配置：`~/.pi/agent/permissions.yaml` 与项目 `.pi/permissions.yaml`。  
规格与样例见 monorepo `docs/wayfinder/2026-07-14-pi-guard-spec.md`。

## 用法

挂载扩展后默认启用内置清单。可选配置：

- 全局：`~/.pi/agent/permissions.yaml`
- 项目：`.pi/permissions.yaml`

样例见 monorepo `docs/wayfinder/samples/`。
