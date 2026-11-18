# @shelken/simple-plannotator

## 0.1.11

### Patch Changes

- [#116](https://github.com/shelken/pi-extensions/pull/116) [`e168d08`](https://github.com/shelken/pi-extensions/commit/e168d0882752e4b5b74cdf854799808d7780067e) Thanks [@shelken](https://github.com/shelken)! - 宿主包的 peerDependencies 改为 `"*"`，与 pi 官方打包规范一致。

- [#118](https://github.com/shelken/pi-extensions/pull/118) [`7f49719`](https://github.com/shelken/pi-extensions/commit/7f49719e0795ca05d9009a0a255970ee9935310d) Thanks [@shelken](https://github.com/shelken)! - 在浏览器里提交审查或标注时，若原会话已被 `/new`、`/resume`、`/reload` 替换，结果会被丢弃，不再因调用失效的会话对象产生未处理 rejection 而让 pi 退出。

## 0.1.10

### Patch Changes

- [#112](https://github.com/shelken/pi-extensions/pull/112) [`47bc946`](https://github.com/shelken/pi-extensions/commit/47bc946e0d6a636b67a49178aa1dd93bec23faeb) Thanks [@renovate](https://github.com/apps/renovate)! - fix(deps): update dependency @plannotator/pi-extension to ^0.28.62

## 0.1.9

### Patch Changes

- [#103](https://github.com/shelken/pi-extensions/pull/103) [`52a727e`](https://github.com/shelken/pi-extensions/commit/52a727e10ba1e824c11d2f0c4862c2b7a850fdd7) Thanks [@renovate](https://github.com/apps/renovate)! - fix(deps): update dependency @plannotator/pi-extension to ^0.28.37

- [#108](https://github.com/shelken/pi-extensions/pull/108) [`f0493be`](https://github.com/shelken/pi-extensions/commit/f0493beeb46c04aba09c4d7b755d7722647c25af) Thanks [@renovate](https://github.com/apps/renovate)! - fix(deps): update dependency @plannotator/pi-extension to ^0.28.50

## 0.1.8

### Patch Changes

- [#88](https://github.com/shelken/pi-extensions/pull/88) [`5c7d925`](https://github.com/shelken/pi-extensions/commit/5c7d925384b7aa53fdc73cf2abd254afb4ecd11c) Thanks [@renovate](https://github.com/apps/renovate)! - fix(deps): update dependency @plannotator/pi-extension to ^0.28.36

## 0.1.7

### Patch Changes

- [#73](https://github.com/shelken/pi-extensions/pull/73) [`91b8542`](https://github.com/shelken/pi-extensions/commit/91b85428e2ead68f27c289b473a0fc6f8d577210) Thanks [@renovate](https://github.com/apps/renovate)! - fix(deps): update 插件 runtime 依赖

## 0.1.6

### Patch Changes

- [#63](https://github.com/shelken/pi-extensions/pull/63) [`7858497`](https://github.com/shelken/pi-extensions/commit/7858497f27bcdf60e896e5c06581950453ee9a2c) Thanks [@renovate](https://github.com/apps/renovate)! - fix(deps): update 插件 runtime 依赖

## 0.1.5

### Patch Changes

- [`0f2dfc8`](https://github.com/shelken/pi-extensions/commit/0f2dfc86aa6fa6029c9e9c40846f2ae25e037533) Thanks [@shelken](https://github.com/shelken)! - 规范依赖声明：宿主 `@earendil-works/*` peer 下限 `>=0.80.0`；`typebox` 改为 pi-add-dir 真依赖；清理根死依赖并同步文档清单。

## 0.1.4

### Patch Changes

- [`a1672fa`](https://github.com/shelken/pi-extensions/commit/a1672fad0b1b5595b35e8f1a82c9951f01baa050) Thanks [@shelken](https://github.com/shelken)! - 扁平化入口到子包根目录，清理上游独立发包元数据
