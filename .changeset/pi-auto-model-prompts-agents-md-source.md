---
"@shelken/pi-auto-model-prompts": minor
---

prompt 源改为项目根与 agent 目录下的 `AGENTS.<matcher>.md`，不再读取 `auto-model-prompts/` 目录。匹配语义、目录内优先级、空文件跳过、配置加载与事件挂点均未变；`AGENTS.md` 本体不参与匹配。迁移时把原 `<matcher>.md` 重命名为 `AGENTS.<matcher>.md` 并移到项目根或 agent 目录。
