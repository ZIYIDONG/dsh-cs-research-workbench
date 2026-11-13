// 坚果云 WebDAV 客户端与增量同步：下沉到 services 层，供 tools/nutstore.js 与 tools/backup.js 复用。
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadConfig, assertDavHost } from './config.js';
import { safePath, walk, exists, nonempty, atomicJson, inside } from '../utils/path.js';
import { hashBytes, hashFile } from '../utils/hash.js';
import { containsSecret } from '../utils/secret.js';
import { retry } from '../utils/retry.js';

const MAX_BYTES = 32 * 1024 * 1024;
const excluded = r => r.split('/').some(p => ['.git', '.dsh-csrw', '.csrw', '.env', 'credentials', 'node_modules', '.ssh', '.aws', '.gnupg'].includes(p) || /\.(pem|key|p12|pfx)$/i.test(p) || /^(?:\.env(?:\.|$)|\.?(?:credentials?|secrets?|tokens?|auth|cookies?)(?:\.|$)|\.(?:npmrc|netrc)$|id_(?:rsa|ed25519)(?:\.|$))/i.test(p));

export function rel(value, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.includes('\0') || value.includes(':') || value.startsWith('/') || value.startsWith('\\') || value.split(/[\\/]/).some(p => ['..', '.'].includes(p))) throw new Error('Remote path must be a relative child path');
  return value.replaceAll('\\', '/').replace(/\/+$/, '');
}

const xmlDecode = s => s.replace(/&(?:amp|lt|gt|quot|apos);/g, m => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }[m])).replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n)));

function tag(xml, name) { return xml.match(new RegExp('<(?:[\\w-]+:)?' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?' + name + '>', 'i'))?.[1] ?? ''; }

export class Dav {
  constructor(config, username, password, signal) { this.base = new URL(config.baseUrl.endsWith('/') ? config.baseUrl : config.baseUrl + '/'); assertDavHost(this.base.hostname); this.root = rel(config.remoteRoot); this.auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64'); this.signal = signal; this.retry = Number(config.retry ?? 0); this.retryDelay = Number(config.retryDelay ?? 1000); }
  url(relative = '') { const joined = [this.root, rel(relative, true)].filter(Boolean).join('/'); return new URL(joined.split('/').map(encodeURIComponent).join('/'), this.base); }
  async request(method, relative = '', { headers = {}, body, allowed = [] } = {}) {
    this.signal?.throwIfAborted();
    const response = await retry(async () => {
      let res;
      try {
        res = await fetch(this.url(relative), { method, headers: { Authorization: this.auth, ...headers }, body, signal: AbortSignal.any([this.signal ?? new AbortController().signal, AbortSignal.timeout(20000)]), redirect: 'error' });
      } catch (err) {
        if (this.signal?.aborted) throw this.signal.reason;
        throw new Error(`WebDAV ${method} connection failed (${err.name}); check endpoint and credentials`, { cause: err });
      }
      // 5xx / 429 视为可重试；4xx 业务错误直接抛出，不重试。
      if (res.status >= 500 || res.status === 429) {
        await res.body?.cancel().catch(() => {});
        throw Object.assign(new Error(`WebDAV ${method} failed: HTTP ${res.status}`), { status: res.status });
      }
      return res;
    }, { attempts: (this.retry ?? 0) + 1, delay: this.retryDelay ?? 1000, signal: this.signal });
    if (!response.ok && !allowed.includes(response.status)) { await response.body?.cancel(); throw new Error(`WebDAV ${method} failed: HTTP ${response.status}`); }
    return response;
  }
  async bytes(response) { if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new Error('WebDAV file exceeds 32 MiB limit'); } const chunks = []; let length = 0; for await (const chunk of response.body) { length += chunk.length; if (length > MAX_BYTES) throw new Error('WebDAV response exceeds 32 MiB limit'); chunks.push(chunk); } return Buffer.concat(chunks); }
  async get(relative) { const response = await this.request('GET', relative, { allowed: [404] }); if (response.status === 404) { await response.body?.cancel(); return null; } const data = await this.bytes(response); return { data, hash: hashBytes(data), etag: response.headers.get('etag') }; }
  async mkdir(relative = '') { const parts = [...this.root.split('/'), ...rel(relative, true).split('/').filter(Boolean)]; let folder = ''; for (const part of parts) { folder = [folder, part].filter(Boolean).join('/'); const scope = Object.create(this); scope.root = folder; const response = await scope.request('MKCOL', '', { allowed: [405] }); await response.body?.cancel(); } }
  async list(relative = '', recursive = false) { const found = []; const queue = [rel(relative, true)]; while (queue.length) { this.signal?.throwIfAborted(); const folder = queue.shift(); const response = await this.request('PROPFIND', folder, { headers: { Depth: '1', 'Content-Type': 'application/xml' }, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getetag/></d:prop></d:propfind>' }); const text = (await this.bytes(response)).toString('utf8'); if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Unsafe DAV XML refused'); const responses = [...text.matchAll(/<(?:[\w-]+:)?response(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi)]; if (!responses.length) throw new Error('Invalid DAV multistatus response'); const prefix = this.url('').pathname.replace(/\/+$/, '') + '/'; const requested = this.url(folder).pathname.replace(/\/+$/, ''); for (const match of responses) { const node = match[1]; const href = xmlDecode(tag(node, 'href')); const u = new URL(href, this.base); if (u.origin !== this.base.origin || (!u.pathname.startsWith(prefix) && u.pathname !== prefix.slice(0, -1))) throw new Error('DAV returned path outside configured remote root'); if (u.pathname.replace(/\/+$/, '') === requested) continue; let name; try { name = decodeURIComponent(u.pathname.slice(prefix.length)).replace(/\/+$/, ''); } catch { throw new Error('Invalid DAV path encoding'); } name = rel(name); const expected = folder ? folder + '/' : ''; if (!name.startsWith(expected) || name.slice(expected.length).includes('/')) throw new Error('DAV Depth:1 returned unexpected descendant'); const statuses = [...node.matchAll(/HTTP\/\d(?:\.\d)?\s+(\d+)/g)].map(m => Number(m[1])); if (statuses.length && !statuses.some(n => n >= 200 && n < 300)) continue; const directory = /<(?:[\w-]+:)?collection(?:\s[^>]*)?\s*\/?\s*>/i.test(node); if (!excluded(name)) { found.push({ path: name, directory, size: Number(tag(node, 'getcontentlength') || 0), etag: xmlDecode(tag(node, 'getetag')) || null }); if (recursive && directory) queue.push(name); } if (found.length > 10000) throw new Error('WebDAV listing exceeds 10000 entries'); } } return found; }
}

export async function nutstoreClient(ctx, workspace, signal) {
  const config = await loadConfig(workspace, signal);
  const credentials = ctx.get('credentials');
  const record = credentials ? await credentials.readRecord(config.nutstore.credentialKey).then(r => r ?? (config.nutstore.credentialKey === 'csrw/nutstore' ? undefined : credentials.readRecord('csrw/nutstore'))) : undefined;
  const username = record?.kind === 'api-key' ? (record.env?.NUTSTORE_USERNAME || config.nutstore.username || process.env.NUTSTORE_USERNAME) : (config.nutstore.username || process.env.NUTSTORE_USERNAME);
  const password = record?.kind === 'api-key' ? (record.key || record.env?.NUTSTORE_PASSWORD || process.env.NUTSTORE_PASSWORD) : process.env.NUTSTORE_PASSWORD;
  if (!username || !password) throw new Error('Configure Nutstore app password via credentials api-key record or NUTSTORE_USERNAME/NUTSTORE_PASSWORD environment variables');
  if (/[\r\n:]/.test(username)) throw new Error('Invalid WebDAV username');
  return { workspace, config, dav: new Dav(config.nutstore, username, password, signal) };
}

/** 把 WebDAV/网络错误归类为可操作的提示，供 UI 与日志共用。 */
export function classifyError(error) {
  const status = Number(error?.status);
  const message = String(error?.message ?? '');
  if (/Configure Nutstore app password|NUTSTORE_PASSWORD|NUTSTORE_USERNAME/.test(message)) return { kind: 'auth-missing', hint: '配置坚果云应用密码：DSH 凭据存储（api-key）或 NUTSTORE_USERNAME / NUTSTORE_PASSWORD 环境变量' };
  if (status === 401 || /HTTP 401/.test(message)) return { kind: 'auth-failed', hint: '账号或应用密码错误，请重新配置凭据' };
  if (status === 403 || /HTTP 403/.test(message)) return { kind: 'forbidden', hint: '无权限访问该目录，请检查坚果云应用授权范围' };
  if (status === 404 || /HTTP 404/.test(message)) return { kind: 'not-found', hint: '远端目录不存在，请检查 baseUrl / remoteRoot' };
  if (status === 412 || /HTTP 412/.test(message)) return { kind: 'conflict', hint: '远端文件在同步期间被修改，重跑会保留冲突副本' };
  if (/connection failed|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|network|timeout/i.test(message)) return { kind: 'network', hint: '网络不可达或超时，检查网络后重试' };
  if (/32 MiB/i.test(message)) return { kind: 'too-large', hint: '文件超过 32 MiB 单文件上限，请拆分或用其他方式传输' };
  if (/relative child path/.test(message)) return { kind: 'invalid-path', hint: '远端路径必须是相对子路径，不能包含 .. 或盘符' };
  return { kind: 'unknown', hint: message || '未知错误' };
}

/** 追加一条同步日志；日志失败不阻塞同步主流程。 */
async function logEntry(workspace, entry, signal) {
  try {
    const dir = await safePath(workspace, '.dsh-csrw/logs');
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, 'nutstore.log'), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', { signal });
  } catch { /* ignore log failures */ }
}

/** 显式删除远端文件或目录；拒绝删除远端根，404 视为已不存在。 */
export async function nutstoreDelete(ctx, workspace, remotePath, signal, { confirm = false } = {}) {
  if (confirm !== true) throw new Error('Delete requires confirm:true');
  const target = rel(remotePath);
  if (!target) throw new Error('Refusing to delete the configured remote root');
  const { dav } = await nutstoreClient(ctx, workspace, signal);
  const response = await dav.request('DELETE', target, { allowed: [404] });
  await response.body?.cancel();
  return { deleted: target, status: response.status, found: response.status !== 404 };
}

/** 读取最近的同步日志（最新在前，最多 500 条）。 */
export async function nutstoreLogs(workspace, limit = 50, signal) {
  const file = await safePath(workspace, '.dsh-csrw/logs/nutstore.log');
  let text = '';
  try { text = await fs.readFile(file, { encoding: 'utf8', signal }); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  return text.split('\n').filter(Boolean).slice(-Math.max(1, Math.min(500, Number(limit) || 50))).reverse().map((line) => { try { return JSON.parse(line); } catch { return { raw: line }; } });
}

// 本地目录的唯一解析出口（nutstore_push / nutstore_pull / backup_upload 共用），因此越界门只在这里实现一份。
// 只对「显式传入」的 localPath 评估：config 派生值（backup.localDir）不在 payload 内，由写时确认承担（advisory 层）。
async function localRoot(workspace, value, { explicitLocalPath = false, confirmExternalPath = false } = {}) {
 nonempty(value, 'localPath');
 const root = path.resolve(workspace, value);
 await safePath(root, '', { allowRoot: true });
 if (explicitLocalPath && confirmExternalPath !== true && !inside(workspace, root)) {
  const error = new Error(`options.localPath resolves to ${root}, outside the workspace; rerun with confirmExternalPath:true`);
  error.code = 'EXTERNAL_PATH_REQUIRED'; error.path = root; throw error;
 }
 return root;
}

async function conflict(root, relative, local, remote, signal) { const target = await safePath(root, relative); const suffix = (await exists(target + '.local') || await exists(target + '.remote')) ? '.' + randomUUID() : ''; await fs.mkdir(path.dirname(target), { recursive: true }); if (local !== null) await fs.writeFile(target + suffix + '.local', local, { flag: 'wx', signal }); await fs.writeFile(target + suffix + '.remote', remote, { flag: 'wx', signal }); return { path: relative, localCopy: local === null ? null : relative + suffix + '.local', remoteCopy: relative + suffix + '.remote' }; }

export async function nutstoreSync(ctx, workspace, localPath, remotePath, direction, signal, options = {}) {
  const { config, dav } = await nutstoreClient(ctx, workspace, signal);
  const root = await localRoot(workspace, localPath, options);
  const prefix = rel(remotePath ?? '', true);
  const remoteName = r => [prefix, r].filter(Boolean).join('/');
  if (direction === 'push' && !(await exists(root))) throw new Error('Local directory does not exist');
  if (direction === 'pull') await fs.mkdir(root, { recursive: true });
  const stateFile = await safePath(workspace, '.dsh-csrw/sync/' + hashBytes(JSON.stringify([config.nutstore.baseUrl, config.nutstore.remoteRoot, prefix, root])) + '.json');
  let state = {};
  try { state = JSON.parse(await fs.readFile(stateFile, { encoding: 'utf8', signal })); if (!state || Array.isArray(state) || typeof state !== 'object') throw new Error('Invalid sync state'); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  const transferred = [], skipped = [], conflicts = [], pruned = [], blocked = [];
  let entries;
  if (direction === 'push') { await dav.mkdir(prefix); entries = (await walk(root, { signal, exclude: excluded })).filter(f => !/(\.local|\.remote)(\.|$)/.test(f.relative)).map(f => f.relative); } else entries = (await dav.list(prefix, true)).filter(f => !f.directory).map(f => prefix ? f.path.slice(prefix.length + 1) : f.path);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const total = entries.length;
  let processed = 0;
  const report = (relative) => { processed += 1; try { onProgress?.({ processed, total, relative }); } catch { /* ignore progress errors */ } };
  try {
    for (const relative of entries) {
      signal?.throwIfAborted();
      const file = await safePath(root, relative);
      let local = null;
      try { if ((await fs.stat(file)).size > MAX_BYTES) throw new Error('Local file exceeds 32 MiB limit'); local = await fs.readFile(file, { signal }); } catch (err) { if (err.code !== 'ENOENT') throw err; }
      const localHash = local === null ? null : hashBytes(local);
      // 内容级拦截放在 dav.get 之前：省一次往返，且这条路径绝不可能进 PUT。
      // 只在 push 方向判定——pull 是用户自己的远端数据，拦它会让恢复流程莫名丢文件。
      if (direction === 'push' && local !== null && containsSecret(local)) {
        blocked.push({ path: relative, reason: 'sensitive-content' });
        report(relative);
        continue;
      }
      const remote = await dav.get(remoteName(relative));
      if (remote && remote.hash === localHash) { state[relative] = localHash; skipped.push(relative); report(relative); continue; }
      const base = state[relative];
      if (direction === 'push') {
        if (remote && (!base || remote.hash !== base)) { conflicts.push(await conflict(root, relative, local, remote.data, signal)); report(relative); continue; }
        if (local === null) throw new Error('Local file disappeared during push');
        const parent = path.posix.dirname(remoteName(relative)); if (parent !== '.') await dav.mkdir(parent);
        if (remote && !remote.etag) throw new Error('WebDAV server omitted ETag; refusing unsafe overwrite');
        const response = await dav.request('PUT', remoteName(relative), { body: local, headers: remote ? { 'If-Match': remote.etag } : { 'If-None-Match': '*' }, allowed: [412] });
        await response.body?.cancel();
        if (response.status === 412) throw new Error('WebDAV file changed during upload; rerun to retain conflict copies');
        const verified = await dav.get(remoteName(relative));
        if (!verified || verified.hash !== localHash) throw new Error('Uploaded WebDAV file failed SHA-256 verification');
        state[relative] = localHash; transferred.push(relative); report(relative);
      } else {
        if (!remote) throw new Error('Remote file disappeared during pull');
        if (local !== null && (!base || localHash !== base)) { conflicts.push(await conflict(root, relative, local, remote.data, signal)); report(relative); continue; }
        await fs.mkdir(path.dirname(file), { recursive: true }); await safePath(root, relative);
        if (local !== null && await hashFile(file, signal) !== localHash) throw new Error('Local file changed during download');
        if (local === null) await fs.writeFile(file, remote.data, { flag: 'wx', signal });
        else { const temp = file + '.' + randomUUID() + '.tmp'; await fs.writeFile(temp, remote.data, { flag: 'wx', signal }); signal?.throwIfAborted(); await fs.rename(temp, file); }
        state[relative] = remote.hash; transferred.push(relative); report(relative);
      }
    }
    if (direction === 'push' && options.prune === true) {
      const localSet = new Set(entries);
      const remoteAll = (await dav.list(prefix, true)).filter(f => !f.directory).map(f => prefix ? f.path.slice(prefix.length + 1) : f.path);
      for (const remote of remoteAll) {
        if (localSet.has(remote)) continue;
        signal?.throwIfAborted();
        const response = await dav.request('DELETE', remoteName(remote), { allowed: [404] });
        await response.body?.cancel();
        pruned.push(remote);
      }
    }
  } finally {
    await atomicJson(stateFile, state, signal).catch(() => {});
  }
  // source 是无条件回显的绝对路径「实际用了哪个本地目录」，不是仅在省略 localPath 时才给：
  // 调用方（backup_upload / backup_all）可能从 config 派生 localPath，此时 payload 里没有该值，
  // 只有回显才能让用户确认数据落到了哪个盘。工作区外也不报错——越界门已在 localRoot 里按需评估过。
  const result = { direction, source: root, transferred, skipped, conflicts, pruned, blocked, secretsBlocked: blocked.length, deletionsPropagated: pruned.length > 0, total, processed };
  await logEntry(workspace, { direction, root, prefix, transferred: transferred.length, skipped: skipped.length, conflicts: conflicts.length, pruned: pruned.length, blocked: blocked.length }, signal);
  return result;
}
