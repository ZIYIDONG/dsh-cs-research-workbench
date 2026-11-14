// buildIndex 磁盘索引缓存回归。契约：不传 cachePath 与历史行为一致；缓存只存结构化结果与
// 元数据（mtimeMs/size/bodyLine/title/tags/aliases/links），绝不存笔记正文；命中时只重解析
// 变化/新增文件，删除文件不写回；读/写/解析失败降级为纯内存扫描；signal 中止不被降级吞掉。
// 夹具全部在 os.tmpdir()，不碰真实 vault。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildIndex } from '../lib/utils/wikilink.js';
import { obsidianTools } from '../lib/tools/obsidian.js';

const signal = () => new AbortController().signal;
const exclude = r => r.split('/').some(x => ['.obsidian', '.git', '.dsh-csrw', '.csrw', '.trash'].includes(x));
const MARKER = 'CACHE_BODY_MARKER_9b7d2f31';
const NOTE_KEYS = ['aliases', 'body', 'links', 'tags', 'title'];
const CACHE_ENTRY_KEYS = ['aliases', 'bodyLine', 'links', 'mtimeMs', 'size', 'tags', 'title'];
const cachePathOf = root => path.join(root, '.dsh-csrw', 'obsidian-index.json');
const fileExists = async file => { try { await fs.access(file); return true; } catch { return false; } };

async function vault(t, prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(async () => fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }));
  await fs.mkdir(path.join(root, '.obsidian'), { recursive: true });
  await fs.mkdir(path.join(root, '.dsh-csrw'), { recursive: true });
  return root;
}

async function seed(root) {
  await fs.mkdir(path.join(root, 'sub'), { recursive: true });
  await fs.writeFile(path.join(root, 'a.md'), `---\ntitle: Alpha\ntags: [ml]\naliases: [A]\n---\nSee [[b]] and ${MARKER} in the body.\n`);
  await fs.writeFile(path.join(root, 'b.md'), '# B\nplain b body\n');
  await fs.writeFile(path.join(root, 'sub', 'c.md'), `---\ntitle: Cee\ntags: [systems]\naliases: [C]\n---\nLink [[a|A]] and ${MARKER} too.\n`);
}

/** 把 Map 结构转成可 deepEqual 的普通对象，用于「与无缓存一致」的逐字段比较。 */
function plain(index) {
  return {
    files: index.files.slice().sort(),
    aliases: Object.fromEntries([...index.aliases].map(([k, v]) => [k, v.slice()])),
    notes: Object.fromEntries([...index.notes].map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])),
  };
}

async function readCache(cachePath) {
  return JSON.parse(await fs.readFile(cachePath, 'utf8'));
}
async function tamper(cachePath, transform) {
  const raw = await readCache(cachePath);
  transform(raw.entries);
  await fs.writeFile(cachePath, JSON.stringify(raw));
  return raw;
}

test('不传 cachePath 与传 cachePath 的 buildIndex 返回结构逐字段一致，缓存只存结构化结果', async t => {
  const root = await vault(t, 'csrw-index-shape-');
  await seed(root);
  const cachePath = cachePathOf(root);
  const noCache = await buildIndex(root, { signal: signal(), exclude });
  const withCache = await buildIndex(root, { signal: signal(), exclude, cachePath });

  assert.deepEqual(plain(withCache), plain(noCache));
  assert.ok(Array.isArray(withCache.files));
  assert.ok(withCache.aliases instanceof Map);
  assert.ok(withCache.notes instanceof Map);
  for (const index of [noCache, withCache]) {
    for (const [rel, info] of index.notes) {
      assert.deepEqual(Object.keys(info).sort(), NOTE_KEYS, `${rel} 的 note 字段集合必须固定`);
      assert.ok(Array.isArray(info.tags) && Array.isArray(info.aliases) && Array.isArray(info.links));
    }
  }
  assert.equal(noCache.aliases.size, 2);
  assert.deepEqual(noCache.aliases.get('a'), ['a.md']);

  const raw = await readCache(cachePath);
  assert.equal(raw.version, 1);
  assert.equal(raw.root, path.resolve(root));
  assert.ok(raw.entries && typeof raw.entries === 'object' && !Array.isArray(raw.entries));
  for (const rel of Object.keys(raw.entries)) {
    assert.deepEqual(Object.keys(raw.entries[rel]).sort(), CACHE_ENTRY_KEYS, `${rel} 的缓存条目字段集合必须固定`);
    assert.equal(Object.hasOwn(raw.entries[rel], 'body'), false, '缓存不得存正文');
    assert.equal(typeof raw.entries[rel].mtimeMs, 'number');
    assert.equal(typeof raw.entries[rel].size, 'number');
  }
});

test('二次调用命中缓存：缓存内结构化结果被沿用，正文仍按行偏移从原文件还原', async t => {
  const root = await vault(t, 'csrw-index-hit-');
  await seed(root);
  const cachePath = cachePathOf(root);
  const first = await buildIndex(root, { signal: signal(), exclude, cachePath });
  const before = await readCache(cachePath);

  // 间接证明命中：只改缓存里的解析结果，不动 mtimeMs/size。若第二次重新解析，篡改值会消失。
  await tamper(cachePath, entries => {
    entries['a.md'].title = 'TAMPERED_TITLE';
    entries['a.md'].tags = ['tampered'];
    entries['a.md'].links = [];
  });
  const second = await buildIndex(root, { signal: signal(), exclude, cachePath });
  const cached = second.notes.get('a.md');
  assert.equal(cached.title, 'TAMPERED_TITLE', '未变化文件必须命中缓存而非重新解析');
  assert.deepEqual(cached.tags, ['tampered']);
  assert.deepEqual(cached.links, []);
  assert.ok(cached.body.includes(MARKER), '命中时正文必须从原文件按行偏移还原');
  assert.equal(cached.body, first.notes.get('a.md').body);
  assert.deepEqual(second.files.slice().sort(), first.files.slice().sort());
  assert.deepEqual(second.aliases.get('a'), ['a.md']);

  const after = await readCache(cachePath);
  assert.equal(after.entries['a.md'].title, 'TAMPERED_TITLE', '命中条目写回时不得悄悄重新解析');
  assert.equal(after.entries['a.md'].mtimeMs, before.entries['a.md'].mtimeMs);
  assert.equal(after.entries['a.md'].size, before.entries['a.md'].size);
});

test('修改 1 个文件只重解析该文件，新增被纳入，删除从 files 与缓存中剔除', async t => {
  const root = await vault(t, 'csrw-index-delta-');
  await seed(root);
  const cachePath = cachePathOf(root);
  await buildIndex(root, { signal: signal(), exclude, cachePath });
  // 三个文件都打上篡改标记：只有真正重解析的文件才会恢复成真实值。
  await tamper(cachePath, entries => {
    for (const rel of Object.keys(entries)) entries[rel].title = `TAMPERED_${rel}`;
  });

  await fs.writeFile(path.join(root, 'b.md'), '---\ntitle: Bee2\ntags: [revised]\n---\nRewritten body with [[a]] link.\n');
  await fs.writeFile(path.join(root, 'new.md'), '# new\n[[a]]\n');
  await fs.rm(path.join(root, 'sub', 'c.md'));

  const second = await buildIndex(root, { signal: signal(), exclude, cachePath });
  const noCache = await buildIndex(root, { signal: signal(), exclude });
  assert.equal(second.notes.get('a.md').title, 'TAMPERED_a.md', '未改动的 a.md 不得重解析');
  assert.equal(second.notes.get('b.md').title, 'Bee2', '改动的 b.md 必须重解析');
  assert.deepEqual(second.notes.get('b.md').tags, ['revised']);
  assert.equal(second.notes.get('b.md').links.length, 1);
  assert.equal(second.notes.get('b.md').links[0].target, 'a');
  assert.deepEqual(JSON.parse(JSON.stringify(second.notes.get('b.md'))), JSON.parse(JSON.stringify(noCache.notes.get('b.md'))), '重解析结果必须与纯内存一致');
  assert.ok(second.files.includes('new.md'));
  assert.ok(!second.files.includes('sub/c.md'));
  assert.deepEqual(JSON.parse(JSON.stringify(second.notes.get('new.md'))), JSON.parse(JSON.stringify(noCache.notes.get('new.md'))));

  const raw = await readCache(cachePath);
  assert.equal(Object.hasOwn(raw.entries, 'sub/c.md'), false, '已删除文件不得写回缓存');
  assert.ok(Object.hasOwn(raw.entries, 'new.md'));
  assert.equal(raw.entries['b.md'].title, 'Bee2', '变化文件的缓存条目必须更新');
  assert.equal(raw.entries['a.md'].title, 'TAMPERED_a.md');
});

test('缓存文件绝不含笔记正文（唯一标记只出现在原文件与内存 body 中）', async t => {
  const root = await vault(t, 'csrw-index-nobody-');
  await seed(root);
  const cachePath = cachePathOf(root);
  const index = await buildIndex(root, { signal: signal(), exclude, cachePath });
  // fixture 自证：标记确实在正文里并已被解析到，否则「缓存里没有」是假绿。
  assert.ok(index.notes.get('a.md').body.includes(MARKER));
  assert.ok(index.notes.get('sub/c.md').body.includes(MARKER));
  assert.ok((await fs.readFile(path.join(root, 'a.md'), 'utf8')).includes(MARKER));

  const text = await fs.readFile(cachePath, 'utf8');
  assert.equal(text.includes(MARKER), false, '缓存 JSON 不得出现笔记正文标记');
  assert.equal(text.includes('plain b body'), false);
  assert.equal(text.includes('See [['), false);
  const raw = JSON.parse(text);
  for (const entry of Object.values(raw.entries)) assert.equal(Object.hasOwn(entry, 'body'), false);
});

test('缓存损坏 / 不可写 / 路径非法时降级为纯内存扫描，结果与无缓存一致', async t => {
  const root = await vault(t, 'csrw-index-fallback-');
  await seed(root);
  const expected = plain(await buildIndex(root, { signal: signal(), exclude }));

  // 1) 损坏 JSON：当作无缓存，本次全量解析并自愈覆写。
  const cachePath = cachePathOf(root);
  await fs.writeFile(cachePath, '{broken json');
  assert.deepEqual(plain(await buildIndex(root, { signal: signal(), exclude, cachePath })), expected);
  assert.equal((await readCache(cachePath)).version, 1, '损坏缓存应被自愈覆写');

  // 2) 不可写：父路径是普通文件，atomicJson 无法创建目录，必须降级而不是让工具失败。
  const parentFile = path.join(root, '.dsh-csrw', 'parent-is-a-file');
  await fs.writeFile(parentFile, 'x');
  assert.deepEqual(plain(await buildIndex(root, { signal: signal(), exclude, cachePath: path.join(parentFile, 'index.json') })), expected);

  // 3) 路径非法：含 NUL 的路径在读/写阶段都会抛，同样降级。
  const illegal = `${path.join(root, '.dsh-csrw')}${path.sep}illegal\u0000.json`;
  assert.deepEqual(plain(await buildIndex(root, { signal: signal(), exclude, cachePath: illegal })), expected);
});

test('signal 中止在缓存路径下仍抛出，降级分支不得吞掉 abort', async t => {
  const root = await vault(t, 'csrw-index-abort-');
  await seed(root);
  const cachePath = cachePathOf(root);

  const first = new AbortController();
  first.abort(new Error('cache-abort'));
  await assert.rejects(buildIndex(root, { signal: first.signal, exclude, cachePath }), err => err.message === 'cache-abort');
  assert.equal(await fileExists(cachePath), false, '中止前不得产生缓存写副作用');

  // 损坏缓存 + 已中止：readCache 的 catch 与 buildIndex 的 catch 都必须继续向外抛。
  await fs.writeFile(cachePath, '{broken');
  const second = new AbortController();
  second.abort(new Error('cache-read-abort'));
  await assert.rejects(buildIndex(root, { signal: second.signal, exclude, cachePath }), err => err.message === 'cache-read-abort');
});

test('缓存命中时 graph / backlinks / links 工具结果仍正确，缓存落在 workspace/.dsh-csrw', async t => {
  const root = await vault(t, 'csrw-index-tools-');
  await fs.mkdir(path.join(root, 'sub'), { recursive: true });
  await fs.writeFile(path.join(root, 'a.md'), '---\ntitle: Alpha\ntags: [ml]\naliases: [A]\n---\nSee [[b]] and [[sub/Unknown]].\n');
  await fs.writeFile(path.join(root, 'b.md'), '# B\nplain b body\n');
  const defs = Object.fromEntries(obsidianTools({ get: () => undefined }).map(d => [d.name, d]));
  const run = (name, args) => defs[`dsh_csrw_obsidian_${name}`].execute({ workspace: root, ...args }, { signal: signal() });
  const cachePath = cachePathOf(root);

  const firstGraph = await run('graph', {});
  assert.equal(firstGraph.nodes.length, 2);
  assert.equal(firstGraph.edges.length, 1);
  assert.deepEqual(firstGraph.edges.map(e => [e.from, e.to]), [['a.md', 'b.md']]);
  assert.equal(await fileExists(cachePath), true, '工具必须把缓存写到 <workspace>/.dsh-csrw/obsidian-index.json');

  // 篡改 title（不动 links），第二次调用若命中缓存就会沿用篡改值，同时链接解析结果不变。
  await tamper(cachePath, entries => { entries['b.md'].title = 'CACHED_TITLE'; });
  const cachedGraph = await run('graph', {});
  assert.equal(cachedGraph.nodes.find(n => n.id === 'b.md').title, 'CACHED_TITLE', 'graph 必须命中缓存');
  assert.equal(cachedGraph.nodes.length, 2);
  assert.deepEqual(cachedGraph.edges.map(e => [e.from, e.to]), [['a.md', 'b.md']], '缓存命中时 edges 仍正确');
  const fresh = await buildIndex(root, { signal: signal(), exclude });
  assert.equal(fresh.notes.get('a.md').links.length, 2, '纯内存结果必须与缓存图一致');

  const backlinks = await run('backlinks', { path: 'b.md' });
  assert.equal(backlinks.path, 'b.md');
  assert.deepEqual(backlinks.backlinks.map(b => b.from), ['a.md']);
  const links = await run('links', { path: 'a.md' });
  assert.equal(links.links.find(l => l.target === 'b').resolved, 'b.md');
  assert.equal(links.links.find(l => l.target === 'sub/Unknown').resolved, null);
  assert.equal((await readCache(cachePath)).entries['b.md'].title, 'CACHED_TITLE', '后续调用仍走同一份缓存');
});
