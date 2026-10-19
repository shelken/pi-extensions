---
"@shelken/pi-dynamic-models": patch
---

个别 provider 模型发现失败时只记录日志，继续更新成功的 provider，不再向 pi 终端弹出发现错误；缺失配置或缓存文件不再产生 ENOENT 日志噪音。
