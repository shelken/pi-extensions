# Repository Guidelines

个人 pi 扩展 monorepo：子包一目录一 package，放在 `extensions/`；根 `package.json` 的 `pi.extensions` 是 workspace 与 pi 加载入口；统一验证与 changesets 发布

## Always-on

- 验证用 `just verify`：单插件改动在子包目录跑，跨包改动跑根 `just verify`
- 有发布意义的行为/入口/配置变更写 `.changeset/*.md`；纯测试/文档改动不写
- 文档只记代码看不出来的约定、流程、边界决策、禁止事项；路径用 `{pi-agent-dir}` 等变量
- 仓内文档唯一入口索引：`docs/README.md`，按需规则先查索引再读对应文件
