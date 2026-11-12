// Git 执行封装：下沉到 services 层，供 tools/git.js 与 tools/backup.js 复用，
// 避免工具模块之间的横向依赖。
import childProcess from 'node:child_process';

const MAX_OUTPUT = 1024 * 1024;

export async function git(root, args, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1' };
    // Do not inherit overrides which redirect Git's repository or index.
    for (const key of Object.keys(env)) {
      if (/^GIT_(?:DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG.*|CEILING_DIRECTORIES)$/i.test(key)) delete env[key];
    }
    let child;
    try {
      child = childProcess.spawn('git', ['-c', 'core.quotePath=false', ...args], {
        cwd: root, env, shell: false, windowsHide: true, signal,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) { reject(error); return; }
    const chunks = [];
    let bytes = 0, overflow = false;
    // Drain stderr without echoing remote URLs or credentials.
    const collect = (chunk, keep) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT) { overflow = true; child.kill(); return; }
      if (keep) chunks.push(Buffer.from(chunk));
    };
    child.stdout.on('data', chunk => collect(chunk, true));
    child.stderr.on('data', chunk => collect(chunk, false));
    child.once('error', error => {
      if (error?.code === 'ENOENT') reject(new Error('Git executable not found in PATH; install Git or add it to PATH before using dsh_csrw_git_*'));
      else reject(error);
    });
    child.once('close', (code, killedBy) => {
      if (signal.aborted) { reject(signal.reason); return; }
      if (overflow) { reject(new Error('Git output exceeded 1 MiB')); return; }
      if (code !== 0) {
        const command = args.find(value => ['init', 'status', 'rev-parse', 'remote', 'add', 'commit', 'push', 'pull'].includes(value)) ?? 'operation';
        reject(new Error(`Git ${command} failed (exit ${code ?? killedBy}); check repository configuration and authentication`)); return;
      }
      // Decode after joining chunks so split multibyte filenames remain intact.
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}
