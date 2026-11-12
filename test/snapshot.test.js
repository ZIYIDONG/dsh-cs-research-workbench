import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createSnapshot, verifySnapshot, restoreSnapshot, discoverDsh } from '../lib/services/snapshot.js';
import { backupTools } from '../lib/tools/backup.js';
import { DEFAULTS, setConfig } from '../lib/services/config.js';
import { hashBytes } from '../lib/utils/hash.js';
const signal = () => new AbortController().signal;
async function fixture(t) {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-csrw-snapshot-'));
 const cleanup = []; t.after(async () => { for (const fn of cleanup) await fn(); await fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); });
 const vault = path.join(root, 'vault'); await fs.mkdir(path.join(vault, '.obsidian'), { recursive: true });
 await fs.writeFile(path.join(vault, 'note.md'), 'original');
 const options = { sources: ['obsidian'], vaultPath: vault, backupDir: path.join(root, 'backups') };
 return { root, vault, options, cleanup };
}
async function manifest(snapshot) { return JSON.parse(await fs.readFile(path.join(snapshot.snapshotPath, 'manifest.json'), 'utf8')); }
async function changeManifest(snapshot, transform) { const m = await manifest(snapshot); transform(m); await fs.writeFile(path.join(snapshot.snapshotPath, 'manifest.json'), JSON.stringify(m)); }

test('versioned manifest, hashes, local default and credential exclusion', async t => {
 const { root, vault } = await fixture(t);
 await fs.writeFile(path.join(vault, '.env'), 'UNLABELLED=private');
 await fs.writeFile(path.join(vault, 'config.json'), '{"apiKey":"top-secret"}');
 await fs.writeFile(path.join(vault, 'preferences.json'), '{"theme":"dark"}');
 const snap = await createSnapshot(root, { sources: ['obsidian'], vaultPath: vault }, signal());
 assert.equal(path.dirname(snap.snapshotPath), path.join(root, '.dsh-csrw', 'backups'));
 const m = await manifest(snap); assert.equal(m.version, 1); assert.ok(Date.parse(m.createdAt));
 assert.equal(m.files.find(f => f.path === 'note.md').sha256, hashBytes('original'));
 assert.equal(m.files.find(f => f.path === 'note.md').size, 8);
 assert.ok(!m.files.some(f => ['.env', 'config.json'].includes(f.path)));
 assert.equal(m.excluded.length, 1);
 assert.equal((await verifySnapshot(snap.snapshotPath, signal())).verified, true);
});

test('restore verifies everything, snapshots old state and preserves extra files', async t => {
 const { root, vault, options } = await fixture(t); const snap = await createSnapshot(root, options, signal());
 await fs.writeFile(path.join(vault, 'note.md'), 'edited'); await fs.writeFile(path.join(vault, 'extra.md'), 'keep');
 await assert.rejects(restoreSnapshot(root, { ...options, snapshotPath: snap.snapshotPath }, signal()), /confirm:true/);
 const restored = await restoreSnapshot(root, { ...options, snapshotPath: snap.snapshotPath, confirm: true }, signal());
 assert.equal(await fs.readFile(path.join(vault, 'note.md'), 'utf8'), 'original');
 assert.equal(await fs.readFile(path.join(vault, 'extra.md'), 'utf8'), 'keep');
 const pre = await manifest({ snapshotPath: restored.preRestoreSnapshot });
 assert.equal(pre.files.find(f => f.path === 'note.md').sha256, hashBytes('edited'));
});

test('corrupt payload blocks restore before any destination changes', async t => {
 const { root, vault, options } = await fixture(t); const snap = await createSnapshot(root, options, signal());
 await fs.writeFile(path.join(vault, 'note.md'), 'edited');
 await fs.writeFile(path.join(snap.snapshotPath, 'files', 'obsidian', 'note.md'), 'corrupt');
 await assert.rejects(restoreSnapshot(root, { ...options, snapshotPath: snap.snapshotPath, confirm: true }, signal()), /integrity/);
 assert.equal(await fs.readFile(path.join(vault, 'note.md'), 'utf8'), 'edited');
 assert.equal((await fs.readdir(options.backupDir)).length, 1);
});

test('manifest traversal, aliases and duplicates rejected', async t => {
 const { root, options } = await fixture(t);
 for (const bad of ['../escape', 'C:/escape', '/escape', 'sub\\escape', 'note.md.', 'NUL']) {
  const snap = await createSnapshot(root, options, signal()); await changeManifest(snap, m => { m.files[0].path = bad; });
  await assert.rejects(verifySnapshot(snap.snapshotPath, signal()), /Invalid manifest/);
 }
 const snap = await createSnapshot(root, options, signal()); await changeManifest(snap, m => { m.files.push(m.files[0]); });
 await assert.rejects(verifySnapshot(snap.snapshotPath, signal()), /Duplicate/);
});

test('manifest destination fields are ignored in favour of selected configured source', async t => {
 const { root, vault, options } = await fixture(t); const snap = await createSnapshot(root, options, signal());
 const other = path.join(root, 'other'); await fs.mkdir(other); await fs.writeFile(path.join(other, 'note.md'), 'do-not-touch');
 await changeManifest(snap, m => { m.sources[0].root = other; });
 await fs.writeFile(path.join(vault, 'note.md'), 'edited');
 await restoreSnapshot(root, { ...options, snapshotPath: snap.snapshotPath, confirm: true }, signal());
 assert.equal(await fs.readFile(path.join(other, 'note.md'), 'utf8'), 'do-not-touch');
 assert.equal(await fs.readFile(path.join(vault, 'note.md'), 'utf8'), 'original');
});

test('all targets preflight before any restore writes', async t => {
 const { root, vault, options } = await fixture(t); await fs.mkdir(path.join(vault, 'sub')); await fs.writeFile(path.join(vault, 'sub', 'later.md'), 'later');
 const snap = await createSnapshot(root, options, signal()); await fs.writeFile(path.join(vault, 'note.md'), 'edited');
 await fs.rm(path.join(vault, 'sub'), { recursive: true }); await fs.writeFile(path.join(vault, 'sub'), 'blocking-parent');
 await assert.rejects(restoreSnapshot(root, { ...options, snapshotPath: snap.snapshotPath, confirm: true }, signal()), /directory|ENOTDIR/);
 assert.equal(await fs.readFile(path.join(vault, 'note.md'), 'utf8'), 'edited');
});

test('source, payload and target junctions are rejected', async t => {
 const { root, vault, options } = await fixture(t); const external = path.join(root, 'external'); await fs.mkdir(external); await fs.writeFile(path.join(external, 'outside.md'), 'outside');
 const link = path.join(vault, 'linked'); await fs.symlink(external, link, process.platform === 'win32' ? 'junction' : 'dir');
 await assert.rejects(createSnapshot(root, options, signal()), /links|junctions/i); await fs.rm(link, { recursive: true, force: true });
 await fs.mkdir(path.join(vault, 'sub')); await fs.writeFile(path.join(vault, 'sub', 'later.md'), 'later');
 const snap = await createSnapshot(root, options, signal());
 await fs.rm(path.join(vault, 'sub'), { recursive: true }); await fs.symlink(external, path.join(vault, 'sub'), process.platform === 'win32' ? 'junction' : 'dir');
 await assert.rejects(restoreSnapshot(root, { ...options, snapshotPath: snap.snapshotPath, confirm: true }, signal()), /links|junctions/i);
 await fs.rm(path.join(vault, 'sub'), { recursive: true, force: true });
 const payloadDir = path.join(snap.snapshotPath, 'files', 'obsidian', 'sub'); await fs.rm(payloadDir, { recursive: true }); await fs.symlink(external, payloadDir, process.platform === 'win32' ? 'junction' : 'dir');
 await assert.rejects(verifySnapshot(snap.snapshotPath, signal()), /links|junctions/i);
 await fs.rm(payloadDir, { recursive: true, force: true });
});

test('DSH actual fixture home/profile discovery excludes sessions and secrets', async t => {
 const { root } = await fixture(t); const home = path.join(root, 'dsh'); const profile = path.join(home, 'profiles', 'work');
 for (const dir of [path.join(home, 'prompts'), path.join(home, 'skills'), path.join(home, 'sessions'), path.join(home, 'storages'), path.join(profile, 'plugins')]) await fs.mkdir(dir, { recursive: true });
 await fs.writeFile(path.join(home, 'prompts', 'system.md'), 'hello'); await fs.writeFile(path.join(home, 'skills', 'SKILL.md'), 'skill');
 await fs.writeFile(path.join(home, 'sessions', 'private.json'), 'session'); await fs.writeFile(path.join(home, 'storages', 'data.json'), 'storage');
 await fs.writeFile(path.join(profile, 'plugins', 'index.js'), 'export default {}'); await fs.writeFile(path.join(profile, 'config.yml'), 'apiKey: private-value');
 for(const name of ['cordis.patch.yml','pnpm-lock.yaml','pnpm-workspace.yaml']) await fs.writeFile(path.join(profile,name),'safe: true');
  await fs.writeFile(path.join(profile,'plugins','.credentials.yaml'),'undocumented: private-value');
  const found = await discoverDsh({}, structuredClone(DEFAULTS), signal(), { DSH_HOME: home, DSH_PROFILE_DIR: profile }); assert.equal(found.profile, profile);
 const snap = await createSnapshot(root, { sources: ['dsh'], dshHome: home }, signal()); const m = await manifest(snap);
 assert.ok(m.files.some(f => f.source === 'dsh-home' && f.path === 'prompts/system.md'));
 assert.ok(m.files.some(f => f.source === 'dsh-profile' && f.path === 'plugins/index.js'));
 assert.ok(!m.files.some(f => /sessions|storages|config.yml|credentials/.test(f.path)));
  for(const name of ['cordis.patch.yml','pnpm-lock.yaml','pnpm-workspace.yaml']) assert.ok(m.files.some(f=>f.source==='dsh-profile'&&f.path===name));
 const empty = path.join(root, 'empty'); await fs.mkdir(empty);
 await assert.rejects(discoverDsh({ dshHome: empty }, structuredClone(DEFAULTS), signal(), {}), /verified candidates/);
});

test('Zotero WAL database snapshot is consistent using node:sqlite backup', async t => {
 const { root, cleanup } = await fixture(t); const dataDir = path.join(root, 'zotero'); await fs.mkdir(dataDir);
 const live = new DatabaseSync(path.join(dataDir, 'zotero.sqlite')); cleanup.push(() => live.close());
 live.exec('PRAGMA journal_mode=WAL; CREATE TABLE items(id INTEGER, title TEXT); INSERT INTO items VALUES(1,\'committed\')');
 await fs.writeFile(path.join(dataDir, 'attachment.txt'), 'attachment');
 const snap = await createSnapshot(root, { sources: ['zotero'], dataDir }, signal()); const m = await manifest(snap);
 assert.ok(!m.files.some(f => /-wal|-shm/.test(f.path)));
 const copy = new DatabaseSync(path.join(snap.snapshotPath, 'files', 'zotero', 'zotero.sqlite'), { readOnly: true });
 try { assert.equal(copy.prepare('SELECT title FROM items').get().title, 'committed'); assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); } finally { copy.close(); }
 live.exec("INSERT INTO items VALUES(2, 'apiKey: private-in-wal')");
 const sensitive = await createSnapshot(root, { sources: ['zotero'], dataDir }, signal());
 assert.ok(!(await manifest(sensitive)).files.some(f => f.path === 'zotero.sqlite'));
 await assert.rejects(restoreSnapshot(root, { sources: ['zotero'], dataDir, snapshotPath: snap.snapshotPath, confirm: true }, signal()), /Close Zotero/);
});

test('abort, unsupported target config and missing sources propagate', async t => {
 const { root, options } = await fixture(t); const controller = new AbortController(); controller.abort(new Error('stop-now'));
 await assert.rejects(createSnapshot(root, options, controller.signal), /stop-now/);
 await assert.rejects(setConfig(root, 'backup.target', 'remote'), /local or nutstore/);
 await assert.rejects(createSnapshot(root, { ...options, vaultPath: path.join(root, 'missing') }, signal()), /ENOENT/);
});

test('canonical defineTool contracts render one JSON block and preserve exceptions', async t => {
 const { root, options } = await fixture(t); const definitions = backupTools({});
 assert.deepEqual(definitions.map(d => d.name), ['dsh_csrw_backup_obsidian', 'dsh_csrw_backup_zotero', 'dsh_csrw_backup_dsh', 'dsh_csrw_backup_workspace', 'dsh_csrw_snapshot_create', 'dsh_csrw_snapshot_verify', 'dsh_csrw_snapshot_restore', 'dsh_csrw_backup_upload', 'dsh_csrw_backup_github', 'dsh_csrw_backup_all']);
 for (const d of definitions) { assert.equal(d.output.schema.type, 'object'); if (d.name === 'dsh_csrw_backup_all') assert.equal(d.output.schema.additionalProperties, true); else { assert.equal(d.output.schema.additionalProperties, false); assert.ok(Array.isArray(d.output.schema.required)); } }
 const d = definitions[0]; const result = await d.execute({ workspace: root, ...options }, { signal: signal() });
 const blocks = d.output.render({}, result); assert.equal(blocks.length, 1); assert.deepEqual(JSON.parse(blocks[0].text), result);
 const c = new AbortController(); c.abort(new Error('tool-abort')); await assert.rejects(d.execute({ workspace: root, ...options }, { signal: c.signal }), /tool-abort/);
});


test('restore verifies corrupt unselected sources before modifying selected source', async t => {
 const { root, vault, options } = await fixture(t); const dataDir = path.join(root, 'zotero'); await fs.mkdir(dataDir); await fs.writeFile(path.join(dataDir, 'item.txt'), 'item');
 const snap = await createSnapshot(root, { ...options, sources: ['obsidian', 'zotero'], dataDir }, signal());
 await fs.writeFile(path.join(vault, 'note.md'), 'edited'); await fs.writeFile(path.join(snap.snapshotPath, 'files', 'zotero', 'item.txt'), 'bad');
 await assert.rejects(restoreSnapshot(root, { ...options, snapshotPath: snap.snapshotPath, confirm: true }, signal()), /integrity/);
 assert.equal(await fs.readFile(path.join(vault, 'note.md'), 'utf8'), 'edited');
});
