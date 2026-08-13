---
"@shelken/pi-co-authored-by": patch
---

修复与其它 Co-Authored-By 注入器共存时的双写:链式执行既有 hook 时,跳过自身会注入 Co-Authored-By 的 hook(如 dsh-co-authored-by 残留),避免同一提交出现重复 trailer
