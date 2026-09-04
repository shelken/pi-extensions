# pi-co-authored-by

## 0.2.13

### Patch Changes

- [`14b6021`](https://github.com/shelken/pi-extensions/commit/14b60219e4cf05aa7754c4adb71054551585a2eb) Thanks [@shelken](https://github.com/shelken)! - 动态识别 omp/pi 宿主名称并探测真实宿主版本生成 Generated-By，支持环境变量与配置文件自定义共同作者邮箱

## 0.2.12

### Patch Changes

- [`b1b9586`](https://github.com/shelken/pi-extensions/commit/b1b9586ec7894de2606caa2e64a34ebe36edd644) Thanks [@shelken](https://github.com/shelken)! - 修复发布包漏打包子模块导致安装后找不到 `./lib/git-commit.ts` 的问题，统一分发 `src/` 源码入口，并增加 `omp.extensions` 声明

## 0.2.11

### Patch Changes

- [`f820167`](https://github.com/shelken/pi-extensions/commit/f82016766d84520334d70a0fb90dd348aa7c6d12) Thanks [@shelken](https://github.com/shelken)! - 修复与其它 Co-Authored-By 注入器共存时的双写:链式执行既有 hook 时,跳过自身会注入 Co-Authored-By 的 hook(如 dsh-co-authored-by 残留),避免同一提交出现重复 trailer

## 0.2.10

### Patch Changes

- [`45e8eb4`](https://github.com/shelken/pi-extensions/commit/45e8eb4c3572c3982c7c9cefb9bc5559ff889813) Thanks [@shelken](https://github.com/shelken)! - 只包装直接执行的 git commit：非 commit 命令不再注入 hook 脚本，避免与其他命令改写扩展互相干扰

## 0.2.9

### Patch Changes

- [`232f848`](https://github.com/shelken/pi-extensions/commit/232f848e6a887b275505e1c399ac7ea60e05fa12) Thanks [@shelken](https://github.com/shelken)! - 不再通过 GIT_CONFIG 注入 core.hooksPath；改为 bash 期间临时安装 prepare-commit-msg。
  pid 引用计数：多 shell 并发与 SIGKILL 残留不会误卸/卡死 hook。

## 0.2.8

### Patch Changes

- [`0f2dfc8`](https://github.com/shelken/pi-extensions/commit/0f2dfc86aa6fa6029c9e9c40846f2ae25e037533) Thanks [@shelken](https://github.com/shelken)! - 规范依赖声明：宿主 `@earendil-works/*` peer 下限 `>=0.80.0`；`typebox` 改为 pi-add-dir 真依赖；清理根死依赖并同步文档清单。

## 0.2.7

### Patch Changes

- [`a1672fa`](https://github.com/shelken/pi-extensions/commit/a1672fad0b1b5595b35e8f1a82c9951f01baa050) Thanks [@shelken](https://github.com/shelken)! - 扁平化入口到子包根目录，清理上游独立发包元数据

## 0.2.6

### Patch Changes

- [`9bdde3b`](https://github.com/shelken/pi-extensions/commit/9bdde3be02839164c30eeef36f4c9b86906eabe8) Thanks [@shelken](https://github.com/shelken)! - 修复使用绝对路径 git 提交时不会添加 trailers 的问题。

- [`d12b52c`](https://github.com/shelken/pi-extensions/commit/d12b52c92382827b5e4fd925c25ce8fd23956614) Thanks [@shelken](https://github.com/shelken)! - 将提交署名改为基于临时 prepare-commit-msg hook 注入，减少对 shell 命令形态的依赖。
