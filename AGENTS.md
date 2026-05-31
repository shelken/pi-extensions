# Repository Guidelines

## 必做维护

- 新增、移除或改名子 package 时，同步更新根 `README.md` 表格和根 `package.json` 的 `pi.extensions`。
- 子 package 如果来自 fork，必须在该子包 `README.md` 标明原始仓库链接。
- 从独立仓库迁入后，验证通过再归档旧 GitHub 仓库；不要先归档。
- 只迁移当前 `settings.json` 中启用且明确决定继续使用的扩展；待议项目保持独立。

## 迁移流程

1. 复制当前已审阅的源仓库内容到 `extensions/<package>`，排除 `.git`、`node_modules`、`dist`、lockfile 和临时文件。
2. 修正 pi 运行所需入口、依赖包名和根 `package.json` 的 `pi.extensions`。
3. 从 pi settings 移除旧 package/extension 入口，保留 mono repo 入口。
4. 运行精准验证；通过后提交、推送，再归档旧仓库。

## 统一规范

- 保持修改范围小；不做顺手重构。
- 文档不写本机绝对路径、账号、token 或隐私信息。
- pi core 依赖使用 `@earendil-works/*` 和 `typebox`，不要重新引入旧 `@mariozechner/*` 或 `@sinclair/typebox`。
- fork 子包尽量保留原结构；只做当前 pi 版本兼容和本人需要的行为改动。
- 提交前至少运行 `bun run check`；有子包测试时运行对应 `bun --filter <package> test`。
