# Repository Guidelines

个人 pi 扩展 monorepo：子包装在 `extensions/`，统一验证与 changesets 发布；根 `package.json` 的 `pi.extensions` 是 workspace 与 pi 加载入口

## Always-on

- 验证用 `just verify`：单插件改动在子包目录跑，跨包改动跑根 `just verify`
- 有发布意义的行为/入口/配置变更写 `.changeset/*.md`；纯测试/文档改动不写（见 `docs/versioning.md`）
- 增删改名子包：同步根 `README.md` 表格与根 `package.json` 的 `pi.extensions`
- 文档不写本机绝对路径，用 `{pi-agent-dir}` 等变量
- 文档不复述源码已表达的逻辑，只记代码看不出来的约定、流程、边界决策、禁止事项

## 提交与发布

- 提交后检查 `.changeset/` 目录，询问用户是否发布，同意后走发布流程

## 按需阅读

| 何时读 | 读什么 |
| --- | --- |
| 依赖分层、子包命名发布元数据、插件配置路径、factory 约束、justfile 分工、新建插件模板、迁移流程、worktree 单包挂载 | `docs/CODING_STANDARDS.md` |
| 写 changeset、查版本与发布流程 | `docs/versioning.md` |
| 真机测试 pi 插件行为、选便宜测试模型 | `docs/agents/pi-testing.md` |
| 管理 GitHub issue、写 feature spec | `docs/agents/issue-tracker.md` |
| 写 domain 文档、ADR | `docs/agents/domain.md` |
| 查子包清单与协作说明 | `README.md` |
| 查开发与验证命令 | `justfile` |
| 排查 pi 扩展故障 | `skills/pi-extension-diagnose` |
