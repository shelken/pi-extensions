# Workflow

日常流程与命令。命令清单以环境为准：`just --list`、`pi --help`、`cat package.json`。

## 验证与提交
- 提交前至少 `just verify`；单包改动在子包目录内跑 `just verify`，避免全局验证浪费时间
- PR 统一经 `.github/workflows/ci.yml` 运行 `just verify` 门禁，环境依据 `.mise.toml` 还原
- 提交后检查 `.changeset/` 目录，询问用户是否发布；同意后按 `docs/versioning.md` 发布

## 新建子包
- `nix flake new extensions/{new-extension} -t github:shelken/nix-templates#pi-extension`
- 子包级命令放子包 justfile；通用命令放根 justfile

## 测试 pi 插件
- 先挑便宜模型：`pi --list-models | grep -Ei '\-flash|\-mini|\-nano|free'`，优先 free
- 冒烟命令的完整 flag 串查 `pi --help`（意图：关掉 session/上下文/审批，`-p "say hi"` 只测一句话）

## worktree / 分支开发
- 本地测试只把**单个子包路径**挂进 `{pi-agent-dir}/settings.json` 的 `packages`
- 不挂 monorepo 根：整仓入口会与主干 packages 叠装

## 迁移（迁入 monorepo）
1. 复制已审阅源码到 `extensions/<package>`，排除 `.git`、`node_modules`、`dist`、lockfile、临时文件
2. 修正入口、包名、根 `pi.extensions`
3. 从 pi settings 去掉旧独立入口，保留 mono 入口
4. 验证通过再提交、推送，最后归档旧仓库
