---
"@shelken/pi-co-authored-by": patch
---

runner 改用 PATH 中的 Bash，避免 macOS 系统 Bash 3.2 解析 quoted heredoc 提交消息时因反引号或引号中断提交；保留消息字面量与 Co-Authored-By / Generated-By trailer
