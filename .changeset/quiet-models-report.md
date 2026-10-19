---
"@shelken/pi-dynamic-models": patch
---

修复模型发现丢失网关能力字段：现在读取 `/models` 自报的上下文长度、输出上限、输入模态与思考档位，不再回退 128k 默认值；按端点与账户绑定缓存；空列表会移除旧 AUTO 模型；models.dev 不可用时仍能发现；保留 provider 级 `compat` 与 `$VAR` 凭据引用。
