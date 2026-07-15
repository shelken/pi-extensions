# @shelken/pi-guard

## 0.2.0

### Minor Changes

- [`6b96861`](https://github.com/shelken/pi-extensions/commit/6b96861d2fd095984333e3dbc13d578d99fe853a) Thanks [@shelken](https://github.com/shelken)! - `evaluateGuard` 实现命令与路径硬禁（子串/`*`、path 归一与 bash 双针）。

- [`42194bd`](https://github.com/shelken/pi-extensions/commit/42194bd1814115385002df98edddee3952cac762) Thanks [@shelken](https://github.com/shelken)! - 策略合并：内置 deny 清单、permissions.yaml 层解析、`-value` 移除与 default_reason 覆盖。

- [`ea380e4`](https://github.com/shelken/pi-extensions/commit/ea380e4643751d7cf1f7e9b7f6d9d8a1b9314cf8) Thanks [@shelken](https://github.com/shelken)! - 新增 pi-guard 脚手架：导出 `evaluateGuard` 空壳（当前恒 allow），拦截规则后续落地。

- [`1174359`](https://github.com/shelken/pi-extensions/commit/11743593a1e13cde3a1f4c5a89d03dfd0a6f9efa) Thanks [@shelken](https://github.com/shelken)! - 接入 tool_call 硬禁与 permissions.yaml 加载（fail-open 警告）。

### Patch Changes

- [`0f2dfc8`](https://github.com/shelken/pi-extensions/commit/0f2dfc86aa6fa6029c9e9c40846f2ae25e037533) Thanks [@shelken](https://github.com/shelken)! - 规范依赖声明：宿主 `@earendil-works/*` peer 下限 `>=0.80.0`；`typebox` 改为 pi-add-dir 真依赖；清理根死依赖并同步文档清单。

- [`4eb4086`](https://github.com/shelken/pi-extensions/commit/4eb40869481335622eaa96cb6325f1d6bb97100a) Thanks [@shelken](https://github.com/shelken)! - 硬禁 reason 改为两行大写协议：`! FORBIDDEN COMMAND|PATH|BY USER` + body。
