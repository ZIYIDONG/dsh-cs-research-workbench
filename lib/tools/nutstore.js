// 坚果云 WebDAV 工具：仅参数编排，客户端与同步逻辑在 services/nutstore.js。
import { tool, s, workspaceOf, outputObject } from './common.js';
import { nutstoreClient, nutstoreSync, rel } from '../services/nutstore.js';

export function nutstoreTools(ctx) {
  const testSchema = outputObject({ connected: { type: 'boolean', required: true }, remoteRootExists: { type: 'boolean', required: true }, status: { type: 'integer', required: true } });
  const listSchema = outputObject({ entries: { type: 'json', required: true } });
  const syncSchema = outputObject({ direction: { type: 'string', required: true }, transferred: { type: 'json', required: true }, skipped: { type: 'json', required: true }, conflicts: { type: 'json', required: true }, deletionsPropagated: { type: 'boolean', required: true } });
  const syncParameters = { localPath: s('本地目录，可为工作区相对路径或显式绝对路径；不接受链接。'), remotePath: s('相对配置 remoteRoot 的子目录；省略时直接使用 remoteRoot。', false) };
  async function client(a, e) { const workspace = await workspaceOf(ctx, a, e); return nutstoreClient(ctx, workspace, e.signal); }
  async function sync(a, e, direction) { const workspace = await workspaceOf(ctx, a, e); return nutstoreSync(ctx, workspace, a.localPath, a.remotePath, direction, e.signal); }
  return [
    tool('dsh_csrw_nutstore_test', '测试坚果云 WebDAV 目录连接与认证，仅 PROPFIND；不创建文件，不返回凭据。', {}, async (a, e) => { const { dav } = await client(a, e); const response = await dav.request('PROPFIND', '', { headers: { Depth: '0' }, allowed: [404] }); const status = response.status; await response.body?.cancel(); return { connected: true, remoteRootExists: status !== 404, status }; }, testSchema),
    tool('dsh_csrw_nutstore_list', '只读列出 WebDAV 远端目录的直接子项，最多 10000 项；凭据从安全存储或环境读取。', { remotePath: s('相对 remoteRoot 的目录，省略使用根。', false) }, async (a, e) => ({ entries: await (await client(a, e)).dav.list(rel(a.remotePath ?? '', true)) }), listSchema),
    tool('dsh_csrw_nutstore_push', '将本地目录按 SHA-256 增量上传 WebDAV；冲突保留 .local/.remote，不静默覆盖，不传播删除。', syncParameters, (a, e) => sync(a, e, 'push'), syncSchema),
    tool('dsh_csrw_nutstore_pull', '将远端目录按 SHA-256 增量下载；本地冲突保留 .local/.remote，不静默覆盖，不传播删除。', syncParameters, (a, e) => sync(a, e, 'pull'), syncSchema),
  ];
}
