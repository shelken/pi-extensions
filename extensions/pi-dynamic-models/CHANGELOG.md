# @shelken/pi-dynamic-models

## 0.2.4

### Patch Changes

- [`7e049de`](https://github.com/shelken/pi-extensions/commit/7e049de59f4a1ed09605a4d709b49a2bf9aeea13) Thanks [@shelken](https://github.com/shelken)! - 注册前补齐 models.json 手写模型缺省字段（name/cost/reasoning 等），与 pi 自身 modelFromJson 默认值对齐，避免不完整模型透传进运行时

## 0.2.3

### Patch Changes

- [`38ed017`](https://github.com/shelken/pi-extensions/commit/38ed017bd979a463713e53109acf26ca0c7d296c) Thanks [@shelken](https://github.com/shelken)! - 修复模型匹配大小写不对称：registry 为小写 id、查询为大写（如网关返回 `Deepseek-v4-flash`）时无法匹配，导致回退默认参数。

## 0.2.2

### Patch Changes

- [`f68bc68`](https://github.com/shelken/pi-extensions/commit/f68bc68888233ce863c1105550a33fcf7255ec1c) Thanks [@shelken](https://github.com/shelken)! - 并发锁与失败冷却：多进程同时启动时不再重复拉取 registry/provider 网络请求；不可达 provider 失败后 10 分钟内冷却，不再每次 session_start 白等超时

## 0.2.1

### Patch Changes

- [`8635da4`](https://github.com/shelken/pi-extensions/commit/8635da46bd6a3eecd24473d803f93197cfe9cf68) Thanks [@shelken](https://github.com/shelken)! - /dynamic-models 增加 status/refresh 参数补全与描述

- [`373e2e6`](https://github.com/shelken/pi-extensions/commit/373e2e66d31d015f6b779e0e7ad433797f509ddd) Thanks [@shelken](https://github.com/shelken)! - 修复 provider 模型缓存过期后不再更新的问题；缓存 TTL 调整为 6 小时。
  网络失败不再写缓存（避免 mtime 伪装成 6h 新鲜）。
  优先 models.dev reasoning effort；未提供时用硬编码 thinking 映射；完整映射 cost。

## 0.2.0

### Minor Changes

- [`50227a3`](https://github.com/shelken/pi-extensions/commit/50227a3f2bd281486bb25daef549c4153233ade2) Thanks [@shelken](https://github.com/shelken)! - hash 未变跳过重注册、日志摘要、registry SWR/memo、过滤非对话模型、status/notify，以及 enableProviders \* 与 /dynamic-models 命令。

### Patch Changes

- [`0120d52`](https://github.com/shelken/pi-extensions/commit/0120d521e288294d5efbb523e0566549c43238b3) Thanks [@shelken](https://github.com/shelken)! - 内置 provider（如 openai）同 id 不覆盖参数：existing 含 built-in，register 时合并内置+models.json 仅追加新 AUTO。

## 0.1.7

### Patch Changes

- [`0f2dfc8`](https://github.com/shelken/pi-extensions/commit/0f2dfc86aa6fa6029c9e9c40846f2ae25e037533) Thanks [@shelken](https://github.com/shelken)! - 规范依赖声明：宿主 `@earendil-works/*` peer 下限 `>=0.80.0`；`typebox` 改为 pi-add-dir 真依赖；清理根死依赖并同步文档清单。

- [`858f5da`](https://github.com/shelken/pi-extensions/commit/858f5da44811eab01cad095969d40734180fe849) Thanks [@shelken](https://github.com/shelken)! - factory 阶段用磁盘 cache 同步注册 AUTO 模型，修复 session 恢复找不到动态 provider/id 的问题。

## 0.1.6

### Patch Changes

- [`378e01f`](https://github.com/shelken/pi-extensions/commit/378e01f3f1a74a83f6b0959df1809f2f7c22f446) Thanks [@shelken](https://github.com/shelken)! - 修正 npm Trusted Publishing 所需的仓库元数据，并补充 fork 修改版权声明。

## 0.1.5

### Patch Changes

- [`8512cc5`](https://github.com/shelken/pi-extensions/commit/8512cc514cf22f1fd23bbbe4e18c44ef918abc74) Thanks [@shelken](https://github.com/shelken)! - 改用 npm Trusted Publishing，通过 GitHub OIDC 发布并生成 provenance。
