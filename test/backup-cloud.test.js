import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createSnapshot } from '../lib/services/snapshot.js';
import { backupTools } from '../lib/tools/backup.js';
import { setConfig } from '../lib/services/config.js';

const base = path.resolve('.test-artifacts');
await fs.mkdir(base, { recursive: true });
const signal = () => new AbortController().signal;

test('workspace source backs up .dsh-csrw config and sync but excludes backups dir', async t => {
  const root = await fs.mkdtemp(path.join(base, 'ws-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.dsh-csrw', 'sync'), { recursive: true });
  await fs.writeFile(path.join(root, '.dsh-csrw', 'config.json'), '{"obsidian":{"vaultPath":"vault"}}');
  await fs.writeFile(path.join(root, '.dsh-csrw', 'sync', 'state.json'), '{}');
  const snap = await createSnapshot(root, { sources: ['workspace'] }, signal());
  const m = JSON.parse(await fs.readFile(path.join(snap.snapshotPath, 'manifest.json'), 'utf8'));
  assert.deepEqual(m.sources.map(s => s.id), ['workspace']);
  const files = m.files.map(f => f.path);
  assert.ok(files.includes('config.json'));
  assert.ok(files.includes('sync/state.json'));
  assert.ok(!files.some(f => f.startsWith('backups/')));
});

test('backup_github inits repo, syncs metadata, commits and pushes on confirm', async t => {
  const root = await fs.mkdtemp(path.join(base, 'gh-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.dsh-csrw'), { recursive: true });
  await fs.writeFile(path.join(root, '.dsh-csrw', 'config.json'), '{"obsidian":{"vaultPath":"vault"}}');
  await setConfig(root, 'git.backupRemote', 'git@github.com:user/backup.git');
  const calls = [];
  t.mock.method(childProcess, 'spawn', (command, args) => {
    calls.push(args);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => { child.emit('close', null, 'SIGTERM'); return true; };
    queueMicrotask(() => {
      let out = '';
      if (args.includes('get-url')) out = 'git@github.com:user/backup.git\n';
      child.stdout.end(out);
      child.stderr.end('');
      child.emit('close', 0, null);
    });
    return child;
  });
  const tool = backupTools({ get: () => undefined }).find(d => d.name === 'dsh_csrw_backup_github');
  const result = await tool.execute({ workspace: root, confirm: true }, { signal: signal() });
  assert.equal(result.pushed, true);
  assert.equal(result.remote, 'git@github.com:user/backup.git');
  assert.ok(calls.some(a => a.includes('init')));
  assert.ok(calls.some(a => a.includes('remote')));
  assert.ok(calls.some(a => a.includes('add')));
  assert.ok(calls.some(a => a.includes('commit')));
  assert.ok(calls.some(a => a.includes('push')));
  // 元数据已复制进仓库
  const repoDir = path.join(root, '.dsh-csrw', 'backup-repo');
  const copied = JSON.parse(await fs.readFile(path.join(repoDir, 'workspace', 'config.json'), 'utf8'));
  assert.equal(copied.git.backupRemote, 'git@github.com:user/backup.git');
});

test('backup_github commits but does not push without confirm', async t => {
  const root = await fs.mkdtemp(path.join(base, 'gh-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.dsh-csrw'), { recursive: true });
  await setConfig(root, 'git.backupRemote', 'git@github.com:user/backup.git');
  const calls = [];
  t.mock.method(childProcess, 'spawn', (command, args) => {
    calls.push(args);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => { child.emit('close', null, 'SIGTERM'); return true; };
    queueMicrotask(() => { child.stdout.end(''); child.stderr.end(''); child.emit('close', 0, null); });
    return child;
  });
  const tool = backupTools({ get: () => undefined }).find(d => d.name === 'dsh_csrw_backup_github');
  const result = await tool.execute({ workspace: root }, { signal: signal() });
  assert.equal(result.pushed, false);
  assert.ok(calls.some(a => a.includes('commit')));
  assert.ok(!calls.some(a => a.includes('push')));
});
