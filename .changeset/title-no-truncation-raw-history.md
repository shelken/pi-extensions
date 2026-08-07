---
"@shelken/pi-title": patch
---

移除标题截断:不再按 maxTitleLength 硬切(避免中文标题被腰斩),长度约束交给 prompt;history 新增 rawTitle 记录模型原始输出;默认 maxTitleLength 改为 35
