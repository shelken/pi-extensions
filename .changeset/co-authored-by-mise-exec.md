---
"@shelken/pi-co-authored-by": patch
---

修复 `mise exec -- git commit`（含 `mise x`、`--cd`/`-C` 选项与 `node@20` 等工具参数）被识别为非提交而漏写 Co-Authored-By / Generated-By 的问题。
