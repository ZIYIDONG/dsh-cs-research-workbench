import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classifyError, nutstoreDelete, nutstoreLogs } from '../lib/services/nutstore.js';

test('classifyError maps HTTP and network errors to actionable kinds', () => {
  assert.equal(classifyError(Object.assign(new Error('x'), { status: 401 })).kind, 'auth-failed');
  assert.equal(classifyError(Object.assign(new Error('x'), { status: 403 })).kind, 'forbidden');
  assert.equal(classifyError(Object.assign(new Error('x'), { status: 404 })).kind, 'not-found');
  assert.equal(classifyError(Object.assign(new Error('x'), { status: 412 })).kind, 'conflict');
  assert.equal(classifyError(new Error('fetch failed')).kind, 'network');
  assert.equal(classifyError(new Error('Local file exceeds 32 MiB limit')).kind, 'too-large');
  assert.equal(classifyError(new Error('Configure Nutstore app password via credentials')).kind, 'auth-missing');
  assert.equal(classifyError(new Error('weird')).kind, 'unknown');
});

test('nutstoreDelete requires explicit confirm', async () => {
  await assert.rejects(nutstoreDelete({ get: () => undefined }, '/tmp', 'a.md', undefined, {}), /confirm:true/);
});

test('nutstoreDelete refuses the configured remote root', async () => {
  await assert.rejects(nutstoreDelete({ get: () => undefined }, '/tmp', '', undefined, { confirm: true }), /relative child path|remote root/);
});

test('nutstoreLogs returns an empty list when no log file exists', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-nutstore-'));
  try {
    assert.deepEqual(await nutstoreLogs(root, 10), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
