---
"@shelken/simple-plannotator": patch
---

在浏览器里提交审查或标注时，若原会话已被 `/new`、`/resume`、`/reload` 替换，结果会被丢弃，不再因调用失效的会话对象产生未处理 rejection 而让 pi 退出。
