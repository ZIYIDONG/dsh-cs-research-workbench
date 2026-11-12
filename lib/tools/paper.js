import fs from 'node:fs/promises';
import path from 'node:path';
import { tool, s, b, workspaceOf, outputObject } from './common.js';
import { loadConfig, detectVault } from '../services/config.js';
import { safePath, exists, nonempty } from '../utils/path.js';
import { buildFrontmatter } from '../utils/frontmatter.js';
import { fetchZotero } from '../services/zotero.js';

function pad(n) { return String(n).padStart(2, '0'); }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function text(value, length) { return typeof value === 'string' ? value.slice(0, length) : ''; }

export function paperTools(ctx) {
  return [
    tool('dsh_csrw_paper_to_note', '从本机 Zotero 条目生成一篇文献笔记写入 vault：frontmatter + [[cite:KEY]] + 摘要 + 附件引用；不下载附件文件。', {
      key: s('Zotero 条目 key，8 位大写字母或数字。'),
      destination: s('vault 内目标相对路径；省略时写入 papers/<key>.md。', false),
      overwrite: b('目标已存在时是否覆盖。'),
    }, async (a, e) => {
      if (!/^[A-Z0-9]{8}$/.test(a.key ?? '')) throw new Error('key must be 8 uppercase letters or digits');
      const workspace = await workspaceOf(ctx, a, e);
      const config = await loadConfig(workspace, e.signal);
      const root = await detectVault(workspace, config, e.signal);
      const { data } = await fetchZotero(workspace, config, `items/${a.key}`, { format: 'json' }, e.signal, false);
      const rec = data && typeof data === 'object' && !Array.isArray(data) ? data.data : null;
      if (!rec || typeof rec !== 'object') throw new Error('Zotero API returned an invalid item');
      const creators = Array.isArray(rec.creators) ? rec.creators : [];
      const authors = creators.map((c) => c?.name || `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim()).filter(Boolean);
      const year = typeof rec.date === 'string' ? (rec.date.match(/\d{4}/)?.[0] ?? '') : '';
      const tags = Array.isArray(rec.tags) ? rec.tags.map((t) => t?.tag).filter(Boolean) : [];
      const abstractNote = text(rec.abstractNote, 12000);
      const title = text(rec.title, 1000);

      let attachments = [];
      try {
        const children = await fetchZotero(workspace, config, `items/${a.key}/children`, { itemType: 'attachment', format: 'json' }, e.signal, false);
        if (Array.isArray(children.data)) attachments = children.data.map((r) => r?.data?.filename).filter(Boolean);
      } catch { /* 附件元数据失败不阻断笔记生成 */ }

      const frontmatter = {
        title, authors, year, doi: text(rec.DOI, 300), url: text(rec.url, 2000),
        tags, zoteroKey: a.key, itemType: text(rec.itemType, 80), created: todayStr(),
      };
      const lines = [`# ${title}`, '', `\`[[cite:${a.key}]]\``];
      if (abstractNote) lines.push('', '## 摘要', '', abstractNote);
      if (attachments.length) lines.push('', '## 附件', '', ...attachments.map((f) => `![[${f}]]`));
      const note = buildFrontmatter(frontmatter, lines.join('\n') + '\n');

      const destRel = a.destination ?? `papers/${a.key}.md`;
      nonempty(destRel, 'destination');
      const file = await safePath(root, destRel);
      if (await exists(file) && a.overwrite !== true) throw new Error(`Destination exists: ${destRel}; pass overwrite:true`);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, note, { flag: a.overwrite === true ? 'w' : 'wx', encoding: 'utf8', signal: e.signal });
      return { destination: destRel, key: a.key, title, cite: `[[cite:${a.key}]]`, attachments };
    }, outputObject({ destination: { type: 'string', required: true }, key: { type: 'string', required: true }, title: { type: 'string', required: true }, cite: { type: 'string', required: true }, attachments: { type: 'json', required: true } })),
  ];
}
