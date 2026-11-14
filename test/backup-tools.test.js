// 备份组正向执行路径回归。既有 snapshot.test.js 只列名字/schema 并跑 backup_obsidian，
// backup-cloud.test.js 跑 backup_github，backup-sensitive.test.js 覆盖拒绝路径；本文件补齐
// backup_zotero / backup_dsh / backup_workspace / snapshot_create / snapshot_verify /
// backup_upload / backup_all / snapshot_prune 的「实际执行且不抛错 + 返回结构符合 output schema」。
//
// 夹具只在 os.tmpdir()；WebDAV 只连本机 127.0.0.1 mock；不触碰真实 vault / Zotero 库 /
// 真实 DSH profile / 远端 Git 仓库 / 坚果云账号。
//
// 仍需手工（mock 无法忠实执行的外部服务部分，故不伪造通过）：
// - backup_github 的真实 push 到 GitHub 私有远端：只能验证 git 命令序列（backup-cloud.test.js 已覆盖），
//   远端落地、鉴权与私有仓库权限必须手工验证；
// - backup_upload / backup_all 的真实坚果云账号：本机 DAV 桩只验证请求路径、PUT/GET 与失败分类，
//   真实账号的鉴权、配额、WebDAV 兼容性仍需手工；
// - backup_zotero 的真实运行中 Zotero（WAL 与锁竞争）：本文件用真实 node:sqlite backup API，
//   真实客户端并发场景仍需手工；运行时缺 backup() 时该用例 skip 并写明原因；
// - backup_dsh 的 env 自动发现与真实 ~/.dsh profile：本文件显式指定临时 dshHome，不读取真实 DSH home。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { backupTools } from '../lib/tools/backup.js';
import { setConfig } from '../lib/services/config.js';
import { hashBytes } from '../lib/utils/hash.js';

const signal = () => new AbortController().signal;
const LEAK = 'api_key=sk-abcdefghijklmnop1234\n';

async function workspace(t, prefix = 'csrw-backup-tools-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const cleanup = [];
  t.after(async () => {
    for (const fn of cleanup) { try { await fn(); } catch { /* 清理失败不覆盖测试结论 */ } }
    await fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });
  await fs.mkdir(path.join(root, '.dsh-csrw'), { recursive: true });
  return { root, cleanup };
}

// 本机 DAV 桩：真实保存 PUT 内容并支持条件上传/回读校验，绝不连云端。
const davCtx = {
  get: key => key === 'credentials'
    ? { readRecord: async () => ({ kind: 'api-key', key: 'fixture-password', env: { NUTSTORE_USERNAME: 'fixture' } }) }
    : undefined,
};

async function davStub({ failWith = 0 } = {}) {
  const files = new Map();
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    calls.push({ method: req.method, path: name });
    if (failWith) { res.writeHead(failWith).end(); return; }
    if (req.method === 'MKCOL') { res.writeHead(201).end(); return; }
    if (req.method === 'GET') {
      if (!files.has(name)) { res.writeHead(404).end(); return; }
      const body = files.get(name);
      res.writeHead(200, { ETag: `"${hashBytes(body)}"`, 'Content-Length': body.length }).end(body);
      return;
    }
    if (req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const current = files.get(name);
      if ((req.headers['if-none-match'] === '*' && current)
        || (req.headers['if-match'] && current && req.headers['if-match'] !== `"${hashBytes(current)}"`)) {
        res.writeHead(412).end();
        return;
      }
      files.set(name, body);
      res.writeHead(201, { ETag: `"${hashBytes(body)}"` }).end();
      return;
    }
    if (req.method === 'PROPFIND') {
      const folder = name.endsWith('/') ? name : `${name}/`;
      const nodes = [`<d:response><d:href>${folder}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`];
      res.writeHead(207, { 'Content-Type': 'application/xml' }).end(`<d:multistatus xmlns:d="DAV:">${nodes.join('')}</d:multistatus>`);
      return;
    }
    res.writeHead(405).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${server.address().port}/dav/`,
    calls,
    files,
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}

function definitions(ctx = { get: () => undefined }) {
  const byName = Object.fromEntries(backupTools(ctx).map(d => [d.name, d]));
  return {
    byName,
    run: (name, args) => byName[`dsh_csrw_${name}`].execute(args, { signal: signal() }),
  };
}

function assertType(value, type, label) {
  if (!type || type === 'json') return;
  if (type === 'string') assert.equal(typeof value, 'string', `${label} must be string`);
  else if (type === 'integer') assert.ok(Number.isInteger(value), `${label} must be integer`);
  else if (type === 'boolean') assert.equal(typeof value, 'boolean', `${label} must be boolean`);
  else if (type === 'object') assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be object`);
  else if (type === 'array') assert.ok(Array.isArray(value), `${label} must be array`);
}

/** 运行时返回值必须符合 defineTool 转换后的 output schema：必填齐全、类型正确、render 一致。 */
function assertOutput(result, def, { extraKeys = [] } = {}) {
  const schema = def.output.schema;
  assert.equal(schema.type, 'object');
  assert.ok(result && typeof result === 'object' && !Array.isArray(result), `${def.name} must return an object`);
  for (const key of schema.required ?? []) assert.ok(Object.hasOwn(result, key), `${def.name} missing required output "${key}"`);
  for (const [key, spec] of Object.entries(schema.properties ?? {})) {
    if (Object.hasOwn(result, key)) assertType(result[key], spec.type, `${def.name}.${key}`);
  }
  if (schema.additionalProperties === false) {
    const allowed = new Set([...Object.keys(schema.properties ?? {}), ...extraKeys]);
    for (const key of Object.keys(result)) assert.ok(allowed.has(key), `${def.name} returns undeclared output "${key}"`);
  }
  const blocks = def.output.render({}, result);
  assert.equal(blocks.length, 1);
  assert.deepEqual(JSON.parse(blocks[0].text), result);
}

// services/nutstore.js 的返回值比 syncOut 声明多 3 个结构化字段；此处显式钉死集合，
// 新增任何未声明字段都会失败（schema 声明未同步的问题在交付中作为观察项上报，不放宽必填/类型断言）。
const SYNC_EXTRA_KEYS = ['pruned', 'total', 'processed'];
const manifest = snapshotPath => fs.readFile(path.join(snapshotPath, 'manifest.json'), 'utf8').then(JSON.parse);
const fileExists = async file => { try { await fs.access(file); return true; } catch { return false; } };

// ---------------------------------------------------------------- 快照类正向路径

test('backup_zotero：真实 SQLite backup API 正向执行，凭据路径被排除，输出符合 created schema', async t => {
  let sqlite;
  try { sqlite = await import('node:sqlite'); } catch (error) {
    t.skip(`node:sqlite unavailable (${error.code ?? error.message}); Zotero SQLite copy needs manual verification`);
    return;
  }
  if (typeof sqlite.backup !== 'function') {
    t.skip('node:sqlite backup() unavailable in this runtime; Zotero SQLite copy needs manual verification');
    return;
  }
  const { root, cleanup } = await workspace(t, 'csrw-backup-zotero-');
  const dataDir = path.join(root, 'zotero');
  await fs.mkdir(path.join(dataDir, 'styles'), { recursive: true });
  await fs.writeFile(path.join(dataDir, 'attachment.txt'), 'attachment');
  await fs.writeFile(path.join(dataDir, 'styles', 'apa.csl'), 'style');
  await fs.writeFile(path.join(dataDir, '.credentials.json'), 'private');
  const live = new sqlite.DatabaseSync(path.join(dataDir, 'zotero.sqlite'));
  cleanup.push(() => live.close());
  live.exec("CREATE TABLE items(id INTEGER, title TEXT); INSERT INTO items VALUES(1, 'committed')");

  const { byName, run } = definitions();
  const result = await run('backup_zotero', { workspace: root, dataDir });
  assertOutput(result, byName.dsh_csrw_backup_zotero);
  assert.equal(result.version, 1);
  assert.equal(result.roots.length, 1);
  assert.equal(result.roots[0].kind, 'zotero');
  const mf = await manifest(result.snapshotPath);
  const names = mf.files.map(f => f.path);
  assert.ok(names.includes('attachment.txt'));
  assert.ok(names.includes('styles/apa.csl'));
  assert.ok(names.includes('zotero.sqlite'));
  assert.ok(!names.some(n => /credentials|-wal|-shm/.test(n)), '凭据路径与 SQLite sidecar 不得进快照');
  const copy = new sqlite.DatabaseSync(path.join(result.snapshotPath, 'files', 'zotero', 'zotero.sqlite'), { readOnly: true });
  try {
    assert.equal(copy.prepare('SELECT title FROM items').get().title, 'committed');
    assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { copy.close(); }
  assert.equal(await fileExists(path.join(result.snapshotPath, 'files', 'zotero', '.credentials.json')), false);
});

test('backup_dsh：显式临时 dshHome 正向执行并排除 sessions/凭据，输出符合 created schema', async t => {
  const { root } = await workspace(t, 'csrw-backup-dsh-');
  const home = path.join(root, 'dsh-home');
  for (const dir of ['prompts', 'skills', 'sessions', 'storages']) await fs.mkdir(path.join(home, dir), { recursive: true });
  await fs.writeFile(path.join(home, 'prompts', 'system.md'), 'hello prompts');
  await fs.writeFile(path.join(home, 'skills', 'SKILL.md'), 'hello skills');
  await fs.writeFile(path.join(home, 'sessions', 'private.json'), 'session');
  await fs.writeFile(path.join(home, 'storages', 'data.json'), 'storage');
  await fs.writeFile(path.join(home, 'config.yml'), 'theme: dark');
  await fs.writeFile(path.join(home, 'prompts', '.credentials.txt'), 'private');

  const { byName, run } = definitions();
  const result = await run('backup_dsh', { workspace: root, dshHome: home });
  assertOutput(result, byName.dsh_csrw_backup_dsh);
  assert.equal(result.roots.map(r => r.id).includes('dsh-home'), true);
  const mf = await manifest(result.snapshotPath);
  const names = mf.files.map(f => f.path);
  assert.ok(names.includes('prompts/system.md'));
  assert.ok(names.includes('skills/SKILL.md'));
  assert.ok(names.includes('config.yml'));
  assert.ok(!names.some(n => /sessions|storages|credentials/i.test(n)), 'sessions/storages/凭据一律排除');
  assert.equal(await fileExists(path.join(result.snapshotPath, 'files', 'dsh-home', 'sessions', 'private.json')), false);
});

test('backup_workspace：正向备份 .dsh-csrw 配置与同步基线并排除 backups 自身', async t => {
  const { root } = await workspace(t, 'csrw-backup-workspace-');
  // 写精简配置而非 setConfig 的全量 DEFAULTS：后者含 "credentialKey": "..." 会命中既有的
  // SECRET 保守排除（快照按设计不落盘凭据类内容），那不是本用例要测的行为。
  await fs.writeFile(path.join(root, '.dsh-csrw', 'config.json'), JSON.stringify({ obsidian: { vaultPath: 'vault' } }));
  await fs.mkdir(path.join(root, '.dsh-csrw', 'sync'), { recursive: true });
  await fs.writeFile(path.join(root, '.dsh-csrw', 'sync', 'state.json'), '{}');

  const { byName, run } = definitions();
  const result = await run('backup_workspace', { workspace: root });
  assertOutput(result, byName.dsh_csrw_backup_workspace);
  assert.equal(result.roots[0].id, 'workspace');
  const mf = await manifest(result.snapshotPath);
  const names = mf.files.map(f => f.path);
  assert.ok(names.includes('config.json'));
  assert.ok(names.includes('sync/state.json'));
  assert.ok(!names.some(n => n.startsWith('backups/')), '备份目录自身不得被备份');
});

test('snapshot_create：明确选源后正向执行；敏感内容与 .env 只排除不落盘', async t => {
  const { root } = await workspace(t, 'csrw-snapshot-create-');
  const vault = path.join(root, 'vault');
  await fs.mkdir(path.join(vault, '.obsidian'), { recursive: true });
  await fs.writeFile(path.join(vault, 'note.md'), 'original');
  await fs.writeFile(path.join(vault, '.env'), 'UNLABELLED=private');
  await fs.writeFile(path.join(vault, 'leak.md'), LEAK);

  const { byName, run } = definitions();
  const result = await run('snapshot_create', { workspace: root, sources: ['obsidian'], vaultPath: 'vault' });
  assertOutput(result, byName.dsh_csrw_snapshot_create);
  assert.equal(result.files, 1);
  assert.equal(result.excluded, 1);
  assert.equal(result.roots[0].kind, 'obsidian');
  const mf = await manifest(result.snapshotPath);
  assert.equal(mf.version, 1);
  assert.deepEqual(mf.excluded, [{ source: 'obsidian', path: 'leak.md', reason: 'sensitive-content' }]);
  assert.deepEqual(mf.files.map(f => f.path), ['note.md']);
  for (const bad of ['.env', 'leak.md']) {
    assert.equal(await fileExists(path.join(result.snapshotPath, 'files', 'obsidian', bad)), false, `${bad} 不得落盘`);
  }
});

test('snapshot_verify：只读验证正向路径；篡改 payload 必须抛错而不是返回 verified:false', async t => {
  const { root } = await workspace(t, 'csrw-snapshot-verify-');
  const vault = path.join(root, 'vault');
  await fs.mkdir(vault, { recursive: true });
  await fs.writeFile(path.join(vault, 'note.md'), 'original');
  const { byName, run } = definitions();
  const created = await run('snapshot_create', { workspace: root, sources: ['obsidian'], vaultPath: 'vault' });

  const result = await run('snapshot_verify', { workspace: root, snapshotPath: created.snapshotPath });
  assertOutput(result, byName.dsh_csrw_snapshot_verify);
  assert.equal(result.verified, true);
  assert.equal(result.version, 1);
  assert.equal(result.files, 1);
  assert.equal(result.snapshotPath, created.snapshotPath);
  assert.equal(await fs.readFile(path.join(vault, 'note.md'), 'utf8'), 'original', 'verify 不得修改源');

  await fs.writeFile(path.join(created.snapshotPath, 'files', 'obsidian', 'note.md'), 'corrupt');
  await assert.rejects(run('snapshot_verify', { workspace: root, snapshotPath: created.snapshotPath }), /integrity mismatch/);
});

// ---------------------------------------------------------------- 上传 / 一键备份正向路径

test('backup_upload：本机 WebDAV mock 正向上传，输出符合 syncOut，凭据不落盘', async t => {
  const stub = await davStub();
  const { root } = await workspace(t, 'csrw-backup-upload-');
  try {
    await setConfig(root, 'nutstore.baseUrl', stub.url, signal());
    const base = path.join(root, '.dsh-csrw', 'backups');
    await fs.mkdir(base, { recursive: true });
    await fs.writeFile(path.join(base, 'a.md'), '# a\n');

    const { byName, run } = definitions(davCtx);
    const result = await run('backup_upload', { workspace: root });
    assertOutput(result, byName.dsh_csrw_backup_upload, { extraKeys: SYNC_EXTRA_KEYS });
    assert.equal(result.direction, 'push');
    assert.equal(result.source, path.resolve(base));
    assert.deepEqual(result.transferred, ['a.md']);
    assert.equal(result.secretsBlocked, 0);
    assert.equal(result.deletionsPropagated, false);
    assert.equal(stub.files.get('/dav/dsh-csrw/backups/a.md').toString('utf8'), '# a\n', 'PUT 必须真的把内容交给本机 mock');
    assert.ok(stub.calls.length > 0);
    // MKCOL 创建 remoteRoot 本身时路径是 /dav/dsh-csrw（无尾斜杠），其余都是其子路径。
    assert.ok(stub.calls.every(c => c.path === '/dav/dsh-csrw' || c.path.startsWith('/dav/dsh-csrw/')),
      '所有请求都必须落在本机 mock 的 remoteRoot 或其子路径下，不得连云端');
    for (const method of ['MKCOL', 'PUT', 'GET']) assert.ok(stub.calls.some(c => c.method === method), `缺少 ${method} 请求`);
    const configText = await fs.readFile(path.join(root, '.dsh-csrw', 'config.json'), 'utf8');
    assert.equal(configText.includes('fixture-password'), false, '凭据不得落盘');
  } finally { await stub.close(); }
});

test('backup_all：默认 local 目标只创建快照，输出结构完整且无伪装成功字段', async t => {
  const { root } = await workspace(t, 'csrw-backup-all-local-');
  const vault = path.join(root, 'vault');
  await fs.mkdir(vault, { recursive: true });
  await fs.writeFile(path.join(vault, 'note.md'), 'original');

  const { byName, run } = definitions();
  const result = await run('backup_all', { workspace: root, sources: ['obsidian'], vaultPath: 'vault' });
  assertOutput(result, byName.dsh_csrw_backup_all);
  for (const key of ['snapshotPath', 'files', 'excluded', 'pruned', 'roots']) {
    assert.ok(Object.hasOwn(result, key), `backup_all 缺少 ${key}`);
  }
  assert.equal(result.files, 1);
  assert.equal(result.roots.length, 1);
  assert.equal((await manifest(result.snapshotPath)).version, 1);
  for (const key of ['nutstore', 'github', 'nutstoreError', 'githubError']) {
    assert.equal(Object.hasOwn(result, key), false, `local 目标不得出现 ${key}`);
  }
});

test('backup_all：target=nutstore 分流到本机 mock，嵌套结果仍符合同步输出结构', async t => {
  const stub = await davStub();
  const { root } = await workspace(t, 'csrw-backup-all-nutstore-');
  try {
    await setConfig(root, 'nutstore.baseUrl', stub.url, signal());
    const vault = path.join(root, 'vault');
    await fs.mkdir(vault, { recursive: true });
    await fs.writeFile(path.join(vault, 'note.md'), 'original');

    const { byName, run } = definitions(davCtx);
    const result = await run('backup_all', { workspace: root, target: 'nutstore', sources: ['obsidian'], vaultPath: 'vault' });
    assertOutput(result, byName.dsh_csrw_backup_all);
    assert.ok(result.snapshotPath && (await manifest(result.snapshotPath)).version === 1);
    assert.equal(Object.hasOwn(result, 'nutstoreError'), false);
    assert.equal(Object.hasOwn(result, 'githubError'), false);
    assertOutput(result.nutstore, byName.dsh_csrw_backup_upload, { extraKeys: SYNC_EXTRA_KEYS });
    assert.equal(result.nutstore.direction, 'push');
    assert.ok(result.nutstore.transferred.length > 0);
    assert.ok(stub.calls.some(c => c.method === 'PUT'), '分流必须真的上传到本机 mock');
  } finally { await stub.close(); }
});

test('backup_all：单步失败不影响其余步骤，错误原样暴露而非包装成成功', async t => {
  const stub = await davStub({ failWith: 500 });
  const { root } = await workspace(t, 'csrw-backup-all-failure-');
  try {
    await setConfig(root, 'nutstore.baseUrl', stub.url, signal());
    await setConfig(root, 'nutstore.retry', 0, signal());
    await setConfig(root, 'nutstore.retryDelay', 0, signal());
    const vault = path.join(root, 'vault');
    await fs.mkdir(vault, { recursive: true });
    await fs.writeFile(path.join(vault, 'note.md'), 'original');

    const { byName, run } = definitions(davCtx);
    const result = await run('backup_all', { workspace: root, target: 'nutstore', sources: ['obsidian'], vaultPath: 'vault' });
    assertOutput(result, byName.dsh_csrw_backup_all);
    assert.equal((await manifest(result.snapshotPath)).version, 1, '本地快照必须仍然成功');
    assert.equal(typeof result.nutstoreError, 'string', '上传失败必须带错误消息');
    assert.match(result.nutstoreError, /WebDAV MKCOL failed: HTTP 500/);
    assert.equal(Object.hasOwn(result, 'nutstore'), false, '失败不得伪装成成功结果');
    assert.equal(Object.hasOwn(result, 'github'), false);
  } finally { await stub.close(); }
});

// ---------------------------------------------------------------- 保留数量与安全门

test('snapshot_prune：confirm:false 拒绝且零副作用；confirm:true 正向清理并保留 .pending/损坏目录', async t => {
  const { root } = await workspace(t, 'csrw-snapshot-prune-');
  const base = path.join(root, 'backups');
  const names = ['2026-01-01T00-00-00-000Z-old', '2026-01-02T00-00-00-000Z-mid', '2026-01-03T00-00-00-000Z-new'];
  for (const [i, name] of names.entries()) {
    await fs.mkdir(path.join(base, name), { recursive: true });
    await fs.writeFile(path.join(base, name, 'manifest.json'), JSON.stringify({ version: 1, id: name, createdAt: `2026-01-0${i + 1}T00:00:00.000Z`, sources: [], files: [], excluded: [] }));
  }
  await fs.mkdir(path.join(base, '.pending-unfinished'), { recursive: true });
  await fs.mkdir(path.join(base, 'no-manifest'), { recursive: true });
  const args = { workspace: root, backupDir: 'backups', keep: 1 };
  const { byName, run } = definitions();

  await assert.rejects(run('snapshot_prune', { ...args, confirm: false }), /Prune requires confirm:true/);
  assert.deepEqual((await fs.readdir(base)).sort(), [...names, '.pending-unfinished', 'no-manifest'].sort());

  const result = await run('snapshot_prune', { ...args, confirm: true });
  assertOutput(result, byName.dsh_csrw_snapshot_prune);
  assert.equal(result.kept, 1);
  assert.equal(result.pruned.length, 2);
  const left = (await fs.readdir(base)).sort();
  assert.deepEqual(left, ['.pending-unfinished', 'no-manifest', '2026-01-03T00-00-00-000Z-new'].sort());
});

test('安全护栏加强：恢复仍需 confirm、越界源仍需显式旗标，拒绝路径零副作用', async t => {
  const { root } = await workspace(t, 'csrw-backup-guards-');
  const vault = path.join(root, 'vault');
  await fs.mkdir(vault, { recursive: true });
  await fs.writeFile(path.join(vault, 'note.md'), 'original');
  const { run } = definitions();
  const created = await run('snapshot_create', { workspace: root, sources: ['obsidian'], vaultPath: 'vault' });
  await fs.writeFile(path.join(vault, 'note.md'), 'edited');

  await assert.rejects(
    run('snapshot_restore', { workspace: root, sources: ['obsidian'], vaultPath: 'vault', snapshotPath: created.snapshotPath }),
    error => error.code === 'INVALID_ARGS' && error.message.includes('confirm'),
  );
  await assert.rejects(
    run('snapshot_restore', { workspace: root, sources: ['obsidian'], vaultPath: 'vault', snapshotPath: created.snapshotPath, confirm: false }),
    /Restore requires confirm:true/,
  );
  assert.equal(await fs.readFile(path.join(vault, 'note.md'), 'utf8'), 'edited', '拒绝后不得写入源');

  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'csrw-backup-outside-'));
  t.after(async () => fs.rm(outside, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }));
  await fs.mkdir(path.join(outside, 'styles'), { recursive: true });
  await fs.writeFile(path.join(outside, 'styles', 'a.csl'), 'style');
  // 本用例前面已用 snapshot_create 生成过一个快照，故不能断言 backups 不存在；
  // 改为断言越界门之后快照集合不变（门在解析期抛，早于任何写）。
  const backupDir = path.join(root, '.dsh-csrw', 'backups');
  const before = (await fs.readdir(backupDir)).sort();
  await assert.rejects(
    run('backup_zotero', { workspace: root, dataDir: outside }),
    error => error.code === 'EXTERNAL_PATH_REQUIRED' && error.path === outside,
  );
  assert.deepEqual((await fs.readdir(backupDir)).sort(), before, '越界门不得产生新快照');
  assert.deepEqual((await fs.readdir(outside)).sort(), ['styles'], '外部源目录不得被写入');
});
