# @shelken/pi-sounds

## 0.1.1

### Patch Changes

- [#130](https://github.com/shelken/pi-extensions/pull/130) [`e5907ae`](https://github.com/shelken/pi-extensions/commit/e5907ae6e28e3e15925a27014a9212a0dc7c03a0) Thanks [@shelken](https://github.com/shelken)! - 修复非交互模式（如 `pi -p`）下异步播放失败触发 stale `ctx` 未捕获异常、OMP 配置路径错误、非 macOS 每轮弹错及 `/sounds reload` 失败后误报成功的问题
