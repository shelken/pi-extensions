# 仓内文档索引

按任务找文档；下表未覆盖的约定看 `docs/CODING_STANDARDS.md` 或对应包 README

| 触发 | 读 |
| --- | --- |
| 增删改名子包、新建/迁移/挂载插件、写扩展代码 | [`docs/CODING_STANDARDS.md`](CODING_STANDARDS.md) |
| 提交后（`.changeset/` 为空时询问用户是否发布）、写 changeset、发布失败 | [`docs/versioning.md`](versioning.md) |
| 真机测试 pi 插件、选便宜测试模型 | [`docs/agents/pi-testing.md`](agents/pi-testing.md) |
| 管理 GitHub issue、写 feature spec | [`docs/agents/issue-tracker.md`](agents/issue-tracker.md) |
| 写 domain 文档、ADR | [`docs/agents/domain.md`](agents/domain.md) |
| 查子包清单、同步子包表与 `pi.extensions`、临时禁用插件、本地挂载 | [`README.md`](../README.md) |
| 查开发与验证命令 | `justfile` |
| pi 插件装了但不生效、加载/触发排查 | [`skills/pi-extension-diagnose`](../skills/pi-extension-diagnose/SKILL.md) |
