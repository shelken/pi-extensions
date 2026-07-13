# Repository Guidelines

个人 pi 扩展 monorepo：子包装在 `extensions/`，统一验证与 changesets 发布。

## 目录结构

`extensions/`: 各插件子包（一目录一 package）
`.changeset/`: 版本与 changelog 声明
`.github/workflows/`: CI / 发布
`docs/`: 版本与协作文档
`justfile`: 统一开发与验证命令
`package.json`: workspace 与 `pi.extensions` 入口
`AGENTS.md` / `README.md`: 协作约定与索引
`.pi/`: 本仓项目级 pi 包声明与本地 npm 安装（入库仅限约定文件）

## 开发注意事项

- 增删改名子包：同步根 `README.md` 表格与根 `package.json` 的 `pi.extensions`
- 有发布意义的行为/入口/配置变更写 `.changeset/*.md`；只改测试/文档可空 changeset 或不写（见 `docs/versioning.md`）
- fork 说明写在**子包** `README.md`，根 README 不写 fork 来源

## 基本约束

- AGENTS / 开发说明禁止复述源码已表达的逻辑；只记代码看不出来的约定(实现即文档), 只记流程、边界决策、禁止事项
- 子包默认 `private: true`；公开发布用 `@shelken/` + `publishConfig.access: public`
- 子包级命令放子包 justfile；通用命令放根 `justfile`
- 插件配置路径无特殊理由时：`{pi-agent-dir}/extensions/<package>/config.json` 与 `.pi/extensions/<package>/config.json`，项目覆盖全局
- 扩展 factory 禁网络与同步重 IO；耗时放 `session_start`（或等价延迟路径）
- 文档不写本机绝对路径，用 `{pi-agent-dir}` 等
- 提交前至少 `just verify`；单包可加 `bun --filter <package> test`
- 如果想要测试pi插件, 先检查模型(使用mini/nano/flash/free等便宜经济的模型),`pi --list-models | grep -Ei '\-flash|\-mini|\-nano|free'`,优先使用free, 然后测试模型`pi --model opencode/deepseek-v4-flash-free --thinking high --no-session --no-context-files --no-approve --no-extensions --no-skills -p "say hi"`; 
- 如果要自主交互测试, 阅读 `pi-interactive-shell` skill
- 新建新的插件时 使用 `nix flake new extensions/{new-extension} -t github:shelken/nix-templates#pi-extension`

## 迁移流程（迁入 monorepo 时）

1. 复制已审阅源码到 `extensions/<package>`，排除 `.git`、`node_modules`、`dist`、lockfile、临时文件
2. 修正入口、包名、根 `pi.extensions`
3. 从 pi settings 去掉旧独立入口，保留 mono 入口
4. 验证通过再提交、推送；最后才归档旧仓库
