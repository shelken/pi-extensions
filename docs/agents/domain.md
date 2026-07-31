# Domain Docs

工程 skill 探索本仓时如何消费领域文档。

## Before exploring, read these

- **`CONTEXT.md`**（repo 根）。
- **`docs/adr/`**——读触及你将要改动区域的 ADR。

任一文件不存在时**静默继续**，不标记缺失、不建议预先创建。`/domain-modeling` skill（经 `/grill-with-docs`、`/improve-codebase-architecture`）会在术语/决策真正落定时惰性创建。

## File structure

Single-context（本仓采用）：

```
/
├── CONTEXT.md
├── docs/adr/
│   └── 0001-*.md
└── extensions/
```

## Use the glossary's vocabulary

输出中命名领域概念时（issue 标题、重构提案、假设、测试名）用 `CONTEXT.md` 定义的术语，不要漂移到 glossary 明确回避的同义词。概念不在 glossary 中——要么你在造项目未用的词（重新考虑），要么是真缺口（记给 `/domain-modeling`）。

## Flag ADR conflicts

输出与既有 ADR 矛盾时显式标出，而非静默覆盖：

> _Contradicts ADR-0007 (...) — but worth reopening because…_
