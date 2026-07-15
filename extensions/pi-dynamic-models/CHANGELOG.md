# @shelken/pi-dynamic-models

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
