# pi-extensions 统一流程入口。详见 AGENTS.md。

default:
    @just --list

# 类型检查
check:
    bun run check

# 子包 + vitest 测试
test:
    bun run test

# 提交前完整校验: 类型检查 + 测试
verify:
    bun run verify

# 扫描完整 Git 历史中的密钥
secrets:
    gitleaks git --redact --no-banner --verbose

# 依赖升级 (latest, 递归) 后跑 verify
deps-update:
    bun run deps:update

# 依赖升级 dry-run
deps-update-dry:
    bun run deps:update:dry

# === 版本管理 (changesets) ===
# 详细流程见 docs/versioning.md

# 添加 changeset: 声明本次变更影响的子包 + bump 类型 (交互式)
changeset:
    bunx changeset

# 查看待发布的 changeset (是否有漏写)
changeset-status:
    bunx changeset status

# 本地预览 version 应用结果 (bump + CHANGELOG); 预览后 git checkout . 撤销
changeset-version:
    bunx changeset version
