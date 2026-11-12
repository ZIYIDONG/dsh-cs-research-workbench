// Zotero 本机 API 请求封装：下沉到 services 层，供 tools/zotero.js 与 tools/paper.js 复用。
const MAX_BODY = 2 * 1024 * 1024;

export async function fetchZotero(workspace, config, endpoint, params = {}, signal, asText = false) {
  const base = new URL(config.zotero.localApi);
  // Keep this invariant at the request boundary, even if the config source changes later.
  if (!['http:', 'https:'].includes(base.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
    || base.username || base.password || base.search || base.hash) throw new Error('Zotero API must be a credential-free loopback URL');
  const url = new URL(`${base.href.replace(/\/$/, '')}/users/0/${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const combined = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
  let response;
  try {
    response = await fetch(url, { method: 'GET', signal: combined, redirect: 'manual', credentials: 'omit', headers: { Accept: asText ? 'text/html, text/plain' : 'application/json' } });
  } catch (error) {
    signal.throwIfAborted();
    throw new Error('Zotero 本机 API 连接失败或超时；请启动 Zotero 并启用本机 API（允许此计算机上的其他应用程序与 Zotero 通信），核对 zotero.localApi。无云端回退。', { cause: error });
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Zotero 本机 API HTTP ${response.status}${response.status === 404 ? '：条目或 API 路径不存在' : ''}；请检查本机 API 设置与条目 key`);
  }
  const reader = response.body?.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    if (reader) while (true) {
      combined.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY) { await reader.cancel(); throw new Error('Zotero response exceeded 2 MiB; use a smaller limit'); }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    signal.throwIfAborted();
    if (combined.aborted) throw new Error('Zotero 本机 API 响应超时；请检查本机服务', { cause: error });
    throw error;
  } finally { reader?.releaseLock(); }
  const body = Buffer.concat(chunks).toString('utf8');
  if (asText) return { body };
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('Zotero API returned invalid JSON'); }
  const totalHeader = response.headers.get('Total-Results');
  const total = totalHeader !== null && /^\d+$/.test(totalHeader) && Number.isSafeInteger(Number(totalHeader)) ? Number(totalHeader) : null;
  return { data, total };
}
