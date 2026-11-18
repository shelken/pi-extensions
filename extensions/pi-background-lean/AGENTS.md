# pi-background-lean

pi-background 的 lean 包装：只改模型可见文字，不改行为。

## 目录结构

`src/index.ts`: 扩展入口与覆盖文字
`tests/`: 用 pi SDK 真实加载上游与本包对比
`package.json` / `README.md` / `LICENSE`: 包元数据与说明

## 基本约束

- 不改上游执行逻辑；需要改行为时向上游反馈或另行 fork
- 覆盖文字必须与上游实际行为一致；升级上游按 README「升级上游」核对
