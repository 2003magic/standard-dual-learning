---
name: dsh-preset-authoring
description: >-
  在 DeepSeek Harness（DSH）里创作、安装、验证自定义 Agent 预设（agent preset）
  的速查手册：复制 PTC/code 预设、改 persona、捆绑 skills、可选零依赖插件、
  用户目录安装、GUI 验证、踩坑清单。当用户要"新建自定义 agent / 复制 PTC 模式 /
  导入预设 / 给预设加 skill / 把某个仓库提炼成 skill"时使用本技能。
---

# DSH Agent 预设创作手册

## 最简路径（无插件，约 2 分钟）

1. 复制 apps/cli/config/agent-presets/code/ 整目录 → 改成 <preset-id>/
   （id 必须匹配 [a-z0-9][a-z0-9-]*）。
2. 改 agent.cordis.yml 的 persona 行（@deepseek-ai/dsh-persona 的 config.text，
   支持 {{model}} / {{cwd}} 占位符）。
3. 把提炼好的 SKILL.md 放进预设的 skills/，并给 skill-filesystem 行加配置：

    - id: skill-filesystem
      name: '@deepseek-ai/dsh-skill-filesystem'
      config:
        customSkillDirs:
          - !!js "process.getBuiltinModule('node:url').fileURLToPath(new URL('skills/', baseUrl))"

   （!!js 求值上下文里有 baseUrl＝预设目录 和 process。）
4. 写 preset.yml：name / description（可选 order；用户预设不写 order 会排在
   内置之后按 id 排序）。
5. 安装：git clone <repo> ~/.dsh/.agent-presets/<preset-id>（或直接放目录）。
   用户预设根 = $DSH_HOME/.agent-presets（默认 ~/.dsh/.agent-presets）。
   发现是实时的，无需重启进程。
6. GUI：模式菜单自动出现 → 设置 → Agent 预设 → 设为默认 → 新建会话验证。

## 组合文件要点

- agent.cordis.yml 顶层必须是「插件行列表」（- id / name / config），
  元数据只能放旁边的 preset.yml。
- 行解析：name: './plugin.mjs' 相对「预设目录」解析（插件/技能随包分发）；
  bare 包名（@deepseek-ai/dsh-*）从 host 组合解析；绝对路径转 file: URL。
- 预设行注册服务必须包在 isolate realm 的 group 里，否则 mount 被拒；
  只挂监听器、不提供服务的行不需要 realm。
- 内置行参考：persona、agent-instructions（maxBytes）、tool-bash、tool-fs、
  tool-jobs、skill-filesystem、tool-skill、tool-goal、planning group（plan-mode）、
  compaction group、delegation group（subagent/workflow/ralph）、tool-ask-user、
  tool-todo、tool-web、tool-presentation（mode: code 即 PTC/Code Mode SDK，run_code）。

## 零依赖插件速查（可选增强）

- 模块导出 export const name + export function apply(ctx, config)；
  只用 Node 内置模块（node:fs 等），随预设目录走，不需要 npm 解析。
- 事件面：
  - agent/session-start({ agent, source }) 纯通知 → agent.inject(message) 注入
    上下文（不 gate 启动）。
  - tools/post-execute(exec, result, next) 瀑布 → 返回
    { kind: 'block' | 'continue', additionalContexts: UserMessage[] }，
    先计数、再 await next()、最后把自己的提醒 fold 到下游决策上
    （参考 packages/guard/repeat-tool-reminder）。
  - agent/pre-step({ agent, messages }, next) 里
    messages.some(m => m.source.kind === 'user') 可重置连击，永远 delegate。
- agent.inject 必须传完整 UserMessage 对象，字符串会被 inbox 原样 splice
  但成不了合法消息：
    { role: 'user', id: randomUUID(),
      content: [{ type: 'text', text: '...' }],
      source: { kind: 'plugin', plugin: 'x', form: 'instructions' } }
- form 合法值：instructions | catalog | snapshot | notice | relay | recall
  （不存在 context；notice 必须带 summary）。省略 form 也合法。
- 失败检测：result.isError === true + result.content[].text 提取文本；
  指纹 = 状态/风险码（3-5 位数字）+ 异常类名 + status=…/exit code=… 标签
  + 归一化前缀（去掉 uuid/时间戳/路径/hex/纯数字）。
- repeat-tool-reminder 是现成的「相同调用循环断路器」，阈值例 [2,4,6]。

## 踩坑清单（实测结论）

1. GUI 会话切换 preset 走 recompose，session-start 已经错过：新会话先按默认
   preset 创建，再点模式菜单切换 → agent/session-start 早已触发，插件第一层
   注入不生效。要测第一层必须先把预设「设为默认」再新建会话。
2. 运行中的 dsh web 进程冻结 preset 世代：standing mount 按组合文件 stamp
   复用，实测改 preset 文件后新会话仍跑旧版本（插件、组合都读不到新的）。
   改完预设要「重启 dsh web」才生效；全新启动的进程没有这个问题。
3. 发布：仓库根 = 预设目录，git clone 到用户预设根即导入，git pull 即更新。
4. 验证三步：新会话系统提示词含你的 persona → 技能目录含捆绑 skill →
   会话日志 ~/.dsh/sessions/<workspace-mangled>/<session-id>/session.jsonl.zstd
   里 zstd -dc … | grep -c '注入文本'，或 grep agent/inbox/spliced 看 inserted
   是否为对象（字符串说明跑了旧版插件）。
5. 技能目录优先级（低→高）：project .dsh/skills < project .agents/skills
   < custom（预设 customSkillDirs）< user ~/.dsh/skills < user ~/.agents/skills。
   想让 skill 在所有会话可用 → 放 ~/.agents/skills/<name>/（watcher 热加载）。

## 两层分工

- skills 层（最简、通用）：只做「提示词协议」，模型选择加载，任何 harness 都能用。
- 插件层（可选、增强）：把协议变成强制的——启动必注入、连击必提醒、知识库自动落盘。
  只注入不拦截，失败永远 fail-open。
