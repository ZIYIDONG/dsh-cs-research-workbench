// 唯一写入口：白名单字段 + 类型校验。所有 AI/UI 操作都先变成 ops 再进来。

export const COLLECTION = { todo: 'todos', project: 'projects', paper: 'papers', idea: 'ideas', note: 'notes' }

const FIELDS = {
  todo: ['title', 'status', 'priority', 'due', 'projectId', 'estimateMinutes', 'notes', 'tags', 'blockedReason'],
  project: ['name', 'goal', 'status', 'venue', 'milestones'],
  paper: ['title', 'authors', 'venue', 'year', 'status', 'doi', 'url', 'readBy', 'notes'],
  idea: ['title', 'kind', 'status', 'body'],
  note: ['title', 'body', 'kb'],
}

const STATUS = {
  todo: ['todo', 'doing', 'waiting', 'done'],
  project: ['active', 'paused', 'done'],
  paper: ['inbox', 'reading', 'read', 'cited'],
  idea: ['seed', 'exploring', 'parked'],
  note: ['draft', 'stable'],
}

const MAX_TEXT = 40_000

let counter = 0
export function newId(prefix) {
  counter = (counter + 1) % 1296
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 4)}`
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function text(value) {
  if (value === undefined) return undefined
  if (value !== null && typeof value !== 'string') return ``
  return String(value ?? '').slice(0, MAX_TEXT)
}

function coerce(kind, patch) {
  const result = {}
  for (const key of FIELDS[kind] ?? []) {
    if (!(key in patch)) continue
    const value = patch[key]
    if (key === 'title' || key === 'name') result[key] = text(value) ?? ''
    else if (key === 'status') result.status = STATUS[kind].includes(value) ? value : undefined
    else if (key === 'priority') result.priority = ['P0', 'P1', 'P2', 'P3'].includes(value) ? value : undefined
    else if (key === 'due' || key === 'readBy') result[key] = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
    else if (key === 'estimateMinutes') result.estimateMinutes = Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined
    else if (key === 'year') result.year = Number.isFinite(value) ? Math.round(value) : undefined
    else if (key === 'tags') result.tags = Array.isArray(value) ? value.filter((tag) => typeof tag === 'string').slice(0, 20) : []
    else if (key === 'milestones') result.milestones = Array.isArray(value) ? value.filter(isObject).slice(0, 50) : []
    else if (key === 'projectId' || key === 'blockedReason') result[key] = value ? String(value).slice(0, 200) : null
    else if (key === 'url') result.url = typeof value === 'string' && /^https?:\/\//i.test(value) ? value.slice(0, 2000) : ''
    else if (key === 'doi') result.doi = typeof value === 'string' ? value.slice(0, 200) : ''
    else result[key] = text(value) ?? ''
  }
  // 去掉被判定为非法的枚举/数字字段
  for (const key of Object.keys(result)) if (result[key] === undefined) delete result[key]
  return result
}

const LABEL = { todo: '任务', project: '项目', paper: '文献', idea: '想法', note: '笔记' }

function defaults(kind) {
  const now = new Date().toISOString()
  if (kind === 'todo') return { status: 'todo', priority: 'P2', due: null, projectId: null, estimateMinutes: null, notes: '', tags: [], doneAt: null, blockedReason: null }
  if (kind === 'project') return { status: 'active', goal: '', venue: '', milestones: [] }
  if (kind === 'paper') return { status: 'inbox', authors: '', venue: '', year: null, doi: '', url: '', readBy: null, notes: '' }
  if (kind === 'idea') return { kind: 'idea', status: 'seed', body: '' }
  return { kb: 'concept', body: '' }
}

/**
 * @param {object} draft - 状态对象，就地修改。
 * @param {Array<object>} ops
 * @returns {{receipts: Array<{text: string, target: string, kind: string}>, errors: string[]}}
 */
export function applyOps(draft, ops) {
  const receipts = []
  const errors = []
  for (const raw of Array.isArray(ops) ? ops : []) {
    if (!isObject(raw) || typeof raw.op !== 'string') { errors.push('操作格式无效'); continue }
    const kind = COLLECTION[raw.kind] ? raw.kind : Object.keys(COLLECTION).find((key) => COLLECTION[key] === raw.kind)
    const list = kind ? draft[COLLECTION[kind]] : null
    try {
      if (raw.op === 'clear_samples') {
        for (const key of Object.keys(COLLECTION)) draft[COLLECTION[key]] = draft[COLLECTION[key]].filter((row) => !row.sample)
        draft.chat = draft.chat.filter((row) => !row.sample)
        receipts.push({ text: '已清空示例数据', target: '', kind: '' })
        continue
      }
      if (!list) { errors.push('未知的数据类型'); continue }
      if (raw.op === 'add_item') {
        const title = text(raw.title) ?? text(raw.name) ?? ''
        if (!title.trim()) { errors.push(`${LABEL[kind]}标题不能为空`); continue }
        const at = new Date().toISOString()
        const row = {
          id: newId(kind === 'note' ? 'note' : kind), ...defaults(kind), ...coerce(kind, { title, name: title, ...raw }),
          pos: null, createdAt: at, updatedAt: at, sample: Boolean(raw.sample),
        }
        if (kind === 'project') delete row.title
        list.unshift(row)
        receipts.push({ text: `已创建${LABEL[kind]}：${title.slice(0, 24)}`, target: row.id, kind })
        continue
      }
      const id = typeof raw.id === 'string' ? raw.id : ''
      const target = list.find((row) => row.id === id)
      if (!target) { errors.push(`${LABEL[kind]}不存在`); continue }
      if (raw.op === 'update_item') {
        const patch = coerce(kind, raw.patch ?? raw)
        delete patch.id
        Object.assign(target, patch, { updatedAt: new Date().toISOString() })
        receipts.push({ text: `已更新${LABEL[kind]}`, target: id, kind })
        continue
      }
      if (raw.op === 'set_status') {
        if (!STATUS[kind].includes(raw.status)) { errors.push('状态值无效'); continue }
        target.status = raw.status
        if (kind === 'todo') target.doneAt = raw.status === 'done' ? new Date().toISOString() : null
        target.updatedAt = new Date().toISOString()
        receipts.push({ text: `状态改为 ${raw.status}`, target: id, kind })
        continue
      }
      if (raw.op === 'set_pos') {
        const x = Number(raw.pos?.x)
        const y = Number(raw.pos?.y)
        if (!Number.isFinite(x) || !Number.isFinite(y)) { errors.push('坐标无效'); continue }
        target.pos = { x: Math.round(x), y: Math.round(y), r: Number.isFinite(raw.pos?.r) ? raw.pos.r : 0 }
        continue
      }
      if (raw.op === 'delete_item') {
        list.splice(list.indexOf(target), 1)
        receipts.push({ text: `已删除${LABEL[kind]}`, target: id, kind })
        continue
      }
      errors.push(`未知操作：${raw.op}`)
    } catch (err) {
      errors.push(err.message || String(err))
    }
  }
  return { receipts, errors }
}
