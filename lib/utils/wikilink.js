import fs from 'node:fs/promises';
import path from 'node:path';
import { walk, atomicJson } from './path.js';
import { splitFrontmatter, aliasesOf } from './frontmatter.js';

// 双链解析、消歧、索引与反推。默认纯内存全量扫描；传入 cachePath 时启用磁盘索引缓存
// （docs/obsidian-local-features.md §6.4）：按 mtimeMs+size 判定命中，只重新解析变化/新增文件。
// 缓存只存结构化解析结果与元数据，绝不存笔记正文；命中时按正文起始行偏移从原文件还原。

const LINK_RE = /(!?)\[\[([^\[\]\n]+)\]\]/g;
const CACHE_VERSION = 1;
const END_DELIM = /^(?:---|\.\.\.)\s*$/;

/** 解析单个链接内部文本（不含外层 [[ ]]），先切 | 别名，再切 # 段落。 */
export function parseLink(raw) {
  let text = String(raw ?? '').trim();
  let alias = null;
  let section = null;
  const pipe = text.indexOf('|');
  if (pipe >= 0) {
    alias = text.slice(pipe + 1).trim();
    text = text.slice(0, pipe);
  }
  const hash = text.indexOf('#');
  if (hash >= 0) {
    section = text.slice(hash + 1).trim();
    text = text.slice(0, hash);
  }
  return {
    target: text.trim(),
    alias: alias === '' ? null : alias,
    section: section === '' ? null : section,
  };
}

/** 提取整段文本里的全部 wikilink（含嵌入），跳过空目标。 */
export function extractLinks(text) {
  const re = /(!?)\[\[([^\[\]\n]+)\]\]/g;
  const links = [];
  let m;
  while ((m = re.exec(text))) {
    const parsed = parseLink(m[2]);
    if (!parsed.target) continue;
    links.push({ raw: m[0], embed: m[1] === '!', ...parsed });
  }
  return links;
}

/** 把 tags 归一化为字符串数组（兼容单字符串 / 行内数组 / 块数组）。 */
export function normalizeTags(value) {
  if (value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
  return [];
}

function stem(rel) {
  return rel.replace(/\.md$/i, '');
}

function pick(hits) {
  if (!hits.length) return { resolved: null, ambiguous: false, candidates: [], via: null };
  const uniq = [...new Map(hits.map((h) => [h.rel, h])).values()];
  if (uniq.length === 1) return { resolved: uniq[0].rel, ambiguous: false, candidates: [uniq[0].rel], via: uniq[0].via };
  const minDepth = Math.min(...uniq.map((h) => h.depth));
  let shortest = uniq.filter((h) => h.depth === minDepth);
  const minLen = Math.min(...shortest.map((h) => h.len));
  shortest = shortest.filter((h) => h.len === minLen);
  if (shortest.length === 1) return { resolved: shortest[0].rel, ambiguous: false, candidates: uniq.map((h) => h.rel), via: shortest[0].via };
  return { resolved: null, ambiguous: true, candidates: uniq.map((h) => h.rel), via: null };
}

/** 把链接 target 解析为 vault 内真实文件路径：精确路径 → basename 最短唯一路径 → 别名兜底。 */
export function resolveTarget(target, index) {
  if (!target) return { resolved: null, ambiguous: false, candidates: [], via: null };
  const lower = target.toLowerCase();
  const hits = [];
  const add = (rel, via) => hits.push({ rel, via, depth: rel.split('/').length, len: rel.length });

  for (const rel of index.files) {
    if (stem(rel).toLowerCase() === lower) add(rel, 'path');
  }
  if (!hits.length) {
    const base = lower.split('/').pop();
    for (const rel of index.files) {
      if (stem(rel).toLowerCase().split('/').pop() === base) add(rel, 'basename');
    }
  }
  if (!hits.length) {
    const aliasList = index.aliases.get(lower);
    if (aliasList) for (const rel of aliasList) add(rel, 'alias');
  }
  return pick(hits);
}

/**
 * 纯内存全量扫描：不传 cachePath 时唯一的执行路径，行为与历史实现逐字一致。
 */
async function scanAll(root, { signal, exclude } = {}) {
  const files = [];
  const aliases = new Map();
  const notes = new Map();
  for (const f of await walk(root, { signal, exclude })) {
    if (!f.relative.toLowerCase().endsWith('.md')) continue;
    files.push(f.relative);
    const text = await fs.readFile(f.path, { encoding: 'utf8', signal });
    const { data, body } = splitFrontmatter(text);
    const aliasList = aliasesOf(data);
    const tags = normalizeTags(data.tags);
    const links = extractLinks(body);
    notes.set(f.relative, { title: data.title ?? null, tags, aliases: aliasList, links, body });
    for (const a of aliasList) {
      const key = a.toLowerCase();
      if (!aliases.has(key)) aliases.set(key, []);
      aliases.get(key).push(f.relative);
    }
  }
  return { files, aliases, notes };
}

/** 与 splitFrontmatter 的 body 定义对齐：返回正文起始行号；null 表示无 frontmatter（body 即原文）。 */
function bodyLineOf(text) {
  if (typeof text !== 'string' || !text.startsWith('---')) return null;
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) if (END_DELIM.test(lines[i])) return i + 1;
  return null;
}

/** 按行偏移从原文件还原正文：与 splitFrontmatter 用同一套 split/join，CRLF 行为完全一致。 */
function bodyFromLine(text, line) {
  if (line === null) return text;
  return text.split(/\r?\n/).slice(line).join('\n');
}

/** 缓存缺失/损坏/格式不符一律当作「无缓存」：本次全量解析并覆写自愈，不让工具调用失败。 */
async function readCache(cachePath, signal) {
  try {
    const raw = JSON.parse(await fs.readFile(cachePath, { encoding: 'utf8', signal }));
    if (!raw || raw.version !== CACHE_VERSION || typeof raw.root !== 'string'
      || !raw.entries || typeof raw.entries !== 'object' || Array.isArray(raw.entries)) return null;
    return raw;
  } catch (err) {
    signal?.throwIfAborted();
    return null;
  }
}

function validEntry(hit) {
  return !!hit && typeof hit === 'object' && !Array.isArray(hit)
    && typeof hit.mtimeMs === 'number' && typeof hit.size === 'number'
    && (hit.bodyLine === null || (Number.isInteger(hit.bodyLine) && hit.bodyLine >= 0))
    && Array.isArray(hit.tags) && Array.isArray(hit.aliases) && Array.isArray(hit.links);
}

/**
 * 带磁盘索引缓存的扫描：mtimeMs+size 命中则不重新解析（正文按行偏移从原文件取回）；
 * 变化/新增文件重新解析，已删除文件不写回 next，从而自然从缓存剔除。
 */
async function scanWithCache(root, { signal, exclude, cachePath }) {
  signal?.throwIfAborted();
  const absRoot = path.resolve(root);
  const cache = await readCache(cachePath, signal);
  const entries = cache && cache.root === absRoot ? cache.entries : {};
  const list = (await walk(root, { signal, exclude })).filter((f) => f.relative.toLowerCase().endsWith('.md'));
  const files = [];
  const aliases = new Map();
  const notes = new Map();
  const next = Object.create(null);
  for (const f of list) {
    signal?.throwIfAborted();
    const stat = await fs.stat(f.path);
    const hit = Object.hasOwn(entries, f.relative) ? entries[f.relative] : null;
    const text = await fs.readFile(f.path, { encoding: 'utf8', signal });
    // 字节数复核：stat 与 read 之间文件被改动、或非 UTF-8 解码异常时按「未命中」重新解析，不返回脏数据。
    const fresh = validEntry(hit) && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size
      && Buffer.byteLength(text, 'utf8') === stat.size;
    let info;
    let bodyLine;
    if (fresh) {
      bodyLine = hit.bodyLine;
      info = {
        title: hit.title ?? null, tags: hit.tags, aliases: hit.aliases, links: hit.links,
        body: bodyFromLine(text, bodyLine),
      };
    } else {
      const { data, body } = splitFrontmatter(text);
      const aliasList = aliasesOf(data);
      bodyLine = bodyLineOf(text);
      info = { title: data.title ?? null, tags: normalizeTags(data.tags), aliases: aliasList, links: extractLinks(body), body };
    }
    files.push(f.relative);
    notes.set(f.relative, info);
    for (const a of info.aliases) {
      const key = a.toLowerCase();
      if (!aliases.has(key)) aliases.set(key, []);
      aliases.get(key).push(f.relative);
    }
    next[f.relative] = {
      mtimeMs: stat.mtimeMs, size: stat.size, bodyLine,
      title: info.title, tags: info.tags, aliases: info.aliases, links: info.links,
    };
  }
  // 原子写（tmp + rename）。写失败抛给 buildIndex 统一降级为纯内存全量扫描，绝不让工具调用失败。
  await atomicJson(cachePath, { version: CACHE_VERSION, root: absRoot, entries: next }, signal);
  return { files, aliases, notes };
}

/**
 * 扫描 vault 构建索引：文件列表、别名表、每篇 frontmatter 与正向链接。
 * 返回结构恒为 {files, aliases, notes}，notes 每项恒为 {title, tags, aliases, links, body}。
 * @param {object} [options]
 * @param {string} [options.cachePath] 磁盘索引缓存路径；省略时为纯内存全量扫描。
 */
export async function buildIndex(root, { signal, exclude, cachePath } = {}) {
  if (!cachePath) return scanAll(root, { signal, exclude });
  try {
    return await scanWithCache(root, { signal, exclude, cachePath });
  } catch (err) {
    // 缓存读/写/解析任一环节失败一律降级为纯内存全量扫描；signal 中止必须继续向外抛，不能被降级吞掉。
    signal?.throwIfAborted();
    return scanAll(root, { signal, exclude });
  }
}

/** 重组链接 target（用于 rename 重写，保留 section 与 alias）。 */
export function newLinkTarget(parsed, newStem) {
  let t = newStem;
  if (parsed.section) t += '#' + parsed.section;
  if (parsed.alias) t += '|' + parsed.alias;
  return t;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 在去掉 wikilink 的正文里查找目标笔记名/别名的未链接提及，返回带上下文片段。 */
export function unlinkedMentions(body, names) {
  const stripped = body.replace(/!?\[\[[^\[\]\n]+\]\]/g, ' ');
  const mentions = [];
  for (const name of names) {
    if (!name || name.length < 2) continue;
    const re = new RegExp(escapeRegExp(name), 'ig');
    let m;
    while ((m = re.exec(stripped))) {
      mentions.push({ name, snippet: stripped.slice(Math.max(0, m.index - 40), m.index + name.length + 60).trim() });
    }
  }
  return mentions;
}
