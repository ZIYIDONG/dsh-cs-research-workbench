import { tool, s, workspaceOf, outputObject } from './common.js';
import { loadConfig } from '../services/config.js';
import { nonempty } from '../utils/path.js';
import { fetchZotero } from '../services/zotero.js';

const LIMIT = { type: 'integer', description: '返回条数，默认 20，范围 1–100。' };
const KEY = s('Zotero 条目 key，8 位大写字母或数字。');
const listingSchema = outputObject({ items: { type: 'json', required: true }, total: { type: 'json', required: true }, nextStart: { type: 'json', required: true }, truncated: { type: 'boolean', required: true } });
function keyOf(value) {
  if (typeof value !== 'string' || !/^[A-Z0-9]{8}$/.test(value)) throw new Error('key must be 8 uppercase letters or digits');
  return value;
}
function paging(args) {
  const limit = args.limit ?? 20, start = args.start ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be 1..100');
  if (!Number.isInteger(start) || start < 0 || start > 1000000) throw new Error('start must be 0..1000000');
  return { limit, start };
}
function text(value, length, state) {
  if (typeof value !== 'string') return '';
  if (value.length > length) state.truncated = true;
  return value.slice(0, length);
}
function itemData(record) {
  if (!record || typeof record !== 'object' || !record.data || typeof record.data !== 'object' || Array.isArray(record.data)) throw new Error('Zotero API returned an invalid item');
  return record.data;
}
function summary(record, state) {
  const data = itemData(record);
  const creators = Array.isArray(data.creators) ? data.creators : [];
  if (creators.length > 30) state.truncated = true;
  return {
    key: keyOf(record.key ?? data.key), itemType: text(data.itemType, 80, state),
    title: text(data.title, 1000, state), date: text(data.date, 100, state),
    DOI: text(data.DOI, 300, state), url: text(data.url, 2000, state),
    creators: creators.slice(0, 30).map(creator => ({
      creatorType: text(creator?.creatorType, 80, state), name: text(creator?.name, 300, state),
      firstName: text(creator?.firstName, 200, state), lastName: text(creator?.lastName, 200, state),
    })),
  };
}

export function zoteroTools(ctx) {
  async function request(args, exec, endpoint, params = {}, asText = false) {
    const workspace = await workspaceOf(ctx, args, exec);
    const config = await loadConfig(workspace, exec.signal);
    return fetchZotero(workspace, config, endpoint, params, exec.signal, asText);
  }
  async function list(args, exec, endpoint, params, convert) {
    const { limit, start } = paging(args);
    const { data, total } = await request(args, exec, endpoint, { format: 'json', limit, start, ...params });
    if (!Array.isArray(data)) throw new Error('Zotero API returned an invalid item list');
    const state = { truncated: data.length > limit };
    const items = data.slice(0, limit).map(record => convert(record, state));
    const more = total === null ? data.length >= limit : start + items.length < total;
    return { items, total, nextStart: more ? start + items.length : null, truncated: state.truncated || more };
  }
  const pageParameters = { limit: LIMIT, start: { type: 'integer', description: '分页偏移，默认 0，范围 0–1000000。' } };
  return [
    tool('dsh_csrw_zotero_search', '只读搜索本机 Zotero 条目，返回有界元数据和分页偏移；需要 Zotero 本机 API。', {
      query: s('非空检索词；搜索所有条目字段。'), ...pageParameters,
    }, async (args, exec) => {
      nonempty(args.query, 'query');
      if (args.query.length > 1000) throw new Error('query must be at most 1000 characters');
      return list(args, exec, 'items', { q: args.query, qmode: 'everything' }, summary);
    }, listingSchema),
    tool('dsh_csrw_zotero_item', '读取本机 Zotero 单个条目的元数据与有界摘要。', { key: KEY }, async (args, exec) => {
      const { data } = await request(args, exec, `items/${keyOf(args.key)}`, { format: 'json' });
      const state = { truncated: false };
      const item = summary(data, state);
      const details = itemData(data);
      item.abstractNote = text(details.abstractNote, 12000, state);
      item.publicationTitle = text(details.publicationTitle, 1000, state);
      const tags = Array.isArray(details.tags) ? details.tags : [];
      if (tags.length > 50) state.truncated = true;
      item.tags = tags.slice(0, 50).map(tag => text(tag?.tag, 200, state));
      return { item, truncated: state.truncated };
    }, outputObject({ item: { type: 'json', required: true }, truncated: { type: 'boolean', required: true } })),
    tool('dsh_csrw_zotero_notes', '只读列出本机 Zotero 条目的子笔记；每篇最多返回 8000 字符的原始 HTML。', { key: KEY, ...pageParameters }, async (args, exec) =>
      list(args, exec, `items/${keyOf(args.key)}/children`, { itemType: 'note' }, (record, state) => {
        const data = itemData(record);
        if (data.itemType !== 'note') throw new Error('Zotero API returned a non-note child');
        return { key: keyOf(record.key ?? data.key), note: text(data.note, 8000, state) };
      }), listingSchema),
    tool('dsh_csrw_zotero_attachments', '只读列出本机 Zotero 条目的附件元数据；不读取附件文件或下载二进制内容。', { key: KEY, ...pageParameters }, async (args, exec) =>
      list(args, exec, `items/${keyOf(args.key)}/children`, { itemType: 'attachment' }, (record, state) => {
        const data = itemData(record);
        if (data.itemType !== 'attachment') throw new Error('Zotero API returned a non-attachment child');
        return { key: keyOf(record.key ?? data.key), title: text(data.title, 1000, state), filename: text(data.filename, 500, state), contentType: text(data.contentType, 100, state), linkMode: text(data.linkMode, 100, state), url: text(data.url, 2000, state) };
      }), listingSchema),
    tool('dsh_csrw_zotero_cite', '从本机 Zotero API 获取一条格式化参考文献，返回有界 HTML 文本。', {
      key: KEY, style: s('Zotero 已安装的 CSL 样式短名，默认 apa；仅小写字母、数字和连字符。', false),
    }, async (args, exec) => {
      const key = keyOf(args.key), style = args.style ?? 'apa';
      if (typeof style !== 'string' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(style)) throw new Error('Invalid citation style');
      const { body } = await request(args, exec, `items/${key}`, { format: 'bib', style, linkwrap: 0 }, true);
      const state = { truncated: false };
      const citation = text(body, 16000, state);
      return { key, style, format: 'html', citation, truncated: state.truncated };
    }, outputObject({ key: { type: 'string', required: true }, style: { type: 'string', required: true }, format: { type: 'string', required: true }, citation: { type: 'string', required: true }, truncated: { type: 'boolean', required: true } })),
  ];
}
