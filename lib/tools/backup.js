import fs from 'node:fs/promises';
import path from 'node:path';
import { tool, s, b, workspaceOf, outputObject, jsonOutput } from './common.js';
import { createSnapshot, verifySnapshot, restoreSnapshot, backupBase } from '../services/snapshot.js';
import { pruneSnapshots } from '../services/retention.js';
import { loadConfig } from '../services/config.js';
import { safePath, exists } from '../utils/path.js';
import { assertRemoteUrl, redactRemote } from '../utils/remote.js';
import { nutstoreSync } from '../services/nutstore.js';
import { git } from '../services/git.js';

const sources = { type: 'array', items: { type: 'string', enum: ['obsidian', 'zotero', 'dsh', 'workspace'] }, description: '明确选择源；create 默认四个源，restore 必填且只恢复这些源。' };
const location = {
 vaultPath: s('本次 Obsidian 库路径；省略使用配置或唯一自动发现。', false),
 dataDir: s('本次 Zotero 数据目录；省略使用配置。', false),
 dshHome: s('本次 DSH home；省略验证运行环境和用户目录候选，不将猜测视为真实位置。', false),
 dshProfile: s('本次 DSH profile 的绝对路径或 home/profiles 下的名称；多候选时必须明确。', false),
 backupDir: s('本次本地备份目录；默认配置 backup.localDir（.dsh-csrw/backups）。', false),
 target: { type: 'string', enum: ['local', 'nutstore'], description: '备份目标；local 仅本地，nutstore 由 backup_all 额外上传坚果云。' },
 includeDshSessions: b('显式包含 DSH sessions/storages；默认不包含，或遵循现有配置。')
};
const created = outputObject({ snapshotPath: { type: 'string', required: true }, version: { type: 'integer', required: true }, createdAt: { type: 'string', required: true }, files: { type: 'integer', required: true }, excluded: { type: 'integer', required: true }, pruned: { type: 'integer', required: true }, roots: { type: 'json', required: true } });
// 越界路径用独立旗标：与 confirm（破坏性/外发）严格分开，一个旗标只表达一件事，互不代偿。
const externalSourceConfirm = b('备份/恢复源解析到工作区之外时需显式 true。', false);
const syncOut = outputObject({ direction: { type: 'string', required: true }, source: { type: 'string', required: true }, transferred: { type: 'json', required: true }, skipped: { type: 'json', required: true }, conflicts: { type: 'json', required: true }, blocked: { type: 'json', required: true }, secretsBlocked: { type: 'integer', required: true }, deletionsPropagated: { type: 'boolean', required: true } });

async function githubBackup(ctx, workspace, config, options, signal) {
 const remote = options.remote || config.git.backupRemote;
 if (!remote) throw new Error('Configure git.backupRemote (GitHub remote URL) first');
 // 严格模式（无 allowLocal）：remote 可能来自 options.remote（工具入参、agent 可控），只放行 https/ssh/scp。
 // 校验必须先于 :28 的 repoDir 解析与 :32 的 mkdir —— 否则非法 remote 会先留下本地仓库副作用。
 assertRemoteUrl(remote, 'git.backupRemote');
 const branch = options.branch || config.git.backupBranch;
 // branch 复用 config.js 的判定（config 侧已有校验，但 options.branch 是工具入参，会绕过）。
 if (typeof branch !== 'string' || !branch.trim() || branch.startsWith('-') || /[\r\n\s]/.test(branch)) throw new Error('Invalid git branch');
 // repoDir 必须是工作区相对子路径：config 侧本来就只允许相对路径（config.js 的 relative child 规则），参数不应比配置更宽松。
 // safePath 同时提供相对路径限制与符号链接拒绝，且不产生任何文件系统副作用。
 if (options.repoDir && path.isAbsolute(options.repoDir)) throw new Error('repoDir must be a workspace-relative child path');
 const repoDir = await safePath(workspace, options.repoDir || config.git.backupRepoDir);
 const srcConfig = await safePath(workspace, '.dsh-csrw/config.json');
 // backup.localDir 允许绝对路径（可备份到其它盘/NAS）：先 resolve 成 root，再以 '' 作为相对段。
 // 不能把绝对路径当第二个参数传——safePath 对含冒号的 relative 直接拒绝；allowRoot 只跳过"不许指向 root"这一条，链接检查照常。
 const backupsDir = await safePath(path.resolve(workspace, config.backup.localDir), '', { allowRoot: true });
 const isRepo = await exists(path.join(repoDir, '.git'));
 // 与 confirm 无关的硬门：目标是「已存在、非空、还不是 git 仓库」时，git init + add -A 会把整个目录纳入版本库。
 // 这条不能靠用户确认兜底（误配一次就是大规模误提交），必须在 mkdir 之前判定。
 if (!isRepo && await exists(repoDir)) {
  let entries;
  try { entries = await fs.readdir(repoDir); }
  catch (error) { if (error.code !== 'EACCES' && error.code !== 'EPERM') throw error; throw new Error(`Cannot inspect repoDir (${error.code}); choose an empty or new directory`); }
  if (entries.length) throw new Error(`repoDir already exists and is not empty; refusing to git init in it: ${repoDir}`);
 }
 await fs.mkdir(repoDir, { recursive: true });
 if (!isRepo) {
  await git(repoDir, ['init', `--initial-branch=${branch}`], signal);
  // `--` 终止选项解析：以 `-` 开头的 remote 不会被当成 git 选项（主防线是 assertRemoteUrl 的 `^-` 拒绝，这里是第二道）。
  await git(repoDir, ['remote', 'add', '--', 'origin', remote], signal);
 } else {
  const url = (await git(repoDir, ['remote', 'get-url', 'origin'], signal)).trim();
  // 只回显脱敏形式，避免 origin 里内嵌的凭据进入错误消息/日志。
  if (url && url !== remote) throw new Error(`Backup repo origin is ${redactRemote(url)}, expected ${redactRemote(remote)}; remove the repo or align git.backupRemote`);
  if (!url) await git(repoDir, ['remote', 'add', '--', 'origin', remote], signal);
 }
 // 元数据：工作区配置 + 每个快照的 manifest（不含大文件）
 if (await exists(srcConfig)) {
  await fs.mkdir(path.join(repoDir, 'workspace'), { recursive: true });
  await fs.copyFile(srcConfig, path.join(repoDir, 'workspace', 'config.json'));
 }
 if (await exists(backupsDir)) {
  for (const ent of await fs.readdir(backupsDir, { withFileTypes: true })) {
   if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
   const mf = path.join(backupsDir, ent.name, 'manifest.json');
   if (await exists(mf)) {
    await fs.mkdir(path.join(repoDir, 'manifests'), { recursive: true });
    await fs.copyFile(mf, path.join(repoDir, 'manifests', `${ent.name}.json`));
   }
  }
 }
 const message = options.message || `backup ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
 await git(repoDir, ['add', '-A'], signal);
 await git(repoDir, ['-c', 'core.hooksPath=/dev/null', 'commit', '-m', message, '--allow-empty'], signal);
 if (options.confirm === true) {
  await git(repoDir, ['push', '--', 'origin', branch], signal);
  return { pushed: true, remote, branch, repoDir };
 }
 return { pushed: false, remote, branch, repoDir };
}

export function backupTools(ctx) {
 const create = fixed => async (a, e) => createSnapshot(await workspaceOf(ctx, a, e), { ...a, ...(fixed ? { sources: [fixed] } : {}) }, e.signal);
 return [
  tool('dsh_csrw_backup_obsidian', '备份 Obsidian 到本地版本快照，记录逐文件 SHA-256；排除凭据和检测到的敏感内容，拒绝链接。', { ...location, confirmExternalPath: externalSourceConfirm }, create('obsidian'), created),
  tool('dsh_csrw_backup_zotero', '备份 Zotero：SQLite 使用只读连接与 backup API 创建一致副本，其他文件正常备份；排除凭据。', { ...location, confirmExternalPath: externalSourceConfirm }, create('zotero'), created),
  tool('dsh_csrw_backup_dsh', '验证真实 DSH home/profile 后备份 prompts/plugins/skills/soul/非敏感 config；默认排除 sessions/storages。', { ...location, confirmExternalPath: externalSourceConfirm }, create('dsh'), created),
  tool('dsh_csrw_backup_workspace', '备份工作区配置参数（.dsh-csrw/config.json 与同步基线）到本地快照；排除备份目录自身，不包含凭据。', { ...location, confirmExternalPath: externalSourceConfirm }, create('workspace'), created),
  tool('dsh_csrw_snapshot_create', '为所选源创建本地时间版本快照与逐文件 SHA-256/size manifest；不会上传或改配置。', { ...location, sources, confirmExternalPath: externalSourceConfirm }, create(), created),
  tool('dsh_csrw_snapshot_verify', '只读验证快照全部文件、大小、SHA-256 与 manifest 路径安全；失败抛错。', { snapshotPath: s('快照目录绝对路径。') }, async (a, e) => verifySnapshot(a.snapshotPath, e.signal), outputObject({ snapshotPath: { type: 'string', required: true }, verified: { type: 'boolean', required: true }, version: { type: 'integer', required: true }, files: { type: 'integer', required: true } })),
  tool('dsh_csrw_snapshot_restore', '需 confirm:true：先验证全体、预校验所选源目标，再自动创建 pre-restore 快照并恢复。目标来自本次配置而非 manifest；不删除额外文件。关闭 Zotero 后再恢复数据库。', { ...location, sources: { ...sources, required: true }, snapshotPath: s('待恢复快照目录绝对路径。'), confirm: b('必须显式为 true 才允许写入目标源。', true), confirmExternalPath: externalSourceConfirm }, async (a, e) => restoreSnapshot(await workspaceOf(ctx, a, e), a, e.signal), outputObject({ snapshotPath: { type: 'string', required: true }, restored: { type: 'boolean', required: true }, files: { type: 'integer', required: true }, preRestoreSnapshot: { type: 'string', required: true } })),
  tool('dsh_csrw_backup_upload', '把本地备份目录整体增量上传到坚果云 WebDAV（remoteRoot/backups）；本地为主，云端为异地副本。', { localPath: s('本地备份目录；默认 backup.localDir。', false), remotePath: s('相对 remoteRoot 的远端目录；默认 backups。', false), confirmExternalPath: externalSourceConfirm }, async (a, e) => {
  const workspace = await workspaceOf(ctx, a, e);
  const config = await loadConfig(workspace, e.signal);
  // 只有显式传了 localPath 才评估越界门；省略时取 config.backup.localDir（不在 payload 内，由写时确认承担）。
  return nutstoreSync(ctx, workspace, a.localPath || config.backup.localDir, a.remotePath || 'backups', 'push', e.signal, { explicitLocalPath: Object.hasOwn(a, 'localPath'), confirmExternalPath: a.confirmExternalPath === true });
 }, syncOut),
  tool('dsh_csrw_backup_github', '把工作区配置与快照元数据纳入 git 仓库并 commit+push 到 GitHub 私有远程；小文件版本化异地备份。', { repoDir: s('备份仓库目录；默认 git.backupRepoDir。', false), remote: s('GitHub 远程 URL；默认 git.backupRemote。', false), branch: s('分支；默认 git.backupBranch。', false), message: s('提交信息；默认带时间戳。', false), confirm: b('实际 push 会写远端仓库，需显式确认。', false) }, async (a, e) => { const workspace = await workspaceOf(ctx, a, e); const config = await loadConfig(workspace, e.signal); return githubBackup(ctx, workspace, config, a, e.signal); }, outputObject({ pushed: { type: 'boolean', required: true }, remote: { type: 'string', required: true }, branch: { type: 'string', required: true }, repoDir: { type: 'string', required: true } })),
  tool('dsh_csrw_backup_all', '一键备份：本地快照，并按配置分流到坚果云（完整快照）与 GitHub（元数据）；单步失败不影响其余步骤，各自报错。', { ...location, sources, confirm: b('实际 push 到 GitHub 远端需显式确认。', false), confirmExternalPath: externalSourceConfirm }, async (a, e) => { const workspace = await workspaceOf(ctx, a, e); const config = await loadConfig(workspace, e.signal); const snapshot = await createSnapshot(workspace, a, e.signal); const result = { snapshotPath: snapshot.snapshotPath, files: snapshot.files, excluded: snapshot.excluded, pruned: snapshot.pruned, roots: snapshot.roots }; if ((a.target || config.backup.target) === 'nutstore') { try { result.nutstore = await nutstoreSync(ctx, workspace, config.backup.localDir, 'backups', 'push', e.signal, { explicitLocalPath: false }); } catch (err) { result.nutstoreError = err.message; } } if (config.git.backupRemote) { try { result.github = await githubBackup(ctx, workspace, config, a, e.signal); } catch (err) { result.githubError = err.message; } } return result; }, jsonOutput),
  tool('dsh_csrw_snapshot_prune', '按保留数量清理旧快照；只删除带 manifest.json 的快照目录，保留最近 keep 个，不触碰 .pending 或损坏目录。', { backupDir: s('本次本地备份目录；默认配置 backup.localDir。', false), keep: { type: 'integer', description: '保留最近 N 个快照；省略使用 backup.keep，0 表示不清理。' }, confirm: b('删除旧快照不可恢复，需显式 true。', true), confirmExternalPath: externalSourceConfirm }, async (a, e) => {
  // schema 的 required 只保证键存在，不保证值为 true：必须另设执行层门，否则 {confirm:false} 会直接删除。
  if (a.confirm !== true) throw new Error('Prune requires confirm:true');
  const workspace = await workspaceOf(ctx, a, e);
  const config = await loadConfig(workspace, e.signal);
  // 必须经 backupBase：越界门在解析期抛，早于 pruneSnapshots 的任何删除（retention 是循环 fs.rm，无回滚、无部分恢复）。
  const base = await backupBase(workspace, a, config);
  return pruneSnapshots(base, a.keep ?? config.backup.keep, e.signal);
 }, outputObject({ pruned: { type: 'json', required: true }, kept: { type: 'integer', required: true } })),
 ];
}
