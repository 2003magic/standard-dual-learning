# ptc-dual-learning

**DSH 自定义 Agent 预设**：以 PTC 模式（Code Mode SDK）为基础，内置从
[agent-dual-learning](https://github.com/2003magic/agent-dual-learning) 提炼的**双层学习机制**。

| 层级 | 时机 | 动作 | 载体 |
|---|---|---|---|
| 第一层 · 预防 | 会话启动 | 先读项目指引、必要时先 web_search 刷新知识，写认知简报再动手 | persona + 插件注入 |
| 第二层 · 兜底 | 连续 N 次**同类**失败 | 暂停机械重试 → 学习 → 修正假设 → 只做一次决定性验证 | 插件指纹检测 + 提醒 |
| 循环 | 全程 | 失败事件自动记入 `.dual-learning/events.jsonl`，教训写入 `lessons.md` | JSONL 知识库 |

- **PTC 能力不变**：所有工具仍通过 run_code 的 TypeScript 程序组合调用，子代理、工作流、计划模式、目标等全部保留。
- **插件零依赖**：`dual-learning.mjs` 只监听生命周期事件并注入提示，不拦截、不否决任何工具调用，随预设目录一起分发。
- **机械重试断路器**：`repeat-tool-reminder` 阈值调为 [2, 4, 6]，比默认更早打断完全相同的重复调用。

## 回家导入（两种方式任选）

### 方式 A：图形界面

1. 打开 DeepSeek Harness Web 界面，点输入框上方的模式按钮（如 “PTC 模式”）。
2. 预设文件就位后（见方式 B 第 1 步），**PTC 双层学习** 会自动出现在菜单里，选中即可（新会话生效）。
3. 可选：在 设置 中把默认预设改为 `ptc-dual-learning`。

### 方式 B：终端一行命令（推荐）

```bash
git clone https://github.com/2003magic/ptc-dual-learning ~/.dsh/.agent-presets/ptc-dual-learning
```

`~/.dsh/.agent-presets/` 是用户预设目录（`$DSH_HOME` 存在时用 `$DSH_HOME/.agent-presets`）。
发现是实时的：目录就位后，界面的模式菜单直接出现新预设，无需重启进程；已有会话保持原预设，新会话才会用新的。

更新到新版本：进目录 `git pull`（运行中的会话继续用旧组合，新会话生效）。

## 目录结构

```text
ptc-dual-learning/
├── agent.cordis.yml              # 预设组合：code 全部行 + 学习循环行
├── preset.yml                    # 显示名与描述
├── dual-learning.mjs             # 零依赖双层学习插件（随预设分发）
└── skills/
    ├── dual-layer-learning/      # 双层学习完整协议
    └── learn-before-retry/       # “失败后先学再试”速查协议
```

两个技能通过 `skill-filesystem.customSkillDirs` 随预设挂载，模型会话里直接可见、可按需加载。

## 可调参数（agent.cordis.yml 中 `dual-learning` 行）

| 参数 | 默认 | 说明 |
|---|---|---|
| `threshold` | `3` | 连续同类失败多少次后注入“先学习”提醒（在阈值及其整数倍升级） |
| `storeDir` | `.dual-learning` | 知识库目录（events.jsonl / lessons.md），相对工作目录 |
| `include` | `[]` | 只统计的工具名通配模式；空 = 全部工具 |
| `exclude` | `[todo_write]` | 不计入连击的工具名通配模式（`*` 通配） |

指纹提取规则：状态/风险码（3-5 位数字）、异常类名（`*Error`/`*Exception` 等）、
`status=…`/`exit code=…` 标签 + 归一化后的消息前缀；用户插话会重置连击，成功会重置连击。

## 与上游项目的关系

本仓库是 [agent-dual-learning](https://github.com/2003magic/agent-dual-learning)（Python 库 + Cursor
hooks + skills）的 DSH 原生实现：不需要 shell-hook 桥或 MCP，直接订阅 DSH 的类型化生命周期事件
（`agent/session-start` / `tools/post-execute` / `agent/pre-step`）。Python CLI 仍可用于
Cursor/Claude 等其它环境，两边协议一致。

License: MIT
