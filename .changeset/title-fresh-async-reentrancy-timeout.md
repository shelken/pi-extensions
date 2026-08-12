---
"@shelken/pi-title": patch
---

fix(pi-title): 严格复用 live provider payload；fresh 异步、防重入并在 120 秒强制超时；reload 保留 live，无 live 时延后到下一轮；收拢为单文件实现
