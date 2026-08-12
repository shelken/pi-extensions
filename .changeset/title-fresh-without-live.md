---
"@shelken/pi-title": patch
---

`/title fresh` 无 live payload 时（reload 后未对话、刚换模型）不再静默排队，改用不含对话历史的精简请求立即生成；成功后 notify 显示新标题。
