import test from 'node:test';
import assert from 'node:assert/strict';
import { retry, isRetryable } from '../lib/utils/retry.js';

test('retry succeeds after transient failures', async () => {
  let calls = 0;
  const value = await retry(async () => {
    calls += 1;
    if (calls < 3) throw new Error('fetch failed');
    return 'ok';
  }, { attempts: 3, delay: 1 });
  assert.equal(value, 'ok');
  assert.equal(calls, 3);
});

test('retry does not retry non-retryable errors', async () => {
  let calls = 0;
  await assert.rejects(retry(async () => {
    calls += 1;
    throw Object.assign(new Error('bad request'), { status: 400 });
  }, { attempts: 3, delay: 1 }), /bad request/);
  assert.equal(calls, 1);
});

test('isRetryable classifies network/5xx but not 4xx', () => {
  assert.equal(isRetryable(Object.assign(new Error('x'), { status: 503 })), true);
  assert.equal(isRetryable(Object.assign(new Error('x'), { status: 429 })), true);
  assert.equal(isRetryable(Object.assign(new Error('x'), { status: 400 })), false);
  assert.equal(isRetryable(Object.assign(new Error('x'), { status: 412 })), false);
  assert.equal(isRetryable(new Error('fetch failed')), true);
  assert.equal(isRetryable(new Error('ECONNRESET')), true);
});

test('retry stops when aborted', async () => {
  const controller = new AbortController();
  controller.abort(new Error('stop-now'));
  await assert.rejects(
    retry(async () => { throw new Error('fetch failed'); }, { attempts: 3, delay: 1, signal: controller.signal }),
    /stop-now/,
  );
});
