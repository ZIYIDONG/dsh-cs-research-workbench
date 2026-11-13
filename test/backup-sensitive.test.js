import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import childProcess from 'node:child_process';
import { definitions } from '../lib/index.js';
import { registerUiCommand } from '../lib/ui-command.js';
import { createSnapshot } from '../lib/services/snapshot.js';
import { setConfig } from '../lib/services/config.js';
import { pruneSnapshots } from '../lib/services/retention.js';
import { SECRET, containsSecret } from '../lib/utils/secret.js';
import { hashBytes } from '../lib/utils/hash.js';

// 快照侧的敏感内容拦截、manifest 无绝对路径、以及「全仓单一 SECRET 来源」的回归护栏。
// 夹具一律建在 os.tmpdir()，不往仓库写任何临时目录。

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEAK = 'api_key=sk-abcdefghijklmnop1234\n';

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'csrw-sensitive-'));
  const vault = path.join(workspace, 'vault');
  await fs.mkdir(vault, { recursive: true });
  await fs.writeFile(path.join(vault, 'clean.md'), '# 干净内容\n');
  await fs.writeFile(path.join(vault, 'leak.md'), LEAK);
  return { workspace, vault };
}

/** 递归收集对象里所有字符串值，用于断言 manifest 不含绝对路径。 */
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) strings(item, out);
  return out;
}

test('snapshot excludes sensitive content instead of persisting it (D3)', async () => {
  const { workspace } = await fixture();
  // fixture 自证：拦截判定确实命中，且空值形态不命中（否则用例会假绿）。
  assert.equal(containsSecret(LEAK), true);
  assert.equal(containsSecret('api_key='), false);

  const result = await createSnapshot(workspace, { sources: ['obsidian'], vaultPath: 'vault' });
  const manifest = JSON.parse(await fs.readFile(path.join(result.snapshotPath, 'manifest.json'), 'utf8'));

  assert.equal(result.excluded, 1);
  assert.deepEqual(manifest.excluded, [{ source: 'obsidian', path: 'leak.md', reason: 'sensitive-content' }]);
  assert.deepEqual(manifest.files.map(file => file.path), ['clean.md']);
  // 保守排除而非可逆脱敏：命中文件不得以任何形式落进快照载荷。
  await assert.rejects(fs.access(path.join(result.snapshotPath, 'files', 'obsidian', 'leak.md')));
});

test('snapshot manifest never carries absolute paths (B3 guard)', async () => {
  const { workspace } = await fixture();
  const result = await createSnapshot(workspace, { sources: ['obsidian'], vaultPath: 'vault' });
  const manifest = JSON.parse(await fs.readFile(path.join(result.snapshotPath, 'manifest.json'), 'utf8'));

  // 护栏：roots 只能出现在工具返回值，不得落 manifest —— backup_github 会把 manifest 推进远端仓库。
  assert.deepEqual(manifest.sources, [{ id: 'obsidian', kind: 'obsidian' }]);
  for (const file of manifest.files) {
    assert.equal(path.isAbsolute(file.path), false, file.path);
    assert.equal(file.path.includes('\\'), false, file.path);
  }
  for (const value of strings(manifest)) {
    assert.equal(path.isAbsolute(value), false, value);
    assert.equal(/^[A-Za-z]:[\\/]/.test(value), false, value);
    assert.equal(/^\\\\/.test(value), false, value);
    assert.equal(/^\/\//.test(value), false, value);
    assert.equal(value.includes(workspace), false, value);
  }
});

test('snapshot keeps a single SECRET source of truth (fork guard)', async () => {
  // 护栏：snapshot 里的判定必须来自 utils/secret.js。允许两种实现形状：
  //   ① import { SECRET } from '../utils/secret.js'（重构后的目标形状）
  //   ② 本地 const SECRET 字面量与 utils 导出逐字等价（当前形状，允许但不得漂移）
  // 两种形状都不满足才算失败；本地常量与 import 同时存在视为分叉，直接失败。
  const source = await fs.readFile(path.join(PLUGIN, 'lib/services/snapshot.js'), 'utf8');
  const imported = /import\s*\{[^}]*\bSECRET\b[^}]*\}\s*from\s*['"]\.\.\/utils\/secret\.js['"]/.test(source);
  const local = source.split('\n').find(line => line.startsWith('const SECRET = '));

  if (imported) {
    assert.equal(local, undefined, 'snapshot must not keep a local SECRET once it imports the shared one');
    return;
  }
  assert.ok(local, 'snapshot must either import SECRET or declare it locally');
  const literal = local.slice('const SECRET = '.length).trim().replace(/;$/, '');
  const last = literal.lastIndexOf('/');
  assert.ok(last > 0, 'local SECRET must be a regex literal');
  assert.equal(literal.slice(1, last), SECRET.source, 'local SECRET source drifted from utils/secret.js');
  assert.equal(literal.slice(last + 1), SECRET.flags, 'local SECRET flags drifted from utils/secret.js');
});

// ---- 确认门（schema 层 vs 业务层）与跨消费点严格性 ----
// 这两道门证明的是不同的事：schema 的 required 只保证「参数存在」，
// 业务层的 `Xxx requires confirm:true` 才保证「值真的是 true」。合并断言会同时失去两者。

const tools = definitions({ get: () => undefined });
const tool = name => tools.find(entry => entry.name === `dsh_csrw_${name}`);
const signal = () => new AbortController().signal;

test('schema declares only confirm and confirmExternalPath as confirm-like keys', () => {
  // 护栏：任何近似名（confirmExternal / confirmPath / confirmExternalPaths）都会让注入落空。
  // 期望集合按落地后形态写死；将来新增旗标必须同时改这里，不允许悄悄多一个。
  const names = [...new Set(tools.flatMap(entry => Object.keys(entry.parameters?.properties ?? {}).filter(key => /confirm/i.test(key))))].sort();
  assert.deepEqual(names, ['confirm', 'confirmExternalPath']);
});

test('nutstore_delete without confirm is rejected by the schema, not the service', async () => {
  await assert.rejects(
    tool('nutstore_delete').execute({ workspace: os.tmpdir(), remotePath: 'x' }, { signal: signal() }),
    error => error.code === 'INVALID_ARGS' && error.message.includes('missing required property "confirm"'),
  );
});

test('snapshot_restore without confirm is rejected by the schema, not the service', async () => {
  await assert.rejects(
    tool('snapshot_restore').execute({ workspace: os.tmpdir(), sources: ['obsidian'], snapshotPath: os.tmpdir() }, { signal: signal() }),
    error => error.code === 'INVALID_ARGS' && error.message.includes('missing required property "confirm"'),
  );
});

test('nutstore_delete with confirm:false is rejected by the service layer', async () => {
  // 类别：本批新增能力（nutstore_delete 不在 HEAD 中）。
  // 业务层用普通 Error（无 code），只断言 message；与 schema 层用例是两道不同的门 ——
  // schema 的 required 只保证「键存在」，值为 true 必须由执行层另行保证。
  await assert.rejects(
    tool('nutstore_delete').execute({ workspace: os.tmpdir(), remotePath: 'x', confirm: false }, { signal: signal() }),
    error => error.message === 'Delete requires confirm:true',
  );
});

test('snapshot_restore with confirm:false is rejected by the service layer', async () => {
  // 类别：既有护栏（HEAD 已有 snapshot_restore 及其执行层门）。本批不得加宽、也不得放宽它。
  await assert.rejects(
    tool('snapshot_restore').execute({ workspace: os.tmpdir(), sources: ['obsidian'], snapshotPath: os.tmpdir(), confirm: false }, { signal: signal() }),
    error => error.message === 'Restore requires confirm:true',
  );
});

test('snapshot_prune with confirm:false is rejected by the service layer', async () => {
  // snapshot_prune 的 confirm 在 schema 里是 required，但 JSON Schema 只校验键存在、不校验值为 true；
  // 因此实现必须在执行层另设 if (a.confirm !== true) throw。本条是该校验的回归护栏 ——
  // 去掉它，{confirm:false} 会直接执行删除。
  const workspace = await workspaceFixture();
  const base = path.join(workspace, '.dsh-csrw', 'backups');
  const names = ['2026-01-01T00-00-00-000Z-old', '2026-01-02T00-00-00-000Z-new'];
  for (const name of names) {
    await fs.mkdir(path.join(base, name, 'files'), { recursive: true });
    await fs.writeFile(path.join(base, name, 'manifest.json'), JSON.stringify({ version: 1, id: name, createdAt: '2026-01-0' + (name.includes('old') ? '1' : '2') + 'T00:00:00.000Z', sources: [], files: [], excluded: [] }));
  }
  await assert.rejects(
    tool('snapshot_prune').execute({ workspace, keep: 1, confirm: false }, { signal: signal() }),
    error => error.message === 'Prune requires confirm:true',
  );
  // 拒绝必须发生在任何删除之前：keep=1 本来会删掉一个，两个目录都得还在。
  assert.deepEqual((await fs.readdir(base)).sort(), names.slice().sort());
  // 反向验证（不修改 lib）：底层 pruneSnapshots 在同一个 base 上会真的删掉一个，
  // 说明执行层那道 if 是唯一保护；删掉它，上面这次调用就不再是「拒绝」而是「删除」。
  const pruned = await pruneSnapshots(base, 1, signal());
  assert.equal(pruned.pruned.length, 1);
  assert.equal((await fs.readdir(base)).length, 1);
});

test('backup_github keeps strict remote validation and never spawns git', async t => {
  // allowLocal 只对「用户自己仓库」的 push/pull 开放；备份通道的 remote 可能来自工具入参，
  // 必须永远严格。这条是防 allowLocal 传染到备份通道的唯一防线。
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'csrw-github-'));
  const spawned = [];
  t.mock.method(childProcess, 'spawn', (...args) => {
    spawned.push(args);
    throw new Error('spawn must not run for a rejected remote');
  });
  await assert.rejects(
    tool('backup_github').execute({ workspace, remote: 'file:///C:/repo' }, { signal: signal() }),
    error => error.message.startsWith('Remote scheme is not allowed: file: ') && error.message.includes('check git.backupRemote in .dsh-csrw/config.json'),
  );
  assert.deepEqual(spawned, []);
  // 校验必须先于 repoDir 解析与 mkdir：非法 remote 不得留下任何本地仓库副作用。
  await assert.rejects(fs.access(path.join(workspace, '.dsh-csrw', 'backup-repo')));
});

// ---- 信封注入与声明矩阵（ui-command） ----
// 注入是 ui-command 的行为：用桩工具捕获 execute 真正收到的 args，不触碰文件系统。
// 两张表语义不同，必须分开验证：ENVELOPE_CONFIRMABLE 注入 confirm，EXTERNAL_PATH_ARGS 注入 confirmExternalPath。

function envelope(names) {
  const seen = new Map();
  const stubs = names.map(name => ({ name, execute: async args => { seen.set(name, args); return { ok: true }; } }));
  let command;
  registerUiCommand({
    get: () => undefined,
    effect: fn => fn(),
    inject: (_services, mount) => mount({ register: definition => { command = definition; return () => {}; } }),
  }, stubs);
  const invoke = async (operation, args = {}, confirmed = true) => {
    const rawInput = JSON.stringify({ operation, args: { workspace: os.tmpdir(), ...args }, confirmed });
    const result = await command.handler({ rawInput, agent: { id: 'fixture' }, signal: new AbortController().signal });
    return JSON.parse(result.text);
  };
  return { invoke, seen };
}

test('envelope injects confirm only for the two envelope-confirmable tools', async () => {
  const { invoke, seen } = envelope(['dsh_csrw_nutstore_delete', 'dsh_csrw_snapshot_prune']);
  assert.deepEqual(await invoke('dsh_csrw_nutstore_delete', { remotePath: 'x' }), { ok: true });
  assert.equal(seen.get('dsh_csrw_nutstore_delete').confirm, true);
  await invoke('dsh_csrw_snapshot_prune', { keep: 3 });
  assert.equal(seen.get('dsh_csrw_snapshot_prune').confirm, true);
});

test('envelope never injects confirm into tools outside the envelope table', async () => {
  // 声明可以存在（config_set/nutstore_push/backup_github/backup_all 都有可选 confirm，语义各异），
  // 但注入不得发生：required 与「是否被注入」是两个正交维度，不能互相推断。
  const names = ['dsh_csrw_backup_github', 'dsh_csrw_backup_all', 'dsh_csrw_config_set', 'dsh_csrw_nutstore_push', 'dsh_csrw_backup_upload'];
  const { invoke, seen } = envelope(names);
  for (const name of names) {
    await invoke(name, {});
    assert.equal('confirm' in seen.get(name), false, `${name} must not receive an injected confirm`);
  }
});

test('explicit confirm values are never overwritten by the envelope', async () => {
  // 信封确认不得把显式否定翻成肯定：fail-closed 的关键一条。
  const { invoke, seen } = envelope(['dsh_csrw_snapshot_prune']);
  await invoke('dsh_csrw_snapshot_prune', { keep: 3, confirm: false });
  assert.equal(seen.get('dsh_csrw_snapshot_prune').confirm, false);
  await invoke('dsh_csrw_snapshot_prune', { keep: 3, confirm: true });
  assert.equal(seen.get('dsh_csrw_snapshot_prune').confirm, true);
});

test('confirmExternalPath is injected only for a non-empty payload path key', async () => {
  const { invoke, seen } = envelope(['dsh_csrw_backup_upload', 'dsh_csrw_nutstore_push']);
  await invoke('dsh_csrw_backup_upload', { localPath: 'D:/out' });
  assert.equal(seen.get('dsh_csrw_backup_upload').confirmExternalPath, true);
  // 省略路径键（路径来自 config）时不得注入：config 派生路径由写时门承担，不在 payload 内。
  await invoke('dsh_csrw_backup_upload', {});
  assert.equal('confirmExternalPath' in seen.get('dsh_csrw_backup_upload'), false);
  // 空串不算「给了路径」。
  await invoke('dsh_csrw_backup_upload', { localPath: '' });
  assert.equal('confirmExternalPath' in seen.get('dsh_csrw_backup_upload'), false);
  await invoke('dsh_csrw_nutstore_push', { localPath: 'D:/out' });
  assert.equal(seen.get('dsh_csrw_nutstore_push').confirmExternalPath, true);
  // 显式 false 同样是 fail-closed：不被覆盖。
  await invoke('dsh_csrw_backup_upload', { localPath: 'D:/out', confirmExternalPath: false });
  assert.equal(seen.get('dsh_csrw_backup_upload').confirmExternalPath, false);
});

test('snapshot_prune is the only dual-table member and receives both flags', async () => {
  // 唯一同时属于 ENVELOPE_CONFIRMABLE 与 EXTERNAL_PATH_ARGS 的工具：
  // 两个旗标各管一件事（confirm 管删除、confirmExternalPath 管越界），互不代偿，但都要注入。
  const { invoke, seen } = envelope(['dsh_csrw_snapshot_prune']);
  await invoke('dsh_csrw_snapshot_prune', { backupDir: 'D:/out', keep: 1 });
  const args = seen.get('dsh_csrw_snapshot_prune');
  assert.equal(args.confirm, true);
  assert.equal(args.confirmExternalPath, true);
});

test('required matrix: only destructive confirms are required, confirmExternalPath never is', () => {
  const confirmRequired = tools.filter(entry => (entry.parameters.required ?? []).includes('confirm')).map(entry => entry.name.slice(9)).sort();
  assert.deepEqual(confirmRequired, ['nutstore_delete', 'snapshot_prune', 'snapshot_restore']);
  // confirmExternalPath 必须可选：做成必填会让每次正常调用都带旗标，门等于恒真。
  const externalRequired = tools.filter(entry => (entry.parameters.required ?? []).includes('confirmExternalPath')).map(entry => entry.name.slice(9));
  assert.deepEqual(externalRequired, []);
});

test('declaration matrix: eleven tools declare confirmExternalPath and injection is a subset', () => {
  // 声明集 ≠ 注入集：备份/快照类的显式路径参数同样需要门可满足，所以声明更多是正确的。
  // 新增声明者必须显式改这份清单，避免「注入了但没声明 → 静默丢弃」再次出现。
  const declarers = tools.filter(entry => Object.hasOwn(entry.parameters?.properties ?? {}, 'confirmExternalPath')).map(entry => entry.name.slice(9)).sort();
  assert.deepEqual(declarers, [
    'backup_all', 'backup_dsh', 'backup_obsidian', 'backup_upload', 'backup_workspace', 'backup_zotero',
    'nutstore_pull', 'nutstore_push', 'snapshot_create', 'snapshot_prune', 'snapshot_restore',
  ]);
  for (const name of ['nutstore_push', 'nutstore_pull', 'backup_upload', 'snapshot_prune']) {
    assert.ok(declarers.includes(name), `${name} is injected but does not declare the flag`);
  }
  // backup_github 不声明是正确：它没有路径参数、也不调 createSnapshot。
  assert.equal(declarers.includes('backup_github'), false);
});

test('snapshot_prune without confirm is rejected by the schema, not the service', async () => {
  await assert.rejects(
    tool('snapshot_prune').execute({ workspace: os.tmpdir(), keep: 0 }, { signal: signal() }),
    error => error.code === 'INVALID_ARGS' && error.message.includes('missing required property "confirm"'),
  );
});

// ---- config 策略（ADVISORY 层：写时确认 + 结构性违规可见性） ----
// 路径越界不进 policyViolations（那是结构性违规专用），其可见性由 setConfig 的 confirm 门承担。

async function workspaceFixture() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'csrw-ws-'));
}

async function writeConfig(workspace, value) {
  await fs.mkdir(path.join(workspace, '.dsh-csrw'), { recursive: true });
  await fs.writeFile(path.join(workspace, '.dsh-csrw', 'config.json'), JSON.stringify(value));
}

test('config policy violations list structural problems without echoing values', async () => {
  const workspace = await workspaceFixture();
  const clean = await tool('config_show').execute({ workspace }, { signal: signal() });
  assert.deepEqual(clean.policyViolations, []);

  await writeConfig(workspace, {
    git: { backupRemote: 'https://user:tok@h.example/r.git' },
    nutstore: { baseUrl: 'https://nextcloud.example/dav/' },
  });
  const dirty = await tool('config_show').execute({ workspace }, { signal: signal() });
  assert.deepEqual(dirty.policyViolations.map(item => item.key).sort(), ['git.backupRemote', 'nutstore.baseUrl']);
  // 违规信息只给结构原因，不得回显原始值里的凭据片段。
  const text = JSON.stringify(dirty.policyViolations);
  assert.equal(text.includes('tok'), false);
  assert.equal(text.includes('user:'), false);
});

test('setConfig rejects untrusted remotes and schemes before persisting', async () => {
  const workspace = await workspaceFixture();
  await assert.rejects(setConfig(workspace, 'git.backupRemote', 'file:///C:/repo', signal()), /Remote scheme is not allowed: file:/);
  // 含空白先被 config 层拦（早于 URL 校验），无空白的 helper 语法才走到 URL 校验。
  await assert.rejects(setConfig(workspace, 'git.backupRemote', 'ext::sh -c id', signal()), /Invalid git backupRemote/);
  await assert.rejects(setConfig(workspace, 'git.backupRemote', 'ext::foo', signal()), /Remote helper syntax is not allowed: ext::/);
  // 顺序：URL 非法时报 URL 错，而不是要求 confirm——否则用户会去确认一个还没通过校验的值。
  await assert.rejects(setConfig(workspace, 'git.backupRemote', 'https://user:pw@h.example/r.git', signal()), /must not embed a password/);
  assert.equal((await setConfig(workspace, 'git.backupRemote', 'https://github.com/u/r.git', signal())).scopeChanged, false);
});

test('setConfig enforces the WebDAV host allowlist and loopback exception', async () => {
  const workspace = await workspaceFixture();
  await assert.rejects(setConfig(workspace, 'nutstore.baseUrl', 'https://nextcloud.example/dav/', signal()), /WebDAV host is not allowlisted: nextcloud\.example/);
  // 回环例外：本地测试服务器允许 http://127.0.0.1，且不被视为凭据作用域变更。
  assert.equal((await setConfig(workspace, 'nutstore.baseUrl', 'http://127.0.0.1/dav/', signal())).saved, true);
  // 从回环切回公网 host 会变更凭据作用域 → 需要显式 confirm。
  await assert.rejects(setConfig(workspace, 'nutstore.baseUrl', 'https://dav.jianguoyun.com/dav/', signal()), /credential scope; rerun with confirm:true/);
  assert.equal((await setConfig(workspace, 'nutstore.baseUrl', 'https://dav.jianguoyun.com/dav/', signal(), { confirm: true })).saved, true);
});

test('setConfig requires confirm when a path-scoped key leaves the workspace', async () => {
  const workspace = await workspaceFixture();
  await assert.rejects(setConfig(workspace, 'backup.localDir', 'D:/backups', signal()), /backup\.localDir points outside the workspace; rerun with confirm:true/);
  const saved = await setConfig(workspace, 'backup.localDir', 'D:/backups', signal(), { confirm: true });
  assert.equal(saved.scopeChanged, true);
  // 与凭据作用域不同：路径越界即使值未变也每次都要显式确认（实现如此，勿假设可跳过）。
  await assert.rejects(setConfig(workspace, 'backup.localDir', 'D:/backups', signal()), /points outside the workspace/);
});

// ---- 越界门（只评估显式传入的路径；config 派生路径运行期不评估） ----

test('explicit external source path is refused with a machine-readable code and path', async () => {
  const workspace = await workspaceFixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'csrw-outside-'));
  await fs.writeFile(path.join(outside, 'note.md'), '# note\n');
  await assert.rejects(
    tool('backup_obsidian').execute({ workspace, vaultPath: outside }, { signal: signal() }),
    error => error.code === 'EXTERNAL_PATH_REQUIRED' && path.isAbsolute(error.path) && error.message.includes(outside),
  );
  // 零副作用：门在解析期抛，早于 mkdir，备份目录不得被创建。
  await assert.rejects(fs.access(path.join(workspace, '.dsh-csrw', 'backups')));
});

test('explicit external source path is accepted once confirmExternalPath is given', async () => {
  const workspace = await workspaceFixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'csrw-outside-'));
  await fs.writeFile(path.join(outside, 'note.md'), '# note\n');
  const result = await tool('backup_obsidian').execute({ workspace, vaultPath: outside, confirmExternalPath: true }, { signal: signal() });
  assert.equal(result.files, 1);
  assert.deepEqual(result.roots.map(root => root.kind), ['obsidian']);
  assert.equal(path.isAbsolute(result.roots[0].path), true);
});

test('paths inside the workspace need no external-path confirmation', async () => {
  const workspace = await workspaceFixture();
  await fs.mkdir(path.join(workspace, 'vault'));
  await fs.writeFile(path.join(workspace, 'vault', 'note.md'), '# note\n');
  const result = await tool('backup_obsidian').execute({ workspace, vaultPath: 'vault' }, { signal: signal() });
  assert.equal(result.files, 1);
});

test('config-derived external source root is allowed at runtime (two-stage design)', async () => {
  // 护栏：config 派生路径不得被运行期门拦。防止后人把门改回「无条件评估」而让「恢复自己的库」每次都要确认。
  // 这里用 createSnapshot 代理，绝不能跑真 restore（会污染运行机工作区外的目录）。
  const workspace = await workspaceFixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'csrw-outside-'));
  await fs.writeFile(path.join(outside, 'note.md'), '# note\n');
  await writeConfig(workspace, { obsidian: { vaultPath: outside, autoDetect: false } });

  const before = (await fs.readdir(outside)).sort();
  const result = await tool('backup_obsidian').execute({ workspace }, { signal: signal() });
  assert.equal(result.files, 1);
  assert.deepEqual(result.roots.map(root => root.kind), ['obsidian']);
  // createSnapshot 只读源：外部目录不得被写入任何东西。
  assert.deepEqual((await fs.readdir(outside)).sort(), before);
});

test('snapshot_prune refuses an explicit external backupDir before deleting anything', async () => {
  const workspace = await workspaceFixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'csrw-outside-'));
  await assert.rejects(
    tool('snapshot_prune').execute({ workspace, backupDir: outside, keep: 0, confirm: true }, { signal: signal() }),
    error => error.code === 'EXTERNAL_PATH_REQUIRED' && error.path === outside,
  );
});

// DEP-3：catch 必须透出 code/path，否则 UI 只能靠文案判断。这两条走真实工具，验证结构化字段能被读回。
function realEnvelope(workspace = os.tmpdir()) {
  let command;
  registerUiCommand({
    get: () => undefined,
    effect: fn => fn(),
    inject: (_services, mount) => mount({ register: definition => { command = definition; return () => {}; } }),
  }, tools);
  return async (operation, args) => {
    const rawInput = JSON.stringify({ operation, args: { workspace, ...args }, confirmed: true });
    // 错误结果里的 text 是纯文案（非 JSON），因此保留原始对象以读取 code/path。
    return command.handler({ rawInput, agent: { id: 'fixture' }, signal: new AbortController().signal });
  };
}

test('envelope surfaces schema errors with a machine-readable code', async () => {
  const result = await realEnvelope()('dsh_csrw_nutstore_delete', {});
  assert.equal(result.kind, 'error');
  assert.equal(result.code, 'INVALID_ARGS');
  assert.match(result.text, /missing required property "remotePath"/);
});

// ---- D 项：备份通道的路径处理（绝对路径放行是待落地的改动，这里先钉住「不得放开的部分」） ----

test('backup channel still refuses a symlinked or junctioned backup dir', async t => {
  const workspace = await workspaceFixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'csrw-lout-'));
  await fs.mkdir(path.join(workspace, '.dsh-csrw'), { recursive: true });
  try {
    await fs.symlink(outside, path.join(workspace, '.dsh-csrw', 'backups'), 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'UNKNOWN'].includes(error.code)) {
      t.skip(`sandbox denied directory junction creation (${error.code}); this runs on Windows where fs.symlink(...,'junction') needs no admin rights`);
      return;
    }
    throw error;
  }
  // 必须匹配具体文案：笼统断言「抛错」会在因为别的原因失败时也变绿，等于没测。
  await assert.rejects(
    tool('backup_github').execute({ workspace, remote: 'https://github.com/u/r.git' }, { signal: signal() }),
    error => error.message === 'Symbolic links/junctions are not allowed',
  );
});

// ---- nutstore 同步的 source 回显：无条件、绝对路径、与入参原文无关 ----
// 夹具用本地 DAV 桩（与既有 nutstore 测试同思路）：PROPFIND 返回空集合，MKCOL/PUT 一律 201。

async function davStub() {
  // files 必须真存真回：客户端在 PUT 之后会回读一次做 SHA-256 校验（services/nutstore.js:164），
  // 桩若只回 201 而 GET 返回 404，红的是桩不是实现。与 outputObject 严格字段同理：桩必须跟着真实校验走。
  const files = new Map();
  const server = http.createServer(async (req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (req.method === 'PROPFIND') {
      // 必须返回可解析的条目：pull 的列表解析不接受空 multistatus（会报 Invalid DAV multistatus response）。
      const folder = name.endsWith('/') ? name : `${name}/`;
      const nodes = [`<d:response><d:href>${folder}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`];
      for (const [key, body] of files) {
        if (!key.startsWith(folder)) continue;
        nodes.push(`<d:response><d:href>${key}</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontentlength>${body.length}</d:getcontentlength><d:getetag>"${hashBytes(body)}"</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`);
      }
      res.writeHead(207, { 'Content-Type': 'application/xml' }).end(`<d:multistatus xmlns:d="DAV:">${nodes.join('')}</d:multistatus>`);
      return;
    }
    if (req.method === 'MKCOL') { res.writeHead(201).end(); return; }
    if (req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      files.set(name, body);
      res.writeHead(201, { ETag: `"${hashBytes(body)}"` }).end();
      return;
    }
    // 上传后客户端会回读一次做 SHA-256 校验，因此 GET 必须真的返回内容。
    if (req.method === 'GET') {
      if (!files.has(name)) { res.writeHead(404).end(); return; }
      const body = files.get(name);
      res.writeHead(200, { ETag: `"${hashBytes(body)}"`, 'Content-Length': body.length }).end(body);
      return;
    }
    res.writeHead(405).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${server.address().port}/dav/`,
    seed: (key, body) => files.set(key, Buffer.from(body)),
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}

function syncTools() {
  // nutstore 工具需要 credentials 服务；给一个只实现 readRecord 的桩，不接触真实钥匙串。
  const ctx = { get: key => (key === 'credentials' ? { readRecord: async () => ({ kind: 'api-key', key: 'fixture-password', env: { NUTSTORE_USERNAME: 'fixture' } }) } : undefined) };
  const defs = definitions(ctx);
  return (name, args) => defs.find(entry => entry.name === `dsh_csrw_${name}`).execute(args, { signal: signal() });
}

async function davWorkspace() {
  const stub = await davStub();
  const workspace = await workspaceFixture();
  await setConfig(workspace, 'nutstore.baseUrl', stub.url, signal());
  return { workspace, stub };
}

test('nutstore push echoes the resolved absolute source for a relative localPath', async () => {
  const { workspace, stub } = await davWorkspace();
  try {
    await fs.mkdir(path.join(workspace, 'source'));
    await fs.writeFile(path.join(workspace, 'source', 'a.md'), '# a\n');
    const result = await syncTools()('nutstore_push', { workspace, localPath: 'source' });
    assert.equal(result.source, path.resolve(workspace, 'source'));
    assert.equal(path.isAbsolute(result.source), true);
  } finally { await stub.close(); }
});

test('nutstore push echoes an absolute localPath verbatim instead of nesting it', async () => {
  const { workspace, stub } = await davWorkspace();
  try {
    const external = await fs.mkdtemp(path.join(os.tmpdir(), 'csrw src space-'));
    await fs.writeFile(path.join(external, 'a.md'), '# a\n');
    const result = await syncTools()('nutstore_push', { workspace, localPath: external, confirmExternalPath: true });
    assert.equal(result.source, external);
  } finally { await stub.close(); }
});

test('backup_upload echoes source from config when localPath is omitted', async () => {
  const { workspace, stub } = await davWorkspace();
  try {
    await fs.mkdir(path.join(workspace, '.dsh-csrw', 'backups'), { recursive: true });
    await fs.writeFile(path.join(workspace, '.dsh-csrw', 'backups', 'a.md'), '# a\n');
    const result = await syncTools()('backup_upload', { workspace });
    assert.equal(result.source, path.resolve(workspace, '.dsh-csrw', 'backups'));
  } finally { await stub.close(); }
});

test('an external source still echoes while succeeding once confirmed', async () => {
  const { workspace, stub } = await davWorkspace();
  try {
    const external = await fs.mkdtemp(path.join(os.tmpdir(), 'csrw src out-'));
    await fs.writeFile(path.join(external, 'a.md'), '# a\n');
    const result = await syncTools()('backup_upload', { workspace, localPath: external, confirmExternalPath: true });
    assert.equal(result.source, external);
    assert.equal(path.isAbsolute(result.source), true);
  } finally { await stub.close(); }
});

test('nutstore pull echoes the local destination root, not the remote prefix', async () => {
  // pull 语境下 source 是「下载写入的本地根」，不是远端 prefix —— 字段名沿用 source 但语义相反。
  // 此断言防止有人把它改成回显远端路径，那会让客户端的 source 展示在 pull 方向变成误导信息。
  const { workspace, stub } = await davWorkspace();
  try {
    // 播一个远端文件：pull 需要可解析的列表条目，否则解析器直接报 Invalid DAV multistatus。
    stub.seed('/dav/dsh-csrw/a.md', '# a\n');
    const result = await syncTools()('nutstore_pull', { workspace, localPath: 'download' });
    const config = JSON.parse(await fs.readFile(path.join(workspace, '.dsh-csrw', 'config.json'), 'utf8'));
    assert.equal(result.direction, 'pull');
    assert.equal(result.source, path.resolve(workspace, 'download'));
    assert.equal(path.isAbsolute(result.source), true);
    // 不得是远端相关标识：remoteRoot 前缀与 baseUrl 都不应出现。
    assert.notEqual(result.source, config.nutstore.remoteRoot);
    assert.equal(result.source.includes(config.nutstore.baseUrl), false);
    assert.equal(result.source.includes(config.nutstore.remoteRoot), false);
  } finally { await stub.close(); }
});

test('backup_all nests the same source under result.nutstore', async () => {
  const { workspace, stub } = await davWorkspace();
  try {
    await fs.mkdir(path.join(workspace, 'vault'));
    await fs.writeFile(path.join(workspace, 'vault', 'a.md'), '# a\n');
    await writeConfig(workspace, { nutstore: { baseUrl: stub.url }, obsidian: { vaultPath: 'vault' } });
    const result = await syncTools()('backup_all', { workspace, target: 'nutstore', sources: ['obsidian'] });
    assert.equal(result.nutstore.source, path.resolve(workspace, '.dsh-csrw', 'backups'));
  } finally { await stub.close(); }
});

test('backup channel accepts an absolute backup.localDir (other drive or NAS)', async () => {
  // 消费侧验证：config 层允许绝对路径之后，快照必须真的落在该绝对路径上。
  // 与 config 层写时确认门（setConfig 的 points-outside 拒绝）是两个层面，不要混成一条。
  const workspace = await workspaceFixture();
  // 目录名含空格：同时覆盖「空格不得被误拦」这一支（与 CR/LF 检查成对）。
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'csrw abs backups-'));
  await fs.mkdir(path.join(workspace, 'vault'));
  await fs.writeFile(path.join(workspace, 'vault', 'note.md'), '# note\n');
  await writeConfig(workspace, { backup: { localDir: base } });

  const result = await tool('backup_obsidian').execute({ workspace, vaultPath: 'vault' }, { signal: signal() });
  assert.equal(result.files, 1);
  assert.equal(result.snapshotPath.startsWith(base), true, result.snapshotPath);
  assert.equal((await fs.readdir(result.snapshotPath)).includes('manifest.json'), true);
});

test('backup channel keeps the default relative backup dir working', async () => {
  const workspace = await workspaceFixture();
  const result = await tool('backup_github').execute({ workspace, remote: 'https://github.com/u/r.git' }, { signal: signal() });
  assert.equal(result.pushed, false);
  assert.equal(result.remote, 'https://github.com/u/r.git');
});

test('envelope surfaces EXTERNAL_PATH_REQUIRED with the resolved path', async () => {
  // 显式 confirmExternalPath:false 会抑制注入，从而让越界门真正生效；
  // 否则信封 confirmed 在注入路径下等价于「用户已授权这个路径」。
  const workspace = await workspaceFixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'csrw-outside-'));
  const result = await realEnvelope(workspace)('dsh_csrw_snapshot_prune', { backupDir: outside, keep: 0, confirm: true, confirmExternalPath: false });
  assert.equal(result.kind, 'error');
  assert.equal(result.code, 'EXTERNAL_PATH_REQUIRED');
  assert.equal(result.path, outside);
});
