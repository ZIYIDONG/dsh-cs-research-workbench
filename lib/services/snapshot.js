import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { loadConfig, detectVault } from './config.js';
import { safePath, inside, exists, walk, atomicJson, nonempty } from '../utils/path.js';
import { hashFile, hashBytes } from '../utils/hash.js';

const KINDS = ['obsidian', 'zotero', 'dsh'];
const DSH_PARTS = new Set(['prompts', 'plugins', 'skills', 'config', 'config.json', 'config.yml', 'config.yaml', 'cordis.yml', 'cordis.yaml', 'cordis.patch.yml', 'cordis.patch.yaml', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']);
const PRIVATE = /(^|\/)(?:\.?(?:credentials?|secrets?|tokens?|auth|cookies?)[^/]*|\.env(?:\.[^/]*)?|\.npmrc|\.netrc|id_rsa[^/]*|id_ed25519[^/]*)(\/|$)|\.(?:pem|key|p12|pfx)$/i;
const SECRET = /(?:["']?(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|credential)[\w.-]*["']?\s*[:=]\s*["']?[^\s"',}\]]+)|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,})/i;
const check = signal => signal?.throwIfAborted();
function selected(value) { const out = value ?? KINDS; if (!Array.isArray(out) || !out.length || out.some(x => !KINDS.includes(x)) || new Set(out).size !== out.length) throw new Error('sources must be a nonempty unique array of obsidian/zotero/dsh'); return out; }
function relative(value) { if (typeof value !== 'string' || !value || value.includes('\\') || value.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)) || /[:\x00-\x1f]/.test(value) || path.isAbsolute(value)) throw new Error('Invalid manifest relative path'); return value; }
async function directory(root) { root = path.resolve(nonempty(root, 'source root')); await safePath(root, '', { allowRoot: true }); if (!(await fs.stat(root)).isDirectory()) throw new Error('Source root is not a directory'); return root; }
async function evidence(root) { if (!await exists(root)) return false; await directory(root); for (const name of DSH_PARTS) if (await exists(await safePath(root, name))) return true; return false; }

// Candidate names are not proof: require actual DSH content and resolve ambiguity explicitly.
export async function discoverDsh(options = {}, config, signal, env = process.env) {
 check(signal);
 const explicitHome = options.dshHome || config.backup.dshHome;
 const candidates = explicitHome ? [path.resolve(explicitHome)] : env.DSH_HOME ? [path.resolve(env.DSH_HOME)] : [...new Set([ path.join(os.homedir(), '.dsh'), ...(process.platform === 'win32' && env.USERPROFILE ? [path.join(env.USERPROFILE, '.dsh')] : [])].filter(Boolean).map(x => path.resolve(x)))];
 const valid = [];
 for (const root of candidates) {
  check(signal); if (!await exists(root)) continue;
  await directory(root);
  if (await evidence(root) || await exists(await safePath(root, 'profiles'))) valid.push(root);
 }
 if (valid.length !== 1) throw new Error(`DSH home discovery found ${valid.length} verified candidates; provide dshHome`);
 const home = valid[0];
 let profile = options.dshProfile || config.backup.dshProfile || (!explicitHome ? env.DSH_PROFILE_DIR : undefined);
 if (profile) { profile = path.isAbsolute(profile) ? profile : await safePath(home, `profiles/${profile}`); if (!await evidence(profile)) throw new Error('DSH profile lacks verified prompts/plugins/skills/config content'); profile = await directory(profile); }
 else {
  const base = await safePath(home, 'profiles'); const found = [];
  if (await exists(base)) for (const ent of await fs.readdir(base, { withFileTypes: true })) { check(signal); const candidate = await safePath(base, ent.name); if (ent.isDirectory() && await evidence(candidate)) found.push(candidate); }
  if (found.length > 1) throw new Error('Multiple DSH profiles found; provide dshProfile'); profile = found[0];
 }
 if (!profile && !await evidence(home)) throw new Error('No verified DSH backup content found');
 return { home, profile };
}
async function resolveSources(workspace, options, config, signal) {
 const result = [];
 for (const kind of selected(options.sources)) {
  check(signal);
  if (kind === 'obsidian') result.push({ id: kind, kind, root: await directory(options.vaultPath ? path.resolve(workspace, options.vaultPath) : await detectVault(workspace, config, signal)) });
  if (kind === 'zotero') result.push({ id: kind, kind, root: await directory(path.resolve(workspace, nonempty(options.dataDir || config.zotero.dataDir, 'Zotero dataDir'))) });
  if (kind === 'dsh') { const { home, profile } = await discoverDsh(options, config, signal); result.push({ id: 'dsh-home', kind, root: home }); if (profile && profile !== home) result.push({ id: 'dsh-profile', kind, root: profile }); }
 }
 return result;
}
function excluded(source, rel, includeSessions) {
 const parts = rel.split('/');
 if (PRIVATE.test(rel) || parts.some(x => ['.git', '.csrw', 'node_modules'].includes(x))) return true;
 if (source.kind === 'zotero' && /(?:-wal|-shm|-journal)$/.test(rel)) return true;
 if (source.kind === 'dsh') return !DSH_PARTS.has(parts[0]) && !(includeSessions && ['sessions', 'storages'].includes(parts[0]));
 return false;
}
async function sqliteCopy(source, destination, signal) {
 const { DatabaseSync, backup } = await import('node:sqlite');
 if (typeof backup !== 'function') throw new Error('This Node runtime lacks node:sqlite backup API');
 check(signal); const db = new DatabaseSync(source, { readOnly: true });
 try { await backup(db, destination, { rate: 64, progress() { check(signal); } }); check(signal); } finally { db.close(); }
}
async function backupBase(workspace, options, config) {
 if ((options.target ?? config.backup.target) !== 'local') throw new Error('Backup target is not local; Nutstore snapshot transport is not implemented');
 const base = path.resolve(workspace, options.backupDir || config.backup.localDir); return safePath(base, '', { allowRoot: true });
}
export async function createSnapshot(workspace, options = {}, signal) {
 check(signal); const config = await loadConfig(workspace, signal); const sources = await resolveSources(workspace, options, config, signal); const base = await backupBase(workspace, options, config);
 if (sources.some(s => inside(base, s.root))) throw new Error('Backup directory must not contain a source root');
 await fs.mkdir(base, { recursive: true });
 const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
 const staging = await safePath(base, `.pending-${id}`); const destination = await safePath(base, id);
 await fs.mkdir(staging, { mode: 0o700 });
 const manifest = { version: 1, createdAt: new Date().toISOString(), id, sources: sources.map(({ id, kind }) => ({ id, kind })), files: [], excluded: [] };
 try {
  for (const source of sources) {
   const files = await walk(source.root, { signal, exclude: rel => inside(base, path.resolve(source.root, rel)) || excluded(source, rel, options.includeDshSessions ?? config.backup.includeDshSessions) });
   for (const entry of files) {
    check(signal); const rel = relative(entry.relative); const from = await safePath(source.root, rel);
    // Conservative exclusion, not reversible redaction: never persist detected credential-bearing content.
    const bytes = await fs.readFile(from, { signal });
    if (SECRET.test(bytes.toString('utf8'))) { manifest.excluded.push({ source: source.id, path: rel, reason: 'sensitive-content' }); continue; }
    const stored = `files/${source.id}/${rel}`; const to = await safePath(staging, stored); await fs.mkdir(path.dirname(to), { recursive: true });
    if (source.kind === 'zotero' && /\.(?:sqlite|db)$/i.test(rel)) {
     await sqliteCopy(from, to, signal);
     // A committed WAL page may contain a secret absent from the main source file.
     if (SECRET.test((await fs.readFile(to, { signal })).toString('utf8'))) { await fs.unlink(to); manifest.excluded.push({ source: source.id, path: rel, reason: 'sensitive-content' }); continue; }
    }
    else await fs.writeFile(to, bytes, { flag: 'wx', mode: 0o600, signal });
    manifest.files.push({ source: source.id, path: rel, size: (await fs.stat(to)).size, sha256: await hashFile(to, signal) });
   }
  }
  await atomicJson(await safePath(staging, 'manifest.json'), manifest, signal); check(signal); await fs.rename(staging, destination);
  return { snapshotPath: destination, version: 1, createdAt: manifest.createdAt, files: manifest.files.length, excluded: manifest.excluded.length };
 } catch (error) { await fs.rm(staging, { recursive: true, force: true }); throw error; }
}

async function readVerified(snapshotPath, signal) {
 check(signal); const root = await directory(snapshotPath); const manifest = JSON.parse(await fs.readFile(await safePath(root, 'manifest.json'), { encoding: 'utf8', signal }));
 if (manifest.version !== 1 || typeof manifest.id !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt)) || !Array.isArray(manifest.sources) || !Array.isArray(manifest.files)) throw new Error('Invalid snapshot manifest');
 const ids = new Set();
 for (const s of manifest.sources) { if (!s || !KINDS.includes(s.kind) || !['obsidian', 'zotero', 'dsh-home', 'dsh-profile'].includes(s.id) || (s.id.startsWith('dsh-') ? s.kind !== 'dsh' : s.kind !== s.id) || ids.has(s.id)) throw new Error('Invalid snapshot source'); ids.add(s.id); }
 const names = new Set();
 for (const f of manifest.files) {
  check(signal); if (!f || !ids.has(f.source) || !Number.isSafeInteger(f.size) || f.size < 0 || !/^[a-f0-9]{64}$/.test(f.sha256)) throw new Error('Invalid snapshot file');
  relative(f.path); const key = `${f.source}/${f.path}`.toLowerCase(); if (names.has(key)) throw new Error('Duplicate snapshot path'); names.add(key);
  if (PRIVATE.test(f.path)) throw new Error('Credential path in manifest refused');
  const full = await safePath(root, `files/${f.source}/${f.path}`); const stat = await fs.lstat(full);
  if (!stat.isFile() || stat.size !== f.size || await hashFile(full, signal) !== f.sha256) throw new Error(`Snapshot integrity mismatch: ${f.source}/${f.path}`);
 }
 return { root, manifest };
}
export async function verifySnapshot(snapshotPath, signal) { const { root, manifest } = await readVerified(snapshotPath, signal); return { snapshotPath: root, verified: true, version: manifest.version, files: manifest.files.length }; }

export async function restoreSnapshot(workspace, options = {}, signal) {
 if (options.confirm !== true) throw new Error('Restore requires confirm:true');
 if (!options.sources) throw new Error('Restore requires explicit sources');
 const { root, manifest } = await readVerified(nonempty(options.snapshotPath, 'snapshotPath'), signal);
 const config = await loadConfig(workspace, signal); await backupBase(workspace, options, config);
 const sources = await resolveSources(workspace, options, config, signal); const byId = new Map(sources.map(s => [s.id, s]));
 for (const kind of selected(options.sources)) if (!manifest.sources.some(s => s.kind === kind)) throw new Error(`Snapshot has no selected source: ${kind}`);
 const writes = [];
 for (const file of manifest.files) {
  check(signal); const source = byId.get(file.source); if (!source) { if (selected(options.sources).includes(manifest.sources.find(s => s.id === file.source).kind)) throw new Error('Selected snapshot source has no configured destination'); continue; }
  if (excluded(source, file.path, options.includeDshSessions ?? config.backup.includeDshSessions)) throw new Error('Manifest contains forbidden restore path');
  const target = await safePath(source.root, file.path);
  if (inside(root, target) || inside(target, root)) throw new Error('Restore target overlaps snapshot');
  if (await exists(target) && !(await fs.lstat(target)).isFile()) throw new Error('Restore target must be a regular file');
  if (source.kind === 'zotero' && /\.(?:sqlite|db)$/i.test(file.path) && (await exists(`${target}-wal`) || await exists(`${target}-shm`) || await exists(`${target}-journal`))) throw new Error('Close Zotero before restoring a database with active SQLite sidecars');
  let parent = path.dirname(target); while (!await exists(parent)) parent = path.dirname(parent);
  if (!(await fs.stat(parent)).isDirectory()) throw new Error('Restore parent is not a directory');
  if (writes.some(w => w.target.toLowerCase() === target.toLowerCase() || inside(w.target, target) || inside(target, w.target))) throw new Error('Overlapping restore targets');
  await fs.access(parent, constants.W_OK); if (await exists(target)) await fs.access(target, constants.W_OK);
  const bytes = await fs.readFile(await safePath(root, `files/${file.source}/${file.path}`), { signal });
  if (bytes.length !== file.size || hashBytes(bytes) !== file.sha256) throw new Error('Snapshot changed during restore preflight');
  if (SECRET.test(bytes.toString('utf8'))) throw new Error('Sensitive snapshot content refused');
  writes.push({ source, target, relative: file.path, bytes });
 }
 // All manifests, payloads, destinations and permissions are checked before any user file changes.
 const preRestore = await createSnapshot(workspace, { ...options, snapshotPath: undefined }, signal);
 for (const item of writes) {
  check(signal); await safePath(item.source.root, item.relative); await fs.mkdir(path.dirname(item.target), { recursive: true });
  const temp = await safePath(item.source.root, `${item.relative}.${randomUUID()}.restore-tmp`);
  try { await fs.writeFile(temp, item.bytes, { flag: 'wx', mode: 0o600, signal }); check(signal); await safePath(item.source.root, item.relative); await fs.rename(temp, item.target); }
  finally { if (await exists(temp)) await fs.unlink(temp); }
 }
 return { snapshotPath: root, restored: true, files: writes.length, preRestoreSnapshot: preRestore.snapshotPath };
}
