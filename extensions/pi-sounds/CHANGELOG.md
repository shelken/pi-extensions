# @shelken/pi-sounds

## 0.1.2

### Patch Changes

- [#132](https://github.com/shelken/pi-extensions/pull/132) [`a2d5541`](https://github.com/shelken/pi-extensions/commit/a2d5541c7a1875a5b0418d2fc14d7688f564db7d) Thanks [@shelken](https://github.com/shelken)! - SSH 会话与 macOS 暗唤醒无音频能力状态下跳过远端 afplay 并降级为终端响铃，同时优化播放超时提示

## 0.1.1

### Patch Changes

- [#130](https://github.com/shelken/pi-extensions/pull/130) [`e5907ae`](https://github.com/shelken/pi-extensions/commit/e5907ae6e28e3e15925a27014a9212a0dc7c03a0) Thanks [@shelken](https://github.com/shelken)! - 修复非交互模式（如 `pi -p`）下异步播放失败触发 stale `ctx` 未捕获异常、OMP 配置路径错误、非 macOS 每轮弹错及 `/sounds reload` 失败后误报成功的问题
