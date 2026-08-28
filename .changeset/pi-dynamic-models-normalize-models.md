---
"@shelken/pi-dynamic-models": patch
---

注册前补齐 models.json 手写模型缺省字段（name/cost/reasoning 等），与 pi 自身 modelFromJson 默认值对齐，避免不完整模型透传进运行时