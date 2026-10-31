---
"@shelken/pi-co-authored-by": patch
---

修复 `git -C`、`command git`、绝对路径 git、`exec git commit`、shell 分组等直接提交形态漏写 Co-Authored-By / Generated-By（`exec` 还会残留 hook）的问题：改用进程级 GIT_CONFIG hooksPath + 全量 hook 转发器，不再向用户仓库安装或修改任何 hook。
