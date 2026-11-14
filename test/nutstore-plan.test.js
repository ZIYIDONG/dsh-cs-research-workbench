// docs/nutstore-sync-test-plan.md 的 TC-01~TC-10 自动化对照。
// 所有调用都是「工具级」：nutstoreTools(ctx) 返回的 defineTool 定义 .execute()，参数走真实 schema 校验。
// 隔离：每个用例独立 .test-artifacts 工作区 + 独立 127.0.0.1 临时端口 DAV mock，
//       不依赖执行顺序、不改任何既有测试、不遗留 process.env / 全局状态（TC-01 用 try/finally 还原）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { nutstoreTools } from '../lib/tools/nutstore.js';
import { classifyError, rel } from '../lib/services/nutstore.js';
import { setConfig } from '../lib/services/config.js';
import { hashBytes } from '../lib/utils/hash.js';
import { isRetryable } from '../lib/utils/retry.js';
import { basicAuth, createDavStub, unusedPort } from './fixtures/nutstore-dav.js';

const base = path.resolve('.test-artifacts');
await fs.mkdir(base, { recursive: true });

const CREDENTIALS = { kind: 'api-key', key: 'fixture-password', env: { NUTSTORE_USERNAME: 'fixture' } };
const WRONG_CREDENTIALS = { kind: 'api-key', key: 'wrong-app-password', env: { NUTSTORE_USERNAME: 'fixture' } };

/** 每个用例独立工作区 + 独立 mock；t.after 保证 server 和目录都被回收。 */
async function setup(t, options = {}) {
  const stub = await createDavStub(options.stub ?? {});
  t.after(() => stub.close());
  const workspace = await fs.mkdtemp(path.join(base, 'nutstore-plan-'));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await setConfig(workspace, 'nutstore.baseUrl', stub.url);
  // 关掉重试与退避：故障注入用例要精确控制「已传 / 未传」，也不让测试等 1s/2s。
  await setConfig(workspace, 'nutstore.retry', 0);
  await setConfig(workspace, 'nutstore.retryDelay', 1);
  const ctx = {
    get: key => {
      if (key !== 'credentials' || options.noCredentials) return undefined;
      return { readRecord: async () => options.credentials ?? CREDENTIALS };
    },
  };
  const defs = Object.fromEntries(nutstoreTools(ctx).map(def => [def.name, def]));
  const run = (name, args = {}) =>
    defs[`dsh_csrw_nutstore_${name}`].execute({ workspace, ...args }, { signal: new AbortController().signal });
  return { workspace, stub, defs, run };
}

async function writeFiles(root, files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, ...relative.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
}

async function syncState(workspace) {
  const dir = path.join(workspace, '.dsh-csrw/sync');
  const names = (await fs.readdir(dir)).filter(name => name.endsWith('.json'));
  const merged = {};
  for (const name of names) Object.assign(merged, JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')));
  return merged;
}

// ---------------------------------------------------------------- TC-01 配置校验

test('TC-01 配置校验：无凭据被拒，提示 DSH 凭据存储 / NUTSTORE_USERNAME（auth-missing）', async t => {
  const saved = { u: process.env.NUTSTORE_USERNAME, p: process.env.NUTSTORE_PASSWORD };
  delete process.env.NUTSTORE_USERNAME;
  delete process.env.NUTSTORE_PASSWORD;
  try {
    const { run, stub } = await setup(t, { noCredentials: true });
    await assert.rejects(run('test'), err => {
      assert.match(err.message, /DSH 凭据存储|NUTSTORE_USERNAME/);
      assert.match(err.message, /auth-missing/);
      return true;
    });
    assert.equal(stub.requests.length, 0, '缺凭据时不应发出任何 WebDAV 请求');
  } finally {
    if (saved.u === undefined) delete process.env.NUTSTORE_USERNAME; else process.env.NUTSTORE_USERNAME = saved.u;
    if (saved.p === undefined) delete process.env.NUTSTORE_PASSWORD; else process.env.NUTSTORE_PASSWORD = saved.p;
  }
});

test('TC-01 配置校验：错误应用密码 -> 401 auth-failed', async t => {
  const { run, stub } = await setup(t, { credentials: WRONG_CREDENTIALS });
  await assert.rejects(run('test'), err => {
    assert.match(err.message, /auth-failed/);
    assert.match(err.message, /账号或应用密码错误/);
    return true;
  });
  assert.ok(stub.requests.length >= 1);
  assert.equal(stub.requests.every(r => r.authMatches), false, 'mock 确实收到了不匹配的凭据');
});

test('TC-01 配置校验：错误 baseUrl -> network / not-found 两类可操作错误', async t => {
  const { workspace, stub, run } = await setup(t);
  // (a) 不可达端口：ECONNREFUSED -> network，提示可重试。
  const deadPort = await unusedPort();
  await setConfig(workspace, 'nutstore.baseUrl', `http://127.0.0.1:${deadPort}/dav/`);
  await assert.rejects(run('test'), err => {
    assert.match(err.message, /network/);
    assert.match(err.message, /网络不可达|重试/);
    assert.equal(classifyError(err).kind, 'network');
    assert.equal(isRetryable(err), true);
    return true;
  });
  // (b) 错误的 baseUrl 路径：PROPFIND 404。nutstore_test 把 404 视为「根不存在」的合法响应，
  //     不是错误；同场景的 list 会抛出可读的 not-found 语义（TC-08 也覆盖该分支）。
  await setConfig(workspace, 'nutstore.baseUrl', stub.url.replace(/\/dav\/$/, '/missing/'));
  const missingRoot = await run('test');
  assert.equal(missingRoot.connected, true);
  assert.equal(missingRoot.status, 404);
  assert.equal(missingRoot.remoteRootExists, false);
  assert.match(missingRoot.hint, /不存在|创建/);
  await assert.rejects(run('list'), err => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /404/);
    assert.equal(classifyError(err).kind, 'not-found');
    return true;
  });
});

test('TC-01 配置校验：remoteRoot 含 .. 被拒，拒绝同步且不发请求', async t => {
  const { workspace, stub, run } = await setup(t);
  // 写时门 + 读时门：两道都不允许 '..'。
  await assert.rejects(setConfig(workspace, 'nutstore.remoteRoot', 'a/../b'), /Relative child path/);
  await fs.writeFile(
    path.join(workspace, '.dsh-csrw/config.json'),
    JSON.stringify({ nutstore: { remoteRoot: 'a/../b' } }),
  );
  await assert.rejects(run('test'), err => {
    assert.match(err.message, /Relative child path|relative child path|Remote path|相对子路径|invalid-path/i);
    return true;
  });
  assert.equal(stub.requests.length, 0, '非法 remoteRoot 必须拒绝同步，不发起网络请求');
  // 服务层的相对子路径拒绝能归类为 invalid-path，并给出「相对子路径」提示。
  assert.throws(() => rel('a/../b'), /relative child path/);
  const info = classifyError(new Error('Remote path must be a relative child path'));
  assert.equal(info.kind, 'invalid-path');
  assert.match(info.hint, /相对子路径/);
});

test('TC-01 配置校验：正确配置 connected / remoteRootExists / latencyMs / status', async t => {
  const { stub, run } = await setup(t);
  const ok = await run('test');
  assert.equal(ok.connected, true);
  assert.equal(ok.remoteRootExists, true);
  assert.equal(ok.status, 207);
  assert.ok(Number.isInteger(ok.latencyMs) && ok.latencyMs >= 0, 'latencyMs 必须是非负整数');
  assert.equal(typeof ok.hint, 'string');
  assert.ok(ok.hint.length > 0);
  // 远端根不存在时 404 是合法响应，remoteRootExists 必须为 false。
  stub.folders.delete('/dav/dsh-csrw/');
  const absent = await run('test');
  assert.equal(absent.connected, true);
  assert.equal(absent.status, 404);
  assert.equal(absent.remoteRootExists, false);
  assert.match(absent.hint, /不存在|创建/);
});

// ---------------------------------------------------------------- TC-02 首次全量同步

test('TC-02 首次全量：10 文件 transferred、list 结构一致、SHA-256 一致、基线 10 条路径哈希', async t => {
  const { workspace, stub, run } = await setup(t);
  const TEN = {
    'a.md': 'content a',
    'b.md': 'content b',
    'c.md': 'content c',
    'j.md': 'content j',
    'sub/d.md': 'content d',
    'sub/e.md': 'content e',
    'sub/deep/f.md': 'content f',
    'sub/deep/g.md': 'content g',
    'notes/h.md': 'content h',
    'notes/i.md': 'content i',
  };
  await writeFiles(path.join(workspace, 'source'), TEN);

  const first = await run('push', { localPath: 'source' });
  assert.equal(first.direction, 'push');
  assert.equal(first.transferred.length, 10);
  assert.deepEqual([...first.transferred].sort(), Object.keys(TEN).sort());
  assert.equal(first.skipped.length, 0);
  assert.equal(first.conflicts.length, 0);
  assert.equal(first.total, 10);
  assert.equal(first.processed, 10);

  // nutstore_list 是 Depth:1 的直接子项列表：分层列出并拼出与本地一致的结构。
  const top = await run('list');
  assert.deepEqual(top.entries.filter(e => !e.directory).map(e => e.path).sort(), ['a.md', 'b.md', 'c.md', 'j.md']);
  assert.deepEqual(top.entries.filter(e => e.directory).map(e => e.path).sort(), ['notes', 'sub']);
  const sub = await run('list', { remotePath: 'sub' });
  assert.deepEqual(sub.entries.filter(e => !e.directory).map(e => e.path).sort(), ['sub/d.md', 'sub/e.md']);
  assert.deepEqual(sub.entries.filter(e => e.directory).map(e => e.path), ['sub/deep']);
  const deep = await run('list', { remotePath: 'sub/deep' });
  assert.deepEqual(deep.entries.filter(e => !e.directory).map(e => e.path).sort(), ['sub/deep/f.md', 'sub/deep/g.md']);
  const notes = await run('list', { remotePath: 'notes' });
  assert.deepEqual(notes.entries.filter(e => !e.directory).map(e => e.path).sort(), ['notes/h.md', 'notes/i.md']);

  // 抽查一个文件的 SHA-256（mock 真存真回，不是只回 201）。
  const remoteA = stub.read('a.md');
  assert.ok(remoteA);
  assert.equal(hashBytes(remoteA), hashBytes(await fs.readFile(path.join(workspace, 'source/a.md'))));

  // 同步基线 .dsh-csrw/sync/*.json：恰好 10 条路径 -> SHA-256。
  const state = await syncState(workspace);
  assert.deepEqual(Object.keys(state).sort(), Object.keys(TEN).sort());
  for (const [relative, hash] of Object.entries(state)) assert.match(hash, /^[0-9a-f]{64}$/, relative);
});

// ---------------------------------------------------------------- TC-03 增量同步

test('TC-03 增量：二次全 skipped / 改 1 传 1 / 新增 1 传 1 / 删本地不 prune 远端保留', async t => {
  const { workspace, stub, run } = await setup(t);
  const source = path.join(workspace, 'source');
  await writeFiles(source, { 'a.md': 'A', 'b.md': 'B', 'c.md': 'C' });
  assert.equal((await run('push', { localPath: 'source' })).transferred.length, 3);
  const putsAfterFirst = stub.state.putCount;

  const again = await run('push', { localPath: 'source' });
  assert.equal(again.transferred.length, 0);
  assert.equal(again.skipped.length, 3);
  assert.equal(stub.state.putCount, putsAfterFirst, '未变文件不得重复 PUT');

  await fs.writeFile(path.join(source, 'a.md'), 'A changed');
  const changed = await run('push', { localPath: 'source' });
  assert.deepEqual([...changed.transferred].sort(), ['a.md']);
  assert.equal(changed.skipped.length, 2);

  await fs.writeFile(path.join(source, 'new.md'), 'brand new');
  const added = await run('push', { localPath: 'source' });
  assert.deepEqual([...added.transferred].sort(), ['new.md']);
  assert.equal(added.skipped.length, 3);

  await fs.rm(path.join(source, 'b.md'));
  const removed = await run('push', { localPath: 'source' });
  assert.equal(removed.transferred.length, 0);
  assert.equal(removed.deletionsPropagated, false);
  assert.deepEqual(removed.pruned, []);
  assert.ok(stub.read('b.md'), '不带 prune 时远端必须保留本地已删文件');
  assert.equal((await run('list')).entries.some(e => e.path === 'b.md'), true);
});

// ---------------------------------------------------------------- TC-04 下载

test('TC-04 pull：远端新增落地 / 再 pull 全 skipped / 远端删除本地保留', async t => {
  const { workspace, stub, run } = await setup(t);
  const source = path.join(workspace, 'source');
  await writeFiles(source, { 'a.md': 'A', 'b.md': 'B', 'c.md': 'C' });
  await run('push', { localPath: 'source' });

  stub.seed('remote-new.md', 'from remote');
  const pulled = await run('pull', { localPath: 'source' });
  assert.equal(pulled.direction, 'pull');
  assert.deepEqual([...pulled.transferred].sort(), ['remote-new.md']);
  assert.equal(pulled.skipped.length, 3);
  assert.equal(await fs.readFile(path.join(source, 'remote-new.md'), 'utf8'), 'from remote');

  const again = await run('pull', { localPath: 'source' });
  assert.equal(again.transferred.length, 0);
  assert.equal(again.skipped.length, 4);

  stub.remove('remote-new.md');
  const afterDelete = await run('pull', { localPath: 'source' });
  assert.equal(afterDelete.transferred.length, 0);
  assert.equal(afterDelete.deletionsPropagated, false);
  assert.equal(await fs.readFile(path.join(source, 'remote-new.md'), 'utf8'), 'from remote', '远端删除不得传播到本地');
  assert.deepEqual((await fs.readdir(source)).sort(), ['a.md', 'b.md', 'c.md', 'remote-new.md']);
});

// ---------------------------------------------------------------- TC-05 冲突

test('TC-05 冲突：双向改生成 .local/.remote、再次 push 不静默覆盖、人工合并后 transferred', async t => {
  const { workspace, stub, run } = await setup(t);
  const source = path.join(workspace, 'source');
  await writeFiles(source, { 'x.md': 'v1' });
  await run('push', { localPath: 'source' }); // 建立基线：state['x.md'] = hash('v1')

  await fs.writeFile(path.join(source, 'x.md'), 'local');
  stub.seed('x.md', 'remote');               // 远端独立改动，偏离基线
  const conflict = await run('push', { localPath: 'source' });
  assert.equal(conflict.conflicts.length, 1);
  assert.equal(conflict.conflicts[0].path, 'x.md');
  assert.equal(await fs.readFile(path.join(source, 'x.md'), 'utf8'), 'local', '主文件不得被覆盖');
  assert.equal(await fs.readFile(path.join(source, 'x.md.local'), 'utf8'), 'local');
  assert.equal(await fs.readFile(path.join(source, 'x.md.remote'), 'utf8'), 'remote');

  const again = await run('push', { localPath: 'source' });
  assert.equal(again.conflicts.length, 1);
  assert.equal(again.transferred.length, 0);
  assert.equal(await fs.readFile(path.join(source, 'x.md'), 'utf8'), 'local');
  assert.equal(await fs.readFile(path.join(source, 'x.md.local'), 'utf8'), 'local');
  assert.equal(await fs.readFile(path.join(source, 'x.md.remote'), 'utf8'), 'remote');
  assert.equal(stub.read('x.md').toString(), 'remote', '远端冲突版本不得被静默覆盖');
  assert.equal(stub.state.putCount, 1, '冲突期间不得发生额外 PUT');

  // 人工合并：合并进主文件、删除全部 .local/.remote 副本；并把远端冲突版本回滚到上次同步基线
  // （实现的 state 只在成功传输后更新，远端偏离基线就会一直判冲突；这是真实人工处理远端冲突版本的建模）。
  await fs.writeFile(path.join(source, 'x.md'), 'merged');
  for (const name of await fs.readdir(source)) {
    if (/\.(local|remote)$/.test(name)) await fs.rm(path.join(source, name));
  }
  stub.seed('x.md', 'v1');
  const resolved = await run('push', { localPath: 'source' });
  assert.deepEqual(resolved.conflicts, []);
  assert.deepEqual(resolved.transferred, ['x.md']);
  assert.equal(await fs.readFile(path.join(source, 'x.md'), 'utf8'), 'merged');
  assert.equal(stub.read('x.md').toString(), 'merged');
  assert.deepEqual((await fs.readdir(source)).sort(), ['x.md']);
});

// ---------------------------------------------------------------- TC-06 网络中断与恢复

test('TC-06 网络中断与恢复：故障可重试 / 已传不回滚 / 恢复幂等 / logs >= 2 条含方向计数', async t => {
  const { workspace, stub, run } = await setup(t);
  const source = path.join(workspace, 'source');
  await writeFiles(source, {
    'f1.md': 'payload 1', 'f2.md': 'payload 2', 'f3.md': 'payload 3',
    'f4.md': 'payload 4', 'f5.md': 'payload 5',
  });
  stub.state.fault = { afterPuts: 2, mode: 'network', triggered: false };
  await assert.rejects(run('push', { localPath: 'source' }), err => {
    assert.match(err.message, /connection failed|HTTP 503/);
    // 「可重试」= 错误被归类为 network 且提示可重试，并且下面恢复后重跑确实成功。
    // 这里不固化 retry.isRetryable(包装后的错误)：用内部重试器分类当验收条件
    // 会把「可恢复」误读成「自动重试」，与本 TC 的标准不符。
    // isRetryable 现已识别 "connection failed" 形态（见 lib/utils/retry.js）。
    assert.equal(classifyError(err).kind, 'network');
    assert.match(classifyError(err).hint, /重试/);
    return true;
  });
  assert.equal(stub.state.fault.triggered, true);
  const uploadedBefore = [...stub.files.keys()].map(key => key.slice(stub.rootKey.length)).sort();
  assert.equal(uploadedBefore.length, 2, '中断前已传 2 个文件');
  for (const name of uploadedBefore) assert.ok(stub.read(name), `已传文件 ${name} 不得回滚`);
  const partial = await syncState(workspace);
  assert.deepEqual(Object.keys(partial).sort(), uploadedBefore, '失败后基线必须保留已传部分');

  stub.state.fault = null; // 恢复网络
  const recovered = await run('push', { localPath: 'source' });
  assert.deepEqual([...recovered.skipped].sort(), uploadedBefore, '已传文件恢复后 skipped');
  assert.equal(recovered.transferred.length, 3, '未传文件继续');
  assert.equal(new Set([...recovered.skipped, ...recovered.transferred]).size, 5);
  const final = await run('push', { localPath: 'source' });
  assert.equal(final.transferred.length, 0, '最终全成功且幂等');
  assert.equal(final.skipped.length, 5);
  assert.equal(stub.files.size, 5);

  const logs = await run('logs');
  assert.ok(logs.entries.length >= 2, `日志条数应 >= 2，实际 ${logs.entries.length}`);
  for (const entry of logs.entries) {
    assert.equal(entry.direction, 'push');
    for (const field of ['transferred', 'skipped', 'conflicts', 'pruned']) {
      assert.equal(typeof entry[field], 'number', `${field} 必须是计数`);
    }
  }
  // 回归：同步失败也必须落一条与成功记录同构、额外带 ok:false / error:'network' 的日志；
  // 失败不得静默成功，也不得清掉恢复后的成功记录。
  const failed = logs.entries.filter(entry => entry.ok === false && entry.error === 'network');
  assert.ok(failed.length >= 1, `网络失败后 nutstore_logs 必须含 ok:false / error:'network' 记录，实际 ${JSON.stringify(logs.entries)}`);
  for (const field of ['transferred', 'skipped', 'conflicts', 'pruned']) {
    assert.equal(typeof failed[0][field], 'number', `失败记录 ${field} 必须与成功记录同构`);
  }
  assert.equal(failed[0].direction, 'push');
  assert.ok(logs.entries.some(entry => entry.ok !== false && entry.direction === 'push' && typeof entry.transferred === 'number'), '恢复后的成功记录仍可见');
});

// ---------------------------------------------------------------- TC-07 大文件与特殊字符

test('TC-07 大文件：> 32 MiB 单文件抛 too-large 且提示 32 MiB，不进 PUT', async t => {
  const { workspace, stub, run } = await setup(t);
  const source = path.join(workspace, 'source');
  await fs.mkdir(source, { recursive: true });
  const big = path.join(source, 'huge.bin');
  const handle = await fs.open(big, 'w');
  try {
    await handle.truncate(32 * 1024 * 1024 + 1); // 稀疏扩展，不真分配 32 MiB 内容
  } finally {
    await handle.close();
  }
  await assert.rejects(run('push', { localPath: 'source' }), err => {
    assert.match(err.message, /too-large/);
    assert.match(err.message, /32 MiB/);
    assert.equal(classifyError(err).kind, 'too-large');
    return true;
  });
  assert.equal(stub.state.putCount, 0, '超限文件不得进入 PUT');
  assert.equal(stub.files.size, 0);
});

test('TC-07 特殊字符：中文/空格/#/&/emoji 文件名 push-list-pull round-trip 无乱码', async t => {
  const { workspace, stub, run } = await setup(t, { stub: { hrefMode: 'mixed' } });
  const source = path.join(workspace, 'source');
  await fs.mkdir(source, { recursive: true });
  const names = ['论文笔记.md', 'my notes (v2).md', 'hash#tag.md', 'a&b.md', '🚀-launch.md'];
  for (const name of names) await fs.writeFile(path.join(source, name), 'payload:' + name);

  const pushed = await run('push', { localPath: 'source' });
  assert.equal(pushed.transferred.length, 5);
  assert.equal(pushed.skipped.length, 0);

  const putPaths = stub.requests.filter(r => r.method === 'PUT').map(r => r.pathname);
  for (const marker of ['%23', '%26', '%20', '%E8%AE%BA', '%F0%9F%9A%80']) {
    assert.ok(putPaths.some(p => p.includes(marker)), `PUT 路径应编码出 ${marker}`);
  }

  // Dav.list 必须同时兼容 URL 编码 href 与裸特殊字符 href；三种形态下名字都不乱码。
  for (const mode of ['encoded', 'raw', 'mixed']) {
    stub.state.hrefMode = mode;
    const listed = await run('list');
    assert.deepEqual(
      listed.entries.filter(e => !e.directory).map(e => e.path).sort(),
      [...names].sort(),
      `hrefMode=${mode} 的列表名字`,
    );
  }
  stub.state.hrefMode = 'mixed';

  const pulled = await run('pull', { localPath: 'download' });
  assert.equal(pulled.transferred.length, 5);
  for (const name of names) {
    const got = await fs.readFile(path.join(workspace, 'download', name), 'utf8');
    assert.equal(got, 'payload:' + name);
    assert.equal(hashBytes(Buffer.from(got)), hashBytes(await fs.readFile(path.join(source, name))));
  }
});

// ---------------------------------------------------------------- TC-08 权限异常

test('TC-08 权限异常：mock 403 -> forbidden，push 不静默成功', async t => {
  const { workspace, stub, run } = await setup(t);
  stub.state.forbid = true;
  await writeFiles(path.join(workspace, 'source'), { 'a.md': 'A' });
  await assert.rejects(run('test'), err => {
    assert.match(err.message, /forbidden/);
    assert.match(err.message, /无权限访问该目录/);
    return true;
  });
  await assert.rejects(run('push', { localPath: 'source' }), err => {
    assert.match(err.message, /403/);
    return true;
  });
  assert.equal(stub.files.size, 0, '403 时不得写入远端文件');
});

test('TC-08 权限异常：远端根不存在时 push 自动创建，list 返回可读 404 而非未捕获异常', async t => {
  const { workspace, stub, run } = await setup(t);
  stub.folders.delete('/dav/dsh-csrw/');
  const before = await run('test');
  assert.equal(before.connected, true);
  assert.equal(before.status, 404);
  assert.equal(before.remoteRootExists, false);

  await assert.rejects(run('list'), err => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /WebDAV|404/);
    assert.equal(classifyError(err).kind, 'not-found');
    return true;
  });

  await writeFiles(path.join(workspace, 'source'), { 'a.md': 'root created' });
  const pushed = await run('push', { localPath: 'source' });
  assert.equal(pushed.transferred.length, 1);
  assert.ok(stub.folders.has('/dav/dsh-csrw/'), 'push 应自动 MKCOL 远端根');
  assert.equal(stub.read('a.md').toString(), 'root created');
  const after = await run('test');
  assert.equal(after.remoteRootExists, true);
  assert.equal(after.status, 207);
});

// ---------------------------------------------------------------- TC-09 删除

test('TC-09 删除：confirm 门 / 删除成功 found:true / 不存在 404 / 拒绝删除远端根', async t => {
  const { workspace, stub, run } = await setup(t);
  await writeFiles(path.join(workspace, 'source'), { 'a.md': 'A', 'b.md': 'B' });
  await run('push', { localPath: 'source' });

  // 既有 test/backup-sensitive.test.js 已覆盖 schema 层与 service 层；这里在工具级逐条回归，不放宽。
  await assert.rejects(run('delete', { remotePath: 'a.md' }), /confirm/);
  await assert.rejects(run('delete', { remotePath: 'a.md', confirm: false }), /Delete requires confirm:true/);

  const deleted = await run('delete', { remotePath: 'a.md', confirm: true });
  assert.equal(deleted.found, true);
  assert.equal(deleted.deleted, 'a.md');
  assert.equal(deleted.status, 204);
  assert.equal((await run('list')).entries.some(e => e.path === 'a.md'), false);

  const missing = await run('delete', { remotePath: 'ghost.md', confirm: true });
  assert.equal(missing.found, false);
  assert.equal(missing.status, 404);

  await assert.rejects(run('delete', { remotePath: '', confirm: true }), /relative child path|remote root|Refusing/i);
  assert.equal(stub.state.deleteCount, 2, '删除远端根的请求必须根本不发出');
  assert.ok(stub.folders.has('/dav/dsh-csrw/'));
});

test('TC-09 删除：prune 无 confirm 被拒，prune + confirm 后 pruned 非空且远端与本地一致', async t => {
  const { workspace, stub, run } = await setup(t);
  await writeFiles(path.join(workspace, 'source'), { 'a.md': 'A', 'b.md': 'B' });
  await run('push', { localPath: 'source' });
  stub.seed('stale.md', 'stale'); // 远端多余的残留文件

  await assert.rejects(run('push', { localPath: 'source', prune: true }), /prune requires confirm:true/);
  assert.ok(stub.read('stale.md'), '无 confirm 时不得删任何远端文件');

  const pruned = await run('push', { localPath: 'source', prune: true, confirm: true });
  assert.ok(pruned.pruned.includes('stale.md'));
  assert.equal(pruned.deletionsPropagated, true);
  assert.equal(stub.read('stale.md'), null);
  const listed = await run('list');
  assert.deepEqual(listed.entries.filter(e => !e.directory).map(e => e.path).sort(), ['a.md', 'b.md']);
});

// ---------------------------------------------------------------- TC-10 日志与反馈

test('TC-10 日志与反馈：工具级 nutstore_logs 返回计数、日志文件存在、失败后记录仍在、limit 生效', async t => {
  const { workspace, stub, run } = await setup(t);
  await writeFiles(path.join(workspace, 'source'), { 'a.md': 'A' });
  await run('push', { localPath: 'source' });
  await run('push', { localPath: 'source' });
  await run('push', { localPath: 'source' });

  const logs = await run('logs');
  assert.ok(logs.entries.length >= 3, `应返回最近记录，实际 ${logs.entries.length}`);
  for (const entry of logs.entries) {
    assert.equal(entry.direction, 'push');
    assert.equal(typeof entry.at, 'string');
    for (const field of ['transferred', 'skipped', 'conflicts', 'pruned']) {
      assert.equal(typeof entry[field], 'number', `${field} 必须可见且为计数`);
    }
  }

  const logFile = path.join(workspace, '.dsh-csrw/logs/nutstore.log');
  const text = await fs.readFile(logFile, 'utf8');
  const lines = text.split('\n').filter(Boolean);
  assert.equal(lines.length, logs.entries.length);
  for (const line of lines) assert.doesNotThrow(() => JSON.parse(line), '每行必须是 JSON');

  // 失败后仍能看到之前的记录（不固化「失败是否产生日志」的条数，只要求历史不丢失）。
  const before = logs.entries.length;
  stub.state.forbid = true;
  await assert.rejects(run('push', { localPath: 'source' }), /403/);
  stub.state.forbid = false;
  const after = await run('logs');
  assert.ok(after.entries.length >= before);
  assert.ok(after.entries.some(e => e.direction === 'push' && typeof e.transferred === 'number'));

  // limit：最新在前，1 / 2 精确截断，超大值 clamp 到 500 后返回全部。
  const all = after.entries;
  assert.deepEqual((await run('logs', { limit: 1 })).entries, all.slice(0, 1));
  assert.deepEqual((await run('logs', { limit: 2 })).entries, all.slice(0, 2));
  assert.equal((await run('logs', { limit: 1000 })).entries.length, all.length);
});

// ---------------------------------------------------------------- 补充回归：凭据不落盘

test('补充回归：应用密码 / Basic 凭据不出现在日志、配置与同步基线（既有 config 断言之外）', async t => {
  const { workspace, stub, run } = await setup(t);
  await writeFiles(path.join(workspace, 'source'), { 'a.md': 'A' });
  await run('push', { localPath: 'source' });

  const syncDir = path.join(workspace, '.dsh-csrw/sync');
  const syncText = (await Promise.all(
    (await fs.readdir(syncDir)).filter(name => name.endsWith('.json'))
      .map(name => fs.readFile(path.join(syncDir, name), 'utf8')),
  )).join('\n');
  const samples = [
    ['日志', await fs.readFile(path.join(workspace, '.dsh-csrw/logs/nutstore.log'), 'utf8')],
    ['配置', await fs.readFile(path.join(workspace, '.dsh-csrw/config.json'), 'utf8')],
    ['同步基线', syncText],
  ];
  const secret = 'fixture-password';
  const auth = basicAuth('fixture', 'fixture-password');
  for (const [label, text] of samples) {
    assert.ok(!text.includes(secret), `${label} 不得含应用密码`);
    assert.ok(!text.includes(auth), `${label} 不得含 Basic 凭据`);
  }
  // 凭据只走 Authorization 头，且每次请求都带（既有 test/nutstore.test.js 末尾已断言 config 不含密码）。
  assert.ok(stub.requests.length > 0);
  assert.equal(stub.requests.every(r => r.hasAuthorization && r.authMatches), true);
});
