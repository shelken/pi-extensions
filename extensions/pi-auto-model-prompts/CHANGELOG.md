# @shelken/pi-auto-model-prompts

## 0.3.1

### Patch Changes

- [#48](https://github.com/shelken/pi-extensions/pull/48) [`ad44d44`](https://github.com/shelken/pi-extensions/commit/ad44d44317a89ce129e0099d168393fae3c02a24) Thanks [@shelken](https://github.com/shelken)! - prompt 读取不再因单个坏路径丢掉整轮注入：`.agents` 是普通文件时按空目录处理，prompt 文件读不到（权限等）时继续尝试下一个候选，而不是把异常抛给宿主。

## 0.3.0

### Minor Changes

- [#46](https://github.com/shelken/pi-extensions/pull/46) [`0f1633a`](https://github.com/shelken/pi-extensions/commit/0f1633a9ceaa8551143ac522f5357bddd36d5a04) Thanks [@shelken](https://github.com/shelken)! - prompt 与配置脱离宿主配置目录（`.pi` / `.omp`），统一放 `.agents`：prompt 读 `{cwd}/.agents/AGENTS.<matcher>.md`，全局 `~/.agents/AGENTS.<matcher>.md` 兜底；配置读 `{cwd}/.agents/pi-auto-model-prompts/config.json`，全局 `~/.agents/pi-auto-model-prompts/config.json` 兜底且被项目覆盖。不再读取 `auto-model-prompts/` 目录，匹配语义、目录内优先级、空文件跳过与事件挂点保持不变，裸 `AGENTS.md` 不参与匹配。迁移时把原 `<matcher>.md` 重命名为 `AGENTS.<matcher>.md` 放进项目或全局 `.agents`。

### Patch Changes

- [#46](https://github.com/shelken/pi-extensions/pull/46) [`bbd2953`](https://github.com/shelken/pi-extensions/commit/bbd295368de32481c6a8c917a3a72e5c6e556a31) Thanks [@shelken](https://github.com/shelken)! - 兼容 Oh My Pi 的 `string[]` 形态 `systemPrompt`：追加内容整体入列，不再被模板字符串按逗号拼成一整段而破坏 Markdown 段落。类型按上游 `string` 编译，运行时按实际类型分支。

## 0.2.4

### Patch Changes

- [`711ff91`](https://github.com/shelken/pi-extensions/commit/711ff91b762386b69447371e98cc9497022a4076) Thanks [@shelken](https://github.com/shelken)! - 支持使用 `*文本*.md` 按包含关系匹配模型 ID

- [`02e2381`](https://github.com/shelken/pi-extensions/commit/02e2381a7954b475e506d448c0e0e0b1b001aa68) Thanks [@shelken](https://github.com/shelken)! - 模型 ID 含 `/` 时只匹配最后一段，让带命名空间的模型复用普通模型名 prompt

## 0.2.3

### Patch Changes

- [`0f2dfc8`](https://github.com/shelken/pi-extensions/commit/0f2dfc86aa6fa6029c9e9c40846f2ae25e037533) Thanks [@shelken](https://github.com/shelken)! - 规范依赖声明：宿主 `@earendil-works/*` peer 下限 `>=0.80.0`；`typebox` 改为 pi-add-dir 真依赖；清理根死依赖并同步文档清单。

## 0.2.2

### Patch Changes

- [`7312309`](https://github.com/shelken/pi-extensions/commit/7312309c49d5776a86e20671a1ed8e41880f4fc1) Thanks [@shelken](https://github.com/shelken)! - 公开发布 pi-auto-model-prompts，并提供 scoped npm 安装入口。
