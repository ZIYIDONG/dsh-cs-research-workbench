// 工作台「想法/知识库」↔ Obsidian vault 的双向同步核心。
// 映射键：frontmatter 的 csrwId ↔ 工作台条目 id。冲突保留副本，不自动覆盖。

import fs from 'node:fs/promises';
import path from 'node:path';
import { splitFrontmatter, buildFrontmatter } from '../utils/frontmatter.js';
import { exists, walk, safePath } from '../utils/path.js';
import { newId } from '../utils/id.js';

const md = (r) => r.toLowerCase().endsWith('.md');

function slugify(title) {
  const s = String(title ?? '').trim().toLowerCase().replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'untitled';
}

function toMarkdown(entry, kind) {
  const data = { csrwId: entry.id, title: entry.title ?? '' };
  if (kind === 'idea') { data.kind = entry.kind ?? 'idea'; data.status = entry.status ?? 'seed'; }
  else data.kb = entry.kb ?? 'concept';
  return buildFrontmatter(data, entry.body ?? '');
}

async function readDir(root, signal) {
  if (!root) return [];
  const resolved = path.resolve(root);
  try { await safePath(resolved, '', { allowRoot: true }); } catch { return []; }
  if (!await exists(resolved)) return [];
  const files = await walk(resolved, { signal, exclude: (r) => !md(r) });
  const out = [];
  for (const f of files) {
    const text = await fs.readFile(f.path, 'utf8');
    const { data, body } = splitFrontmatter(text);
    const st = await fs.stat(f.path);
    out.push({ rel: f.relative, data, body, mtimeMs: st.mtimeMs });
  }
  return out;
}

async function planCollection(entries, dir, kind, lastSyncAt, signal) {
  const files = await readDir(dir, signal);
  const byId = new Map();
  for (const e of entries) if (e && e.id) byId.set(e.id, e);
  const fileById = new Map();
  for (const f of files) if (f.data.csrwId) fileById.set(f.data.csrwId, f);
  const plan = { create: [], update: [], pushFiles: [], conflicts: [] };
  const after = (ms) => typeof lastSyncAt === 'number' && lastSyncAt > 0 && ms > lastSyncAt;
  const isFirst = !(typeof lastSyncAt === 'number' && lastSyncAt > 0);

  // Pull：vault → 工作台
  for (const f of files) {
    const id = f.data.csrwId;
    const entry = id ? byId.get(id) : null;
    if (!entry) {
      const row = { id: id ?? newId(kind === 'idea' ? 'idea' : 'note'), title: f.data.title ?? path.basename(f.rel, '.md'), body: f.body, sample: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pos: null };
      if (kind === 'idea') { row.kind = f.data.kind ?? 'idea'; row.status = f.data.status ?? 'seed'; }
      else row.kb = f.data.kb ?? 'concept';
      plan.create.push(row);
    } else if (after(f.mtimeMs) && !after(Date.parse(entry.updatedAt ?? ''))) {
      const patch = { title: f.data.title ?? entry.title, body: f.body, updatedAt: new Date().toISOString() };
      if (kind === 'idea') { patch.kind = f.data.kind ?? entry.kind; patch.status = f.data.status ?? entry.status; }
      else patch.kb = f.data.kb ?? entry.kb;
      plan.update.push({ id: entry.id, patch });
    }
  }

  // Push：工作台 → vault
  for (const entry of entries) {
    const f = entry.id ? fileById.get(entry.id) : null;
    const workbenchChanged = isFirst || after(Date.parse(entry.updatedAt ?? ''));
    if (!f) {
      if (workbenchChanged) plan.pushFiles.push({ rel: `${slugify(entry.title)}.md`, content: toMarkdown(entry, kind) });
    } else if (workbenchChanged) {
      if (after(f.mtimeMs)) plan.conflicts.push({ id: entry.id, title: entry.title, rel: f.rel });
      else plan.pushFiles.push({ rel: f.rel, content: toMarkdown(entry, kind) });
    }
  }
  return plan;
}

/**
 * 计算一次同步的变更计划（不落盘）。返回每个集合的 create/update/pushFiles/conflicts。
 * @param {object} state 工作台状态
 * @param {string} ideasDir 想法目录（绝对路径）
 * @param {string} notesDir 知识库目录（绝对路径）
 * @param {number} lastSyncAt 上次同步时间戳（毫秒）
 */
export async function syncVault(state, ideasDir, notesDir, lastSyncAt, signal) {
  const ideas = await planCollection(state.ideas ?? [], ideasDir, 'idea', lastSyncAt, signal);
  const notes = await planCollection(state.notes ?? [], notesDir, 'note', lastSyncAt, signal);
  return { ideas, notes };
}

/**
 * 应用计划：写 vault 文件（pushFiles）、为冲突保留 vault 副本（conflicts）。
 * create/update 由调用方写回工作台状态。
 */
export async function applyPlan(plan, ideasDir, notesDir, signal) {
  const written = [];
  const conflictCopies = [];
  const roots = { ideas: ideasDir, notes: notesDir };
  for (const collection of ['ideas', 'notes']) {
    const kind = collection === 'ideas' ? 'idea' : 'note';
    const p = plan[collection];
    const root = path.resolve(roots[collection] ?? '');
    for (const item of p.pushFiles) {
      const target = await safePath(root, item.rel);
      await fs.mkdir(path.dirname(target), { recursive: true });
      const tmp = `${target}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, item.content, 'utf8');
      await fs.rename(tmp, target);
      written.push({ kind, rel: item.rel });
    }
    for (const c of p.conflicts) {
      // 保留 vault 原文件不动，写一份冲突副本，让用户手动合并
      const source = await safePath(root, c.rel);
      if (!await exists(source)) continue;
      const copy = source.replace(/\.md$/i, `.conflict.md`);
      await fs.copyFile(source, copy);
      conflictCopies.push({ kind, id: c.id, title: c.title, rel: c.rel, copy: path.basename(copy) });
    }
  }
  return { written, conflictCopies };
}
