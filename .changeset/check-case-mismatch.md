---
"@shelken/pi-dynamic-models": patch
---

修复模型匹配大小写不对称：registry 为小写 id、查询为大写（如网关返回 `Deepseek-v4-flash`）时无法匹配，导致回退默认参数。
