---
"@shelken/pi-title": patch
---

修复自动标题请求绕过 ModelRuntime 认证链路的问题。标题请求改用 `modelRegistry.complete`，自动复用 pi 从环境变量或凭据存储解析出的认证信息，避免内置 provider 返回空流并被误报为 0% 缓存命中率。
