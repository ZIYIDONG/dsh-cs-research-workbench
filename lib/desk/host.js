// 科研工作台 host 半片：/csrw-desk/* 接口、状态读写和本地规则助手。
// 由 lib/index.js 的 apply() 调用；没有 Web 服务时（CLI、测试）静默跳过。
import { applyOps, newId } from './ops.js'
import { Store } from './store.js'

const MAX_JSON = 4_000_000
const PREFIX = '/csrw-desk'

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readBuffer(req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw Object.assign(new Error('内容太大'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readJson(req) {
  const raw = await readBuffer(req, MAX_JSON)
  if (!raw.length) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw Object.assign(new Error('请求不是有效的 JSON'), { status: 400 })
  }
}

/** Web 服务不会替插件路由鉴权，每个请求都要自己走一遍 Host/Origin 和登录凭证检查。 */
export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return 403
  return connection.requestRejection({ headers: req.headers })
}

/** 写请求只接受同站来源，跨站一律拒绝。 */
function crossSite(req) {
  const site = String(req.headers['sec-fetch-site'] || '')
  if (!site) return false
  return site !== 'same-origin' && site !== 'same-site' && site !== 'none'
}

const today = () => new Date().toISOString().slice(0, 10)

function pendingCount(state) {
  return state.todos.filter((row) => row.status === 'todo' || row.status === 'doing').length
}

/** 本地规则助手：不依赖模型也能建任务、查今天、看积压。 */
function localReply(state, message, ops) {
  const text = String(message || '').trim()
  if (!text) return null
  const { receipts, errors } = applyOps(state, ops)
  if (/^(今天|本周|看看|查|统计)/.test(text)) {
    const pending = state.todos.filter((row) => row.status === 'todo' || row.status === 'doing')
    const dueToday = pending.filter((row) => row.due === today())
    const waiting = state.todos.filter((row) => row.status === 'waiting')
    return {
      text: `待推进 ${pending.length} 件，今天到期 ${dueToday.length} 件，等待中 ${waiting.length} 件。`,
      receipts: [], errors: [], ops: [],
    }
  }
  return {
    text: receipts.length ? `已记下：${receipts[0].text.replace(/^已创建任务：/, '')}` : errors[0] || '没听清，换个说法？',
    receipts, errors, ops,
  }
}

async function route(ctx, store, req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  const path = url.pathname.slice(PREFIX.length).replace(/^\/+/, '')
  const method = req.method || 'GET'

  if (method === 'GET' && (path === 'state' || path === '')) {
    const state = await store.read()
    return json(res, 200, { state, canUndo: store.undo.length > 0, model: null, modelOk: false })
  }
  if (method === 'GET' && path === 'settings') {
    const state = await store.read()
    return json(res, 200, { language: state.settings?.language ?? 'zh', assistant: state.settings?.assistant ?? null })
  }
  if (method === 'POST' && path === 'settings') {
    if (crossSite(req)) return json(res, 403, { error: '拒绝跨站请求' })
    const body = await readJson(req)
    const state = await store.mutate('偏好设置', (draft) => {
      if (!draft.settings) draft.settings = {}
      if (typeof body.dockOpen === 'boolean') draft.settings.dockOpen = body.dockOpen
      if (typeof body.language === 'string') draft.settings.language = body.language
      if (body.assistant === null || typeof body.assistant === 'string') draft.settings.assistant = body.assistant
      return draft
    }, { undoable: false })
    return json(res, 200, { settings: state.settings, state })
  }
  if (method === 'POST' && path === 'ops') {
    if (crossSite(req)) return json(res, 403, { error: '拒绝跨站请求' })
    const body = await readJson(req)
    const label = typeof body.label === 'string' && body.label.trim() ? body.label.slice(0, 60) : '操作'
    const undoable = body.undoable !== false
    const result = await store.mutate(label, (draft) => applyOps(draft, body.ops), { undoable })
    return json(res, 200, { ...result, state: await store.read(), canUndo: undoable || store.undo.length > 0 })
  }
  if (method === 'POST' && path === 'undo') {
    if (crossSite(req)) return json(res, 403, { error: '拒绝跨站请求' })
    const label = await store.undoLast()
    return json(res, 200, { label, state: await store.read(), canUndo: store.undo.length > 0 })
  }
  if (method === 'POST' && path === 'chat') {
    if (crossSite(req)) return json(res, 403, { error: '拒绝跨站请求' })
    const body = await readJson(req)
    const message = String(body.message || '').trim()
    if (!message) return json(res, 400, { error: '消息为空' })
    const result = await store.mutate('对话', (draft) => {
      const at = new Date().toISOString()
      draft.chat.push({ id: newId('c'), at, role: 'user', text: message.slice(0, 2000) })
      const ops = []
      // 查询类消息不写数据；其余当作一件事记下来
      if (!/^(今天|本周|看看|查|统计)/.test(message)) {
        ops.push({ op: 'add_item', kind: 'todo', title: message.split(/[。！？\n]/)[0].slice(0, 80) })
      }
      const answer = localReply(draft, message, ops)
      const reply = { id: newId('c'), at: new Date().toISOString(), role: 'assistant', text: answer.text, engine: 'local', receipts: answer.receipts }
      draft.chat.push(reply)
      draft.chat = draft.chat.slice(-200)
      return { reply, receipts: answer.receipts, errors: answer.errors }
    })
    return json(res, 200, { ...result, state: await store.read() })
  }
  return json(res, 404, { error: '接口不存在' })
}

export const name = 'csrw'

/**
 * 把工作台页面挂到 DSH Web 服务上。
 * csrw 的 inject 只有 tools，所以这里用 ctx.get 取 webServer/connection（ui-command.js 同样用法）；
 * 取不到就说明当前环境没有 Web GUI，直接返回 false，不影响 29 个工具。
 */
export function registerDesk(ctx) {
  const webServer = ctx.get('webServer')
  if (typeof webServer?.register !== 'function') return false
  const store = new Store()
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: async (req, res) => {
      try {
        const rejection = requestRejection(ctx, req)
        if (rejection) {
          json(res, rejection, { error: '未授权' })
          return
        }
        await route(ctx, store, req, res)
      } catch (err) {
        if (res.headersSent) {
          res.end()
          return
        }
        json(res, err.status || 500, { error: err.message })
      }
    },
  }), 'csrw: /csrw-desk routes')
  return true
}
