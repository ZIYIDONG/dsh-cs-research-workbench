// Git 远端地址校验：只放行 https/ssh 与 scp 形式，拒绝 remote-helper 语法与本地路径。
// 错误消息只回显 scheme，绝不回显 host、path 或凭据——git.test.js 有「错误不得含凭据」的断言。

export const ALLOWED_GIT_SCHEMES = new Set(['https:', 'ssh:']);

// scp 形式 user@host:path。强制要求 user@，避免把 Windows 盘符 C:\... 误判成 host:path；
// user 限 1–64 字符（git 用户名上限），host 必须以字母数字开头和结尾。
const SCP = /^[A-Za-z0-9._-]{1,64}@[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]:\S+$/;

// 盘符路径、UNC 共享路径与 POSIX 绝对路径：先于 URL 解析单独判，否则 C:\repo 会被 URL 解析成 scheme "c:"，用户看不出是"本地路径被拒"。
// 注意 `^\/` 同时覆盖 `//srv/share` 这种双斜杠写法。
const LOCAL_PATH = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/;

/**
 * 校验并原样返回远端地址；不合法直接抛错。错误消息只回显 scheme，不回显 host、path 或凭据。
 * @param {string} value - 待校验的 remote URL。
 * @param {string} [label] - 出错时提示的配置字段名，用于把用户指回配置文件。
 * @param {{allowLocal?: boolean}} [options] - allowLocal 只给「用户自己仓库」的 push/pull 用：
 *   file:// 与本地绝对路径不执任何命令、也不外发凭据，不是本校验要防的两类能力（remote-helper 执行、凭据内嵌/明文外发）。
 *   远端备份（backup_github）必须保持严格。
 *   ⚠️ 若将来新增任何能改写仓库 remote URL 的工具（remote set-url 之类），此例外必须回滚为严格。
 */
export function assertRemoteUrl(value, label = 'git remote', { allowLocal = false } = {}) {
  const allowed = allowLocal
    ? 'an https:// or ssh (git@host:path) URL, a local absolute path, or file://'
    : 'an https:// or ssh (git@host:path) URL';
  const hint = `(Git remote must be ${allowed} — check ${label} in .dsh-csrw/config.json)`;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Remote URL must be a nonempty string ${hint}`);
  const raw = value.trim();
  // ext::/fd:: 等 remote-helper 语法可执行任意命令（ext:: 已被用于 RCE），先于空格与 URL 解析拒绝，诊断才指向真正原因。
  const helper = raw.match(/^([A-Za-z][\w+.-]*)::/);
  if (helper) throw new Error(`Remote helper syntax is not allowed: ${helper[1]}:: ${hint}`);
  // 换行/NUL 必须先于本地路径放行判定：allowLocal 会在此后直接 return raw，含内部换行的路径会漏过去。
  // 注意这里只查 \r \n \0，不能把可含空格的合法本地路径（C:\my repo\bare.git）一起拦掉。
  if (/[\r\n\0]/.test(raw)) throw new Error(`Invalid remote URL ${hint}`);
  if (LOCAL_PATH.test(raw)) {
    if (allowLocal) return raw;
    throw new Error(`Local paths are not allowed ${hint}`);
  }
  if (/[\r\n\s]/.test(raw) || raw.startsWith('-')) throw new Error(`Invalid remote URL ${hint}`);
  if (SCP.test(raw)) return raw;
  let url;
  try { url = new URL(raw); } catch { throw new Error(`Remote must be an https/ssh URL or user@host:path ${hint}`); }
  if (url.protocol === 'file:') {
    // 严格模式下与其它非白名单 scheme 一并拒绝（错误形态不变）；allowLocal 时只收「无 host 或 localhost」的本地文件 URL。
    if (!allowLocal) throw new Error(`Remote scheme is not allowed: ${url.protocol} ${hint}`);
    // 必须要求规范形式：本函数校验的是 URL 归一化结果，但返回给 git 的是 raw 原文，两者解读可能不同
    // （new URL('file:repo') 得到 /repo，而 git 拿到的是 file:repo）。凡"校验一种形态、执行另一种形态"都要收口到原文。
    if (!/^file:\/\//i.test(raw)) throw new Error(`Remote file URL must be a full file:// URL ${hint}`);
    // 对 file: 该分支实际不可达（URL 解析器在构造期已拒绝 userinfo 并抛 Invalid URL），保留作解析器行为变化时的防御。
    if (url.username || url.password) throw new Error(`Remote must not embed credentials: ${url.protocol}`);
    if (url.hostname && url.hostname !== 'localhost') throw new Error(`file:// URL host is not allowed: ${url.protocol}`);
    // file://、file:///、file: 三者 pathname 都归一化为 '/'，所以不能判 falsy，必须判等于根。
    if (url.pathname === '/') throw new Error(`file:// URL must have a path: ${url.protocol}`);
    return raw;
  }
  if (!ALLOWED_GIT_SCHEMES.has(url.protocol)) throw new Error(`Remote scheme is not allowed: ${url.protocol} ${hint}`);
  // ssh 的 user 是登录名不是凭据（认证走密钥），https 的 user/password 才是；password 一律拒。
  if (url.password) throw new Error(`Remote must not embed a password: ${url.protocol} ${hint}`);
  if (url.protocol === 'https:' && url.username) throw new Error(`Remote must not embed a username: ${url.protocol} ${hint}`);
  return raw;
}

/** 日志/错误用的脱敏形式：只保留 scheme 与 host，丢弃 user、password、path、query。 */
export function redactRemote(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  const scp = raw.match(/^[A-Za-z0-9._-]+@([A-Za-z0-9.-]+):/);
  if (scp) return `scp:${scp[1]}`;
  try { const url = new URL(raw); return `${url.protocol}//${url.hostname}/…`; } catch { return '[redacted]'; }
}
