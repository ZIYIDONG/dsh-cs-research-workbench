import { tool, s, b, workspaceOf, outputObject } from './common.js';
import { createSnapshot, verifySnapshot, restoreSnapshot } from '../services/snapshot.js';

const sources = { type: 'array', items: { type: 'string', enum: ['obsidian', 'zotero', 'dsh'] }, description: '明确选择源；create 默认三个源，restore 必填且只恢复这些源。' };
const location = {
 vaultPath: s('本次 Obsidian 库路径；省略使用配置或唯一自动发现。', false),
 dataDir: s('本次 Zotero 数据目录；省略使用配置。', false),
 dshHome: s('本次 DSH home；省略验证运行环境和用户目录候选，不将猜测视为真实位置。', false),
 dshProfile: s('本次 DSH profile 的绝对路径或 home/profiles 下的名称；多候选时必须明确。', false),
 backupDir: s('本次本地备份目录；默认配置 backup.localDir（.csrw/backups）。', false),
 target: { type: 'string', enum: ['local'], description: '仅支持 local；不隐式忽略未实现的 Nutstore 目标。' },
 includeDshSessions: b('显式包含 DSH sessions/storages；默认不包含，或遵循现有配置。')
};
const created = outputObject({ snapshotPath: { type: 'string', required: true }, version: { type: 'integer', required: true }, createdAt: { type: 'string', required: true }, files: { type: 'integer', required: true }, excluded: { type: 'integer', required: true } });
export function backupTools(ctx) {
 const create = fixed => async (a, e) => createSnapshot(await workspaceOf(ctx, a, e), { ...a, ...(fixed ? { sources: [fixed] } : {}) }, e.signal);
 return [
  tool('csrw_backup_obsidian', '备份 Obsidian 到本地版本快照，记录逐文件 SHA-256；排除凭据和检测到的敏感内容，拒绝链接。', location, create('obsidian'), created),
  tool('csrw_backup_zotero', '备份 Zotero：SQLite 使用只读连接与 backup API 创建一致副本，其他文件正常备份；排除凭据。', location, create('zotero'), created),
  tool('csrw_backup_dsh', '验证真实 DSH home/profile 后备份 prompts/plugins/skills/非敏感 config；默认排除 sessions/storages。', location, create('dsh'), created),
  tool('csrw_snapshot_create', '为所选源创建本地时间版本快照与逐文件 SHA-256/size manifest；不会上传或改配置。', { ...location, sources }, create(), created),
  tool('csrw_snapshot_verify', '只读验证快照全部文件、大小、SHA-256 与 manifest 路径安全；失败抛错。', { snapshotPath: s('快照目录绝对路径。') }, async (a, e) => verifySnapshot(a.snapshotPath, e.signal), outputObject({ snapshotPath: { type: 'string', required: true }, verified: { type: 'boolean', required: true }, version: { type: 'integer', required: true }, files: { type: 'integer', required: true } })),
  tool('csrw_snapshot_restore', '需 confirm:true：先验证全体、预校验所选源目标，再自动创建 pre-restore 快照并恢复。目标来自本次配置而非 manifest；不删除额外文件。关闭 Zotero 后再恢复数据库。', { ...location, sources: { ...sources, required: true }, snapshotPath: s('待恢复快照目录绝对路径。'), confirm: b('必须显式为 true 才允许写入目标源。', true) }, async (a, e) => restoreSnapshot(await workspaceOf(ctx, a, e), a, e.signal), outputObject({ snapshotPath: { type: 'string', required: true }, restored: { type: 'boolean', required: true }, files: { type: 'integer', required: true }, preRestoreSnapshot: { type: 'string', required: true } }))
 ];
}
