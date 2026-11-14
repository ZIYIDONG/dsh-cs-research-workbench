// 本机 WebDAV mock：只监听 127.0.0.1 的临时端口，供 nutstore-plan.test.js 使用。
// 真实存/取（PUT 之后客户端会 GET 回读做 SHA-256 校验）、ETag 条件写、Depth:1 列表、
// 401/403/404 分类、网络故障注入，以及 href 的「URL 编码 / 裸特殊字符」两种返回形态。
// 不接触真实坚果云、真实 vault、任何远端仓库；状态全部在内存里。
import http from 'node:http';
import { once } from 'node:events';
import { hashBytes } from '../../lib/utils/hash.js';

export const basicAuth = (username, password) => 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

const xmlEscape = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

// Dav.url() 对每一段做 encodeURIComponent；mock 的 PROPFIND 可以选编码或裸 href。
const encodedHref = value => value.split('/').map(part => encodeURIComponent(part)).join('/');

/** 取一个当前没有监听者的回环端口，用来复现「网络不可达」，仍然只打本机。 */
export async function unusedPort() {
  const probe = http.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

export async function createDavStub(options = {}) {
  const {
    username = 'fixture',
    password = 'fixture-password',
    root = 'dsh-csrw',
    rootExists = true,
    hrefMode = 'encoded',
  } = options;
  const expectedAuth = basicAuth(username, password);
  const rootKey = `/dav/${root}/`;
  const files = new Map();      // decoded pathname -> Buffer
  const folders = new Set(['/dav/']);
  if (rootExists) folders.add(rootKey);
  const requests = [];          // 只记录方法与路径，不记录凭据明文
  const state = {
    forbid: false,              // 所有请求 403
    authReject: false,          // 所有请求 401
    fault: null,                // { afterPuts, mode: 'network' | 'http503', triggered }
    hrefMode,                   // 'encoded' | 'raw' | 'mixed'
    putCount: 0,
    deleteCount: 0,
  };
  const etag = data => `"${hashBytes(data)}"`;

  const node = (href, { directory = false, size = 0, tag = '' } = {}) => {
    const props = directory
      ? '<d:resourcetype><d:collection/></d:resourcetype>'
      : `<d:resourcetype/><d:getcontentlength>${size}</d:getcontentlength><d:getetag>${xmlEscape(tag)}</d:getetag>`;
    return `<d:response><d:href>${xmlEscape(href)}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
  };

  const server = http.createServer(async (req, res) => {
    // 故障注入会直接 destroy socket；吞掉请求流的 error，避免 mock 自己抛未捕获异常。
    req.on('error', () => {});
    const url = new URL(req.url, 'http://localhost');
    const name = decodeURIComponent(url.pathname);
    const authMatches = req.headers.authorization === expectedAuth;
    requests.push({
      method: req.method,
      pathname: url.pathname,
      hasAuthorization: Boolean(req.headers.authorization),
      authMatches,
      depth: req.headers.depth ?? null,
    });

    if (state.authReject || !authMatches) { res.writeHead(401).end(); return; }
    if (state.forbid) { res.writeHead(403).end(); return; }

    if (req.method === 'MKCOL') {
      folders.add(name.replace(/\/+$/, '') + '/');
      res.writeHead(201).end();
      return;
    }

    if (req.method === 'PROPFIND') {
      const folder = name.replace(/\/+$/, '') + '/';
      if (!folders.has(folder)) { res.writeHead(404).end(); return; }
      const nodes = [node(folder, { directory: true })];
      // Depth:0 只回自身；Depth:1 回直接子项（不能回孙级，Dav.list 会拒绝越级条目）。
      if (req.headers.depth !== '0') {
        for (const f of folders) {
          if (f !== folder && f.startsWith(folder) && !f.slice(folder.length).replace(/\/$/, '').includes('/')) {
            nodes.push(node(encodedHref(f), { directory: true }));
          }
        }
        let index = 0;
        for (const [key, body] of files) {
          if (!key.startsWith(folder) || key.slice(folder.length).includes('/')) continue;
          const mode = state.hrefMode === 'mixed' ? (index % 2 === 0 ? 'encoded' : 'raw') : state.hrefMode;
          nodes.push(node(mode === 'raw' ? key : encodedHref(key), { size: body.length, tag: etag(body) }));
          index += 1;
        }
      }
      res.writeHead(207, { 'Content-Type': 'application/xml' }).end(`<d:multistatus xmlns:d="DAV:">${nodes.join('')}</d:multistatus>`);
      return;
    }

    if (req.method === 'PUT') {
      if (req.headers['if-none-match'] === '*' && files.has(name)) { res.writeHead(412).end(); return; }
      const current = files.get(name);
      if (req.headers['if-match'] && req.headers['if-match'] !== etag(current ?? Buffer.alloc(0))) { res.writeHead(412).end(); return; }
      const fault = state.fault;
      if (fault && !fault.triggered && state.putCount >= fault.afterPuts) {
        fault.triggered = true;
        if (fault.mode === 'network') { req.socket.destroy(); return; } // 真·连接中断 -> fetch failed
        res.writeHead(503).end();                                        // 5xx 可重试
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      files.set(name, body);
      state.putCount += 1;
      res.writeHead(201, { ETag: etag(body) }).end();
      return;
    }

    if (req.method === 'GET') {
      if (!files.has(name)) { res.writeHead(404).end(); return; }
      const body = files.get(name);
      res.writeHead(200, { ETag: etag(body), 'Content-Length': body.length }).end(body);
      return;
    }

    if (req.method === 'DELETE') {
      state.deleteCount += 1;
      if (files.has(name)) { files.delete(name); res.writeHead(204).end(); return; }
      const dir = name.replace(/\/+$/, '') + '/';
      if (folders.has(dir)) {
        for (const key of [...folders]) if (key.startsWith(dir)) folders.delete(key);
        for (const key of [...files.keys()]) if (key.startsWith(dir)) files.delete(key);
        res.writeHead(204).end();
        return;
      }
      res.writeHead(404).end();
      return;
    }

    res.writeHead(405).end();
  });
  server.on('clientError', (_err, socket) => socket.destroy());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const absolute = relative => (relative.startsWith('/') ? relative : rootKey + relative);
  return {
    url: `http://127.0.0.1:${server.address().port}/dav/`,
    files,
    folders,
    requests,
    state,
    rootKey,
    key: absolute,
    read: relative => files.get(absolute(relative)) ?? null,
    seed(relative, content) {
      const key = absolute(relative);
      files.set(key, Buffer.isBuffer(content) ? content : Buffer.from(content));
      let dir = '/';
      for (const part of key.slice(0, key.lastIndexOf('/')).split('/').filter(Boolean)) {
        dir += part + '/';
        folders.add(dir);
      }
      return key;
    },
    remove(relative) { return files.delete(absolute(relative)); },
    async close() {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
