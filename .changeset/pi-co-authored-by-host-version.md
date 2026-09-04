---
"@shelken/pi-co-authored-by": patch
---

移除宿主版本子进程探测，直接采用宿主注入的 VERSION；agent 目录统一经宿主 getAgentDir() 获取
