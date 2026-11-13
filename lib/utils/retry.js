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
  if (status >= 500 || status === 429) return true;
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|network|timeout/i.test(String(error.message ?? ''));
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
