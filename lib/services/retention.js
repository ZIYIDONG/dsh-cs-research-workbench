// 快照保留规则：按 manifest.createdAt 保留最近 N 个，删除更旧的。
// 只处理带 manifest.json 的快照目录；.pending-* 与损坏目录一律跳过，避免误删。
import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, safePath } from '../utils/path.js';

async function snapshotEntries(base, signal) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(base, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return out;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    signal?.throwIfAborted();
    const dir = await safePath(base, entry.name);
    const manifestPath = path.join(dir, 'manifest.json');
    if (!await exists(manifestPath)) continue;
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      out.push({ name: entry.name, path: dir, createdAt: manifest.createdAt ?? '', files: Array.isArray(manifest.files) ? manifest.files.length : 0 });
    } catch {
      // 损坏的快照不参与排序，也不删除。
    }
  }
  out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return out;
}

/**
 * @param {string} base 备份根目录
 * @param {number} keep 保留数量；<=0 表示不清理
 * @returns {{pruned: Array<{name: string, createdAt: string}>, kept: number}}
 */
export async function pruneSnapshots(base, keep, signal) {
  const limit = Math.max(0, Math.trunc(Number(keep) || 0));
  const snapshots = await snapshotEntries(base, signal);
  if (!limit || snapshots.length <= limit) return { pruned: [], kept: snapshots.length };
  const pruned = [];
  for (const snapshot of snapshots.slice(limit)) {
    signal?.throwIfAborted();
    await fs.rm(snapshot.path, { recursive: true, force: true });
    pruned.push({ name: snapshot.name, createdAt: snapshot.createdAt });
  }
  return { pruned, kept: limit };
}

/** 列出当前快照（按新到旧），用于 prune 之外的状态展示。 */
export async function listSnapshots(base, signal) {
  return snapshotEntries(base, signal);
}
