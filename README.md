# CS科研工作台 (dsh-cs-research-workbench)

**CS科研工作台**（`dsh-cs-research-workbench`，简称 `dsh-csrw`）是**面向计算机科学的全流程科研工作台**：把选题构思、文献与笔记、代码与实验版本、结果归档、资料备份串成一条能在本机跑起来的链路。

工作台有六个入口：**待办、文献、项目、想法、知识库、同步与备份**。前五个是工作台页面，最后一个落在设置页与工具里——同步与备份处理的是文件和远端，不产生科研条目，所以不给它单独一页。

"全流程"指上述五段科研工作流，不含实验设备控制、投稿系统对接等外部环节；插件负责本机文件、版本与备份，不代替领域专用的实验工具。

> An end-to-end research workbench for Computer Science: todos, papers, projects, ideas, knowledge base, sync and backup.

v0.1 分两层交付：**工作台界面**（本地状态、快速记录、助手、撤销）与其下的**执行层**（Obsidian 文件操作、Git、Zotero 本机只读 API、坚果云 WebDAV、可校验备份）。插件 ID 与 CLI 为 `dsh-csrw`，工具统一使用 `dsh_csrw_` 前缀（46 个），工作区配置目录为 `.dsh-csrw`，工作台状态存在 `$DSH_HOME/dsh-csrw/state.json`。

## 六个入口

| 入口 | 存什么 | 当前状态 |
| --- | --- | --- |
| 待办 `todo` | 任务标题、状态、优先级、截止时间、所属项目 | 已可用：散落画布、列表、日历三种视图，可拖动、可撤销 |
| 项目 `project` | 项目本身的推进节奏 | 页面占位，只显示记录条数 |
| 文献 `paper` | 题录、DOI/arXiv、阅读状态 | 页面占位，只显示记录条数 |
| 想法 `idea` | 想法、假设、问题、方法 | 页面占位，只显示记录条数 |
| 知识库 `kb` | 概念、坑、公式、工具、片段、模板 | 页面占位，只显示记录条数 |
| 同步与备份 | 快照、远端副本 | 无页面，在设置页与 `dsh_csrw_nutstore_*` / `dsh_csrw_backup_*` 中 |

占位页不是空壳数据：快速记录和助手对话都能写进这五类条目，只是这四个页面目前只统计条数，还没有列表与编辑界面。增加或修改条目走快速记录，查条目走助手。

工作台数据与 46 个工具是两套独立状态：工具不读写 `$DSH_HOME/dsh-csrw/state.json`。要让条目落成文件、版本或远端副本时，显式调用对应工具：

| 想要的结果 | 用哪个 |
| --- | --- |
| 文献题录与引用 | `dsh_csrw_zotero_search` / `item` / `cite` |
| 笔记与知识库落到 vault | `dsh_csrw_obsidian_write` / `append` |
| 代码与实验版本 | `dsh_csrw_git_status` / `commit` / `push` / `pull` |
| 目录同步到坚果云 | `dsh_csrw_nutstore_push` / `pull` |
| 可校验的本地快照 | `dsh_csrw_snapshot_create` / `verify` / `restore` |

## 环境与安装

- Node.js ≥22.16；DSH `>=0.2.2-rc.1 <0.3.0`。本次复验环境：Node 26.13.0、DSH 0.2.2-rc.1、Windows、Git 2.46.0.windows.1。Zotero SQLite 在线备份依赖 Node 内置 `node:sqlite` 的 `backup()`，不提供该 API 的运行时会让备份明确报错，不会退化为直接复制运行中的数据库。
- Git 模块需要系统 `git`；`git` 不在 PATH 时，测试和工具都会明确失败，请先把 Git 加入 PATH。
- Obsidian 操作直接读写 vault，无需 Obsidian REST 插件。
- Zotero 需要运行中的本机 API，默认 `http://127.0.0.1:23119/api`。API 不可用时明确报错，不转向云端。

在源码目录安装依赖并检查：

```powershell
npm install --ignore-scripts
npm run check
npm run check:ui
npm test
node bin/dsh-csrw.js health
```

`devDependencies` 中的 `@deepseek-ai/*` 包只是本地跑测试所需的 peer 依赖；插件运行在 DSH 中时由 DSH 提供这些包，安装插件本身不会安装它们。没有 npm 时可用 DSH 内置的 pnpm：`node <dsh-runtime>/pnpm/bin/pnpm.mjs install --ignore-scripts`。

在 DSH 中通过插件管理安装本目录或发布包。让代理调用 `plugin_manager` 的 `install_bundle`，`target` 为包目录的绝对路径；不要手工改写 profile。包的 `patches/bundle.yaml` 仅插入自己的插件行。安装结果中的 `application` 与 `warnings` 决定是否已生效；若版本替换需要重启，重启后用 `dsh_csrw_health` 验证。插件的中文/英文显示资源和原始 SVG 图标包含在包中。

本地直接运行 `node bin/dsh-csrw.js`。安装为命令行包后也可运行 `dsh-csrw`。命令与工具一一对应，如 `dsh-csrw obsidian read` 对应 `dsh_csrw_obsidian_read`；`--help` 列出完整命令。

## 命名规范

| 标识 | 取值 | 作用域 | 说明 |
| --- | --- | --- | --- |
| npm 包名 | `dsh-cs-research-workbench` | npm / DSH 模块 | 改名必须重新安装 |
| 插件名 | `dsh-csrw` | Host 插件 `name`、Locale 命名空间、CLI | 稳定，工具前缀与之对齐 |
| UI 面板 ID | `dsh-csrw-ui` | 主面板、侧栏入口、设置分区、设置图标 | 四处必须同值 |
| HTTP 路由 | `/dsh-csrw/api` | Host Web 服务 | 前端用相对基址 `dsh-csrw/api/` |
| 工作台状态目录 | `$DSH_HOME/dsh-csrw/` | 本机持久化 | 自动从 `csrw-desk/` 复制，旧目录保留 |
| 工作区配置 | `<workspace>/.dsh-csrw/` | 项目内配置、同步状态、备份 | 首次读取旧 `.csrw/` 配置时自动复制 |
| 工具前缀 | `dsh_csrw_`（46 个） | 模型工具 | 工具名不允许连字符，用下划线分隔 |
| 人工命令 | `/dsh-csrw` | DSH 命令面板 | 与 CLI 同名，不是模型工具 |

所有对外标识统一使用 `dsh-csrw`：插件名、CLI、命令、配置目录、远端根目录、凭据键与工具前缀都是同一根命名，工具前缀因命名规则限制把 `-` 写成 `_`。这样做是为了明确"这是一个 DSH 插件"，而不是独立于 DSH 的 `csrw` 软件。全局标识由 `scripts/check-identifiers.mjs` 校验一致性，`npm run check` 会执行它。

## 图形界面

安装插件并刷新 DSH 页面后，侧边栏新增 **CS科研工作台** 入口，主面板是科研首页；设置里保留同一名字的 **CS科研工作台** 分区，插件管理页也提供配置卡。主面板与设置页复用同一个原生 React 客户端半片（`client.js`，手写 IIFE，无构建步骤），不创建其他网页服务。

主面板（`/dsh-csrw/api/*` 路由，数据在 `$DSH_HOME/dsh-csrw/state.json`；旧目录 `csrw-desk/` 会在首次读取时自动复制，且旧文件保留）：

1. 顶栏是五个入口——待办、项目、文献、想法、知识库，右侧是助手模型按钮和助手开关（点击收起/唤起右侧助手 Dock，状态持久化到偏好）。
2. 首屏两行数字：还有 N 件事等你推进、M 篇文献排在本周；下面是一句话记录框。
3. 一句话按内容分流：DOI/arXiv → 文献，`问题:`/`假设:`/`方法:`/`局限:` 或链接 → 想法，带日期/`@项目`/`#P0`/`~30min` → 任务，其余 → 任务。
4. 散落画布可拖动卡片（位置持久化、不进撤销栈）、滚轮平移、`Ctrl/⌘ + 滚轮` 缩放；底部在散落/列表/日历三种视图间切换；`＋` 打开快速记录。
5. 列表视图是三列五卡：Todo: All｜Todo: Projects、Todo: Paper｜Todo: Idea 整理、Todo: 知识库整理；日历视图按截止日期排布。
6. 快速记录按类型分栏：任务（优先级、截止、项目、状态）、文献（DOI、URL、阅读状态）、想法（类型：想法/假设/问题/方法）、知识库（概念/坑/公式/工具/片段/模板），填完直接写进本地状态。
7. 右侧助手 Dock：不选模型时用本地规则（建任务、查今天、统计待办），不联网；在顶栏选定模型后，助手只依据当前工作台数据作答，要求 120 字内、不编造条目，模型调用失败会回退本地规则并在返回里标明 `engine`。
8. 工作台偏好（界面语言、助手栏默认展开、清除示例数据、撤销提示）不再占用顶栏入口，统一收进 DSH 设置页的「CS科研工作台」分区（见下）。
9. 原生撤销 30 步（`Ctrl/⌘+Z`）、中英文案、窄屏适配（`<1020px` 两列、`<780px` 单列，窄屏默认收起助手）。
10. 布局约定：所有全宽内容必须放进 `.rd-content`。助手 Dock 展开时内容区自动让出 `--dock-w`（336px），顶栏、底部 Dockbar、Toast 同步避让；不要用 `position: fixed` 或 `100vw` 自行铺满，否则会被右侧助手遮住。

设置页里的工具面板（含工作台偏好）：

1. 顶部「偏好」卡片：界面语言（中文/English）、助手栏默认展开、清除示例数据；直接读写工作台状态，改语言后主面板即时生效。
2. 选择工作区目录，并从列表选择一个已有会话作为命令的权限和审计上下文；不会启动模型对话。
3. 点击"加载配置"读取工作区默认值/配置。按字段保存，字符串与布尔类型按白名单校验。密码不在界面中录入或保存。
4. 工作台可检查 Git、Zotero 与 WebDAV，列远端目录、手动上传/下载、创建三类备份并校验快照。同步和备份先展示工作区与参数，确认后才执行。恢复保留在显式确认的工具中，不提供一键恢复。
5. 「Obsidian 工具」卡片：双链/反链/死链/列目录/图谱/书签/Canvas（只读）与模板/日记/附件/重命名（写入确认）；「云端备份」卡片：备份参数/上传坚果云/备份 GitHub/一键备份；「文献笔记」卡片：按 Zotero key 生成文献笔记。
6. 切换工作区会清除旧配置和结果；运行时支持取消，成功与失败独立展示。

界面通过 Host 人工命令 `/dsh-csrw` 调用现有工具定义，使用 DSH 现有远程授权，不绕开权限策略；命令不记录原始输入。它不是模型工具，也不增加 `dsh_csrw_` 工具数量。

命令接受两种写法，边界完全相同（同样受 READ/WRITE 操作白名单约束、同样要 `--confirm`、同样不暴露恢复）：

```text
/dsh-csrw help
/dsh-csrw config show --workspace C:\repo
/dsh-csrw nutstore list --workspace C:\repo --remote-path notes
/dsh-csrw config set --workspace C:\repo --key obsidian.vaultPath --value vault --confirm
/dsh-csrw backup obsidian --workspace C:\repo --confirm
```

界面走整行 JSON（`{"operation":"…","args":{…},"confirmed":true}`），手敲可用上面的 `<模块> <操作> --参数` 形式；两种输入落到同一个执行函数。GUI 入口不隐式执行同步、备份、初始化或推送。工作台数据是本地状态，与 46 个无状态工具互不影响；需要同步到 Git 或坚果云时，仍显式调用 `dsh_csrw_git_*` / `dsh_csrw_nutstore_*`。

开发期 `client.js` 保存后由 DSH 客户端 HMR 自动重载；改 `lib/` 宿主代码需要重载插件或重启 DSH。三份设计文档在 `docs/`：`dsh-research-desk-design.md`（总体）、`dsh-research-desk-pages.md`（五页）、`dsh-research-desk-home.md`（首页）。

## 配置

首次读取返回默认值，不自动写配置。配置位于工作区 `.dsh-csrw/config.json`；`.dsh-csrw.example.json` 是可复制的完整示例。`dsh_csrw_config_set` 每次设置一个白名单字段，拒绝未知字段、类型不匹配和密码/令牌字段；`dsh_csrw_config_show` 返回脱敏结果。

```powershell
node bin/dsh-csrw.js config set --args '{"key":"obsidian.vaultPath","value":"vault"}'
node bin/dsh-csrw.js config show
```

Windows PowerShell 对内联 JSON 的引号处理因版本而异。也可把参数保存为 JSON 文件并使用 `--args-file params.json`。`--workspace` 指定工作区，省略时使用当前会话目录；CLI 则使用当前工作目录。

| 配置 | 默认值 / 行为 |
| --- | --- |
| `git.remote`, `git.branch` | `origin`, `main`；远端 URL 由 Git 自身配置 |
| `git.autoInit`, `git.pullRebase` | `false`, `false` |
| `git.backupRemote`, `git.backupBranch`, `git.backupRepoDir` | 空、`backup`、`.dsh-csrw/backup-repo`；GitHub 元数据备份的远程 URL/分支/本地仓库目录 |
| `obsidian.vaultPath`, `obsidian.autoDetect` | 空路径、`true`；自动查找工作区及直接子目录的 `.obsidian`，多个候选时报错 |
| `obsidian.trashDir` | `.trash`，相对 vault 的回收目录 |
| `zotero.localApi`, `zotero.dataDir` | 本机 API 默认地址、空路径；数据库备份需明确定位数据目录 |
| `nutstore.baseUrl`, `nutstore.remoteRoot` | `https://dav.jianguoyun.com/dav/`, `dsh-csrw` |
| `nutstore.username`, `nutstore.credentialKey` | 空用户名、`dsh-csrw/nutstore`；此 key 是引用名，不是密码 |
| `backup.target`, `backup.localDir` | `local`, `.dsh-csrw/backups`；`target=nutstore` 时 `backup_all` 额外上传坚果云 |
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
| 检查与配置 | `dsh_csrw_health`, `dsh_csrw_config_show`, `dsh_csrw_config_set` |
| Obsidian | `dsh_csrw_obsidian_search`, `read`, `write`, `append`, `move`, `trash`, `attributes`, `links`, `backlinks`, `list`, `template`, `daily`, `attach`, `rename`, `broken_links`, `graph`, `canvas`, `bookmarks`（每个短名均使用 `dsh_csrw_obsidian_` 前缀） |
| 文献笔记 | `dsh_csrw_paper_to_note`（从 Zotero 条目生成 vault 文献笔记） |
| Git | `dsh_csrw_git_status`, `init`, `commit`, `push`, `pull`（每个短名均使用 `dsh_csrw_git_` 前缀） |
| Zotero | `dsh_csrw_zotero_search`, `item`, `notes`, `attachments`, `cite`（每个短名均使用 `dsh_csrw_zotero_` 前缀） |
| 坚果云 | `dsh_csrw_nutstore_test`, `list`, `push`, `pull`（每个短名均使用 `dsh_csrw_nutstore_` 前缀） |
| 备份与快照 | `dsh_csrw_backup_obsidian`, `dsh_csrw_backup_zotero`, `dsh_csrw_backup_dsh`, `dsh_csrw_backup_workspace`, `dsh_csrw_snapshot_create`, `dsh_csrw_snapshot_verify`, `dsh_csrw_snapshot_restore`, `dsh_csrw_backup_upload`, `dsh_csrw_backup_github`, `dsh_csrw_backup_all` |

工具的模型可见参数说明和 CLI `--help` 是具体调用接口。所有操作返回单一 JSON；基础设施错误抛出，不把失败包装为成功。工具尊重取消信号。

### Obsidian

路径相对 vault；拒绝 `..`、盘符越界、符号链接和目录联接。`write` 默认拒绝覆盖，只有 `overwrite:true` 才替换已有文件；`append` 要求已有笔记，文本原样追加。`move` 不覆盖目标，也**不重写 `[[双链]]`**（需要连链接一起改请用 `rename`）。`trash` 仅将文件移动到 vault 的回收目录，返回可恢复路径，不永久删除。搜索忽略内部目录及回收内容。`attributes` 读取或更新笔记的 frontmatter（`title`/`tags`/`aliases` 等 YAML 头）：省略 `set` 时只读，`set` 中值为 `null` 的键会被删除，`keys` 只返回指定键。

双链与检索（对应 `docs/obsidian-local-features.md` 的能力清单，全部已实现）：

- `search` 支持按 `tag` / `scope`（目录）/ `property`（`key=value`）过滤，`query` 可留空仅按过滤列笔记。
- `links` 解析单篇笔记的正向 `[[双链]]`（别名、段落、嵌入、显式路径），并消歧为真实文件路径。
- `backlinks` 反推全库链接到目标笔记的笔记（嵌入不计入），并给出正文中未形成链接的「未链接提及」。
- `rename` 移动文件并全库重写指向它的双链；别名引用保持不变（别名仍解析到该文件）。
- `broken_links` 检测指向不存在文件的死链，并报告同名歧义候选。
- `graph` 导出图谱节点/边数据（只算不画）。
- `list` 列出目录下的 Markdown，可选读取多篇内容；`template` 用 `{{key}}` 变量渲染模板（内置 `date`/`time`/`title`）；`daily` 按 `.obsidian/daily-notes.json` 规则生成日记；`attach` 把本地图片/PDF 拷进 vault 附件目录；`canvas` 读写 `.canvas` JSON；`bookmarks` 只读展平 `.obsidian/bookmarks.json`。

`paper_to_note` 从本机 Zotero 条目生成 vault 文献笔记（frontmatter + `[[cite:KEY]]` + 摘要 + `![[附件]]` 引用），不下载附件文件。双链解析先精确路径、再 basename 最短唯一路径、最后别名兜底；同名文件并列时标记 `ambiguous` 不静默选错。索引在内存中按需扫描，中小 vault（几百篇）单次调用够用。

```json
{"path":"notes/example.md","text":"# Example\nResearch notes\n"}
```

将上述内容保存为参数文件后运行 `dsh-csrw obsidian write --args-file params.json`。读取使用 `{"path":"notes/example.md"}`。

### Git

通过参数数组运行 Git，不拼接 shell。初始化幂等，补充本地忽略规则；`git.autoInit=true` 仅让显式提交在校验全部路径后初始化仓库，状态查询始终只读；提交不隐式推送。推送/拉取需要已配置远端；默认拒绝对脏工作树拉取，可显式配置 rebase 策略。凭据由 SSH agent / Git credential helper 管理，本插件不保存 Git 密码。实际 push 会修改远端仓库，应在用户授权范围内调用。

### Zotero

仅 GET 本机 API。搜索、条目、笔记、附件元数据和引用工具不会写入 Zotero，不下载附件，也不使用云端 fallback。返回的引用依据 API 的实际元数据，不能代替逐条文献核验。

### 坚果云

`push` / `pull` 采用 `localPath`（本地目录）和可选 `remotePath`（相对配置 `remoteRoot` 的目录）。按 SHA-256 记录基线；相同文件跳过。覆盖远端需要 ETag 条件请求，首次写入使用 `If-None-Match: *`，上传后读取校验。

发现不一致且无法安全判断时，保留本地 `.local` 与远端 `.remote` 副本，并在 JSON 的 `conflicts` 中报告，不静默替换原文件。已有冲突副本会加唯一后缀。**不传播删除，不做后台或定时同步。** 本地状态保存在 `.dsh-csrw/sync/`。单文件/响应上限 32 MiB，目录列表上限 10000 项；大附件不适用此版本。目录同步忽略 `.git`、`.dsh-csrw`、`node_modules` 和常见凭据文件。

### 备份、校验与恢复

备份默认保存在本地，manifest 记录版本、时间、大小与每文件 SHA-256。Zotero SQLite 通过只读源连接和 SQLite 在线备份产生一致副本，避免直接复制运行中的数据库。该在线备份使用 Node 内置 `node:sqlite` 的 `backup()`；当前运行时没有该 API 时会明确报错，不会退化为直接复制运行中的数据库。DSH 备份覆盖实际发现/显式配置的 prompts、plugins、skills、soul（专家团）与配置，默认不含 sessions/storages；排除已知敏感路径及检测到敏感内容的文件（整文件跳过，不是字段脱敏）。包含 profile 的 `cordis.patch.yml`、package manifests 与 pnpm 锁文件；排除 `node_modules` 和 `.git`，依赖需要按清单重建。敏感识别为保守启发式，不能保证未知格式密钥 100% 召回，应检查排除报告后再上传。第四个源 `workspace` 备份工作区 `.dsh-csrw/config.json` 与同步基线，排除备份目录自身。

恢复必须显式 `confirm:true`，先完成 manifest 与全部文件校验，再自动生成恢复前快照。只恢复清单内的文件，不删除目标中额外内容；不会对用户资料执行未获授权的真实恢复。多文件恢复不是文件系统事务，运行期 I/O、取消或并发变更可能造成部分完成，恢复前快照是回滚依据。SHA-256 用于完整性而非来源认证；不提供敌对并发下的完全 TOCTOU 防护。恢复 SQLite 前关闭 Zotero；活动 WAL/SHM 存在时拒绝恢复。大文件会读入内存。请先在独立目录验证备份内容和凭据排除报告。

云端分工（见 `docs/backup-architecture.md`）：本地始终是主备份；`dsh_csrw_backup_upload` 把完整快照目录增量同步到坚果云（大附件、SQLite、全量）；`dsh_csrw_backup_github` 把工作区配置与快照 manifest 提交到 GitHub 私有仓库（小文件、版本化）。`dsh_csrw_backup_all` 一键执行本地快照并按 `backup.target` 与 `git.backupRemote` 分流，单步失败不影响其余步骤。两者均不传播删除、不做后台定时同步；GitHub push 需显式 `confirm`。

### 旧版本迁移

工作台状态从旧目录 `$DSH_HOME/csrw-desk/state.json` 迁到 `$DSH_HOME/dsh-csrw/state.json`。迁移在首次读取时自动发生：目标已存在则跳过；旧文件解析失败会明确报错并保留原文件；写入用独占方式，成功后留下 `.migrated-from-csrw-desk` 标记。**旧目录不会被删除**，确认新目录工作正常后可由用户自行清理。

同时兼容三处旧命名，均为只读回退、不删除旧数据：

1. 工作区配置：新路径 `.dsh-csrw/config.json` 不存在时读取旧 `.csrw/config.json`，并尽力复制到新路径。
2. 凭据：`dsh-csrw/nutstore` 读不到记录时回退旧键 `csrw/nutstore`。
3. 远端目录：默认 `remoteRoot` 已从 `csrw` 改为 `dsh-csrw`，旧远端内容不会自动搬迁；需要保留历史同步时，请自行在 WebDAV 端重命名目录，或用 `dsh_csrw_nutstore_pull` 先拉到本地再推送。

CLI 可执行文件名从 `csrw` 改为 `dsh-csrw`，模型工具名从 `csrw_*` 改为 `dsh_csrw_*`，命令从 `/csrw-ui` 改为 `/dsh-csrw`，并同时接受 JSON 与 `dsh-csrw <模块> <操作>` 两种写法。这些都是 0.1.0 内的破坏性更名：旧的调用脚本、快捷指令和提示词需要同步更新。

### 工作台接口排障

页面提示加载失败时，先在浏览器外确认路由本身是否存在：

```text
GET /dsh-csrw/api/state
  404 + 空响应体  → 路由没注册，插件 Web 半片没挂上（宿主已加载工具但未加载路由）
  401 + {"error":"未授权"} → 路由正常，只是请求没带会话凭据；在界面里点“加载配置”即可
```

路由通过 `ctx.inject(['webServer'], …)` 条件注入挂载：`webServer` 服务可能晚于本插件就绪，一次性
`ctx.get('webServer')` 在那种加载顺序下会永久错过它，表现为工具全部可用但工作台永远 404。
没有 Web GUI 的环境（CLI、单元测试）里条件注入不会触发，46 个工具与 `/dsh-csrw` 命令不受影响。

## 验证与范围

自动测试使用工作区 `.test-artifacts/` 或系统临时目录下的隔离 fixture 和本机模拟服务；不推送真实外部仓库，不恢复用户真实 vault、Zotero 或 DSH profile。执行 `npm test` 查看当前结果。真实 Zotero 搜索/读取验收要求本机服务可用；真实坚果云往返要求用户自己的应用密码及测试目录。这些不能由 mock 通过替代。

本版本提供的界面是待办页的三种视图加四个占位页；不含 MCP 服务、向量检索、聚类、Zotero 写入、自动定时同步或永久删除。Obsidian 双链（解析、消歧、反链、未链接提及、重写）、检索过滤、模板、日记、附件拷贝、死链检测、图谱数据、Canvas 与书签均已实现（见 `docs/obsidian-local-features.md`）。

## 源码

`lib/index.js` 注册工具和工作台路由；`lib/tools/` 实现各模块（`obsidian.js` Obsidian 工具、`paper.js` 文献笔记、`git.js`、`zotero.js`、`nutstore.js`、`backup.js`、`config.js`）；`lib/desk/` 是工作台宿主半片（`host.js` 路由、`store.js` 持久化/撤销/迁移、`ops.js` 操作白名单、`seed.js` 示例数据、`ids.js` 全局标识）；`lib/services/config.js` 管理配置，`lib/services/snapshot.js` 管理备份；`lib/utils/` 提供路径边界、frontmatter 解析与双链引擎（`path.js`、`frontmatter.js`、`wikilink.js`）及哈希工具。`bin/dsh-csrw.js` 是 CLI；`client.js` 是浏览器半片；`patches/bundle.yaml` 是 DSH bundle 补丁；`docs/` 是工作台设计文档；`scripts/check.mjs` 与 `scripts/check-identifiers.mjs` 做结构与标识一致性检查，`scripts/verify-ui*.mjs` 校验界面注册与交互。GPL-3.0-only License（保留远端 GNU GPL v3 授权）。

### 本次验收记录（2026-11-12）

- `npm run check` 通过：语法、包元数据、46 个 `dsh_csrw_` 工具、六个模块全部 `ready`；`identifiers` 通过（`dsh-csrw-ui`、`/dsh-csrw/api`、`dsh-csrw`）。
- `npm run check:ui` 通过：五处界面注册、图标几何、标题、设置分区 id 与中英文案全部匹配。
- `npm test`：70 个用例全部通过（0 skip、0 fail）。其中 5 个是 `lib/desk/` 用例，2 个是工作台状态迁移用例，2 个是配置兼容用例；12 个是新增 Obsidian 双链/检索/模板/日记/附件/重命名/死链/图谱/Canvas/书签用例，2 个是 `paper_to_note` 文献笔记用例（用本机 mock HTTP 验证 Zotero 请求路径与生成内容），3 个是新增备份云端用例（`workspace` 源排除备份目录、`backup_github` 用 mock git 验证 init/commit/push 序列与 confirm 门）。"真实 Git 临时仓库集成"用例需要进程能用管道捕获子进程输出，在限制该能力的沙箱中按设计跳过，在普通终端通过。
- 运行期实测：`GET /dsh-csrw/api/state` 返回 401（路由已注册，需鉴权），旧路由 `GET /csrw-desk/state` 返回 404；客户端插槽列表里 `sidebar.panellist`（order 45）、`settings.section`（order 17）、`settings.section.icon` 均为 `dsh-csrw-ui`；`dsh_csrw_health` 返回 46 工具、六模块 `ready`。
- 状态迁移实机验证：从 `~/.dsh/csrw-desk/` 复制到 `~/.dsh/dsh-csrw/`，读到 6 个待办、3 篇文献、3 个想法；旧文件 SHA-256 前后一致（未被改写），新目录含 `state.json` 与 `.migrated-from-csrw-desk` 标记。
- 界面人工验收：设置分区、侧栏入口、标题与图标名称、工作台加载配置均按预期显示；插件卡片描述 41 字未截断。
- 外部服务边界：本机未运行 Zotero，真实 API 搜索/条目读取未验收；未提供坚果云应用密码，真实远端往返未验收；两者在不可用时都返回明确错误而不是假成功。Obsidian 端子验收使用临时 vault（非用户真实数据）：write/append/move/trash 正常，`../` 越界与默认覆盖被拒绝，`snapshot_verify` 能检出被篡改文件，`snapshot_restore` 未传 `confirm: true` 时拒绝。
- 尚未实现：项目、文献、想法、知识库四页只有条数占位，没有列表与编辑界面（工作台界面层，与 Obsidian 执行层无关）。Obsidian 本地能力清单（`docs/obsidian-local-features.md`）已全部实现。
