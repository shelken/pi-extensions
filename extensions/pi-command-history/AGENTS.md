# pi-command-history

按工作目录持久化输入历史，快捷键跨 session 回填。

## 目录结构

`index.ts`: 扩展入口
`tests/`: 测试
`package.json` / `README.md` / `CHANGELOG.md` / `LICENSE`: 包元数据与说明

## 开发注意事项

- 曾用每键 rewrite + 文件锁，已因复杂度放弃；无新证据不要恢复该路线
- 曾去掉的 ctrl 别名与 status 栏，无明确需求不要加回

## 基本约束

（暂无已确认条目。新增须用户确认后再写入。）
