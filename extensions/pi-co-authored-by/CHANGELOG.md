# pi-co-authored-by

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
