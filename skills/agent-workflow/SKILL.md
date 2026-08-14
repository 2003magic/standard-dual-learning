---
name: agent-workflow
description: >-
  AI 编程代理（我）自己的工作流程手册：澄清优先、增量交付、抄权威参考、
  确认修改被加载、最小验证、边做边固化、测完清理。开始任何多步任务前加载本
  技能；当用户抱怨"太慢/太麻烦"、或改动后行为没变化时，务必先按本手册复盘。
---

# Agent 工作流程手册

## 七条规则

1. **澄清比考古便宜**。用户指代不明（"当前 ptc"、"那个页面"、"这个项目"）时：
   先看用户正在看的界面（agent-browser snapshot -i），或直接 ask_user_question
   给选项。不要满磁盘 grep、不要猜。
2. **先交付最简本质，再谈增强**。任务拆成"最简版 + 可选增强"，最简版先做先交付
   （例：复制预设 + 丢 skill 是 2 分钟的事；插件是可选第二步）。不要一步到位大而全。
3. **抄一份权威参考，别读整个子系统**。找一个同类已实现（repeat-tool-reminder、
   hooks 桥、shipped preset），复制它的模式即可；不从 loader/mount/message 源码
   全家桶开始读。源码只读"模式"所在的那一段。
4. **先确认修改被加载，再下结论**。长驻进程有缓存/世代/热更语义（DSH 预设
   standing mount 冻结、HMR、watcher）。改动两三次没生效就停手：用决定性探针
   （apply 里 throw 一句 / 输出带版本号 / 写日志标记）证明加载路径，再继续。
5. **验证克制 + 清理**。最小冒烟（1-2 个用例），优先看日志
   （~/.dsh/sessions/.../session.jsonl.zstd，zstd -dc）而不是反复开界面会话；
   测完删测试会话、关浏览器，不在用户环境留垃圾。
6. **边做边固化**。发现环境事实/踩坑立刻写进 skill 或 lessons.md，不要等收尾；
   收尾时只想得起一半。
7. **用户抱怨节奏时**：停下任务，复盘整个流程，把教训固化成知识，而不是只修任务。

## 本机环境事实（每会话先看这一段）

- DSH Web GUI http://127.0.0.1:3080；看用户界面 → agent-browser open + snapshot -i。
- 用户预设根 ~/.dsh/.agent-presets/<id>/；技能根 ~/.agents/skills/（热加载，放进目录立即进目录）。
- dsh web 进程 cwd = 项目目录；预设世代冻结 → 改完预设需重启 dsh web 才对新会话生效。
- 会话日志 ~/.dsh/sessions/<workspace-mangled>/<sid>/session.jsonl.zstd，zstd -dc 查看。
- GUI 四种模式 = standard/code/minimal/cordis；默认预设：设置 → Agent 预设 → 设为默认。
- gh CLI 已认证 2003magic（repo 权限）；git 身份 2003magic / 1562127280@qq.com。
- agent-browser / Playwright 用完要 close。

## 标准流程

理解（问 / 看界面）→ 拆分（最简版先行，todo 列清楚）→ 查证（抄一个权威参考）→
实现（边做边记）→ 验证（最小冒烟 + 加载探针）→ 清理（测试产物）→
交付（可点击文件路径 + 遗留事项）。

## 本次会话的教训（为什么有这七条）

- "ptc" 指代不明时我做了 6 轮文件系统考古，答案就在用户眼前的 GUI 按钮上 → 规则 1。
- 用户心里的任务是"复制 + 丢 skill"，我端出了一整个带插件的仓库 → 规则 2。
- 插件两次"没生效"其实都是没被加载（standing mount 冻结），我靠 throw 探针才定位 → 规则 4。
- 验证开了 7 个冒烟会话，留在用户 GUI 里 → 规则 5。
- 知识 skill 是用户提醒后才补的 → 规则 6。
