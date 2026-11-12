import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { paperTools } from '../lib/tools/paper.js';
import { setConfig } from '../lib/services/config.js';

const base = path.resolve('.test-artifacts');
await fs.mkdir(base, { recursive: true });
const definitions = paperTools({ get: () => undefined });
const call = (args, signal = new AbortController().signal) => definitions.find(t => t.name === 'dsh_csrw_paper_to_note').execute(args, { signal });

test('paper_to_note generates frontmatter, cite and attachment references from Zotero', async t => {
  const root = await fs.mkdtemp(path.join(base, 'paper-'));
  await fs.mkdir(path.join(root, '.obsidian'));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname.endsWith('/children')) {
      res.end(JSON.stringify([{ key: 'FILE1234', data: { itemType: 'attachment', filename: 'paper.pdf' } }]));
      return;
    }
    res.end(JSON.stringify({ key: 'ABCD1234', data: { itemType: 'journalArticle', title: 'Secure systems', date: '2026-01-15', DOI: '10.1234/x', creators: [{ creatorType: 'author', firstName: 'A', lastName: 'Researcher' }], abstractNote: 'Evidence', tags: [{ tag: 'security' }], url: 'https://example.org' } }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await setConfig(root, 'zotero.localApi', `http://127.0.0.1:${server.address().port}/api`);
  const r = await call({ workspace: root, key: 'ABCD1234' });
  assert.equal(r.title, 'Secure systems');
  assert.equal(r.cite, '[[cite:ABCD1234]]');
  assert.equal(r.destination, 'papers/ABCD1234.md');
  assert.deepEqual(r.attachments, ['paper.pdf']);
  const text = await fs.readFile(path.join(root, r.destination), 'utf8');
  assert.match(text, /title: Secure systems/);
  assert.match(text, /\[\[cite:ABCD1234\]\]/);
  assert.match(text, /!\[\[paper\.pdf\]\]/);
  assert.match(text, /Evidence/);
});

test('paper_to_note rejects invalid keys and overwrite collisions', async t => {
  const root = await fs.mkdtemp(path.join(base, 'paper-'));
  await fs.mkdir(path.join(root, '.obsidian'));
  await assert.rejects(call({ workspace: root, key: 'lowerkey' }), /key/);
  const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ key: 'ABCD1234', data: { itemType: 'journalArticle', title: 'T' } })); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await setConfig(root, 'zotero.localApi', `http://127.0.0.1:${server.address().port}/api`);
  await call({ workspace: root, key: 'ABCD1234' });
  await assert.rejects(call({ workspace: root, key: 'ABCD1234' }), /overwrite/);
});
