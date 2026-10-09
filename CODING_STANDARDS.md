# CODING_STANDARDS

写代码 / 写文档时的规范与决策。每条只记**为什么**；具体做法查对应文件。

## 依赖分层

- `@earendil-works/*` 只进根 `devDependencies` + 子包 `peerDependencies`：宿主 pi 已提供这些模块，重复打包会双实例冲突；dev 声明只为 tsc/测试
- runtime 库（如 `yaml`/`typebox`）放子包 `dependencies`：随包分发，不依赖宿主

## 包元数据

- 子包默认 `private: true`：避免意外发布；发布需显式转公开
- 公开包用 `@shelken/` scope + `publishConfig.access: public`
- `keywords` 必含 `pi-package`：pi.dev/packages 官方索引按此字段收录，与 git tag 无关

## 配置路径

- 插件配置：`{pi-agent-dir}/extensions/<package>/config.json`（全局）与 `.pi/extensions/<package>/config.json`（项目级，覆盖全局）：两处分离让用户级与项目级偏好可各自维护

## 文档与 README

- fork 来源说明写在**子包** README，根 README 不写：根 README 面向使用者，fork 溯源属于单个子包的历史
- 文档路径一律用 `{pi-agent-dir}` 等占位符：本机绝对路径对他人不可复现，且随环境失效

## 命令归属

- 子包级命令放子包 justfile，通用命令放根 justfile：命令跟着作用域走，根 justfile 保持跨子包可用
