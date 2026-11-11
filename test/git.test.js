import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { gitTools } from '../lib/tools/git.js';
import { setConfig } from '../lib/services/config.js';

const base = path.resolve('.test-artifacts');
await fs.mkdir(base, { recursive: true });
const definitions = gitTools({ get: () => undefined });
const exec = () => ({ signal: new AbortController().signal });
const call = (name, args, execution = exec()) => definitions.find(tool => tool.name === `csrw_git_${name}`).execute(args, execution);
async function fixture(repo = true) {
  const root = await fs.mkdtemp(path.join(base, 'git-'));
  if (repo) await fs.mkdir(path.join(root, '.git'));
  return root;
}
function mockGit(t, root, respond = () => '') {
  const calls = [];
  t.mock.method(childProcess, 'spawn', (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => { child.emit('close', null, 'SIGTERM'); return true; };
    queueMicrotask(async () => {
      try {
        const value = args.includes('--show-toplevel') ? `${root}\n` : args.includes('HEAD') ? 'abc123\n' : await respond(args, options, child);
        if (value instanceof Error) { child.emit('error', value); return; }
        const result = typeof value === 'object' && value !== null ? value : { stdout: value };
        child.stdout.end(result.stdout ?? '');
        child.stderr.end(result.stderr ?? '');
        child.emit('close', result.code ?? 0, null);
      } catch (error) { child.emit('error', error); }
    });
    return child;
  });
  return calls;
}

test('Git exports five real DSL tools with canonical JSON output and pre-abort rejection', async () => {
  assert.deepEqual(definitions.map(tool => tool.name), ['status', 'init', 'commit', 'push', 'pull'].map(name => `csrw_git_${name}`));
  assert.equal(definitions[2].parameters.properties.files.type, 'array');
  const root = await fixture(false);
  assert.deepEqual(await call('status', { workspace: root }), { initialized: false, changes: [], dirty: false });
  assert.deepEqual(await call('status', { workspace: root }), { initialized: false, changes: [], dirty: false });
  const value = { initialized: false, changes: [], dirty: false };
  assert.deepEqual(definitions[0].output.render({}, value), [{ type: 'text', text: JSON.stringify(value) }]);
  const abort = new AbortController(); abort.abort(new Error('cancelled'));
  await assert.rejects(call('status', { workspace: root }, { signal: abort.signal }), /cancelled/);
  assert.deepEqual(await fs.readdir(root), []);
});

test('Git init preserves existing ignores, adds sensitive exclusions, and is idempotent', async t => {
  const root = await fixture(false);
  await fs.writeFile(path.join(root, '.gitignore'), 'custom/');
  const calls = mockGit(t, root, async args => { if (args.includes('init')) await fs.mkdir(path.join(root, '.git')); return ''; });
  assert.deepEqual(await call('init', { workspace: root }), { initialized: true, created: true, gitignoreUpdated: true });
  const before = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
  for (const rule of ['custom/', '.csrw/', '.env', '*.pem', '*credentials*', 'attachments/', 'storage/', '*.pdf']) assert.ok(before.split('\n').includes(rule));
  assert.deepEqual(await call('init', { workspace: root }), { initialized: true, created: false, gitignoreUpdated: false });
  assert.equal(await fs.readFile(path.join(root, '.gitignore'), 'utf8'), before);
  assert.equal(calls.filter(call => call.args.includes('init')).length, 1);
  assert.ok(calls[0].args.includes('--initial-branch=main'));
});

test('Git status parses NUL-delimited rename and newline filenames without mutation', async t => {
  const root = await fixture();
  mockGit(t, root, args => args.includes('status') ? 'R  new name.md\0old name.md\0?? line\nbreak.md\0' : '');
  assert.deepEqual(await call('status', { workspace: root }), {
    initialized: true, dirty: true,
    changes: [{ index: 'R', worktree: ' ', path: 'new name.md', originalPath: 'old name.md' }, { index: '?', worktree: '?', path: 'line\nbreak.md' }],
  });
});

test('Git commit validates all paths before staging and uses explicit --only files, no push', async t => {
  const root = await fixture();
  await fs.writeFile(path.join(root, 'notes.md'), 'research');
  await fs.writeFile(path.join(root, '-literal.md'), 'safe');
  await fs.mkdir(path.join(root, 'folder'));
  const calls = mockGit(t, root);
  for (const file of ['../outside.md', '.csrw/config.json', '.git/config', '.env', 'credentials.json', 'paper.pdf', 'attachments/paper.txt', 'folder', '*.md', path.join(root, 'notes.md')]) {
    await assert.rejects(call('commit', { workspace: root, message: 'test', files: ['notes.md', file] }));
  }
  assert.equal(calls.filter(call => call.args.includes('add')).length, 0);
  assert.deepEqual(await call('commit', { workspace: root, message: 'research update', files: ['notes.md', '-literal.md'] }), { commit: 'abc123', files: ['notes.md', '-literal.md'], pushed: false });
  const staging = calls.find(call => call.args.includes('add'));
  assert.deepEqual(staging.args.slice(staging.args.indexOf('add')), ['add', '--', 'notes.md', '-literal.md']);
  const commit = calls.find(call => call.args.includes('commit'));
  assert.deepEqual(commit.args.slice(commit.args.indexOf('commit')), ['commit', '--only', '-m', 'research update', '--', 'notes.md', '-literal.md']);
  assert.equal(calls.some(call => call.args.includes('push')), false);
  for (const call of calls) {
    assert.equal(call.command, 'git'); assert.equal(call.options.shell, false);
    assert.deepEqual(call.options.stdio, ['ignore', 'pipe', 'pipe']);
    assert.equal(call.options.env.GIT_LITERAL_PATHSPECS, '1');
    assert.ok(call.options.signal instanceof AbortSignal);
  }
});

test('Git push requires remote; pull refuses dirty tree and disables configured auto-stash', async t => {
  const root = await fixture();
  let dirty = true, remote = false;
  const calls = mockGit(t, root, args => {
    if (args.includes('status')) return dirty ? ' M notes.md\0' : '';
    if (args.includes('get-url')) return remote ? 'https://example.invalid/research.git\n' : { code: 2, stderr: 'https://user:private@example.invalid' };
    return '';
  });
  await assert.rejects(call('push', { workspace: root }), error => !error.message.includes('private'));
  assert.equal(calls.some(call => call.args.includes('push')), false);
  await assert.rejects(call('pull', { workspace: root }), /Dirty working tree/);
  assert.equal(calls.some(call => call.args.includes('pull')), false);
  dirty = false; remote = true;
  assert.equal((await call('pull', { workspace: root })).rebase, false);
  await setConfig(root, 'git.pullRebase', true);
  assert.equal((await call('pull', { workspace: root })).rebase, true);
  const pulls = calls.filter(call => call.args.includes('pull'));
  assert.ok(pulls[0].args.includes('--ff-only'));
  assert.ok(pulls[1].args.includes('--rebase'));
  for (const pull of pulls) {
    assert.ok(pull.args.includes('rebase.autoStash=false'));
    assert.ok(pull.args.includes('merge.autoStash=false'));
    assert.equal(pull.args.includes('stash'), false);
  }
  // Mock only: no network process is started.
  assert.deepEqual(await call('push', { workspace: root }), { pushed: true, remote: 'origin', branch: 'main' });
});

test('Git rejects non-root repositories, propagates spawn errors and in-flight cancellation', async t => {
  const root = await fixture();
  let mode = 'root';
  t.mock.method(childProcess, 'spawn', (_command, _args, options) => {
    if (mode === 'spawn') throw Object.assign(new Error('spawn EPERM'), { code: 'EPERM' });
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => true;
    if (mode === 'root') queueMicrotask(() => { child.stdout.end(path.dirname(root)); child.emit('close', 0); });
    else options.signal.addEventListener('abort', () => { child.emit('error', options.signal.reason); child.emit('close', null); }, { once: true });
    return child;
  });
  await assert.rejects(call('status', { workspace: root }), /repository root/);
  mode = 'spawn'; await assert.rejects(call('status', { workspace: root }), /spawn EPERM/);
  mode = 'abort'; const abort = new AbortController();
  const pending = call('status', { workspace: root }, { signal: abort.signal });
  setTimeout(() => abort.abort(new Error('in-flight cancellation')), 20);
  await assert.rejects(pending, /in-flight cancellation/);
});

test('Git autoInit is opt-in for commit and only runs after every path validates',async t=>{
 const root=await fixture(false);await fs.writeFile(path.join(root,'notes.md'),'note');
 const calls=mockGit(t,root,async args=>{if(args.includes('init'))await fs.mkdir(path.join(root,'.git'));return '';});
 await assert.rejects(call('commit',{workspace:root,message:'first',files:['notes.md']}),/not initialized/);
 await setConfig(root,'git.autoInit',true);
 assert.equal((await call('status',{workspace:root})).initialized,false);
 await assert.rejects(call('commit',{workspace:root,message:'bad',files:['notes.md','../outside']}));
 assert.equal(calls.some(c=>c.args.includes('init')),false);
 assert.equal((await call('commit',{workspace:root,message:'first',files:['notes.md']})).pushed,false);
 assert.equal(calls.filter(c=>c.args.includes('init')).length,1);
 assert.ok((await fs.readFile(path.join(root,'.gitignore'),'utf8')).includes('.csrw/'));
});

test('real Git local integration when sandbox permits captured spawn (no external push)', async t => {
  const root = await fixture(false);
  try { await call('init', { workspace: root }); }
  catch (error) {
    if (error.code === 'EPERM' || /spawn EPERM/.test(error.message)) { t.skip('Windows sandbox denied captured child_process.spawn (EPERM); no bypass attempted'); return; }
    throw error;
  }
  // Identity is injected per test process, without modifying global or repository config.
  const previous = {};
  for (const [key, value] of Object.entries({ GIT_AUTHOR_NAME: 'CSRW Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'CSRW Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' })) {
    previous[key] = process.env[key]; process.env[key] = value;
  }
  try {
    await fs.writeFile(path.join(root, 'notes.md'), 'research\n');
    const result = await call('commit', { workspace: root, message: 'research', files: ['notes.md', '.gitignore'] });
    assert.match(result.commit, /^[a-f0-9]{40,64}$/);
    assert.equal(result.pushed, false);
    assert.equal((await call('status', { workspace: root })).dirty, false);
    assert.equal((await call('init', { workspace: root })).created, false);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
