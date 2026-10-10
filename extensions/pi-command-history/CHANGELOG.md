# @shelken/pi-command-history

## 0.1.6

### Patch Changes

- [`7a2fc53`](https://github.com/shelken/pi-extensions/commit/7a2fc53caf18ed476c63ec9e3d0bede54f76ace5) Thanks [@shelken](https://github.com/shelken)! - 同步 npm 包的 `src/index.ts` 入口和当前按目录持久化历史实现。

## 0.1.5

### Patch Changes

- [`0f2dfc8`](https://github.com/shelken/pi-extensions/commit/0f2dfc86aa6fa6029c9e9c40846f2ae25e037533) Thanks [@shelken](https://github.com/shelken)! - 规范依赖声明：宿主 `@earendil-works/*` peer 下限 `>=0.80.0`；`typebox` 改为 pi-add-dir 真依赖；清理根死依赖并同步文档清单。

## 0.1.4

### Patch Changes

- [`a1672fa`](https://github.com/shelken/pi-extensions/commit/a1672fad0b1b5595b35e8f1a82c9951f01baa050) Thanks [@shelken](https://github.com/shelken)! - 扁平化入口到子包根目录，清理上游独立发包元数据

- [`e92161c`](https://github.com/shelken/pi-extensions/commit/e92161c979922b1372071b5d86312360d7cb4d57) Thanks [@shelken](https://github.com/shelken)! - 去掉 ctrl 别名与 status；保留 cwd 防碰撞；append 写入 + load 时压缩到 500
