# Coding Standards

写代码与写文档时的规范。流程类内容见 `docs/agents/workflow.md`。

## 包声明

- 子包默认 `private: true`；公开发布用 `@shelken/` 作用域 + `publishConfig.access: public`
- `keywords` 必须含 `pi-package`：pi.dev/packages 官方索引靠这个字段，不是 git tag

## 依赖分层

- `@earendil-works/*` 只放根 `devDependencies`（给 tsc/测试用）+ 子包 `peerDependencies`（宿主 pi 提供，可 optional）
- 真 runtime 库（如 `yaml`/`typebox`）放子包 `dependencies`，不挂根：随包分发，不依赖宿主提供

## 插件配置

- 配置路径无特殊理由时：`{pi-agent-dir}/extensions/<package>/config.json` 与 `.pi/extensions/<package>/config.json`，项目覆盖全局

## 文档写法

- fork 说明写在**子包** `README.md`，根 README 不写 fork 来源
- 文档用 `{pi-agent-dir}` 等占位符指代环境路径，不写本机绝对路径
- 文档禁止复述源码已表达的逻辑；只记约定、流程、边界决策、禁止事项
