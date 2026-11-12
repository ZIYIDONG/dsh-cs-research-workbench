import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { syncVault, applyPlan } from '../lib/services/vault-sync.js';
import { buildFrontmatter, splitFrontmatter } from '../lib/utils/frontmatter.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-vaultsync-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('pull: vault files without csrwId become new workbench entries', async (t) => {
  const root = await fixture(t);
  const ideasDir = path.join(root, 'ideas');
  await fs.mkdir(ideasDir, { recursive: true });
  await fs.writeFile(path.join(ideasDir, 'note1.md'), buildFrontmatter({ title: '测试想法' }, '正文内容'));
  const plan = await syncVault({ ideas: [], notes: [] }, ideasDir, '', 0);
  assert.equal(plan.ideas.create.length, 1);
  const row = plan.ideas.create[0];
  assert.equal(row.title, '测试想法');
  assert.equal(row.body, '正文内容');
  assert.ok(row.id);
});

test('push: workbench entries without files are written to vault with csrwId frontmatter', async (t) => {
  const root = await fixture(t);
  const ideasDir = path.join(root, 'ideas');
  await fs.mkdir(ideasDir, { recursive: true });
  const state = { ideas: [{ id: 'idea_1', title: '工作台想法', kind: 'hypothesis', status: 'seed', body: '内容', updatedAt: new Date(Date.now() + 2000).toISOString() }], notes: [] };
  const plan = await syncVault(state, ideasDir, '', 0);
  assert.equal(plan.ideas.pushFiles.length, 1);
  const { written } = await applyPlan(plan, ideasDir, '');
  assert.equal(written.length, 1);
  const content = await fs.readFile(path.join(ideasDir, written[0].rel), 'utf8');
  const { data } = splitFrontmatter(content);
  assert.equal(data.csrwId, 'idea_1');
  assert.equal(data.title, '工作台想法');
});

test('conflict: both sides changed keeps a conflict copy and does not overwrite', async (t) => {
  const root = await fixture(t);
  const ideasDir = path.join(root, 'ideas');
  await fs.mkdir(ideasDir, { recursive: true });
  await fs.writeFile(path.join(ideasDir, 'x.md'), buildFrontmatter({ csrwId: 'idea_1', title: '旧' }, '旧内容'));
  const lastSyncAt = Date.now() - 10000;
  const state = { ideas: [{ id: 'idea_1', title: '新', kind: 'idea', status: 'seed', body: '新内容', updatedAt: new Date().toISOString() }], notes: [] };
  const plan = await syncVault(state, ideasDir, '', lastSyncAt);
  assert.equal(plan.ideas.conflicts.length, 1);
  assert.equal(plan.ideas.pushFiles.length, 0);
  const { conflictCopies } = await applyPlan(plan, ideasDir, '');
  assert.equal(conflictCopies.length, 1);
  const original = await fs.readFile(path.join(ideasDir, 'x.md'), 'utf8');
  assert.match(original, /旧内容/);
  assert.ok(await fs.stat(path.join(ideasDir, 'x.conflict.md')));
});

test('knowledge base notes sync via kb field', async (t) => {
  const root = await fixture(t);
  const notesDir = path.join(root, 'kb');
  await fs.mkdir(notesDir, { recursive: true });
  const state = { ideas: [], notes: [{ id: 'note_1', title: '路径约束', kb: 'concept', body: '正文', updatedAt: new Date(Date.now() + 2000).toISOString() }] };
  const plan = await syncVault(state, '', notesDir, 0);
  assert.equal(plan.notes.pushFiles.length, 1);
  const { written } = await applyPlan(plan, '', notesDir);
  const content = await fs.readFile(path.join(notesDir, written[0].rel), 'utf8');
  const { data } = splitFrontmatter(content);
  assert.equal(data.kb, 'concept');
  assert.equal(data.csrwId, 'note_1');
});
