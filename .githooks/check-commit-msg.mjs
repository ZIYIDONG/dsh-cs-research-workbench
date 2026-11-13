#!/usr/bin/env node
// Reject commit messages that are not written in English.
// Invoked by .githooks/commit-msg. Rule: .codebuddy/rules/csrw-commit/RULE.mdc
import fs from 'node:fs';

const file = process.argv[2];
if (!file) process.exit(0);

let raw;
try {
  raw = fs.readFileSync(file, 'utf8');
} catch {
  process.exit(0);
}

// Git strips comment lines before committing; ignore them here too, but keep real line numbers.
const lines = raw
  .split(/\r?\n/)
  .map((text, i) => ({ text, no: i + 1 }))
  .filter((entry) => !entry.text.startsWith('#'));

const subject = lines[0]?.text ?? '';

// Git-generated messages are exempt: merge/revert subjects embed branch or ref names.
if (/^(Merge|Revert)\b/.test(subject)) process.exit(0);
if (lines.length === 0) process.exit(0);

// CJK radicals, CJK punctuation, kana, unified ideographs, compatibility ideographs,
// full-width forms, and the supplementary ideographic planes.
const CJK = /[\u2E80-\u2FFF\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u{20000}-\u{2FA1F}]/u;

const hits = [];
for (const entry of lines) {
  const match = entry.text.match(CJK);
  if (!match) continue;
  hits.push({ no: entry.no, char: match[0], column: entry.text.indexOf(match[0]) + 1 });
}

if (hits.length > 0) {
  process.stderr.write('\n提交被拒绝：commit message 必须使用英文。\n\n');
  for (const hit of hits) {
    process.stderr.write(`  第 ${hit.no} 行第 ${hit.column} 个字符：${JSON.stringify(hit.char)}\n`);
  }
  process.stderr.write('\n改写示例：\n');
  process.stderr.write('  feat(todo): add filter by priority\n');
  process.stderr.write('  fix(desk): mount the route through conditional injection\n\n');
  process.stderr.write('规则见 .codebuddy/rules/csrw-commit/RULE.mdc\n');
  process.stderr.write('确需跳过（不推荐）：git commit --no-verify\n\n');
  process.exit(1);
}

if (subject.length > 72) {
  process.stderr.write(`提示：subject 长 ${subject.length} 字符，建议不超过 72。\n`);
}

process.exit(0);
