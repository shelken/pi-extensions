---
"@shelken/pi-auto-model-prompts": minor
---

prompt 与配置脱离宿主配置目录（`.pi` / `.omp`），统一放 `.agents`：prompt 读 `{cwd}/.agents/AGENTS.<matcher>.md`，全局 `~/.agents/AGENTS.<matcher>.md` 兜底；配置读 `{cwd}/.agents/pi-auto-model-prompts/config.json`，全局 `~/.agents/pi-auto-model-prompts/config.json` 兜底且被项目覆盖。不再读取 `auto-model-prompts/` 目录，匹配语义、目录内优先级、空文件跳过与事件挂点保持不变，裸 `AGENTS.md` 不参与匹配。迁移时把原 `<matcher>.md` 重命名为 `AGENTS.<matcher>.md` 放进项目或全局 `.agents`。
