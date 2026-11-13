---
name: csrw-multi-agent
description: 用于 dsh-csrw 插件的跨层改造任务：当改动同时涉及 lib 宿主与 client.js 界面、需要新增或删除 dsh_csrw_ 工具、需要修改工作台状态或备份/同步逻辑、或一次改动跨越三处以上文件白名单时使用。它编排 csrw-host、csrw-webui、csrw-test、csrw-security、csrw-docs 的先后顺序与验收门槛。
---

# dsh-csrw 多成员编排

## 使用前提

成员定义在 `.codebuddy/agents/`，派单规则在 `.codebuddy/rules/csrw-dispatch/RULE.mdc`。本 Skill 只负责"怎么排"，不重复成员职责。

## 步骤

1. **定位落点**：用 Grep 确认要改的文件，产出两栏清单——「预期改动文件」与「涉及成员」。先把这两栏给用户看，再开工。

2. **拆分并行面**：若同时命中 `lib/**` 与 `client.js`，先让 `csrw-host` 定契约——给出新增或修改的 `/dsh-csrw/api/*` 请求/响应 JSON 样例，写进派单说明。契约未定前，`csrw-webui` 只做与后端无关的静态部分，不得自己编字段。

3. **并行派发**：`csrw-host` 与 `csrw-webui` 同时派出，派单中必须写明"只改白名单内文件，越界停下回报"。两者互不读对方代码猜接口。

4. **工具面同步**：涉及工具增删改名时，要求 `csrw-host` 同步四处——`scripts/check.mjs` 的 `tools.length` 断言、`README.md` 工具表与计数、`bin/dsh-csrw.js` 命令表、必要的 `lib/desk/ops.js` 白名单。

5. **串行验证**：两片都声明完成后，派 `csrw-test` 跑 `npm run check` 与 `npm test`；界面改动由 `csrw-webui` 自行跑通 `npm run check:ui` 后交付。失败按归因回退，不得改断言基线。

5.1 **CI 复核**：本地绿只代表本地。推送后必须确认 GitHub Actions 的 `verify` 两个平台任务全绿；未推送就明确告知用户"尚未经 CI 验证"，不得表述为"已验证"。CI 红灯时先判平台差异还是真实缺陷，再决定改代码还是记录理由。

6. **边界复核**：改动涉及写入、删除、恢复、凭据、远端、鉴权时，派 `csrw-security`（只读，输入为 `git diff` 或改动文件清单）。出「阻塞」结论则回到第 3 步。

7. **文档收口**：最后派 `csrw-docs` 同步 `README.md`、`docs/**`、`.dsh-csrw.example.json`，并要求它顺带报告工具计数漂移。

8. **汇总呈现**：按「成员 → 变更文件 → 验证输出」三段输出，不要合并成一段散文。未覆盖项与跳过项必须单列。

## 失败处理

| 现象 | 处理 |
| --- | --- |
| 成员报"需要改白名单外文件" | 主 agent 重新判定派单，不允其自行扩大范围 |
| 两个成员改了同一文件 | 立即停止并行，改为串行并说明原因 |
| 测试失败但实现看起来正确 | 判为测试缺陷，交 `csrw-test` 修并说明改了哪条断言 |
| 安全评审驳回 | 阻塞级修复后才合并；修复本身也要过 `csrw-test` |

## 不要做的事

- 不为单文件小改开 team（走规则里的"不派单"分支）。
- 不让 `csrw-security` 改代码，不让 `csrw-docs` 改代码，不让 `csrw-test` 改实现。
- 不在成员之间转述"你去看另一个成员的代码"——接口一律用 JSON 契约传递。
