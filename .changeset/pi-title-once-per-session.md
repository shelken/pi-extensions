---
"@shelken/pi-title": patch
---

修复自动标题只生成一次：`setSessionName` 同步触发 `session_info_changed`，handler 在 `onTitleSet` 之前执行，把自设标题误判为手动命名并永久锁死后续触发。改为先记录 `lastSetTitle` 再 `setSessionName`，自触发被正确忽略。
