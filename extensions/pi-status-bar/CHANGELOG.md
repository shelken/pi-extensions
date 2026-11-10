# @shelken/pi-status-bar

## 0.2.0

### Minor Changes

- [`31c6681`](https://github.com/shelken/pi-extensions/commit/31c6681f96bfafabef88d086da7362e689e2355e) Thanks [@shelken](https://github.com/shelken)! - 状态条的段顺序改为可配置：在宿主 settings（全局 `{pi-agent-dir}/settings.json` 或项目 `.pi/settings.json`）里写 `statusBar.order`，只显示列出的段并按列出顺序排列。缺失、非数组或写错名字时回退默认顺序，非法项忽略并提示一次。默认顺序同步调整为上下文在 git 之前。
