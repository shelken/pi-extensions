---
"@shelken/pi-auto-model-prompts": patch
---

prompt 读取不再因单个坏路径丢掉整轮注入：`.agents` 是普通文件时按空目录处理，prompt 文件读不到（权限等）时继续尝试下一个候选，而不是把异常抛给宿主。
