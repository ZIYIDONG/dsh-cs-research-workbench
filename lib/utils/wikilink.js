import fs from 'node:fs/promises';
import { walk } from './path.js';
import { splitFrontmatter, aliasesOf } from './frontmatter.js';

// 双链解析、消歧、索引与反推。全部在内存中按需扫描，中小 vault（几百篇）单次调用够用；
// 更大规模可后续加磁盘索引缓存（见 docs/obsidian-local-features.md §6.4）。

const LINK_RE = /(!?)\[\[([^\[\]\n]+)\]\]/g;

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

/** 扫描 vault 构建内存索引：文件列表、别名表、每篇 frontmatter 与正向链接。 */
export async function buildIndex(root, { signal, exclude } = {}) {
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
