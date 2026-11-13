// 敏感内容检测：全仓只有这一处正则来源，快照排除与 WebDAV 同步拦截共用同一判定。
// 只在内存里判断内容，不落盘、不回显命中的片段。
export const SECRET = /(?:["']?(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|credential)[\w.-]*["']?\s*[:=]\s*["']?[^\s"',}\]]+)|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,})/i;

/** @param {Buffer|Uint8Array|string} bytes - 按 UTF-8 解码后匹配，二进制内容同样可判。 */
export const containsSecret = bytes => SECRET.test(bytes.toString('utf8'));
