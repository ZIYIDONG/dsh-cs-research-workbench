# CS科研工作台 (dsh-cs-research-workbench)

**dsh 计算机科学科研工作台**（`dsh-cs-research-workbench`，简称 `csrw`）是**面向计算机科学的全流程科研工作台**。这里的 **CS 指 Computer Science（计算机科学）**，不绑定单一细分方向。工作台有六个入口：**待办、文献、项目、想法、知识库、同步与备份**，对应选题构思、文献与笔记整理、代码与实验版本管理、结果归档、资料备份这五段科研工作流。

这里的"全流程"指上述五段科研工作流，不包含实验设备控制、投稿系统对接等外部环节；插件负责的是本机文件、版本与备份，不代替领域专用的实验工具。

> An end-to-end research workbench for Computer Science: todos, papers, projects, ideas, knowledge base, sync and backup.

v0.1 提供本地 Obsidian 文件操作、Git、Zotero 本机只读 API、坚果云 WebDAV 与可校验的本地备份。插件 ID 和 CLI 为 `csrw`，工具统一使用 `csrw_` 前缀，工作区配置目录为 `.csrw`。

## 环境与安装

- Node.js ≥22.16；DSH `>=0.2.2-rc.1 <0.3.0`。本次复验环境：Node 24.21.0（DSH 内置运行时）、DSH 0.2.2-rc.1、Windows、Git 2.56.1。DSH 桌面版当前内置 Node 24，完整功能（含 Zotero SQLite 在线备份）按该运行时验证。
- Git 模块需要系统 `git`；`git` 不在 PATH 时，测试和工具都会明确失败，请先把 Git 加入 PATH。
- Obsidian 操作直接读写 vault，无需 Obsidian REST 插件。
- Zotero 需要运行中的本机 API，默认 `http://127.0.0.1:23119/api`。API 不可用时明确报错，不转向云端。

在源码目录安装依赖并检查：

```powershell
npm install --ignore-scripts
npm run check
npm test
node bin/csrw.js health
```

`devDependencies` 中的 `@deepseek-ai/*` 包只是本地跑测试所需的 peer 依赖；插件运行在 DSH 中时由 DSH 提供这些包，安装插件本身不会安装它们。没有 npm 时可用 DSH 内置的 pnpm：`node <dsh-runtime>/pnpm/bin/pnpm.mjs install --ignore-scripts`。

在 DSH 中通过插件管理安装本目录或发布包。让代理调用 `plugin_manager` 的 `install_bundle`，`target` 为包目录的绝对路径；不要手工改写 profile。包的 `patches/bundle.yaml` 仅插入自己的插件行。安装结果中的 `application` 与 `warnings` 决定是否已生效；若版本替换需要重启，重启后用 `csrw_health` 验证。插件的中文/英文显示资源和原始 SVG 图标包含在包中。

本地直接运行 `node bin/csrw.js`。安装为命令行包后也可运行 `csrw`。命令与工具一一对应，如 `csrw obsidian read` 对应 `csrw_obsidian_read`；`--help` 列出完整命令。

## 命名规范

| 标识 | 取值 | 作用域 | 说明 |
| --- | --- | --- | --- |
| npm 包名 | `dsh-cs-research-workbench` | npm / DSH 模块 | 改名必须重新安装 |
| 插件短名 | `csrw` | Host 插件 `name`、Locale 命名空间、CLI | 稳定，工具前缀与之对齐 |
| UI 面板 ID | `dsh-csrw-ui` | 主面板、侧栏入口、设置分区、设置图标 | 四处必须同值 |
| HTTP 路由 | `/dsh-csrw/api` | Host Web 服务 | 前端用相对基址 `dsh-csrw/api/` |
| 工作台状态目录 | `$DSH_HOME/dsh-csrw/` | 本机持久化 | 自动从 `csrw-desk/` 复制，旧目录保留 |
| 工作区配置 | `<workspace>/.csrw/` | 项目内配置、同步状态、备份 | 刻意保留短名 |
| 工具前缀 | `csrw_`（29 个） | 模型工具 | 刻意保留短名 |
| 人工命令 | `/csrw-ui` | DSH 命令面板 | 不是模型工具 |

全局资源统一挂在 `dsh-csrw` 命名空间下；项目内配置目录与工具前缀保留短名 `csrw`，避免改动用户已有仓库和模型调用习惯。两处全局标识由 `scripts/check-identifiers.mjs` 校验一致性，`npm run check` 会执行它。

## 图形界面

安装插件并刷新 DSH 页面后，侧边栏新增 **CS科研工作台** 入口，主面板是仿 dsh-media-desk 的科研首页；设置里保留同一名字的 **CS科研工作台** 分区，插件管理页也提供配置卡。主面板与设置页复用同一个原生 React 客户端半片（`client.js`，手写 IIFE，无构建步骤），不创建其他网页服务。

主面板（`/dsh-csrw/api/*` 路由，数据在 `$DSH_HOME/dsh-csrw/state.json`；旧目录 `csrw-desk/` 会在首次读取时自动复制，且旧文件保留）：

1. 首屏两行数字：还有 N 件事等你推进、M 篇文献排在本周；下面是一句话记录框。
2. 一句话按内容分流：DOI/arXiv → 文献，`问题:`/`假设:`/`方法:`/`局限:` 或链接 → 想法，带日期/`@项目`/`#P0`/`~30min` → 任务，其余 → 任务。
3. 散落画布可拖动卡片（位置持久化、不进撤销栈）、滚轮平移、`Ctrl/⌘ + 滚轮` 缩放；底部在散落/列表/日历三种视图间切换，分类筛选只在散落视图出现；`＋` 打开快速记录。
4. 列表视图是三列五卡：Todo: All｜Todo: Projects、Todo: Paper｜Todo: Idea 整理、Todo: 知识库整理。
5. 任务页已可用；项目、文献、想法、知识库四页先给占位与条数，后续版本补齐。右侧助手 Dock 用本地规则建任务/查今天，不调用模型。
6. 原生撤销 30 步、中英文案、窄屏适配（`<1020px` 两列、`<780px` 单列，窄屏默认收起助手）。
7. 布局约定：所有全宽内容必须放进 `.rd-content`。助手 Dock 展开时内容区自动让出 `--dock-w`（336px），顶栏、底部 Dockbar、Toast 同步避让；不要用 `position: fixed` 或 `100vw` 自行铺满，否则会被右侧助手遮住。

设置页里的工具面板：

1. 选择工作区目录，并从列表选择一个已有会话作为命令的权限和审计上下文；不会启动模型对话。
2. 点击“加载配置”读取工作区默认值/配置。按字段保存，字符串与布尔类型按白名单校验。密码不在界面中录入或保存。
3. 工作台可检查 Git、Zotero 与 WebDAV，列远端目录、手动上传/下载、创建三类备份并校验快照。同步和备份先展示工作区与参数，确认后才执行。恢复保留在显式确认的工具中，不提供一键恢复。
4. 切换工作区会清除旧配置和结果；运行时支持取消，成功与失败独立展示。

界面通过 Host 人工命令 `/csrw-ui` 调用现有工具定义，使用 DSH 现有远程授权，不绕开权限策略；命令不记录原始输入。它不是模型工具，也不增加 `csrw_` 工具数量。GUI 入口不隐式执行同步、备份、初始化或推送。工作台数据是本地状态，与 29 个无状态工具互不影响；需要同步到 Git 或坚果云时，仍显式调用 `csrw_git_*` / `csrw_nutstore_*`。

开发期 `client.js` 保存后由 DSH 客户端 HMR 自动重载；改 `lib/` 宿主代码需要重载插件或重启 DSH。三份设计文档在 `docs/`：`dsh-research-desk-design.md`（总体）、`dsh-research-desk-pages.md`（五页）、`dsh-research-desk-home.md`（首页）。

## 配置

首次读取返回默认值，不自动写配置。配置位于工作区 `.csrw/config.json`；`.csrw.example.json` 是可复制的完整示例。`csrw_config_set` 每次设置一个白名单字段，拒绝未知字段、类型不匹配和密码/令牌字段；`csrw_config_show` 返回脱敏结果。

```powershell
node bin/csrw.js config set --args '{"key":"obsidian.vaultPath","value":"vault"}'
node bin/csrw.js config show
```

Windows PowerShell 对内联 JSON 的引号处理因版本而异。也可把参数保存为 JSON 文件并使用 `--args-file params.json`。`--workspace` 指定工作区，省略时使用当前会话目录；CLI 则使用当前工作目录。

| 配置 | 默认值 / 行为 |
| --- | --- |
| `git.remote`, `git.branch` | `origin`, `main`；远端 URL 由 Git 自身配置 |
| `git.autoInit`, `git.pullRebase` | `false`, `false` |
| `obsidian.vaultPath`, `obsidian.autoDetect` | 空路径、`true`；自动查找工作区及直接子目录的 `.obsidian`，多个候选时报错 |
| `obsidian.trashDir` | `.trash`，相对 vault 的回收目录 |
| `zotero.localApi`, `zotero.dataDir` | 本机 API 默认地址、空路径；数据库备份需明确定位数据目录 |
| `nutstore.baseUrl`, `nutstore.remoteRoot` | `https://dav.jianguoyun.com/dav/`, `csrw` |
| `nutstore.username`, `nutstore.credentialKey` | 空用户名、`csrw/nutstore`；此 key 是引用名，不是密码 |
| `backup.target`, `backup.localDir` | `local`, `.csrw/backups`；远端归档请显式上传快照目录 |
| `backup.includeDshSessions` | `false`；默认排除 sessions/storages |
| `backup.dshHome`, `backup.dshProfile` | 空路径，自动发现无法唯一确定时要求显式配置 |

## 凭据

坚果云使用独立的应用密码，不写入项目配置、工具参数或日志。每次操作重新读取：

1. DSH `credentials.readRecord(credentialKey)` 的 `api-key` 记录：`key` 存应用密码，`env.NUTSTORE_USERNAME` 存用户名；或从非敏感配置读取用户名。
2. 未配置记录时读取 `NUTSTORE_USERNAME` / `NUTSTORE_PASSWORD` 环境变量。环境变量只影响继承它的进程，已运行的 DSH 需要由正确环境启动。

Zotero 本机 API 不需要 API Key。WebDAV 强制 HTTPS（本机测试允许 HTTP），禁止 URL 中嵌入用户名、密码、查询串和片段，拒绝重定向。

## 工具与使用边界

| 组 | 工具 |
| --- | --- |
| 检查与配置 | `csrw_health`, `csrw_config_show`, `csrw_config_set` |
| Obsidian | `csrw_obsidian_search`, `read`, `write`, `append`, `move`, `trash`（每个短名均使用 `csrw_obsidian_` 前缀） |
| Git | `csrw_git_status`, `init`, `commit`, `push`, `pull`（每个短名均使用 `csrw_git_` 前缀） |
| Zotero | `csrw_zotero_search`, `item`, `notes`, `attachments`, `cite`（每个短名均使用 `csrw_zotero_` 前缀） |
| 坚果云 | `csrw_nutstore_test`, `list`, `push`, `pull`（每个短名均使用 `csrw_nutstore_` 前缀） |
| 备份与快照 | `csrw_backup_obsidian`, `csrw_backup_zotero`, `csrw_backup_dsh`, `csrw_snapshot_create`, `csrw_snapshot_verify`, `csrw_snapshot_restore` |

工具的模型可见参数说明和 CLI `--help` 是具体调用接口。所有操作返回单一 JSON；基础设施错误抛出，不把失败包装为成功。工具尊重取消信号。

### Obsidian

路径相对 vault；拒绝 `..`、盘符越界、符号链接和目录联接。`write` 默认拒绝覆盖，只有 `overwrite:true` 才替换已有文件；`append` 要求已有笔记，文本原样追加。`move` 不覆盖目标，也**不重写 `[[双链]]`**。`trash` 仅将文件移动到 vault 的回收目录，返回可恢复路径，不永久删除。搜索忽略内部目录及回收内容。

```json
{"path":"notes/example.md","text":"# Example\nResearch notes\n"}
```

将上述内容保存为参数文件后运行 `csrw obsidian write --args-file params.json`。读取使用 `{"path":"notes/example.md"}`。

### Git

通过参数数组运行 Git，不拼接 shell。初始化幂等，补充本地忽略规则；`git.autoInit=true` 仅让显式提交在校验全部路径后初始化仓库，状态查询始终只读；提交不隐式推送。推送/拉取需要已配置远端；默认拒绝对脏工作树拉取，可显式配置 rebase 策略。凭据由 SSH agent / Git credential helper 管理，本插件不保存 Git 密码。实际 push 会修改远端仓库，应在用户授权范围内调用。

### Zotero

仅 GET 本机 API。搜索、条目、笔记、附件元数据和引用工具不会写入 Zotero，不下载附件，也不使用云端 fallback。返回的引用依据 API 的实际元数据，不能代替逐条文献核验。

### 坚果云

`push` / `pull` 采用 `localPath`（本地目录）和可选 `remotePath`（相对配置 `remoteRoot` 的目录）。按 SHA-256 记录基线；相同文件跳过。覆盖远端需要 ETag 条件请求，首次写入使用 `If-None-Match: *`，上传后读取校验。

发现不一致且无法安全判断时，保留本地 `.local` 与远端 `.remote` 副本，并在 JSON 的 `conflicts` 中报告，不静默替换原文件。已有冲突副本会加唯一后缀。**不传播删除，不做后台或定时同步。** 本地状态保存在 `.csrw/sync/`。单文件/响应上限 32 MiB，目录列表上限 10000 项；大附件不适用此版本。目录同步忽略 `.git`、`.csrw`、`node_modules` 和常见凭据文件。

### 备份、校验与恢复

备份默认保存在本地，manifest 记录版本、时间、大小与每文件 SHA-256。Zotero SQLite 通过只读源连接和 SQLite 在线备份产生一致副本，避免直接复制运行中的数据库。该在线备份使用 Node 内置 `node:sqlite` 的 `backup()`；当前 Node 不提供该 API 时会明确报错，不会退化为直接复制运行中的数据库（本次验证运行时 Node 24.21.0 可用）。DSH 备份覆盖实际发现/显式配置的 prompts、plugins、skills 与配置，默认不含 sessions/storages；排除已知敏感路径及检测到敏感内容的文件（整文件跳过，不是字段脱敏）。包含 profile 的 `cordis.patch.yml`、package manifests 与 pnpm 锁文件；排除 `node_modules` 和 `.git`，依赖需要按清单重建。敏感识别为保守启发式，不能保证未知格式密钥 100% 召回，应检查排除报告后再上传。

恢复必须显式 `confirm:true`，先完成 manifest 与全部文件校验，再自动生成恢复前快照。只恢复清单内的文件，不删除目标中额外内容；不会对用户资料执行未获授权的真实恢复。多文件恢复不是文件系统事务，运行期 I/O、取消或并发变更可能造成部分完成，恢复前快照是回滚依据。SHA-256 用于完整性而非来源认证；不提供敌对并发下的完全 TOCTOU 防护。恢复 SQLite 前关闭 Zotero；活动 WAL/SHM 存在时拒绝恢复。大文件会读入内存。请先在独立目录验证备份内容和凭据排除报告。

## 验证与范围

自动测试使用工作区 `.test-artifacts/` 或系统临时目录下的隔离 fixture 和本机模拟服务；不推送真实外部仓库，不恢复用户真实 vault、Zotero 或 DSH profile。执行 `npm test` 查看当前结果。真实 Zotero 搜索/读取验收要求本机服务可用；真实坚果云往返要求用户自己的应用密码及测试目录。这些不能由 mock 通过替代。

本版本提供设置页和侧边栏工作台，不包含 MCP 服务、向量检索、聚类、Zotero 写入、自动定时同步、永久删除或 vault 双链重写。

## 源码

`lib/index.js` 注册工具和工作台路由；`lib/tools/` 实现各模块；`lib/desk/` 是工作台宿主半片（`host.js` 路由、`store.js` 持久化与撤销、`ops.js` 操作白名单、`seed.js` 示例数据）；`lib/services/config.js` 管理配置，`lib/services/snapshot.js` 管理备份；`lib/utils/` 提供路径边界及哈希工具。`bin/csrw.js` 是 CLI；`client.js` 是浏览器半片；`patches/bundle.yaml` 是 DSH bundle 补丁；`docs/` 是工作台设计文档。GPL-3.0-only License（保留远端 GNU GPL v3 授权）。

### 本次验收记录（2026-11-11）

- `node scripts/check.mjs` 复验通过：语法检查、包元数据、29 个 `csrw_` 工具与六个模块全部 `ready`。
- `node --test --test-isolation=none --test-concurrency=1 test/*.test.js` 复验：37 个用例全部通过（0 skip），其中 5 个是并入工作台后的 `lib/desk/` 用例（示例数据、操作白名单、状态/位置更新、持久化与三方撤销、无 Web 服务时 `registerDesk` 不生效）。其中“真实 Git 临时仓库集成”用例需要进程能用管道捕获子进程输出：在限制该能力的沙箱中会按设计跳过（不绕过沙箱），在普通终端（Git 2.56.1 已加入 PATH）中通过。
- 已通过 `plugin_manager install_bundle` 安装进 `desktop` profile（`application: applied`，无 warnings），会话内 29 个 `csrw_` 工具已注册；`csrw_health` 返回六模块 `ready`。`scripts/verify-ui.mjs` 与 `scripts/verify-ui-interaction.mjs` 全部通过；工作台主面板与侧栏入口已注册为 `dsh-csrw-ui`，`GET /dsh-csrw/api/state` 未登录返回 401。
- 原独立验证包 `dsh-research-desk` 的工作台代码已并入本仓库（`lib/desk/` + `client.js`），验证通过后从 profile 停用；其设计文档已移入 `docs/`。
- 实机端子验收（临时 vault，非用户真实数据）：write/append/move/trash 正常；`../` 越界与默认覆盖均被拒绝；`snapshot_create` 生成 manifest，`snapshot_verify` 检出被篡改文件，`snapshot_restore` 未传 `confirm: true` 时拒绝。
- Obsidian 生命周期、WebDAV mock 往返/冲突、Zotero mock GET、SQLite WAL 一致副本与快照恢复均有测试证据；不等于真实外部服务验收。
- 当前机器未运行 Zotero，真实本机 API 搜索/条目读取未验收（Zotero 关闭时工具返回明确连接错误）；未提供坚果云应用凭据，真实远端往返未验收（工具返回明确凭据错误）。
