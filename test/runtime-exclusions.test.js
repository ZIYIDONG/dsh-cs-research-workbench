// 运行时状态文件（obsidian-index.json / nutstore.log）在「快照」与「坚果云同步」两侧的排除回归，
// 外加同步日志去标识化、4xx 显式状态。本次只新增用例：不改 lib/**、client.js、scripts/**、
// 既有测试的任何既有断言；所有断言都是加强型的回归护栏，不弱化安全约束。
//
// 隔离：坚果云用例各自独立 .test-artifacts/ 工作区 + 独立 127.0.0.1 临时端口 DAV mock，
//       快照 / 越界用例各自独立 os.tmpdir() 目录；t.after 统一回收 server 与目录。
//       凭据一律通过 ctx.get('credentials') 注入，不读写 process.env（因此无需还原，也不污染
//       共享全局状态）；不触碰真实 vault / Zotero 库 / 坚果云账号 / DSH profile / 远端仓库。
//       不依赖执行顺序：每个用例都能单独通过。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createSnapshot, verifySnapshot } from '../lib/services/snapshot.js';
import { backupTools } from '../lib/tools/backup.js';
import { nutstoreTools } from '../lib/tools/nutstore.js';
import { Dav, nutstoreLogs } from '../lib/services/nutstore.js';
import { setConfig } from '../lib/services/config.js';
import { hashBytes } from '../lib/utils/hash.js';
import { isRetryable } from '../lib/utils/retry.js';
import { createDavStub, basicAuth } from './fixtures/nutstore-dav.js';

const ARTIFACTS = path.resolve('.test-artifacts');
const signal = () => new AbortController().signal;
const CREDENTIALS = { kind: 'api-key', key: 'fixture-password', env: { NUTSTORE_USERNAME: 'fixture' } };
const RUNTIME_BASENAMES = ['obsidian-index.json', 'nutstore.log'];
const ERROR_KINDS = new Set(['auth-missing', 'auth-failed', 'forbidden', 'not-found', 'conflict', 'network', 'too-large', 'invalid-path', 'unknown']);

/** 独立工作区 + 独立 DAV mock；关掉重试退避，避免用例之间互相影响。 */
async function setup(t) {
  await fs.mkdir(ARTIFACTS, { recursive: true });
  const stub = await createDavStub();
  t.after(() => stub.close());
  const workspace = await fs.mkdtemp(path.join(ARTIFACTS, 'runtime-exclusions-'));
  t.after(() => fs.rm(workspace, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }));
  await setConfig(workspace, 'nutstore.baseUrl', stub.url, signal());
  await setConfig(workspace, 'nutstore.retry', 0, signal());
  await setConfig(workspace, 'nutstore.retryDelay', 1, signal());
  const ctx = { get: key => key === 'credentials' ? { readRecord: async () => CREDENTIALS } : undefined };
  const defs = Object.fromEntries([...nutstoreTools(ctx), ...backupTools(ctx)].map(def => [def.name, def]));
  const exec = (name, args = {}) => defs[name].execute({ workspace, ...args }, { signal: signal() });
  return {
    workspace,
    stub,
    push: args => exec('dsh_csrw_nutstore_push', args),
    upload: args => exec('dsh_csrw_backup_upload', args),
    list: args => exec('dsh_csrw_nutstore_list', args),
    connTest: args => exec('dsh_csrw_nutstore_test', args),
  };
}

async function writeFiles(root, files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, ...relative.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
}

async function logEntries(workspace) {
  const file = path.join(workspace, '.dsh-csrw/logs/nutstore.log');
  const text = await fs.readFile(file, 'utf8');
  const fromFile = text.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const fromService = await nutstoreLogs(workspace, 50, signal());
  assert.deepEqual(fromService.map(e => e.at).sort(), fromFile.map(e => e.at).sort(), '工具读数必须与日志文件一致');
  return { text, entries: fromFile };
}

// ---------------------------------------------------------------- 1/4 workspace 源快照

test('运行时排除 1/4：workspace 快照 files 不含两个运行时文件、含 config.json，excluded 记 runtime-state 且不落盘', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-csrw-runtime-snapshot-'));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }));
  const cfg = path.join(root, '.dsh-csrw');
  await fs.mkdir(path.join(cfg, 'logs'), { recursive: true });
  // 精简合法配置：不命中 SECRET 保守排除，也不引入未知 section。
  await fs.writeFile(path.join(cfg, 'config.json'), JSON.stringify({ obsidian: { trashDir: '.trash' } }));
  // 内容里刻意带本机绝对路径元数据：这类文件按设计连内容都不该进快照。
  await fs.writeFile(path.join(cfg, 'obsidian-index.json'), JSON.stringify({ vault: 'C:/Users/someone/vault', notes: [] }));
  await fs.writeFile(path.join(cfg, 'logs', 'nutstore.log'), JSON.stringify({ root: 'C:/Users/someone' }) + '\n');

  const snap = await createSnapshot(root, { sources: ['workspace'], backupDir: path.join(root, 'backups') }, signal());
  const manifest = JSON.parse(await fs.readFile(path.join(snap.snapshotPath, 'manifest.json'), 'utf8'));
  const files = manifest.files.map(f => f.path);

  assert.ok(files.includes('config.json'), '正常 config.json 必须照常备份');
  assert.ok(!files.includes('obsidian-index.json'), 'obsidian-index.json 不得进 manifest.files');
  assert.ok(!files.includes('logs/nutstore.log'), 'logs/nutstore.log 不得进 manifest.files');
  assert.ok(!files.some(p => RUNTIME_BASENAMES.includes(path.posix.basename(p))), '任意层级的运行时 basename 都不得进 files');
  assert.equal(files.length, 1);

  assert.equal(manifest.excluded.length, 2, '运行时文件必须显式留痕，而不是静默丢弃');
  assert.deepEqual(
    manifest.excluded.map(e => `${e.source}|${e.path}|${e.reason}`).sort(),
    ['workspace|logs/nutstore.log|runtime-state', 'workspace|obsidian-index.json|runtime-state'].sort(),
  );
  for (const entry of manifest.excluded) {
    assert.deepEqual(Object.keys(entry).sort(), ['path', 'reason', 'source'], 'excluded 元素形如 {source,path,reason}');
    assert.equal(entry.source, 'workspace');
    assert.equal(entry.reason, 'runtime-state');
  }

  const payload = path.join(snap.snapshotPath, 'files', 'workspace');
  assert.equal(await fs.readFile(path.join(payload, 'config.json'), 'utf8'), JSON.stringify({ obsidian: { trashDir: '.trash' } }));
  for (const rel of ['obsidian-index.json', 'logs/nutstore.log']) {
    await assert.rejects(fs.stat(path.join(payload, ...rel.split('/'))), /ENOENT/, `${rel} 不得落盘`);
  }
  assert.equal(snap.excluded, 2);
  assert.equal(snap.files, 1);
  const verified = await verifySnapshot(snap.snapshotPath, signal());
  assert.equal(verified.verified, true);
  assert.equal(verified.files, 1);
});

// ---------------------------------------------------------------- 2/4 坚果云 push / backup_upload / Dav.list

test('运行时排除 2/4：nutstore_push 的 walk 过滤两个运行时文件，transferred 与远端 PUT 路径都不含它们', async t => {
  const { workspace, stub, push } = await setup(t);
  const source = path.join(workspace, 'source');
  await writeFiles(source, {
    'obsidian-index.json': JSON.stringify({ vault: 'C:/Users/someone/vault' }),
    'logs/nutstore.log': '{"root":"C:/Users/someone"}\n',
    'notes/ok.md': 'ok',
  });

  const result = await push({ localPath: 'source' });
  assert.deepEqual(result.transferred, ['notes/ok.md']);
  assert.ok(!result.transferred.some(p => RUNTIME_BASENAMES.includes(path.posix.basename(p))));

  const putPaths = stub.requests.filter(r => r.method === 'PUT').map(r => decodeURIComponent(r.pathname));
  assert.ok(putPaths.some(p => p.endsWith('/notes/ok.md')), '正常文件必须真的 PUT 到本机 mock');
  assert.ok(!putPaths.some(p => RUNTIME_BASENAMES.includes(path.posix.basename(p))), 'PUT 路径不得出现运行时文件');
  assert.ok(!stub.requests.some(r => /obsidian-index\.json|nutstore\.log/.test(decodeURIComponent(r.pathname))), '任何请求路径都不得带这两个文件名');
  assert.equal(stub.read('notes/ok.md').toString(), 'ok');
  assert.equal(stub.read('obsidian-index.json'), null);
  assert.equal(stub.read('logs/nutstore.log'), null);
});

test('运行时排除 2/4：backup_upload 从默认备份目录上传时同样过滤两个运行时文件', async t => {
  const { workspace, stub, upload } = await setup(t);
  const base = path.join(workspace, '.dsh-csrw', 'backups');
  await writeFiles(base, {
    'obsidian-index.json': '{"vault":"C:/Users/someone/vault"}',
    'logs/nutstore.log': '{"root":"C:/Users/someone"}\n',
    'snapshot/manifest.json': '{"version":1}',
  });

  // 省略 localPath：走 config.backup.localDir 派生路径，验证该路径也在 walk 排除之内。
  const result = await upload();
  assert.equal(result.direction, 'push');
  assert.equal(result.source, path.resolve(base));
  assert.deepEqual(result.transferred, ['snapshot/manifest.json']);
  assert.ok(!result.transferred.some(p => RUNTIME_BASENAMES.includes(path.posix.basename(p))));

  const putPaths = stub.requests.filter(r => r.method === 'PUT').map(r => decodeURIComponent(r.pathname));
  assert.ok(putPaths.some(p => p.endsWith('/backups/snapshot/manifest.json')), '正常快照元数据必须真的上传');
  assert.ok(!putPaths.some(p => RUNTIME_BASENAMES.includes(path.posix.basename(p))), 'PUT 路径不得出现运行时文件');
  assert.ok(!stub.requests.some(r => /obsidian-index\.json|nutstore\.log/.test(decodeURIComponent(r.pathname))), '任何请求路径都不得带这两个文件名');
  assert.equal(stub.read('backups/snapshot/manifest.json').toString(), '{"version":1}');
  assert.equal(stub.read('backups/obsidian-index.json'), null);
  assert.equal(stub.read('backups/logs/nutstore.log'), null);
});

test('运行时排除 2/4：Dav.list 过滤远端同名 obsidian-index.json 与 logs/nutstore.log，正常文件保留', async t => {
  const { stub, list } = await setup(t);
  stub.seed('obsidian-index.json', 'index');
  stub.seed('readme.md', 'readme');
  stub.seed('logs/nutstore.log', 'log');
  stub.seed('logs/session.txt', 'session');

  const top = await list();
  assert.ok(!top.entries.some(e => e.path === 'obsidian-index.json'), '远端根的运行时索引必须被过滤');
  assert.deepEqual(top.entries.filter(e => !e.directory).map(e => e.path).sort(), ['readme.md']);
  assert.ok(top.entries.some(e => e.directory && e.path === 'logs'));

  const nested = await list({ remotePath: 'logs' });
  assert.ok(!nested.entries.some(e => RUNTIME_BASENAMES.includes(path.posix.basename(e.path))), '子目录里的 nutstore.log 也必须被过滤');
  assert.deepEqual(nested.entries.filter(e => !e.directory).map(e => e.path).sort(), ['logs/session.txt']);
});

// ---------------------------------------------------------------- 3/4 日志去标识化

test('运行时排除 3/4：成功与 ok:false 失败日志的 root 为工作区相对路径，不含绝对路径/盘符/凭据，error 只取 kind', async t => {
  const { workspace, stub, push } = await setup(t);
  const source = path.join(workspace, 'source');
  await writeFiles(source, { 'a.md': 'A' });

  await push({ localPath: 'source' });
  stub.state.forbid = true; // 403 让第二次 push 失败，留下 ok:false 日志
  await assert.rejects(push({ localPath: 'source' }), /403/, '403 不得被包装成成功返回');

  const { text, entries } = await logEntries(workspace);
  assert.ok(entries.length >= 2);
  const ok = entries.filter(e => e.ok !== false);
  const failed = entries.filter(e => e.ok === false);
  assert.ok(ok.length >= 1, '必须留一条成功记录');
  assert.equal(failed.length, 1, '失败必须留一条 ok:false 记录');

  for (const entry of entries) {
    assert.equal(entry.root, 'source', '工作区内必须是 workspace 相对路径');
    assert.equal(path.isAbsolute(entry.root), false);
    assert.ok(!/^[A-Za-z]:/.test(entry.root), 'root 不得含盘符');
    assert.ok(!entry.root.includes(workspace), 'root 不得含本机工作区绝对路径');
  }
  assert.ok(ERROR_KINDS.has(failed[0].error), 'error 只能取 classifyError 的 kind 枚举');
  assert.match(failed[0].error, /^[a-z-]+$/);
  assert.ok(!/WebDAV|HTTP|\d{3}|connection failed/i.test(failed[0].error), 'error 不得回显原始错误消息');
  assert.equal(failed[0].ok, false);
  assert.equal(failed[0].direction, 'push');
  for (const field of ['transferred', 'skipped', 'conflicts', 'pruned']) {
    assert.equal(typeof failed[0][field], 'number', `失败记录 ${field} 必须与成功记录同构`);
  }

  assert.ok(!text.includes('fixture-password'), '日志不得含应用密码');
  assert.ok(!text.includes(basicAuth('fixture', 'fixture-password')), '日志不得含 Basic 凭据');
  assert.ok(!/Authorization|Basic\s/i.test(text), '日志不得含 Authorization / Basic 字样');
  assert.ok(!text.includes(workspace), '日志不得含本机工作区绝对路径');
  assert.ok(!/[A-Za-z]:[\\/]/.test(text), '日志不得含盘符路径');
});

test('运行时排除 3/4：越界 localPath 的日志 root 退化为 12 位短标识，成功/失败同构且不含凭据', async t => {
  const { workspace, stub, push } = await setup(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-csrw-runtime-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }));
  await writeFiles(outside, { 'a.md': 'A' });

  await push({ localPath: outside, confirmExternalPath: true });
  stub.state.forbid = true;
  await assert.rejects(push({ localPath: outside, confirmExternalPath: true }), /403/);

  const token = hashBytes(path.resolve(workspace, outside)).slice(0, 12);
  const { text, entries } = await logEntries(workspace);
  const ok = entries.filter(e => e.ok !== false);
  const failed = entries.filter(e => e.ok === false);
  assert.ok(ok.length >= 1);
  assert.equal(failed.length, 1);

  for (const entry of entries) {
    assert.equal(entry.root, token, '越界必须退化为 hashBytes(root).slice(0,12)');
    assert.match(entry.root, /^[0-9a-f]{12}$/);
    assert.equal(path.isAbsolute(entry.root), false);
    assert.ok(!/^[A-Za-z]:/.test(entry.root), 'root 不得含盘符');
    assert.ok(!entry.root.includes(outside), 'root 不得回显越界目录');
  }
  assert.equal(ok.find(e => e.direction === 'push').root, failed[0].root, '成功与失败两条日志必须同构');
  assert.ok(ERROR_KINDS.has(failed[0].error));
  assert.match(failed[0].error, /^[a-z-]+$/);
  assert.ok(!text.includes('fixture-password'));
  assert.ok(!text.includes(basicAuth('fixture', 'fixture-password')));
  assert.ok(!/Authorization|Basic\s/i.test(text));
  assert.ok(!text.includes(workspace));
  assert.ok(!text.includes(outside), '日志不得含越界绝对路径');
  assert.ok(!/[A-Za-z]:[\\/]/.test(text));
});

// ---------------------------------------------------------------- 4/4 4xx 显式状态

test('运行时排除 4/4：Dav.request 的 403 带 status、isRetryable=false、请求只发 1 次（对照 429/5xx 仍可重试）', async t => {
  const { stub } = await setup(t);
  stub.state.forbid = true;
  // 故意给足重试次数：4xx 仍必须一次即止，证明不是靠 retry:0 掩盖。
  const dav = new Dav({ baseUrl: stub.url, remoteRoot: 'dsh-csrw', retry: 3, retryDelay: 1 }, 'fixture', 'fixture-password', signal());

  await assert.rejects(dav.request('PROPFIND', '', { headers: { Depth: '0' } }), err => {
    assert.equal(err.status, 403, '4xx 错误对象必须带 status');
    assert.match(err.message, /403/);
    assert.equal(isRetryable(err), false, '4xx 不得判为可重试');
    return true;
  });
  assert.equal(stub.requests.length, 1, '4xx 请求只发 1 次');
  assert.equal(stub.requests[0].method, 'PROPFIND');
  // 对照：429 / 5xx 仍可重试（自动重试路径由既有 test/retry.test.js
  // 'isRetryable classifies network/5xx but not 4xx' 与 test/nutstore-plan.test.js TC-06 覆盖）。
  assert.equal(isRetryable(Object.assign(new Error('HTTP 429'), { status: 429 })), true);
  assert.equal(isRetryable(Object.assign(new Error('HTTP 503'), { status: 503 })), true);
});

test('运行时排除 4/4：工具级 401 透传 status 到错误对象、不可重试、请求只发 1 次', async t => {
  const { stub, connTest } = await setup(t);
  stub.state.authReject = true;

  await assert.rejects(connTest(), err => {
    assert.equal(err.status, 401, '工具层错误必须保留底层 status');
    assert.match(err.message, /auth-failed/);
    assert.equal(isRetryable(err), false);
    return true;
  });
  assert.equal(stub.requests.length, 1, '401 请求只发 1 次');
  assert.equal(stub.requests[0].authMatches, true, '401 来自 mock 注入，凭据本身正确');
});
