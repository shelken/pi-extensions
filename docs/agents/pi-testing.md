# 真机测试 pi 插件

需要实际跑 pi 验证插件行为时使用

## 模型选择

优先用便宜经济的模型（free / mini / nano / flash），free 最优先：

```bash
pi --list-models | grep -Ei '\-flash|\-mini|\-nano|free'
```

## 冒烟测试

选定模型后跑一条最小命令确认插件可加载：

```bash
pi --model opencode/deepseek-v4-flash-free --thinking high --no-session --no-context-files --no-approve --no-extensions --no-skills -p "say hi"
```
