# Repository Guidelines

个人 pi 扩展 monorepo：子包装在 `extensions/`（一目录一 package），统一验证与 changesets 发布。

## 仓库硬事实

- 增删改名子包：同步根 `README.md` 表格与根 `package.json` 的 `pi.extensions`
- AGENTS / 开发说明只记代码看不出来的约定（实现即文档）：流程、边界决策、禁止事项
- 扩展 factory 禁网络与同步重 IO；耗时操作放 `session_start`（或等价延迟路径）

## 目录约定

- `.pi/` 为项目级 pi 包声明与本地 npm 安装，入库仅限约定文件

## 指针

| 文档 | 内容 | 何时读 |
|---|---|---|
| `CODING_STANDARDS.md` | 包声明、依赖分层、配置路径、文档写法 | 写代码或写文档时 |
| `docs/agents/workflow.md` | verify 门禁、插件测试、脚手架、迁移流程 | 开发流程各环节 |
| `docs/versioning.md` | changeset 判定与发布唯一权威 | 版本或发布操作前 |
| `docs/agents/issue-tracker.md` | issue 与 spec 都走 GitHub issue | 建 issue 或 spec 时 |
| `docs/agents/domain.md` | `CONTEXT.md` + `docs/adr/` 领域文档消费方式 | 写领域文档时 |
