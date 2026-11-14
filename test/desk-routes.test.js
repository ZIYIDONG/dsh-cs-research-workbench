// 工作台 8 个 HTTP 路由的 handler 级回归：响应体 + 安全边界。
// 通过 registerDesk 暴露的真实 handler 驱动（fake ctx / req / res），不启 Web 服务、不连网络。
// 每个用例独立 $DSH_HOME 临时目录（Store 真实落盘），try/finally 还原，不依赖执行顺序、不遗留全局状态。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { registerDesk, requestRejection } from '../lib/desk/host.js';
import { API_PREFIX, ROUTES, DATA_DIR } from '../lib/desk/ids.js';
import { Store } from '../lib/desk/store.js';

const MAX_JSON = 4_000_000;

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    headersSent: false,
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    end(chunk) { this.body = chunk; this.headersSent = true; },
  };
}

function makeReq({ route = '', method = 'GET', headers = {}, body = '' } = {}) {
  const chunks = body === undefined || body === '' ? [] : [Buffer.isBuffer(body) ? body : Buffer.from(body)];
  return {
    url: `${API_PREFIX}/${route}`,
    method,
    headers,
    async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk; },
  };
}

async function call(handler, options = {}) {
  const res = makeRes();
  await handler(makeReq(options), res);
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.ok(typeof res.body === 'string', 'handler 必须结束响应');
  return { status: res.statusCode, body: JSON.parse(res.body), raw: res.body };
}

/** 用条件注入拿到 registerDesk 注册的真实 handler。 */
function mount({ llm, reject = () => 0 } = {}) {
  const routes = [];
  const scoped = {
    webServer: { register: (route) => { routes.push(route); return () => {}; } },
    effect: (fn) => fn(),
  };
  const ctx = {
    inject: (deps, callback) => { assert.deepEqual(deps, ['webServer']); callback(scoped); },
    get: (name) => {
      if (name === 'connection') return { requestRejection: reject };
      if (name === 'llm') return llm;
      if (name === 'webServer') return scoped.webServer;
      return undefined;
    },
  };
  assert.equal(registerDesk(ctx), true);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].kind, 'prefix');
  assert.equal(routes[0].path, API_PREFIX);
  assert.equal(typeof routes[0].handler, 'function');
  return routes[0].handler;
}

/** 每个用例独立临时目录；DSH_HOME 用 try/finally 还原，Store 指向真实目录。 */
async function withDesk(options, fn) {
  if (typeof options === 'function') { fn = options; options = {}; }
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'csrw-routes-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = dir;
  try {
    const handler = mount(options);
    const store = new Store();
    await store.read(); // 触发 seed 落盘，保证 root 目录存在
    assert.equal(store.root, path.join(dir, DATA_DIR));
    return await fn({ handler, store, root: store.root, dir });
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const fakeLlm = () => ({
  prepareCall: async () => ({ stream: () => (async function* () { yield { type: 'text-delta', text: '模型回答' }; })() }),
  listProviders: () => [{ id: 'mock', name: 'Mock' }],
  listModels: async () => [{ id: 'mock-1', name: 'Mock 1' }],
});

// ---------------------------------------------------------------- GET state

test('GET state：字段齐全，无 llm 时 modelOk=false / canUndo=false', async () => {
  await withDesk(async ({ handler }) => {
    const { status, body } = await call(handler, { route: ROUTES.state });
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(body).sort(), ['canUndo', 'model', 'modelOk', 'state']);
    assert.equal(body.canUndo, false);
    assert.equal(body.model, null);
    assert.equal(body.modelOk, false);
    assert.equal(body.state.todos.length, 6);
    assert.equal(body.state.settings.language, 'zh');
  });
});

test('GET state：有 llm 但未选模型 → modelOk=false', async () => {
  await withDesk({ llm: fakeLlm() }, async ({ handler }) => {
    const { body } = await call(handler, { route: ROUTES.state });
    assert.equal(body.modelOk, false);
    assert.equal(body.model, null);
  });
});

test('GET state：有 llm + 已选模型 → modelOk=true、model 回显', async () => {
  await withDesk({ llm: fakeLlm() }, async ({ handler }) => {
    const posted = await call(handler, { route: ROUTES.settings, method: 'POST', body: JSON.stringify({ assistant: { provider: 'mock', model: 'mock-1' } }) });
    assert.equal(posted.status, 200);
    const { body } = await call(handler, { route: ROUTES.state });
    assert.equal(body.modelOk, true);
    assert.deepEqual(body.model, { provider: 'mock', model: 'mock-1' });
    assert.deepEqual(body.state.settings.assistant, { provider: 'mock', model: 'mock-1' });
  });
});

// ---------------------------------------------------------------- GET backups

test('GET backups：快照目录不存在 → 空数组', async () => {
  await withDesk(async ({ handler, root }) => {
    assert.equal(await fs.stat(path.join(root, 'backups')).then(() => true, () => false), false, '前置条件：本次没有快照目录');
    const { status, body } = await call(handler, { route: ROUTES.backups });
    assert.equal(status, 200);
    assert.deepEqual(body, { snapshots: [] });
  });
});

test('GET backups：含 manifest.json 的快照返回正确字段', async () => {
  await withDesk(async ({ handler, root }) => {
    const snap = path.join(root, 'backups', 'snap-a');
    await fs.mkdir(snap, { recursive: true });
    await fs.writeFile(path.join(snap, 'manifest.json'), JSON.stringify({
      id: 'snap-a', createdAt: '2025-01-02T00:00:00.000Z',
      sources: [{ kind: 'vault' }, { kind: 'state' }],
      files: [{ path: 'a.md' }, { path: 'b.md' }], excluded: ['secret.env'],
    }));
    const { status, body } = await call(handler, { route: ROUTES.backups });
    assert.equal(status, 200);
    assert.deepEqual(body, { snapshots: [{
      id: 'snap-a', createdAt: '2025-01-02T00:00:00.000Z',
      sources: ['vault', 'state'], files: 2, excluded: 1,
    }] });
  });
});

test('GET backups：损坏 manifest 与隐藏目录跳过，按 createdAt 倒序', async () => {
  await withDesk(async ({ handler, root }) => {
    const base = path.join(root, 'backups');
    for (const [name, createdAt] of [['snap-old', '2024-01-01T00:00:00.000Z'], ['snap-new', '2025-06-01T00:00:00.000Z']]) {
      await fs.mkdir(path.join(base, name), { recursive: true });
      await fs.writeFile(path.join(base, name, 'manifest.json'), JSON.stringify({ id: name, createdAt, sources: [], files: [], excluded: [] }));
    }
    await fs.mkdir(path.join(base, 'snap-broken'), { recursive: true });
    await fs.writeFile(path.join(base, 'snap-broken', 'manifest.json'), '{not-json');
    await fs.mkdir(path.join(base, '.hidden'), { recursive: true });
    await fs.writeFile(path.join(base, '.hidden', 'manifest.json'), JSON.stringify({ id: 'hidden' }));
    const { status, body } = await call(handler, { route: ROUTES.backups });
    assert.equal(status, 200);
    assert.deepEqual(body.snapshots.map(row => row.id), ['snap-new', 'snap-old']);
  });
});

// ---------------------------------------------------------------- GET models

test('GET models：llm 缺失 → ok:false / 空目录 / selected:null', async () => {
  await withDesk(async ({ handler }) => {
    const { status, body } = await call(handler, { route: ROUTES.models });
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: false, models: [], providers: [], selected: null });
  });
});

test('GET models：llm 可用时返回 provider/model 目录与已选模型', async () => {
  await withDesk({ llm: fakeLlm() }, async ({ handler }) => {
    await call(handler, { route: ROUTES.settings, method: 'POST', body: JSON.stringify({ assistant: { provider: 'mock', model: 'mock-1' } }) });
    const { status, body } = await call(handler, { route: ROUTES.models });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(body.providers, [{ id: 'mock', name: 'Mock' }]);
    assert.deepEqual(body.models, [{ provider: 'mock', providerName: 'Mock', id: 'mock-1', name: 'Mock 1' }]);
    assert.deepEqual(body.selected, { provider: 'mock', model: 'mock-1' });
  });
});

// ---------------------------------------------------------------- GET/POST settings

test('GET/POST settings：读写 language / dockOpen / assistant / vaultSync，lastSyncAt 不可伪造', async () => {
  await withDesk(async ({ handler }) => {
    const read = await call(handler, { route: ROUTES.settings });
    assert.equal(read.status, 200);
    assert.deepEqual(read.body, { language: 'zh', assistant: null });
    const written = await call(handler, {
      route: ROUTES.settings, method: 'POST',
      body: JSON.stringify({
        language: 'en', dockOpen: false,
        assistant: { provider: 'mock', model: 'mock-1' },
        vaultSync: { ideasDir: '/tmp/ideas', notesDir: '/tmp/notes', lastSyncAt: 999999 },
      }),
    });
    assert.equal(written.status, 200);
    assert.equal(written.body.settings.language, 'en');
    assert.equal(written.body.settings.dockOpen, false);
    assert.deepEqual(written.body.settings.assistant, { provider: 'mock', model: 'mock-1' });
    assert.equal(written.body.settings.vaultSync.ideasDir, '/tmp/ideas');
    assert.equal(written.body.settings.vaultSync.notesDir, '/tmp/notes');
    assert.equal(written.body.settings.vaultSync.lastSyncAt, 0, 'lastSyncAt 只能由同步流程写，不接受客户端伪造');
    const state = await call(handler, { route: ROUTES.state });
    assert.equal(state.body.state.settings.language, 'en');
    assert.equal(state.body.state.settings.dockOpen, false);
    assert.deepEqual(state.body.state.settings.vaultSync, { ideasDir: '/tmp/ideas', notesDir: '/tmp/notes', lastSyncAt: 0 });
  });
});

test('POST settings：非法类型被忽略，assistant:null 清空选择', async () => {
  await withDesk(async ({ handler }) => {
    const good = await call(handler, { route: ROUTES.settings, method: 'POST', body: JSON.stringify({ language: 'en', dockOpen: false, assistant: { provider: 'mock', model: 'mock-1' }, vaultSync: { ideasDir: '/a', notesDir: '/b' } }) });
    assert.equal(good.status, 200);
    const bad = await call(handler, { route: ROUTES.settings, method: 'POST', body: JSON.stringify({ language: 42, dockOpen: 'yes', assistant: 7, vaultSync: 'nope' }) });
    assert.equal(bad.status, 200);
    assert.deepEqual(bad.body.settings, good.body.settings, '非法类型必须全部被忽略');
    const cleared = await call(handler, { route: ROUTES.settings, method: 'POST', body: JSON.stringify({ assistant: null }) });
    assert.equal(cleared.body.settings.assistant, null);
    assert.equal(cleared.body.settings.language, 'en');
    const empty = await call(handler, { route: ROUTES.settings, method: 'POST', body: JSON.stringify({ assistant: { provider: '  ', model: 'mock-1' } }) });
    assert.equal(empty.body.settings.assistant, null, '空 provider 不能污染模型选择');
  });
});

// ---------------------------------------------------------------- POST ops / undo

test('POST ops：applyOps 生效、errors 回传、canUndo=true', async () => {
  await withDesk(async ({ handler }) => {
    const { status, body } = await call(handler, {
      route: ROUTES.ops, method: 'POST',
      body: JSON.stringify({ label: '加任务', undoable: true, ops: [
        { op: 'add_item', kind: 'todo', title: '路由新增任务' },
        { op: 'add_item', kind: 'todo', title: '   ' },
        { op: 'set_status', kind: 'todo', id: '不存在', status: 'done' },
      ] }),
    });
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(body).sort(), ['canUndo', 'errors', 'receipts', 'state']);
    assert.equal(body.receipts.length, 1);
    assert.equal(body.receipts[0].kind, 'todo');
    assert.ok(body.errors.some(e => /标题不能为空/.test(e)), '空标题必须报错');
    assert.ok(body.errors.some(e => /不存在/.test(e)), '不存在的 id 必须报错');
    assert.equal(body.state.todos.length, 7);
    assert.equal(body.state.todos[0].title, '路由新增任务');
    assert.equal(body.canUndo, true);
  });
});

test('POST ops：undoable:false 不占撤销位', async () => {
  await withDesk(async ({ handler }) => {
    const { body } = await call(handler, { route: ROUTES.ops, method: 'POST', body: JSON.stringify({ undoable: false, ops: [{ op: 'add_item', kind: 'todo', title: '不撤销' }] }) });
    assert.equal(body.state.todos.length, 7);
    assert.equal(body.canUndo, false);
    const undo = await call(handler, { route: ROUTES.undo, method: 'POST' });
    assert.equal(undo.body.label, null);
    assert.equal(undo.body.state.todos.length, 7);
  });
});

test('POST undo：撤销后 state 回滚、canUndo 正确、空栈返回 null', async () => {
  await withDesk(async ({ handler }) => {
    const added = await call(handler, { route: ROUTES.ops, method: 'POST', body: JSON.stringify({ label: '加任务', ops: [{ op: 'add_item', kind: 'todo', title: '待撤销' }] }) });
    assert.equal(added.body.state.todos.length, 7);
    assert.equal(added.body.canUndo, true);
    const undone = await call(handler, { route: ROUTES.undo, method: 'POST' });
    assert.equal(undone.status, 200);
    assert.equal(undone.body.label, '加任务');
    assert.equal(undone.body.state.todos.length, 6);
    assert.equal(undone.body.state.todos.some(row => row.title === '待撤销'), false);
    assert.equal(undone.body.canUndo, false);
    const empty = await call(handler, { route: ROUTES.undo, method: 'POST' });
    assert.equal(empty.body.label, null);
    assert.equal(empty.body.canUndo, false);
  });
});

// ---------------------------------------------------------------- POST chat

test('POST chat：查询类本地规则回复、engine=local、不写入条目', async () => {
  await withDesk(async ({ handler }) => {
    const { status, body } = await call(handler, { route: ROUTES.chat, method: 'POST', body: JSON.stringify({ message: '今天' }) });
    assert.equal(status, 200);
    assert.equal(body.reply.engine, 'local');
    assert.match(body.reply.text, /待推进/);
    assert.deepEqual(body.errors, []);
    assert.equal(body.state.todos.length, 6);
    assert.equal(body.state.chat.length, 2);
    assert.equal(body.state.chat[0].role, 'user');
    assert.equal(body.state.chat[1].role, 'assistant');
    assert.equal(body.state.chat[1].engine, 'local');
    const empty = await call(handler, { route: ROUTES.chat, method: 'POST', body: JSON.stringify({ message: '   ' }) });
    assert.equal(empty.status, 400, '空消息必须拒绝');
  });
});

test('POST chat：普通消息由本地规则建任务、engine=local', async () => {
  await withDesk(async ({ handler }) => {
    const { status, body } = await call(handler, { route: ROUTES.chat, method: 'POST', body: JSON.stringify({ message: '读 KAN 论文并做笔记' }) });
    assert.equal(status, 200);
    assert.equal(body.reply.engine, 'local');
    assert.match(body.reply.text, /已记下/);
    assert.equal(body.receipts.length, 1);
    assert.deepEqual(body.errors, []);
    assert.equal(body.state.todos.length, 7);
    assert.equal(body.state.todos[0].title, '读 KAN 论文并做笔记');
    assert.equal(body.state.chat.length, 2);
  });
});

test('POST chat：模型抛错降级为 local、modelText 清空、失败可见且不静默成功', async () => {
  const llm = {
    prepareCall: async () => ({ stream: () => (async function* () {
      yield { type: 'text-delta', text: '__MODEL_LEAK__' };
      throw new Error('mock model failure');
    })() }),
    listProviders: () => [],
    listModels: async () => [],
  };
  await withDesk({ llm }, async ({ handler }) => {
    await call(handler, { route: ROUTES.settings, method: 'POST', body: JSON.stringify({ assistant: { provider: 'mock', model: 'mock-1' } }) });
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
    let res;
    try {
      res = await call(handler, { route: ROUTES.chat, method: 'POST', body: JSON.stringify({ message: '总结进展' }) });
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(res.status, 200);
    assert.equal(res.body.reply.engine, 'local', '模型失败不得伪装成 model 引擎成功');
    assert.ok(!res.body.reply.text.includes('__MODEL_LEAK__'), '抛错前产生的模型文本必须被清空');
    assert.match(res.body.reply.text, /已记下/, '降级后仍由本地规则给出可见回复');
    assert.equal(res.body.state.chat.length, 2);
    assert.equal(res.body.state.chat[1].engine, 'local');
    assert.ok(warnings.some(line => line.includes('assistant model failed') && line.includes('mock model failure')),
      `失败必须可见，实际 warnings=${JSON.stringify(warnings)}`);
    assert.equal(res.body.reply.engine === 'model', false, '不得把失败包装成成功返回');
  });
});

// ---------------------------------------------------------------- POST vault-sync

test('POST vault-sync：缺 ideasDir/notesDir → 400，不触碰任何目录', async () => {
  await withDesk(async ({ handler }) => {
    for (const payload of [{}, { ideasDir: 123, notesDir: null }, { ideasDir: '', notesDir: '' }]) {
      const { status, body } = await call(handler, { route: ROUTES.vaultSync, method: 'POST', body: JSON.stringify(payload) });
      assert.equal(status, 400);
      assert.match(body.error, /未指定同步目录/);
    }
  });
});

// ---------------------------------------------------------------- 安全边界

test('requestRejection：无 connection 返回 403，0/null 放行，401 原样透传', () => {
  assert.equal(requestRejection({ get: () => undefined }, { headers: {} }), 403);
  assert.equal(requestRejection({ get: () => ({ requestRejection: () => 0 }) }, { headers: { a: 'b' } }), 0);
  assert.equal(requestRejection({ get: () => ({ requestRejection: () => null }) }, { headers: {} }), null);
  assert.equal(requestRejection({ get: () => ({ requestRejection: () => 401 }) }, { headers: {} }), 401);
});

test('安全：requestRejection 返回 401/403 时 handler 直接拒绝且不进入 route', async () => {
  for (const status of [401, 403]) {
    let calls = 0;
    const reject = ({ headers }) => { calls += 1; assert.ok(headers && typeof headers === 'object', 'headers 必须透传'); return calls === 1 ? status : 0; };
    await withDesk({ reject }, async ({ handler }) => {
      const denied = await call(handler, { route: ROUTES.state, headers: { 'x-probe': String(status) } });
      assert.equal(denied.status, status);
      assert.deepEqual(denied.body, { error: '未授权' });
    });
    assert.equal(calls, 1);
  }
  // 不进入 route：被拒的写请求不得产生任何状态变更
  let gate = 403;
  const reject = ({ headers }) => { assert.ok(headers); return gate; };
  await withDesk({ reject }, async ({ handler }) => {
    const denied = await call(handler, { route: ROUTES.ops, method: 'POST', headers: { 'x-probe': 'denied' }, body: JSON.stringify({ ops: [{ op: 'add_item', kind: 'todo', title: '不该被创建' }] }) });
    assert.equal(denied.status, 403);
    gate = 0;
    const state = await call(handler, { route: ROUTES.state });
    assert.equal(state.status, 200);
    assert.equal(state.body.state.todos.length, 6, '被 403 拒绝的请求不能进入 route 写状态');
    assert.equal(state.body.canUndo, false);
  });
});

test('安全：5 个写路由在 cross-site 下全部 403，且不产生副作用', async () => {
  const writes = [ROUTES.vaultSync, ROUTES.settings, ROUTES.ops, ROUTES.undo, ROUTES.chat];
  // vault-sync 用空 body：即使护栏失效也只会得到 400，不会写任何真实目录。
  const payloads = {
    [ROUTES.vaultSync]: {},
    [ROUTES.settings]: {},
    [ROUTES.ops]: { ops: [{ op: 'add_item', kind: 'todo', title: '跨站不该创建' }] },
    [ROUTES.undo]: {},
    [ROUTES.chat]: { message: '跨站不该记下' },
  };
  await withDesk(async ({ handler }) => {
    for (const route of writes) {
      const { status, body } = await call(handler, { route, method: 'POST', headers: { 'sec-fetch-site': 'cross-site' }, body: JSON.stringify(payloads[route]) });
      assert.equal(status, 403, `${route} 必须拒绝跨站写请求`);
      assert.match(body.error, /拒绝跨站请求/);
    }
    const state = await call(handler, { route: ROUTES.state });
    assert.equal(state.body.state.todos.length, 6);
    assert.equal(state.body.state.chat.length, 0);
    assert.equal(state.body.state.settings.language, 'zh');
    assert.equal(state.body.canUndo, false);
    // 护栏不能被写成「所有写请求都拒绝」：同站仍放行。
    const ok = await call(handler, { route: ROUTES.ops, method: 'POST', headers: { 'sec-fetch-site': 'same-origin' }, body: JSON.stringify({ ops: [{ op: 'add_item', kind: 'todo', title: '同站放行' }] }) });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.state.todos.length, 7);
  });
});

test('安全：body 超过 4 MB → 413（恰好 4 MB 不超限）', async () => {
  await withDesk(async ({ handler }) => {
    const tooBig = await call(handler, { route: ROUTES.ops, method: 'POST', body: Buffer.alloc(MAX_JSON + 1, 0x61) });
    assert.equal(tooBig.status, 413);
    assert.match(tooBig.body.error, /内容太大/);
    const exactly = await call(handler, { route: ROUTES.ops, method: 'POST', body: Buffer.alloc(MAX_JSON, 0x61) });
    assert.notEqual(exactly.status, 413, '恰好 4 MB 不应被判超限');
  });
});

test('安全：非法 JSON → 400（所有读 body 的写路由）', async () => {
  await withDesk(async ({ handler }) => {
    for (const route of [ROUTES.vaultSync, ROUTES.settings, ROUTES.ops, ROUTES.chat]) {
      const { status, body } = await call(handler, { route, method: 'POST', body: '{not-json' });
      assert.equal(status, 400, `${route} 必须拒绝非法 JSON`);
      assert.match(body.error, /不是有效的 JSON/);
    }
  });
});

test('未知路径 → 404；API 根路径等价于 state', async () => {
  await withDesk(async ({ handler }) => {
    for (const method of ['GET', 'POST']) {
      const { status, body } = await call(handler, { route: 'no-such-route', method });
      assert.equal(status, 404);
      assert.match(body.error, /接口不存在/);
    }
    const root = await call(handler, { route: '' });
    assert.equal(root.status, 200);
    assert.equal(root.body.state.todos.length, 6);
  });
});

// ---------------------------------------------------------------- 补充：模型目录降级与模型成功路径

test('GET models：listProviders 抛错 → ok:false 且错误可见，目录为空', async () => {
  const llm = {
    prepareCall: fakeLlm().prepareCall,
    listProviders: () => { throw new Error('provider boom'); },
    listModels: async () => [{ id: 'mock-1', name: 'Mock 1' }],
  };
  await withDesk({ llm }, async ({ handler }) => {
    const { status, body } = await call(handler, { route: ROUTES.models });
    assert.equal(status, 200);
    assert.equal(body.ok, false);
    assert.equal(body.error, 'provider boom');
    assert.deepEqual(body.providers, []);
    assert.deepEqual(body.models, []);
    assert.equal(body.selected, null);
  });
});

test('GET models：单个 provider 的 listModels 抛错 → 其余 provider 仍可用，不整体失败', async () => {
  const llm = {
    prepareCall: fakeLlm().prepareCall,
    listProviders: () => [{ id: 'bad', name: 'Bad' }, { id: 'good', name: 'Good' }],
    listModels: async provider => {
      if (provider === 'bad') throw new Error('model boom');
      return [{ id: 'g-1', name: 'G 1' }];
    },
  };
  await withDesk({ llm }, async ({ handler }) => {
    const { status, body } = await call(handler, { route: ROUTES.models });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(body.providers, [{ id: 'bad', name: 'Bad' }, { id: 'good', name: 'Good' }]);
    assert.deepEqual(body.models, [{ provider: 'good', providerName: 'Good', id: 'g-1', name: 'G 1' }]);
  });
});

test('POST chat：模型正常返回 → engine=model、回复原文、不建本地任务', async () => {
  await withDesk({ llm: fakeLlm() }, async ({ handler }) => {
    await call(handler, { route: ROUTES.settings, method: 'POST', body: JSON.stringify({ assistant: { provider: 'mock', model: 'mock-1' } }) });
    const { status, body } = await call(handler, { route: ROUTES.chat, method: 'POST', body: JSON.stringify({ message: '请总结一下当前进展' }) });
    assert.equal(status, 200);
    assert.equal(body.reply.engine, 'model');
    assert.equal(body.reply.text, '模型回答');
    assert.deepEqual(body.receipts, []);
    assert.deepEqual(body.errors, []);
    assert.equal(body.state.todos.length, 6, '模型回答时不该由本地规则建任务');
    assert.equal(body.state.chat.length, 2);
    assert.equal(body.state.chat[1].engine, 'model');
    assert.equal(body.state.chat[1].text, '模型回答');
  });
});
