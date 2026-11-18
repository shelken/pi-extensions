# @shelken/pi-status-bar

## 0.2.1

### Patch Changes

- [#116](https://github.com/shelken/pi-extensions/pull/116) [`e168d08`](https://github.com/shelken/pi-extensions/commit/e168d0882752e4b5b74cdf854799808d7780067e) Thanks [@shelken](https://github.com/shelken)! - 宿主包的 peerDependencies 改为 `"*"`，与 pi 官方打包规范一致。

- [#117](https://github.com/shelken/pi-extensions/pull/117) [`d8599e9`](https://github.com/shelken/pi-extensions/commit/d8599e949c11858cebe990af3527763c90188816) Thanks [@shelken](https://github.com/shelken)! - git 脏状态改在 `agent_settled` 刷新，一次请求内的自动重试不再重复跑 `git status`；非法 `statusBar.order` 只在 TUI 提示，不再写 stderr 弄花界面。

## 0.2.0

### Minor Changes

- [`31c6681`](https://github.com/shelken/pi-extensions/commit/31c6681f96bfafabef88d086da7362e689e2355e) Thanks [@shelken](https://github.com/shelken)! - 状态条的段顺序改为可配置：在宿主 settings（全局 `{pi-agent-dir}/settings.json` 或项目 `.pi/settings.json`）里写 `statusBar.order`，只显示列出的段并按列出顺序排列。缺失、非数组或写错名字时回退默认顺序，非法项忽略并提示一次。默认顺序同步调整为上下文在 git 之前。
