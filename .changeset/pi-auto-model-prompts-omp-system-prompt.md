---
"@shelken/pi-auto-model-prompts": patch
---

兼容 Oh My Pi 的 `string[]` 形态 `systemPrompt`：追加内容整体入列，不再被模板字符串按逗号拼成一整段而破坏 Markdown 段落。类型按上游 `string` 编译，运行时按实际类型分支。
