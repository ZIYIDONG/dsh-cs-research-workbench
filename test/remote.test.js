import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRemoteUrl, redactRemote, ALLOWED_GIT_SCHEMES } from '../lib/utils/remote.js';

// 远端地址白名单的行为契约。所有断言只针对可观测面（错误文案 / 原样返回 / 脱敏值），
// 不针对内部机制（例如不去断言 scp 正则本身），改实现时不会无故变红。

const HINT = /check .+ in \.dsh-csrw\/config\.json\)$/;

function rejection(value, label) {
  try {
    assertRemoteUrl(value, label);
  } catch (error) {
    return error.message;
  }
  throw new Error(`expected ${JSON.stringify(value)} to be rejected`);
}

function rejectionWith(value, options) {
  try {
    assertRemoteUrl(value, undefined, options);
  } catch (error) {
    return error.message;
  }
  throw new Error(`expected ${JSON.stringify(value)} to be rejected`);
}

test('remote: https remote is accepted and returned unchanged', () => {
  const value = 'https://github.com/u/r.git';
  assert.equal(assertRemoteUrl(value), value);
  assert.equal(assertRemoteUrl('https://h/r'), 'https://h/r');
});

test('remote: scp-like remote is accepted and never normalized', () => {
  const value = 'git@github.com:user/backup.git';
  const accepted = assertRemoteUrl(value);
  assert.equal(accepted, value);
  // 不补 ssh://、不改大小写、不加端口——返回值就是校验用的原串。
  assert.equal(accepted.startsWith('ssh://'), false);
});

test('remote: ssh scheme is accepted with and without a login user', () => {
  assert.equal(assertRemoteUrl('ssh://git@github.com/u/r.git'), 'ssh://git@github.com/u/r.git');
  assert.equal(assertRemoteUrl('ssh://host/r'), 'ssh://host/r');
});

test('remote: remote-helper syntax is rejected and named in the message', () => {
  assert.match(rejection('ext::sh -c id'), /^Remote helper syntax is not allowed: ext:: /);
  assert.match(rejection('fd::7'), /^Remote helper syntax is not allowed: fd:: /);
});

test('remote: non-https/ssh schemes are rejected and the scheme is echoed with its colon', () => {
  assert.match(rejection('git://h/r'), /^Remote scheme is not allowed: git: /);
  assert.match(rejection('file:///c:/repo'), /^Remote scheme is not allowed: file: /);
  assert.match(rejection('http://h/r'), /^Remote scheme is not allowed: http: /);
});

test('remote: local drive and UNC paths are rejected as local paths, not as scheme c:', () => {
  for (const value of ['C:\\repo', 'D:/repo', '\\\\srv\\share', '//srv/share']) {
    const message = rejection(value);
    assert.match(message, /^Local paths are not allowed /, value);
    // 回归护栏：不得退化成 URL 解析失败后报 scheme "c:"，否则用户看不出是本地路径被拒。
    assert.equal(/scheme/i.test(message), false, `${value} must not be reported as a scheme problem`);
  }
});

test('remote: leading dash is rejected before any URL parsing', () => {
  assert.match(rejection('--mirror'), /^Invalid remote URL /);
  assert.match(rejection('-t'), /^Invalid remote URL /);
});

test('remote: embedded password is rejected for https and ssh', () => {
  assert.match(rejection('https://u:p@h/r'), /^Remote must not embed a password: https: /);
  assert.match(rejection('ssh://git:pw@h/r'), /^Remote must not embed a password: ssh: /);
});

test('remote: embedded https username is rejected while ssh login user is allowed', () => {
  assert.match(rejection('https://u@h/r'), /^Remote must not embed a username: https: /);
  // ssh 的 user 是登录名不是凭据（认证走密钥），因此这条必须保持通过。
  assert.equal(assertRemoteUrl('ssh://git@h/r'), 'ssh://git@h/r');
});

test('remote: strings that are neither URL nor scp form are rejected', () => {
  assert.match(rejection('../repo'), /^Remote must be an https\/ssh URL or user@host:path /);
});

test('remote: empty and non-string inputs share one message through different branches', () => {
  for (const value of ['', null, undefined, 42, {}, [], true]) {
    assert.match(rejection(value), /^Remote URL must be a nonempty string /, JSON.stringify(value));
  }
});

test('remote: scp host boundary is two characters and may not end with a dot', () => {
  assert.equal(assertRemoteUrl('git@hh:x'), 'git@hh:x');
  assert.equal(assertRemoteUrl('git@h.example:r'), 'git@h.example:r');
  for (const value of ['git@h:x', 'a@b:c', 'git@host.:x']) {
    // 已知限制：scp 正则要求 host 首尾都是字母数字，单字符 host 因此被拒。
    assert.match(rejection(value), /^Remote must be an https\/ssh URL or user@host:path /, value);
  }
});

test('remote: rejections never echo host, path or credentials', () => {
  const candidates = [
    'ext::sh -c id', 'fd::7', 'git://h/r', 'file:///c:/repo', 'http://h/r',
    'C:\\repo', 'D:/repo', '\\\\srv\\share', '//srv/share', '--mirror', '-t',
    'https://u:p@h/r', 'ssh://git:pw@h/r', 'https://u@h/r', 'https://u:tok@h/r',
    '../repo', 'git@-host:x', '@host:x', 'git@host:', 'git@h:x',
  ];
  for (const value of candidates) {
    const message = rejection(value);
    for (const fragment of ['h/r', 'u:p', 'tok']) {
      assert.equal(message.includes(fragment), false, `${JSON.stringify(value)} leaked ${fragment}`);
    }
  }
});

test('remote: the label is echoed verbatim so users can find the config field', () => {
  // 默认 label 是契约的一部分（空格形式），文档里不得写成 git.remote。
  assert.match(rejection('ext::x'), /check git remote in \.dsh-csrw\/config\.json\)$/);
  assert.match(rejection('ext::x', 'git.backupRemote'), /check git\.backupRemote in \.dsh-csrw\/config\.json\)$/);
  for (const message of [rejection('git://h/r'), rejection('C:\\repo')]) assert.match(message, HINT);
});

test('remote: surrounding whitespace is trimmed and accepted (expected behavior)', () => {
  // 与 config 层不同：config.js 对 git.remote/branch 直接拒绝任何空白，两层不冲突。
  assert.equal(assertRemoteUrl('  https://github.com/u/r.git  '), 'https://github.com/u/r.git');
  assert.equal(assertRemoteUrl('\thttps://github.com/u/r.git\n'), 'https://github.com/u/r.git');
});

test('remote: whitespace inside the value is rejected', () => {
  assert.match(rejection('git@host:a b'), /^Invalid remote URL /);
  assert.match(rejection('ssh://host/r x'), /^Invalid remote URL /);
});

test('remote: scheme matching is case insensitive and the value is returned verbatim', () => {
  assert.equal(assertRemoteUrl('HTTPS://GitHub.com/u/r.git'), 'HTTPS://GitHub.com/u/r.git');
  assert.equal(assertRemoteUrl('SSH://git@host/r'), 'SSH://git@host/r');
});

test('remote: the allowed scheme set is exactly https and ssh', () => {
  assert.deepEqual([...ALLOWED_GIT_SCHEMES].sort(), ['https:', 'ssh:']);
});

test('redactRemote: helper commands are never echoed', () => {
  // 只断性质、不钉字面值：将来实现若把这些形态统一改成 [redacted]（一种改进），断言仍然成立。
  for (const value of ['ext::sh -c id', 'fd::7']) {
    const redacted = redactRemote(value);
    assert.equal(typeof redacted, 'string', value);
    for (const fragment of ['sh', 'id', '::']) {
      assert.equal(redacted.includes(fragment), false, `${JSON.stringify(value)} leaked ${fragment}`);
    }
  }
  // 盘符形态不承诺「从不回显盘符」（盘符会以小写协议名存活），要守住的是**路径主体**不被回显。
  // 这条能抓到「原样返回 raw」，同时对改成 [redacted] 的实现也成立。
  for (const value of ['C:\\repo', 'D:/repo']) {
    assert.equal(redactRemote(value).includes('repo'), false, `${JSON.stringify(value)} leaked the path body`);
  }
});

test('redactRemote: keeps scheme and host only, and drops path, query and credentials', () => {
  assert.equal(redactRemote('git@github.com:u/r.git'), 'scp:github.com');
  assert.match(redactRemote('https://u:p@h.example/r?x=1'), /^https:\/\/h\.example\/\u2026$/);
  assert.match(redactRemote('file:///C:/repo'), /^file:\/\/\/\u2026$/);
  assert.equal(redactRemote('\\\\srv\\share'), '[redacted]');
  assert.equal(redactRemote(''), '');
  assert.equal(redactRemote(null), '');
  assert.equal(redactRemote('https://u:p@h.example/r').includes('u:p'), false);
});

test('remote: allowLocal never opens the RCE or credential surfaces', () => {
  // allowLocal 只放宽「本地路径」这一类，不外溢到 remote-helper 执行与凭据内嵌两类能力。
  assert.match(rejectionWith('ext::sh -c id', { allowLocal: true }), /^Remote helper syntax is not allowed: ext:: /);
  assert.match(rejectionWith('fd::7', { allowLocal: true }), /^Remote helper syntax is not allowed: fd:: /);
  assert.match(rejectionWith('https://u:p@h/r', { allowLocal: true }), /^Remote must not embed a password: https: /);
  assert.match(rejectionWith('ssh://git:pw@h/r', { allowLocal: true }), /^Remote must not embed a password: ssh: /);
  assert.match(rejectionWith('https://u@h/r', { allowLocal: true }), /^Remote must not embed a username: https: /);
  // ssh 的 user 是登录名而非凭据，allowLocal 不得改变这条既有判定。
  assert.equal(assertRemoteUrl('ssh://git@h/r', undefined, { allowLocal: true }), 'ssh://git@h/r');
});

test('R6b: allowLocal allowlist is exactly local paths plus localhost file URLs', () => {
  // 放行集合锁死：盘符 / UNC / localhost file:// / POSIX 绝对路径。
  // 逐项独立断言（不聚合成一次循环断言）：失败时能直接定位是哪一类放行失效。
  // 将来收紧或放宽 LOCAL_PATH、或改动 pathname 判定时，这条必须先被审视。
  assert.equal(assertRemoteUrl('C:\\repo', undefined, { allowLocal: true }), 'C:\\repo', '盘符 + 反斜杠');
  assert.equal(assertRemoteUrl('D:/repo', undefined, { allowLocal: true }), 'D:/repo', '盘符 + 正斜杠');
  assert.equal(assertRemoteUrl('\\\\srv\\share', undefined, { allowLocal: true }), '\\\\srv\\share', 'UNC + 反斜杠');
  assert.equal(assertRemoteUrl('//srv/share', undefined, { allowLocal: true }), '//srv/share', 'UNC + 正斜杠');
  assert.equal(assertRemoteUrl('file:///C:/repo', undefined, { allowLocal: true }), 'file:///C:/repo', 'file URL 空 host');
  assert.equal(assertRemoteUrl('file://localhost/C:/repo', undefined, { allowLocal: true }), 'file://localhost/C:/repo', 'file URL localhost');
  assert.equal(assertRemoteUrl('/home/x/repo', undefined, { allowLocal: true }), '/home/x/repo', 'POSIX 绝对路径');
  assert.equal(assertRemoteUrl('/mnt/d/repo', undefined, { allowLocal: true }), '/mnt/d/repo', 'POSIX 挂载路径');

  // 仍拒：非 localhost 的 file:// host、file:// 凭证、前导横线、相对路径。
  // 这两条 file: 专属消息不带 `— check <label>` 尾巴，断言时不要加 config 指针锚点。
  assert.match(rejectionWith('file://srv/share', { allowLocal: true }), /^file:\/\/ URL host is not allowed: file:$/);
  assert.match(rejectionWith('file://evil.example/x', { allowLocal: true }), /^file:\/\/ URL host is not allowed: file:$/);
  // file:// 携带 userinfo 时 URL 解析器先抛（file URL 不允许 userinfo），落到通用文案：
  // 只断言「被拒 + 通用文案」，不绑那条对 file: 不可达的专属消息。
  assert.match(rejectionWith('file://user@localhost/x', { allowLocal: true }), /^Remote must be an https\/ssh URL or user@host:path /);
  assert.match(rejectionWith('--mirror', { allowLocal: true }), /^Invalid remote URL /);
  assert.match(rejectionWith('-t', { allowLocal: true }), /^Invalid remote URL /);
  assert.match(rejectionWith('../repo', { allowLocal: true }), /^Remote must be an https\/ssh URL or user@host:path /);
  // 含内部换行/NUL 必须先于「本地路径放行」被拒（否则 allowLocal 会直接 return raw 漏过去）；
  // 而含空格的合法本地路径必须仍放行。这两条是成对的：只留一条，将来调整检查顺序时会静默破功。
  assert.match(rejectionWith('C:\\a\nb', { allowLocal: true }), /^Invalid remote URL /);
  assert.equal(assertRemoteUrl('C:\\my repo\\bare.git', undefined, { allowLocal: true }), 'C:\\my repo\\bare.git');
});

test('R6c: file: URLs must be canonical and carry a real path', () => {
  // 本函数校验的是 URL 归一化结果，但返回给 git 的是 raw 原文；两者解读不同就是绕过面
  // （new URL('file:repo') 得到 /repo，git 拿到的却是 file:repo）。因此要求输入本身是规范 form。
  assert.match(rejectionWith('file://', { allowLocal: true }), /^file:\/\/ URL must have a path: file:$/);
  assert.match(rejectionWith('file:///', { allowLocal: true }), /^file:\/\/ URL must have a path: file:$/);
  for (const value of ['file:', 'file:repo', 'file:/repo']) {
    assert.match(rejectionWith(value, { allowLocal: true }), /^Remote file URL must be a full file:\/\/ URL /, value);
  }
  // 严格模式下仍走 scheme 拒绝，错误形态不变。
  assert.match(rejection('file:///C:/repo'), /^Remote scheme is not allowed: file: /);
});
