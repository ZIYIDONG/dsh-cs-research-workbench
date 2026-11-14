// 通用重试器：指数退避 + 可取消 + 只重试"可重试错误"（网络/超时/5xx/429）。
// 认证失败、路径不存在、412 条件冲突等业务错误不做重试，避免放大问题。

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function isRetryable(error) {
  if (!error) return false;
  if (error.name === 'AbortError' || error.code === 'ABORT_ERR') return false;
  const status = Number(error.status);
  // HTTP 4xx（401/403 认证失败、404、412 冲突等）无论错误消息里出现什么词都不重试：
  // 先短路掉，下面的关键字匹配就不会把带 4xx 状态的错误误判成连接故障。
  if (status >= 400 && status < 500 && status !== 429) return false;
  if (status >= 500 || status === 429) return true;
  // Dav.request 把 fetch 层连接故障统一包装成 "WebDAV <method> connection failed (...)"，
  // 认这个标记才能让 nutstore.retry 真正生效；该措辞只出现在连接失败分支，
  // 与 "WebDAV <method> failed: HTTP <n>" 的 HTTP 响应错误互不混淆（后者由上面的 status 分支处理）。
  return /fetch failed|connection failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|network|timeout/i.test(String(error.message ?? ''));
}

/**
 * @param {() => Promise<any>} fn 一次尝试
 * @param {{attempts?: number, delay?: number, factor?: number, signal?: AbortSignal}} options
 */
export async function retry(fn, { attempts = 3, delay = 500, factor = 2, signal } = {}) {
  const total = Math.max(1, Math.trunc(attempts));
  let last;
  for (let i = 0; i < total; i += 1) {
    signal?.throwIfAborted();
    try {
      return await fn(i);
    } catch (error) {
      last = error;
      if (i === total - 1 || !isRetryable(error)) throw error;
      await sleep(delay * factor ** i, signal);
    }
  }
  throw last;
}
