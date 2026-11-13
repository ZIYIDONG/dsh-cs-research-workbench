import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSnapshot } from '../lib/services/snapshot.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-incremental-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = path.join(root, 'vault');
  await fs.mkdir(path.join(vault, '.obsidian'), { recursive: true });
  await fs.writeFile(path.join(vault, 'note.md'), 'hello');
  return { root, vault, backups: path.join(root, 'backups') };
}

test('incremental snapshot keeps content correct after a full snapshot', async (t) => {
  const { root, vault, backups } = await fixture(t);
  const first = await createSnapshot(root, { vaultPath: vault, sources: ['obsidian'], backupDir: backups, mode: 'full', keep: 0 });
  assert.equal(first.files, 1);
  const second = await createSnapshot(root, { vaultPath: vault, sources: ['obsidian'], backupDir: backups, mode: 'incremental', keep: 0 });
  assert.equal(second.files, 1);
  const content = await fs.readFile(path.join(second.snapshotPath, 'files', 'obsidian', 'note.md'), 'utf8');
  assert.equal(content, 'hello');
});

test('createSnapshot prunes older snapshots when keep is set', async (t) => {
  const { root, vault, backups } = await fixture(t);
  await createSnapshot(root, { vaultPath: vault, sources: ['obsidian'], backupDir: backups, keep: 1 });
  const second = await createSnapshot(root, { vaultPath: vault, sources: ['obsidian'], backupDir: backups, keep: 1 });
  assert.equal(second.pruned, 1);
  const dirs = (await fs.readdir(backups)).filter((name) => !name.startsWith('.'));
  assert.equal(dirs.length, 1);
});
