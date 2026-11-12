import fs from 'node:fs/promises';
import path from 'node:path';
import { tool, s, workspaceOf, outputObject } from './common.js';
import { loadConfig } from '../services/config.js';
import { safePath, exists, nonempty } from '../utils/path.js';
import { git } from '../services/git.js';

const IGNORE = [
  '.dsh-csrw/', '.csrw/', '.env', '.env.*', '*.pem', '*.key', '*.p12', '*.pfx',
  '.ssh/', '.aws/', '.gnupg/', '*credentials*', '*secrets*', '.npmrc', '.netrc',
  'attachments/', 'storage/', '*.pdf', '*.epub', '*.docx', '*.pptx', '*.zip',
];
const sensitive = value => value.split('/').some(part =>
  /^(?:\.git|\.(?:dsh-csrw|csrw)|\.ssh|\.aws|\.gnupg|attachments?|storage)$/i.test(part)
  || /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|id_rsa|id_ed25519)$/i.test(part)
  || /credential|secret|password|token/i.test(part)
  || /\.(?:pem|key|p12|pfx|pdf|epub|docx|pptx|zip)$/i.test(part));

async function ensureIgnore(root, signal) {
  const file = await safePath(root, '.gitignore');
  let before = '';
  try { before = await fs.readFile(file, { encoding: 'utf8', signal }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const lines = new Set(before.split(/\r?\n/));
  const missing = IGNORE.filter(line => !lines.has(line));
  if (!missing.length) return false;
  signal.throwIfAborted();
  await fs.appendFile(file, `${before && !before.endsWith('\n') ? '\n' : ''}\n# CS Research Workbench: local state, credentials, attachments\n${missing.join('\n')}\n`, { signal });
  return true;
}

export function gitTools(ctx) {
  async function workspace(args, exec) {
    const root = await safePath(await workspaceOf(ctx, args, exec), '', { allowRoot: true });
    if (!(await fs.stat(root)).isDirectory()) throw new Error('Workspace must be a directory');
    const config = await loadConfig(root, exec.signal);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(config.git.remote)) throw new Error('git.remote must be a configured remote name');
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(config.git.branch) || /\.\.|\/\.|\.lock(?:\/|$)|[/.]$/.test(config.git.branch)) throw new Error('Invalid Git branch name');
    await safePath(root, '.git');
    return { root, config };
  }
  async function repository(root, signal) {
    if (!(await exists(path.join(root, '.git')))) return false;
    const top = (await git(root, ['rev-parse', '--show-toplevel'], signal)).trim();
    if (path.relative(root, path.resolve(top)) !== '') throw new Error('Workspace must be the repository root');
    return true;
  }
  async function requireRepository(root, signal) {
    if (!(await repository(root, signal))) throw new Error('Git is not initialized; run dsh_csrw_git_init first');
  }
  async function status(root, signal) {
    const result = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], signal);
    const records = result.split('\0');
    const changes = [];
    for (let i = 0; i < records.length; i++) {
      const entry = records[i];
      if (!entry) continue;
      const change = { index: entry[0], worktree: entry[1], path: entry.slice(3) };
      if (/[RC]/.test(entry.slice(0, 2))) change.originalPath = records[++i] ?? '';
      changes.push(change);
    }
    return changes;
  }
  async function remoteReady(root, config, signal) {
    // get-url is deliberately not returned or included in errors.
    const url = (await git(root, ['remote', 'get-url', '--', config.git.remote], signal)).trim();
    if (!url) throw new Error('Configure the Git remote URL before push/pull');
  }
  const resultSchema = outputObject({ initialized: { type: 'boolean', required: true }, changes: { type: 'json', required: true }, dirty: { type: 'boolean', required: true } });
  return [
    tool('dsh_csrw_git_status', '查看工作区自身 Git 仓库的有界状态；未初始化时返回 initialized=false。', {}, async (args, exec) => {
      const { root } = await workspace(args, exec);
      const initialized = await repository(root, exec.signal);
      const changes = initialized ? await status(root, exec.signal) : [];
      return { initialized, changes, dirty: changes.length > 0 };
    }, resultSchema),
    tool('dsh_csrw_git_init', '幂等初始化工作区 Git 仓库并补齐本地状态、凭据和附件的忽略规则。', {}, async (args, exec) => {
      const { root, config } = await workspace(args, exec);
      const initialized = await repository(root, exec.signal);
      if (!initialized) await git(root, ['init', `--initial-branch=${config.git.branch}`], exec.signal);
      const gitignoreUpdated = await ensureIgnore(root, exec.signal);
      return { initialized: true, created: !initialized, gitignoreUpdated };
    }, outputObject({ initialized: { type: 'boolean', required: true }, created: { type: 'boolean', required: true }, gitignoreUpdated: { type: 'boolean', required: true } })),
    tool('dsh_csrw_git_commit', '仅提交显式选择的普通文件或删除记录；autoInit=true 时可初始化后提交，拒绝越界、凭据和附件；不会 push。', {
      message: s('非空提交说明。'),
      files: { type: 'array', items: { type: 'string' }, required: true, description: '相对工作区的文件路径列表，1–200 项；禁止目录、通配符和敏感文件。' },
    }, async (args, exec) => {
      nonempty(args.message, 'message');
      if (!Array.isArray(args.files) || !args.files.length || args.files.length > 200) throw new Error('files must contain 1..200 explicit file paths');
      const { root, config } = await workspace(args, exec);
      const files = [];
      for (const value of args.files) {
        nonempty(value, 'file');
        if (path.isAbsolute(value) || /[*?\[\]]/.test(value)) throw new Error('An explicit relative file path is required');
        const file = await safePath(root, value);
        const relative = path.relative(root, file).split(path.sep).join('/');
        if (sensitive(relative)) throw new Error(`Sensitive file or attachment refused: ${relative}`);
        try { if (!(await fs.lstat(file)).isFile()) throw new Error('Only explicit regular files may be committed'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        files.push(relative);
      }
      const selected = [...new Set(files)];
      if (config.git.autoInit && !(await repository(root, exec.signal))) {
        await git(root, ['init', `--initial-branch=${config.git.branch}`], exec.signal);
        await ensureIgnore(root, exec.signal);
      } else await requireRepository(root, exec.signal);
      await git(root, ['add', '--', ...selected], exec.signal);
      // --only excludes unrelated staged files; disable hooks to prevent implicit external actions.
      await git(root, ['-c', 'core.hooksPath=/dev/null', 'commit', '--only', '-m', args.message, '--', ...selected], exec.signal);
      const commit = (await git(root, ['rev-parse', 'HEAD'], exec.signal)).trim();
      return { commit, files: selected, pushed: false };
    }, outputObject({ commit: { type: 'string', required: true }, files: { type: 'json', required: true }, pushed: { type: 'boolean', required: true } })),
    tool('dsh_csrw_git_push', '将当前仓库配置的分支推送到已配置的远程；会写入外部仓库，应先取得用户授权。', {}, async (args, exec) => {
      const { root, config } = await workspace(args, exec);
      await requireRepository(root, exec.signal);
      await remoteReady(root, config, exec.signal);
      await git(root, ['push', '--', config.git.remote, config.git.branch], exec.signal);
      return { pushed: true, remote: config.git.remote, branch: config.git.branch };
    }, outputObject({ pushed: { type: 'boolean', required: true }, remote: { type: 'string', required: true }, branch: { type: 'string', required: true } })),
    tool('dsh_csrw_git_pull', '从配置远程拉取分支；脏工作树拒绝，pullRebase=true 时 rebase，否则只允许快进；不自动 stash。', {}, async (args, exec) => {
      const { root, config } = await workspace(args, exec);
      await requireRepository(root, exec.signal);
      if ((await status(root, exec.signal)).length) throw new Error('Dirty working tree: commit or explicitly handle changes before pull; automatic stash is disabled');
      await remoteReady(root, config, exec.signal);
      await git(root, ['-c', 'rebase.autoStash=false', '-c', 'merge.autoStash=false', 'pull', config.git.pullRebase ? '--rebase' : '--ff-only', '--', config.git.remote, config.git.branch], exec.signal);
      return { pulled: true, remote: config.git.remote, branch: config.git.branch, rebase: config.git.pullRebase };
    }, outputObject({ pulled: { type: 'boolean', required: true }, remote: { type: 'string', required: true }, branch: { type: 'string', required: true }, rebase: { type: 'boolean', required: true } })),
  ];
}
