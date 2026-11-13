import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pruneSnapshots, listSnapshots } from '../lib/services/retention.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-retention-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function snapshot(root, name, createdAt) {
  const dir = path.join(root, name);
  await fs.mkdir(path.join(dir, 'files'), { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ version: 1, id: name, createdAt, sources: [], files: [] }));
}

test('pruneSnapshots keeps the newest N and deletes older ones', async (t) => {
  const root = await fixture(t);
  await snapshot(root, 's1', '2026-01-01T00:00:00Z');
  await snapshot(root, 's2', '2026-01-02T00:00:00Z');
  await snapshot(root, 's3', '2026-01-03T00:00:00Z');
  const result = await pruneSnapshots(root, 2);
  assert.deepEqual(result.pruned.map((p) => p.name), ['s1']);
  assert.equal(result.kept, 2);
  assert.deepEqual((await fs.readdir(root)).sort(), ['s2', 's3']);
});

test('pruneSnapshots skips dot dirs and directories without manifest', async (t) => {
  const root = await fixture(t);
  await snapshot(root, 's1', '2026-01-01T00:00:00Z');
  await snapshot(root, 's2', '2026-01-02T00:00:00Z');
  await fs.mkdir(path.join(root, '.pending-x'));
  await fs.mkdir(path.join(root, 'broken'));
  const result = await pruneSnapshots(root, 1);
  assert.deepEqual(result.pruned.map((p) => p.name), ['s1']);
  assert.ok(await fs.stat(path.join(root, '.pending-x')));
  assert.ok(await fs.stat(path.join(root, 'broken')));
});

test('pruneSnapshots keep=0 leaves everything untouched', async (t) => {
  const root = await fixture(t);
  await snapshot(root, 's1', '2026-01-01T00:00:00Z');
  await snapshot(root, 's2', '2026-01-02T00:00:00Z');
  const result = await pruneSnapshots(root, 0);
  assert.equal(result.pruned.length, 0);
  assert.equal((await fs.readdir(root)).length, 2);
});

test('listSnapshots returns newest first', async (t) => {
  const root = await fixture(t);
  await snapshot(root, 's1', '2026-01-01T00:00:00Z');
  await snapshot(root, 's2', '2026-01-03T00:00:00Z');
  const list = await listSnapshots(root);
  assert.deepEqual(list.map((s) => s.name), ['s2', 's1']);
});
