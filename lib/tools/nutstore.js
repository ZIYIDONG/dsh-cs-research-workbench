// 坚果云 WebDAV 工具：仅参数编排，客户端与同步逻辑在 services/nutstore.js。
import { tool, s, b, workspaceOf, outputObject } from './common.js';
import { nutstoreClient, nutstoreSync, nutstoreDelete, nutstoreLogs, classifyError, rel } from '../services/nutstore.js';

export function nutstoreTools(ctx) {
  const testSchema = outputObject({ connected: { type: 'boolean', required: true }, remoteRootExists: { type: 'boolean', required: true }, status: { type: 'integer', required: true }, latencyMs: { type: 'integer', required: true }, hint: { type: 'string', required: true } });
  const listSchema = outputObject({ entries: { type: 'json', required: true } });
  const syncSchema = outputObject({ direction: { type: 'string', required: true }, source: { type: 'string', required: true }, transferred: { type: 'json', required: true }, skipped: { type: 'json', required: true }, conflicts: { type: 'json', required: true }, pruned: { type: 'json', required: true }, deletionsPropagated: { type: 'boolean', required: true }, blocked: { type: 'json', required: true }, secretsBlocked: { type: 'integer', required: true }, total: { type: 'integer', required: true }, processed: { type: 'integer', required: true } });
  const deleteSchema = outputObject({ deleted: { type: 'string', required: true }, status: { type: 'integer', required: true }, found: { type: 'boolean', required: true } });
  const logsSchema = outputObject({ entries: { type: 'json', required: true } });
  const syncParameters = { localPath: s('本地目录，可为工作区相对路径或显式绝对路径；不接受链接。'), remotePath: s('相对配置 remoteRoot 的子目录；省略时直接使用 remoteRoot。', false), confirmExternalPath: b('本地目录在工作区之外时需显式 true。', false) };
  async function client(a, e) { const workspace = await workspaceOf(ctx, a, e); return nutstoreClient(ctx, workspace, e.signal); }
  async function sync(a, e, direction) {
    if (direction === 'push' && a.prune === true && a.confirm !== true) throw new Error('prune requires confirm:true');
    const workspace = await workspaceOf(ctx, a, e);
    // push/pull 的 localPath 是必填参数，所以恒为「显式传入」——越界门必然评估。
    return nutstoreSync(ctx, workspace, a.localPath, a.remotePath, direction, e.signal, { prune: a.prune === true, explicitLocalPath: true, confirmExternalPath: a.confirmExternalPath === true });
  }
  return [
    tool('dsh_csrw_nutstore_test', '测试坚果云 WebDAV 连接与认证（仅 PROPFIND），返回延迟与可操作提示；不创建文件，不返回凭据。', {}, async (a, e) => {
      const started = Date.now();
      try {
        const { dav } = await client(a, e);
        const response = await dav.request('PROPFIND', '', { headers: { Depth: '0' }, allowed: [404] });
        const status = response.status;
        await response.body?.cancel();
        return { connected: true, remoteRootExists: status !== 404, status, latencyMs: Date.now() - started, hint: status === 404 ? '远端根目录不存在，首次 push 会自动创建' : '连接正常' };
      } catch (err) {
        const info = classifyError(err);
        throw Object.assign(new Error(`${info.hint}（${info.kind}）`), { cause: err, status: err.status });
      }
    }, testSchema),
    tool('dsh_csrw_nutstore_list', '只读列出 WebDAV 远端目录的直接子项，最多 10000 项；凭据从安全存储或环境读取。', { remotePath: s('相对 remoteRoot 的目录，省略使用根。', false) }, async (a, e) => ({ entries: await (await client(a, e)).dav.list(rel(a.remotePath ?? '', true)) }), listSchema),
    tool('dsh_csrw_nutstore_push', '将本地目录按 SHA-256 增量上传 WebDAV；冲突保留 .local/.remote，不静默覆盖。prune=true 且 confirm=true 时删除远端多余文件。', { ...syncParameters, prune: b('删除远端存在但本地已不存在的文件；会写远端，需同时 confirm:true。', false), confirm: b('prune 删除远端文件时显式确认。', false) }, (a, e) => sync(a, e, 'push'), syncSchema),
    tool('dsh_csrw_nutstore_pull', '将远端目录按 SHA-256 增量下载；本地冲突保留 .local/.remote，不静默覆盖，不删除本地多余文件。', syncParameters, (a, e) => sync(a, e, 'pull'), syncSchema),
    tool('dsh_csrw_nutstore_delete', '显式删除远端文件或目录；拒绝删除远端根，404 视为已不存在，需 confirm:true。', { remotePath: s('相对 remoteRoot 的文件或目录路径。'), confirm: b('必须显式 true 才允许删除远端。', true) }, async (a, e) => { const workspace = await workspaceOf(ctx, a, e); return nutstoreDelete(ctx, workspace, a.remotePath, e.signal, { confirm: a.confirm === true }); }, deleteSchema),
    tool('dsh_csrw_nutstore_logs', '读取最近的坚果云同步日志（最新在前），用于排查失败原因。', { limit: { type: 'integer', description: '返回条数，默认 50，范围 1-500。' } }, async (a, e) => { const workspace = await workspaceOf(ctx, a, e); return { entries: await nutstoreLogs(workspace, a.limit, e.signal) }; }, logsSchema),
  ];
}
