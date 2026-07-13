# pi-extensions 统一流程入口。详见 AGENTS.md。

default:
    @just --list

# 安装依赖并同步 lockfile
install:
    bun install

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

# 首次公开前门禁: manifest + 子包测试 + tarball + 全仓验证
package-audit package:
    node scripts/public-package.mjs audit "{{package}}"
    just verify
    just secrets

# 登录临时 npmrc（需要浏览器 2FA）
package-login:
    npm login --userconfig /tmp/.npmrc-user

# 人工首发当前 workspace 版本（需要浏览器 2FA）
package-bootstrap package:
    node scripts/public-package.mjs bootstrap "{{package}}"

# 为已存在的 npm 包绑定 GitHub OIDC（需要浏览器 2FA）
package-trust package:
    node scripts/public-package.mjs trust "{{package}}"

# 补齐人工首发的 scoped tag 和 GitHub Release
package-baseline package commit="HEAD":
    node scripts/public-package.mjs baseline "{{package}}" "{{commit}}"

# 查看 npm version、repository、license 和公开状态
package-status package:
    node scripts/public-package.mjs status "{{package}}"

# 删除临时 npm 登录凭据
package-auth-clean:
    rm -f /tmp/.npmrc-user

# 日常发包门禁: 测试 + 密钥扫描 + changeset 状态
release-ready:
    just verify
    just secrets
    bunx changeset status

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
