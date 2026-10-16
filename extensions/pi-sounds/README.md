# pi-sounds

Agent 任务完成/事件提示音扩展。开箱即用，内置经典轻量提示音，解决旧版插件阻塞与硬编码缺陷，同时完美支持 Pi 与 Oh My Pi (omp)。

## 安装

```bash
pi install npm:@shelken/pi-sounds
```

在 omp 中，可在 `plugins/package.json` 中作为依赖引入：
```json
"@shelken/pi-sounds": "npm:@shelken/pi-sounds@0.1.0"
```

## 特性

- **开箱即用（零配置）**：默认内置经典的 `done.mp3` 提示音，无需在配置文件中编写任何配置即可直接工作。
- **双宿主原生支持**：
  - **Pi**：精准监听 `agent_settled` 事件，彻底避免因自动重试、自动压缩或排队流转导致的提前或重复响铃；支持 `pi.getSettings()` 内存零 I/O 读取。
  - **Oh My Pi (omp)**：监听 `agent_end` 并自动过滤 `willContinue` 迭代。
- **非阻塞播放（高性能）**：音频播放采用完全异步非阻塞调度，绝不阻碍宿主主事件循环、终端渲染与用户输入。
- **干净安全**：移除旧插件全局 `pkill -9 afplay` 等潜在副作用；参数严格数组化隔离，防注入。

## 命令

- `/sounds test`：立即试听提示音。
- `/sounds list`：查看当前生效的提示音路径与配置来源。
- `/sounds reload`：重新加载配置。

## 可选自定义配置（非必选）

若希望自定义音频路径或调整音量，可在宿主配置文件中声明（未声明则使用默认内置声音）：

### Pi (`~/.pi/agent/settings.json`)
```json
{
  "sounds": {
    "agent_end": {
      "path": "~/Music/custom-done.mp3",
      "volume": 0.8
    }
  }
}
```
*或直接设为 `false` 关闭提示音：`"agent_end": false`。*

### Oh My Pi (`~/.omp/agent/config.yml`)
```yaml
sounds:
  agent_end:
    path: /System/Library/Sounds/Glass.aiff
    volume: 0.5
```

## 开发与验证

```bash
bun install
bun test
```
