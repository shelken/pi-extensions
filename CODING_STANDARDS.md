# CODING_STANDARDS

写代码与文档时的决策规范。命令、流程、gotcha 见 `docs/agents/workflow.md`。

## 工具链与依赖分层
- 工具链（Node、Bun、Gitleaks）由 `.mise.toml` 锁定基线，本地与 CI 统一经 mise 还原
- `@earendil-works/*`：根 `devDependencies`（供 tsc/测试）+ 子包 `peerDependencies`（宿主 pi 提供，可 optional）
- 真 runtime 库（如 `yaml`/`typebox`）放子包 `dependencies`，不挂根
- 依赖自动升级由 `renovate.json` 托管，排除 `mise`，子包 runtime 依赖升级自动生成 changeset

## 包元数据与发布开关
- 子包默认 `private: true`
- 公开发布：包名 `@shelken/` + `publishConfig.access: public`
- `keywords` 必含 `pi-package`：pi.dev/packages 官方索引靠它，与 git tag 无关

## 配置与路径
- 插件配置：`{pi-agent-dir}/extensions/<package>/config.json` 与 `.pi/extensions/<package>/config.json`，项目覆盖全局
- `.pi/` 入库仅限约定文件
- 文档写路径用 `{pi-agent-dir}` 等占位符

## fork 与 README
- fork 说明写在子包 `README.md`；根 README 只做子包索引
