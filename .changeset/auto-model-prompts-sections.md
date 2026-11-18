---
"@shelken/pi-auto-model-prompts": minor
---

pi 下改为写入 `auto_model_prompt` prompt section，不再整段替换 system prompt：注入内容会进入会话记录与 `/export`，切换到不命中的模型后自动移除。Oh My Pi 行为不变。
