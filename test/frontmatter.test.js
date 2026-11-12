import test from 'node:test';
import assert from 'node:assert/strict';
import { splitFrontmatter, parseYaml, serializeYaml, buildFrontmatter, aliasesOf } from '../lib/utils/frontmatter.js';

test('splitFrontmatter returns empty data when no frontmatter', () => {
  const { data, body } = splitFrontmatter('# 标题\n\n正文');
  assert.deepEqual(data, {});
  assert.equal(body, '# 标题\n\n正文');
});

test('splitFrontmatter parses common scalar frontmatter and keeps body', () => {
  const text = '---\ntitle: 我的笔记\ntags:\n  - a\n  - b\ncreated: 2026-11-12\ndone: true\nscore: 3\n---\n正文内容';
  const { data, body } = splitFrontmatter(text);
  assert.equal(data.title, '我的笔记');
  assert.deepEqual(data.tags, ['a', 'b']);
  assert.equal(data.created, '2026-11-12');
  assert.equal(data.done, true);
  assert.equal(data.score, 3);
  assert.equal(body, '正文内容');
});

test('parseYaml handles aliases inline array, block array, single string and nested map', () => {
  assert.deepEqual(parseYaml('aliases: [Foo, Bar]').aliases, ['Foo', 'Bar']);
  assert.deepEqual(parseYaml('aliases:\n  - Foo\n  - Bar').aliases, ['Foo', 'Bar']);
  assert.equal(parseYaml('aliases: OnlyOne').aliases, 'OnlyOne');
  assert.deepEqual(parseYaml('nested:\n  key: value\n  num: 2').nested, { key: 'value', num: 2 });
});

test('parseYaml handles quoted strings, inline maps and booleans', () => {
  assert.equal(parseYaml('note: "has: colon"').note, 'has: colon');
  assert.deepEqual(parseYaml('meta: {a: 1, b: x}').meta, { a: 1, b: 'x' });
  assert.equal(parseYaml('flag: true').flag, true);
  assert.equal(parseYaml('flag: false').flag, false);
  assert.equal(parseYaml('none: ~').none, null);
});

test('aliasesOf normalizes all alias shapes to a string array', () => {
  assert.deepEqual(aliasesOf({ aliases: 'Foo' }), ['Foo']);
  assert.deepEqual(aliasesOf({ aliases: ['Foo', 'Bar'] }), ['Foo', 'Bar']);
  assert.deepEqual(aliasesOf({ aliases: ['Foo', 3, ''] }), ['Foo']);
  assert.deepEqual(aliasesOf({}), []);
});

test('buildFrontmatter round-trips data through serializeYaml', () => {
  const data = { title: '标题', tags: ['a', 'b'], done: true, nested: { k: 'v' } };
  const text = buildFrontmatter(data, '正文');
  assert.ok(text.startsWith('---\n'));
  const { data: parsed, body } = splitFrontmatter(text);
  assert.deepEqual(parsed, data);
  assert.equal(body, '正文');
});

test('buildFrontmatter returns body unchanged for empty data', () => {
  assert.equal(buildFrontmatter({}, '正文'), '正文');
});

test('unterminated frontmatter delimiter is treated as plain body', () => {
  const text = '---\ntitle: 无闭合';
  const { data, body } = splitFrontmatter(text);
  assert.deepEqual(data, {});
  assert.equal(body, text);
});

test('serializeYaml quotes strings that contain YAML-significant characters', () => {
  const out = serializeYaml({ a: 'has: colon', b: 'plain' });
  assert.ok(out.includes('a: "has: colon"'));
  assert.ok(out.includes('b: plain'));
});
