---
"@shelken/pi-command-history": patch
---

不再把其他扩展通过 `sendUserMessage` 注入的消息记入目录历史，`shift+up/down` 只回填用户自己的输入。
