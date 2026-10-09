# Repository Guidelines

个人 pi 扩展 monorepo：子包装在 `extensions/`，统一验证与 changesets 发布。

## 结构与规范

- `extensions/` 下各插件子包，一目录一 package；根 `package.json` 的 `pi.extensions` 决定加载哪些子包入口
- `.pi/` 入库仅限约定文件（本仓项目级 pi 包声明与本地 npm 安装）
- 写代码 / 写文档的规范与决策（依赖分层、包元数据、配置路径、README 约定、路径写法、justfile 归属）：见根 `CODING_STANDARDS.md`
- 版本与 changeset 判定：见 `docs/versioning.md`

## 开发注意事项

- AGENTS / 开发说明只记代码看不出来的约定：流程、边界决策、禁止事项；复述源码即文档的行没有价值
- 增删改名子包：同步根 `README.md` 表格与根 `package.json` 的 `pi.extensions`
- 扩展 factory 禁网络与同步重 IO；耗时放 `session_start`（或等价延迟路径）

## 基本流程

- 提交前至少 `just verify`；单包改动在子包目录内跑 `just verify` 即可，避免全局验证浪费时间
- 测试 pi 插件先挑便宜模型：`pi --list-models | grep -Ei 'free|flash|mini|nano'`（优先 free），flag 组合查 `pi --help`
- 新建插件：`nix flake new extensions/{new-extension} -t github:shelken/nix-templates#pi-extension`
- worktree / 分支开发时，本地测试只把**单个子包路径**加入 `{pi-agent-dir}/settings.json` 的 `packages`；挂 monorepo 根会导致 worktree 整仓入口与主干 packages 叠装
- 提交后检查 changeset 目录，询问用户是否发布，用户同意后按发布流程进行

## 迁移流程（迁入 monorepo 时）

1. 复制已审阅源码到 `extensions/<package>`，排除 `.git`、`node_modules`、`dist`、lockfile、临时文件
2. 修正入口、包名、根 `pi.extensions`；从 pi settings 去掉旧独立入口，保留 mono 入口
3. 验证通过再提交、推送；最后才归档旧仓库

## Agent skills

- Issue / spec 管理（GitHub issue，`gh` CLI）：见 `docs/agents/issue-tracker.md`
- Domain docs（根 `CONTEXT.md` + `docs/adr/`）：见 `docs/agents/domain.md`
