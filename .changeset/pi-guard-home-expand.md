---
"@shelken/pi-guard": minor
---

规则入库时物化 home 绝对副本（`~` / `$HOME` → 当前用户路径）；匹配前对 command/path 同样展开，使 `find ~` 能拦住 `find $HOME` 与绝对 home 路径
