# dsh CS 科研工作台

**dsh 计算机科学与网络安全科研工作台**（`dsh-cs-research-workbench`，简称 `csrw`）是面向 dsh 的代码中心科研插件。这里的 **CS 同时指 Computer Science 与 Cybersecurity**：二者共享问题定义、文献与笔记整理、代码和实验版本管理、结果复现及资料备份流程。本插件抽象这条共同流程，适用于不同计算机科学与网络安全方向，不预设单一子领域。

> A code-centric research workbench for Computer Science and Cybersecurity.

v0.1 提供本地 Obsidian 文件操作、Git、Zotero 本机只读 API、坚果云 WebDAV 与可校验的本地备份。插件 ID 和 CLI 为 `csrw`，工具统一使用 `csrw_` 前缀，工作区配置目录为 `.csrw`。

## 环境与安装

- Node.js ≥22.16；DSH `>=0.2.2-rc.1 <0.3.0`。已开发测试环境：Node 26.13.0、DSH 0.2.2-rc.1、Windows、Git 2.46.0。
- Git 模块需要系统 `git`；Obsidian 操作直接读写 vault，无需 Obsidian REST 插件。
- Zotero 需要运行中的本机 API，默认 `http://127.0.0.1:23119/api`。API 不可用时明确报错，不转向云端。

在源码目录安装依赖并检查：

```powershell
npm install --ignore-scripts
npm run check
npm test
node bin/csrw.js health
```

在 DSH 中通过插件管理安装本目录或发布包。让代理调用 `plugin_manager` 的 `install_bundle`，`target` 为包目录的绝对路径；不要手工改写 profile。包的 `patches/bundle.yaml` 仅插入自己的插件行。安装结果中的 `application` 与 `warnings` 决定是否已生效；若版本替换需要重启，重启后用 `csrw_health` 验证。插件的中文/英文显示资源和原始 SVG 图标包含在包中。

本地直接运行 `node bin/csrw.js`。安装为命令行包后也可运行 `csrw`。命令与工具一一对应，如 `csrw obsidian read` 对应 `csrw_obsidian_read`；`--help` 列出完整命令。

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

备份默认保存在本地，manifest 记录版本、时间、大小与每文件 SHA-256。Zotero SQLite 通过只读源连接和 SQLite 在线备份产生一致副本，避免直接复制运行中的数据库。DSH 备份覆盖实际发现/显式配置的 prompts、plugins、skills 与配置，默认不含 sessions/storages；排除已知敏感路径及检测到敏感内容的文件（整文件跳过，不是字段脱敏）。包含 profile 的 `cordis.patch.yml`、package manifests 与 pnpm 锁文件；排除 `node_modules` 和 `.git`，依赖需要按清单重建。敏感识别为保守启发式，不能保证未知格式密钥 100% 召回，应检查排除报告后再上传。

恢复必须显式 `confirm:true`，先完成 manifest 与全部文件校验，再自动生成恢复前快照。只恢复清单内的文件，不删除目标中额外内容；不会对用户资料执行未获授权的真实恢复。多文件恢复不是文件系统事务，运行期 I/O、取消或并发变更可能造成部分完成，恢复前快照是回滚依据。SHA-256 用于完整性而非来源认证；不提供敌对并发下的完全 TOCTOU 防护。恢复 SQLite 前关闭 Zotero；活动 WAL/SHM 存在时拒绝恢复。大文件会读入内存。请先在独立目录验证备份内容和凭据排除报告。

## 验证与范围

自动测试使用工作区 `.test-artifacts/` 或系统临时目录下的隔离 fixture 和本机模拟服务；不推送真实外部仓库，不恢复用户真实 vault、Zotero 或 DSH profile。执行 `npm test` 查看当前结果。真实 Zotero 搜索/读取验收要求本机服务可用；真实坚果云往返要求用户自己的应用密码及测试目录。这些不能由 mock 通过替代。

v0.1 不包含 UI 仪表盘、MCP 服务、向量检索、聚类、Zotero 写入、自动定时同步、永久删除或 vault 双链重写。

## 源码

`lib/index.js` 注册工具；`lib/tools/` 实现各模块；`lib/services/config.js` 管理配置，`lib/services/snapshot.js` 管理备份；`lib/utils/` 提供路径边界及哈希工具。`bin/csrw.js` 是 CLI；`patches/bundle.yaml` 是 DSH bundle 补丁。MIT License。

### 本次验收记录（2026-11-11）

- 32 项本地测试通过（含真实 Git 临时仓库集成），无失败、无跳过，语法/元数据/29 个工具契约检查通过。
- Obsidian 生命周期、WebDAV mock 往返/冲突、Zotero mock GET、SQLite WAL 一致副本与快照恢复均有测试证据；不等于真实外部服务验收。
- 当前机器真实 Zotero API 连接失败；真实搜索/条目读取未验收。未提供坚果云应用凭据，真实远端往返未验收。
- 当前 DSH 可见旧代际的 health/config 共 3 个工具（Inspect 实测）；同版本源码替换后需要重启 DSH 加载最终 29 工具的 JS 代际，再运行 `csrw_health` 并核对所有模块 `ready`。图标文件已校验，实际 GUI 渲染尚未目视验证。
