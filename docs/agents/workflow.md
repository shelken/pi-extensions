# Workflow

日常开发流程与 gotcha。写代码时的规范见根 `CODING_STANDARDS.md`。

## 验证门禁

- 提交前至少跑 `just verify`；改动仅涉及单个插件时，在子包目录内跑 `just verify` 即可，省去全局验证时间
- 子包级命令放子包 justfile；通用命令放根 justfile

## 测试 pi 插件

- 先挑便宜模型（flash/mini/nano，优先 free）：`pi --list-models` 查列表，其余 flag 串查 `pi --help`

## 新插件脚手架

- 用模板生成：`nix flake new extensions/{new-extension} -t github:shelken/nix-templates#pi-extension`

## worktree 单包挂载

- worktree / 分支开发新插件时，本地测试只把**单个子包路径**加入 `{pi-agent-dir}/settings.json` 的 `packages`，挂 monorepo 根目录会与主干 packages 叠装

## 提交后

- 检查 `.changeset/` 目录，询问用户是否发布；用户同意后按 `docs/versioning.md` 流程进行

## 迁移流程（迁入 monorepo 时）

1. 复制已审阅源码到 `extensions/<package>`，排除 `.git`、`node_modules`、`dist`、lockfile、临时文件
2. 修正入口、包名、根 `pi.extensions`
3. 从 pi settings 去掉旧独立入口，保留 mono 入口
4. 验证通过再提交、推送；最后才归档旧仓库
