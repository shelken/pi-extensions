# Coding Standards

纯工程规范，从 AGENTS.md 按需外移；做下述事情时再阅读对应小节

## 依赖分层

- `@earendil-works/*` 只放根 `package.json` 的 `devDependencies`（供 tsc 与测试）
- 子包以 `peerDependencies` 引用 `@earendil-works/*`，宿主 pi 提供，可设 `optional`
- 真 runtime 库（如 `yaml`、`typebox`）放子包 `dependencies`，不要挂根

## 子包命名与发布元数据

- 子包默认 `private: true`
- 公开发布用 `@shelken/` 前缀 + `publishConfig.access: public`
- `keywords` 必须含 `pi-package`（pi.dev/packages 官方索引靠这个，不是 git tag）
- fork 说明写在子包 `README.md`，根 README 不写 fork 来源

## 插件配置路径

- 无特殊理由时全局路径为 `{pi-agent-dir}/extensions/<package>/config.json`
- 项目级路径为 `.pi/extensions/<package>/config.json`，项目覆盖全局

## 扩展 factory

- 禁网络请求与同步重 IO
- 耗时工作放 `session_start`（或等价延迟路径）

## 命令分工

- 子包级命令放子包 `justfile`
- 通用命令放根 `justfile`

## 新建插件

```bash
nix flake new extensions/{new-extension} -t github:shelken/nix-templates#pi-extension
```

## 迁移流程（迁入 monorepo 时）

1. 复制已审阅源码到 `extensions/<package>`，排除 `.git`、`node_modules`、`dist`、lockfile、临时文件
2. 修正入口、包名、根 `pi.extensions`
3. 从 pi settings 去掉旧独立入口，保留 mono 入口
4. 验证通过再提交、推送；最后才归档旧仓库

## worktree 单包挂载

- worktree / 分支开发新插件时，本地测试只把单个子包路径加入 `{pi-agent-dir}/settings.json` 的 `packages`（如 `.../extensions/<package>`）
- 不挂 monorepo 根目录，避免 worktree 整仓入口与主干 packages 叠装
