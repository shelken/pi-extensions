---
"@shelken/pi-sounds": patch
---

修复非交互模式（如 `pi -p`）下异步播放失败触发 stale `ctx` 未捕获异常、OMP 配置路径错误、非 macOS 每轮弹错及 `/sounds reload` 失败后误报成功的问题
