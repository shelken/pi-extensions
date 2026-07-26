---
"@shelken/pi-co-authored-by": patch
---

不再通过 GIT_CONFIG 注入 core.hooksPath；改为 bash 期间临时安装 prepare-commit-msg。
pid 引用计数：多 shell 并发与 SIGKILL 残留不会误卸/卡死 hook。
