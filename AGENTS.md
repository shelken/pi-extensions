# Repository Guidelines

个人 pi 扩展 monorepo：子包装在 `extensions/`（一目录一 package），根 `package.json` 的 `pi.extensions` 决定加载入口，统一验证与 changesets 发布。

## 铁律
- 扩展 factory 禁网络与同步重 IO；耗时逻辑放 `session_start`（或等价延迟路径）
- 增删改名子包：同步根 `README.md` 表格与根 `package.json` 的 `pi.extensions`
- 文档只记代码看不出的东西：约定、流程、边界决策、禁止事项

## 指针
| 触发 | 文件 |
|---|---|
| 发布 / changeset / npm / tag | `docs/versioning.md` |
| issue / spec | `docs/agents/issue-tracker.md` |
| 术语 / 上下文 / ADR | `docs/agents/domain.md` |
| 提交 / 验证 / 测试 / 新建插件 / worktree / 迁移 | `docs/agents/workflow.md` |
| 依赖 / 包元数据 / 配置路径 / fork / 路径写法 | `CODING_STANDARDS.md` |
