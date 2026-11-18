---
"@shelken/pi-status-bar": patch
---

git 脏状态改在 `agent_settled` 刷新，一次请求内的自动重试不再重复跑 `git status`；非法 `statusBar.order` 只在 TUI 提示，不再写 stderr 弄花界面。
