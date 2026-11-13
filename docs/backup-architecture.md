# 备份体系实现规划（dsh-csrw）

> 目标：本地存全量快照，云端由 GitHub 与坚果云分工配合，覆盖 Obsidian / Zotero / DSH（插件、skills、提示词、专家团）与工作区参数。

## 一、现状盘点

| 能力 | 现状 | 位置 |
| --- | --- | --- |
| 本地快照备份 | ✅ 3 源（obsidian/zotero/dsh）、逐文件 SHA-256、敏感排除、恢复前自动快照 | `lib/services/snapshot.js` |
| 坚果云 WebDAV | ✅ 目录级增量同步 push/pull（SHA-256 增量、冲突保留 .local/.remote） | `lib/tools/nutstore.js` |
| Git | ✅ status/init/commit/push/pull（SSH agent 凭据） | `lib/tools/git.js` |
| 插件/skills/提示词备份 | ✅ 含在 `dsh` 源（`DSH_PARTS`） | `lib/services/snapshot.js` |

**缺口**：
1. `backup.target` 只支持 `local`，云端目标未实现（`backup.js` enum 仅 `local`；`snapshot.js` 的 `backupBase` 明确抛错「Nutstore snapshot transport is not implemented」）。
2. GitHub 备份未实现。
3. 工作区配置 `.dsh-csrw/config.json`（本地导出参数）不在备份范围。
4. 「专家团」`soul/`（SOUL.md/USER.md/IDENTITY.md/RULES.md/memory）不在 `DSH_PARTS`。
5. 云端分工策略未定义。

## 二、三个适配方案

### 1. 坚果云 WebDAV 适配
坚果云承担「大体积完整快照」异地存储。
- 复用 `nutstore push/pull` 同步本地备份目录（`backup.localDir` → 坚果云 `remoteRoot/backups`）。
- 扩展 `backup.target` 为 `local | nutstore`：`createSnapshot` 落盘后自动上传；上传失败保留本地快照并明确报错。

### 2. GitHub 备份适配
GitHub 私有仓库承担「小体积高价值」元数据异地 + 版本化备份（配置、清单、专家团、参数）。
- 新增工具 `dsh_csrw_backup_github`：把备份目录纳入 git 仓库，`commit + push` 到配置的私有远程。
- 配置：`git.backupRemote` / `git.backupBranch` / `git.backupRepoDir`。
- 凭据沿用 SSH agent / credential helper。

### 3. 本地导出参数备份
工作区配置作为第四快照源 `workspace`：备份 `.dsh-csrw/config.json` + `.dsh-csrw/sync/`（排除 `backups` 子目录，防嵌套）。

## 三、整体架构（本地 + 云端分工）

```
本地  .dsh-csrw/backups/  ← 所有快照先落这里（主备份，可快速恢复）
        ├── 坚果云 WebDAV  ← 完整文件快照（大附件、SQLite、全量）
        └── GitHub 私有仓库 ← 元数据/配置/专家团（小、版本化、可追溯）
```

**分工原则**：本地=主（全量、秒级恢复）；坚果云=完整异地（大容量）；GitHub=元数据异地 + 版本历史。

## 四、备份源扩展

- 专家团：`DSH_PARTS` 加入 `soul`，让 `dsh` 源覆盖专家人设/身份/规则/记忆。
- 工作区参数：新增 `workspace` 源（`.dsh-csrw/config.json` + `sync/`）。

## 五、分阶段任务

- **阶段 1（补源，无云端依赖）**：`DSH_PARTS` 加 `soul`；新增 `workspace` 源。
- **阶段 2（坚果云）**：放开 `backup.target`；`createSnapshot` 后自动上传。
- **阶段 3（GitHub）**：`dsh_csrw_backup_github` + 配置。
- **阶段 4（一键）**：`dsh_csrw_backup_all` 分流（大文件→坚果云、元数据→GitHub）。
- **阶段 5（恢复）**：`nutstore_pull` → `snapshot_verify` → `snapshot_restore`；GitHub clone/pull 元数据。

## 六、默认假设（实现采用，可后续调整）

1. 专家团 = `soul` + `skills` + `prompts` 集合；`soul` 本次新增进 `DSH_PARTS`。
2. GitHub 凭据沿用 SSH agent，不新增密码存储。
3. 坚果云上全量快照（含大附件）；GitHub 只上元数据/配置/专家团（小文件）。
4. 备份为手动触发，不做后台定时同步（延续既有边界）。

## 七、策略与配置（已实现）

### 备份范围
- 四源：`obsidian`（vault）、`zotero`（SQLite 一致副本）、`dsh`（prompts/plugins/skills/soul/config）、`workspace`（`.dsh-csrw/config.json` + 同步基线）
- 排除：凭据路径、检测到敏感内容的文件、`node_modules`/`.git`、备份目录自身

### 备份策略
| 项 | 配置 | 默认 | 说明 |
| --- | --- | --- | --- |
| 模式 | `backup.mode` | `full` | `incremental` 时未变更文件用硬链接复用（同 inode，勿手改快照目录） |
| 保留 | `backup.keep` | `10` | 创建快照后自动保留最近 N 个；`0` 不清理；`snapshot_prune` 可手动清理 |
| 触发 | 工具调用 | 手动 | 不做后台定时（延续既有边界） |

### 同步方向与冲突
- 方向：本地为主 → 云端异地（坚果云 push/pull、GitHub commit/push）
- 冲突：按 SHA-256 增量比对；冲突保留 `.local`/`.remote` 双份，不静默覆盖
- 删除不传播

### 失败重试
- 配置：`nutstore.retry`（默认 2）、`nutstore.retryDelay`（默认 1000ms）
- 策略：指数退避（delay × 2^n）；仅重试网络错误、超时、5xx、429；4xx 业务错误直接抛错

### 关键流程
1. 手动备份：`snapshot_create`/`backup_all` → `createSnapshot`（全量/增量 + 自动 prune）
2. 云端分流：`backup_upload` → `nutstoreSync(push)`；`backup_github` → git init/commit/push
3. 恢复：`nutstore_pull` → `snapshot_verify` → `snapshot_restore`（confirm + 预检 + 恢复前快照）
