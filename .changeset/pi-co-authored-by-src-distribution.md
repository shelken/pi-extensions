---
"@shelken/pi-co-authored-by": patch
---

修复发布包漏打包子模块导致安装后找不到 `./lib/git-commit.ts` 的问题，统一分发 `src/` 源码入口，并增加 `omp.extensions` 声明
