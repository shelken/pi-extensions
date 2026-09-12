---
"@shelken/pi-auto-model-prompts": patch
---

配置与提示词目录按宿主取值（Pi `.pi` / Oh My Pi `.omp`）：宿主配置存在时只用宿主的，避免另一宿主的 `enabled: false` 覆盖本宿主显式开启的配置；提示词目录宿主优先。`systemPrompt` 兼容宿主的 `string[]` 形态，追加内容整体入列而非被逗号拼接。
