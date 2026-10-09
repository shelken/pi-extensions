# Repository Guidelines

个人 pi 扩展 monorepo：子包装在 `extensions/`，统一验证与 changesets 发布。

## 目录结构

`extensions/`: 一目录一 package
`.github/workflows/`: CI / 发布
`.pi/`: 项目级 pi 包声明与本地 npm 安装（入库仅限约定文件）

版本、协作、发布文档见 `README.md` 与 `docs/`；命令查 `justfile`，workspace 入口查根 `package.json` 的 `pi.extensions`

## 开发注意事项

- 增删改名子包：同步根 `README.md` 表格与根 `package.json` 的 `pi.extensions`
- 有发布意义的行为/入口/配置变更写 `.changeset/*.md`；只改测试/文档可空 changeset 或不写（见 `docs/versioning.md`）
- fork 说明写在**子包** `README.md`，根 README 不写 fork 来源
- 依赖分层：`@earendil-works/*` 只在根 `devDependencies`（给 tsc/测试）+ 子包 `peerDependencies`（宿主 pi 提供，可 optional）；真 runtime 库（如 `yaml`/`typebox`）放子包 `dependencies`，不要挂根

## 基本约束

- 文档只记代码看不出来的约定与流程、边界决策、禁止事项；源码已表达的逻辑不重复
- 子包默认 `private: true`；公开发布用 `@shelken/` + `publishConfig.access: public`；`keywords` 必须含 `pi-package`（pi.dev/packages 官方索引靠这个，不是 git tag）
- 子包级命令放子包 justfile；通用命令放根 `justfile`
- 插件配置路径无特殊理由时：`{pi-agent-dir}/extensions/<package>/config.json` 与 `.pi/extensions/<package>/config.json`，项目覆盖全局
- 扩展 factory 禁网络与同步重 IO；耗时放 `session_start`（或等价延迟路径）
- 验证：改动仅涉及单个插件时在子包目录跑 `just verify` 即可；跨包改动跑根 `just verify`
- 需要真机测试 pi 插件行为时，见 `docs/agents/pi-testing.md`
- 新建插件用 `nix flake new extensions/{new-extension} -t github:shelken/nix-templates#pi-extension`
- worktree / 分支开发新插件时：本地测试只把**单个子包路径**加入 `{pi-agent-dir}/settings.json` 的 `packages`（如 `.../extensions/<package>`），不要挂 monorepo 根目录，避免 worktree 整仓入口与主干 packages 叠装

## 提交与发布

- 提交后检查 `.changeset/` 目录，询问用户是否发布，同意后走发布流程

## 迁移流程（迁入 monorepo 时）

1. 复制已审阅源码到 `extensions/<package>`，排除 `.git`、`node_modules`、`dist`、lockfile、临时文件
2. 修正入口、包名、根 `pi.extensions`；从 pi settings 去掉旧独立入口，保留 mono 入口
3. 验证通过再提交、推送；最后才归档旧仓库

## Agent skills

- Issues 与 spec 都作为 GitHub issue 管理（`gh` CLI），spec 本地镜像在 `docs/specs/<feature>-spec.md`，见 `docs/agents/issue-tracker.md`
- Domain docs 用 single-context（根 `CONTEXT.md` + `docs/adr/`），见 `docs/agents/domain.md`
