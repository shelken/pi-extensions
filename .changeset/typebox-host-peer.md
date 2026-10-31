---
"@shelken/pi-dynamic-models": patch
"@shelken/pi-add-dir": patch
---

`typebox` 改为 optional `peerDependencies`（`"*"`），由宿主提供，消除 pi 的 “Host-provided extension packages must be declared in peerDependencies” 警告，并避免装出重复的运行时副本。
