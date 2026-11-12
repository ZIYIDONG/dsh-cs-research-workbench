import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { zoteroTools } from '../lib/tools/zotero.js';
import { setConfig, DEFAULTS } from '../lib/services/config.js';

const base = path.resolve('.test-artifacts');
await fs.mkdir(base, { recursive: true });
const definitions = zoteroTools({ get: () => undefined });
const call = (name, args, signal = new AbortController().signal) => definitions.find(tool => tool.name === `dsh_csrw_zotero_${name}`).execute(args, { signal });
const article = { key: 'ABCD1234', data: { key: 'ABCD1234', itemType: 'journalArticle', title: 'Secure systems', date: '2026', DOI: '10.1234/test', creators: [{ creatorType: 'author', firstName: 'A', lastName: 'Researcher' }], abstractNote: 'Evidence', tags: [{ tag: 'security' }] } };
async function fixture(t, respond) {
  const root = await fs.mkdtemp(path.join(base, 'zotero-'));
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, headers: req.headers });
    respond(req, res);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await setConfig(root, 'zotero.localApi', `http://127.0.0.1:${server.address().port}/api`);
  return { root, requests, server };
}
function json(res, value, total) {
  res.setHeader('Content-Type', 'application/json');
  if (total !== undefined) res.setHeader('Total-Results', String(total));
  res.end(JSON.stringify(value));
}

test('Zotero uses five canonical DSL tools and defaults to credential-free local API', () => {
  assert.deepEqual(definitions.map(tool => tool.name), ['search', 'item', 'notes', 'attachments', 'cite'].map(name => `dsh_csrw_zotero_${name}`));
  assert.equal(DEFAULTS.zotero.localApi, 'http://127.0.0.1:23119/api');
  assert.equal(definitions[0].parameters.properties.query.type, 'string');
  const value = { items: [], total: 0, nextStart: null, truncated: false };
  assert.deepEqual(definitions[0].output.render({}, value), [{ type: 'text', text: JSON.stringify(value) }]);
});

test('Zotero real mock HTTP verifies search/item/children/citation GET paths and output', async t => {
  const { root, requests } = await fixture(t, (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.searchParams.get('format') === 'bib') { res.setHeader('Content-Type', 'text/html'); res.end('<div>Researcher (2026). Secure systems.</div>'); return; }
    if (url.pathname.endsWith('/children')) {
      json(res, url.searchParams.get('itemType') === 'note'
        ? [{ key: 'NOTE1234', data: { itemType: 'note', note: '<p>Evidence</p>' } }]
        : [{ key: 'FILE1234', data: { itemType: 'attachment', filename: 'paper.pdf', contentType: 'application/pdf', linkMode: 'imported_file', path: '/private/storage/paper.pdf' } }], 1);
      return;
    }
    json(res, url.pathname.endsWith('/ABCD1234') ? article : [article], 1);
  });
  const found = await call('search', { workspace: root, query: '安全 & systems', limit: 2, start: 0 });
  assert.equal(found.items[0].title, 'Secure systems'); assert.equal(found.nextStart, null);
  const item = await call('item', { workspace: root, key: 'ABCD1234' });
  assert.equal(item.item.abstractNote, 'Evidence'); assert.deepEqual(item.item.tags, ['security']);
  const notes = await call('notes', { workspace: root, key: 'ABCD1234' });
  assert.equal(notes.items[0].note, '<p>Evidence</p>');
  const attachments = await call('attachments', { workspace: root, key: 'ABCD1234' });
  assert.equal(attachments.items[0].filename, 'paper.pdf'); assert.equal('path' in attachments.items[0], false);
  const citation = await call('cite', { workspace: root, key: 'ABCD1234' });
  assert.equal(citation.style, 'apa'); assert.match(citation.citation, /Researcher/); assert.equal(citation.format, 'html');
  assert.equal(requests.length, 5);
  for (const request of requests) {
    assert.equal(request.method, 'GET'); assert.equal(request.headers.authorization, undefined); assert.equal(request.headers['zotero-api-key'], undefined);
    assert.equal(request.headers.cookie, undefined);
    assert.ok(new URL(request.url, 'http://localhost').pathname.startsWith('/api/users/0/items'));
  }
  const search = new URL(requests[0].url, 'http://localhost');
  assert.equal(search.pathname, '/api/users/0/items'); assert.equal(search.searchParams.get('q'), '安全 & systems');
  assert.equal(search.searchParams.get('qmode'), 'everything'); assert.equal(search.searchParams.get('limit'), '2');
  assert.equal(new URL(requests[1].url, 'http://localhost').pathname, '/api/users/0/items/ABCD1234');
  assert.equal(new URL(requests[2].url, 'http://localhost').searchParams.get('itemType'), 'note');
  assert.equal(new URL(requests[3].url, 'http://localhost').searchParams.get('itemType'), 'attachment');
  const cite = new URL(requests[4].url, 'http://localhost');
  assert.equal(cite.searchParams.get('format'), 'bib'); assert.equal(cite.searchParams.get('style'), 'apa');
});

test('Zotero bounds count, strings, notes and citation text with pagination markers', async t => {
  const huge = { ...article, data: { ...article.data, title: 'x'.repeat(1100), abstractNote: 'a'.repeat(13000) } };
  const { root } = await fixture(t, (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.searchParams.get('format') === 'bib') { res.end('c'.repeat(17000)); return; }
    if (url.pathname.endsWith('/children')) { json(res, [{ key: 'NOTE1234', data: { itemType: 'note', note: 'n'.repeat(9000) } }], 1); return; }
    json(res, url.pathname.endsWith('/ABCD1234') ? huge : [huge, article, article], 12);
  });
  const found = await call('search', { workspace: root, query: 'x', limit: 1, start: 3 });
  assert.equal(found.items.length, 1); assert.equal(found.items[0].title.length, 1000);
  assert.equal(found.total, 12); assert.equal(found.nextStart, 4); assert.equal(found.truncated, true);
  const item = await call('item', { workspace: root, key: 'ABCD1234' });
  assert.equal(item.item.abstractNote.length, 12000); assert.equal(item.truncated, true);
  const notes = await call('notes', { workspace: root, key: 'ABCD1234' });
  assert.equal(notes.items[0].note.length, 8000); assert.equal(notes.truncated, true);
  const cite = await call('cite', { workspace: root, key: 'ABCD1234' });
  assert.equal(cite.citation.length, 16000); assert.equal(cite.truncated, true);
});

test('Zotero validates keys, paging and styles before HTTP, and rejects cloud config', async t => {
  const { root, requests } = await fixture(t, (_req, res) => json(res, []));
  for (const args of [{ query: ' ' }, { query: 'x', limit: 0 }, { query: 'x', limit: 101 }, { query: 'x', start: -1 }, { query: 'x', start: 1.5 }]) await assert.rejects(call('search', { workspace: root, ...args }));
  for (const key of ['../files', 'lowerkey', 'A?BADKEY', 'ABCD1234/children']) await assert.rejects(call('item', { workspace: root, key }));
  await assert.rejects(call('cite', { workspace: root, key: 'ABCD1234', style: 'https://example.invalid/style' }), /style/);
  await assert.rejects(setConfig(root, 'zotero.localApi', 'https://api.zotero.org'));
  assert.equal(requests.length, 0);
});

test('Zotero HTTP, invalid JSON, malformed data, redirects and oversized bodies throw', async t => {
  let mode = 'http';
  const { root, requests } = await fixture(t, (_req, res) => {
    if (mode === 'http') { res.writeHead(404); res.end('not found'); }
    else if (mode === 'redirect') { res.writeHead(302, { Location: 'https://example.invalid/cloud' }); res.end(); }
    else if (mode === 'json') res.end('not-json');
    else if (mode === 'shape') json(res, { wrong: [] });
    else if (mode === 'item') json(res, { key: 'ABCD1234' });
    else res.end('x'.repeat(2 * 1024 * 1024 + 1));
  });
  await assert.rejects(call('item', { workspace: root, key: 'ABCD1234' }), /HTTP 404/);
  mode = 'redirect'; await assert.rejects(call('item', { workspace: root, key: 'ABCD1234' }), /HTTP 302/);
  mode = 'json'; await assert.rejects(call('item', { workspace: root, key: 'ABCD1234' }), /invalid JSON/);
  mode = 'shape'; await assert.rejects(call('search', { workspace: root, query: 'x' }), /invalid item list/);
  mode = 'item'; await assert.rejects(call('item', { workspace: root, key: 'ABCD1234' }), /invalid item/);
  mode = 'large'; await assert.rejects(call('item', { workspace: root, key: 'ABCD1234' }), /exceeded 2 MiB/);
  assert.equal(requests.length, 6);
});

test('Zotero connection failures are actionable; cancellation reaches real HTTP request', async t => {
  const { root, server, requests } = await fixture(t, (_req, _res) => {});
  const abort = new AbortController();
  const pending = call('item', { workspace: root, key: 'ABCD1234' }, abort.signal);
  const incoming = once(server, 'request');
  await incoming;
  abort.abort(new Error('user cancelled Zotero'));
  await assert.rejects(pending, /user cancelled Zotero/);
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await assert.rejects(call('item', { workspace: root, key: 'ABCD1234' }), /本机 API 连接失败或超时.*无云端回退/);
  assert.equal(requests.length, 1);
});
