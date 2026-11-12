// 持久化：$DSH_HOME/dsh-csrw/state.json。
// 0.1.0 之前的状态在 $DSH_HOME/csrw-desk/，首次读取时复制过来；旧文件一律保留。
// 两个 Host 进程可能同时运行，所以每次写入前按 mtime 判断是否需要重读。
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { DATA_DIR, LEGACY_DATA_DIR } from './ids.js'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildSeed, migrateState } from './seed.js'

const MAX_UNDO = 30

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const keyed = (list) => list.every((row) => isObject(row) && typeof row.id === 'string')

function revertList(before, after, current) {
  const was = new Map(before.map((row) => [row.id, row]))
  const now = new Map(after.map((row) => [row.id, row]))
  // 这一步新增的行撤掉，两边都有的行逐字段撤回，其余（之后才加的）原样保留
  const result = current
    .filter((row) => !(now.has(row.id) && !was.has(row.id)))
    .map((row) => (was.has(row.id) && now.has(row.id) ? revertChange(was.get(row.id), now.get(row.id), row) : row))
  // 这一步删掉的行放回原来的位置
  const present = new Set(result.map((row) => row.id))
  before.forEach((row, index) => {
    if (now.has(row.id) || present.has(row.id)) return
    result.splice(Math.min(index, result.length), 0, structuredClone(row))
    present.add(row.id)
  })
  return result
}

/** 三方合并式撤销：只撤回这一步改过、之后又没被别的操作改动的部分。 */
export function revertChange(before, after, current) {
  if (same(before, after)) return current
  if (same(current, after)) return before === undefined ? undefined : structuredClone(before)
  if (isObject(before) && isObject(after) && isObject(current)) {
    const result = { ...current }
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const value = revertChange(before[key], after[key], current[key])
      if (value === undefined) delete result[key]
      else result[key] = value
    }
    return result
  }
  if (Array.isArray(before) && Array.isArray(after) && Array.isArray(current)) {
    if (keyed(before) && keyed(after) && keyed(current) && (before.length || after.length)) return revertList(before, after, current)
    if (before.length === after.length && after.length === current.length) return current.map((row, index) => revertChange(before[index], after[index], row))
  }
  return current
}

export function dshHome(env = process.env) {
  return env.DSH_HOME || join(homedir(), '.dsh')
}

const defaultRoot = () => join(dshHome(), DATA_DIR)

export class Store {
  /**
   * @param {string} [root] 状态目录。
   * @param {string|null} [legacyRoot] 需要迁移的旧目录；默认只在使用默认目录时启用。
   */
  constructor(root = defaultRoot(), legacyRoot = root === defaultRoot() ? join(dshHome(), LEGACY_DATA_DIR) : null) {
    this.root = root
    this.legacyRoot = legacyRoot
    this.file = join(root, 'state.json')
    this.state = null
    this.mtimeMs = 0
    this.undo = []
    this.queue = Promise.resolve()
  }

  /**
   * 旧版本把状态放在 $DSH_HOME/csrw-desk/。只复制、不删除、可重入：
   * 目标已存在就跳过；两个 Host 进程同时启动时由 wx 保证只有一个写入。
   */
  async migrateLegacy() {
    if (!this.legacyRoot) return
    try {
      await stat(this.file)
      return
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    const legacyFile = join(this.legacyRoot, 'state.json')
    let raw
    try {
      raw = await readFile(legacyFile, 'utf8')
    } catch (err) {
      if (err.code === 'ENOENT') return
      throw err
    }
    try {
      JSON.parse(raw)
    } catch {
      // 不覆盖、不重建：旧文件留着，让用户看见问题，而不是看到一个空工作台。
      throw new Error('旧工作台状态无法解析，已保留原文件：' + legacyFile)
    }
    await mkdir(this.root, { recursive: true })
    try {
      await writeFile(this.file, raw, { flag: 'wx' })
      await writeFile(join(this.root, '.migrated-from-csrw-desk'), new Date().toISOString() + ' ' + legacyFile + '\n')
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
    }
  }

  async refresh() {
    await this.migrateLegacy()
    await mkdir(this.root, { recursive: true })
    let info = null
    try {
      info = await stat(this.file)
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    if (!info) {
      this.state = buildSeed(new Date())
      await this.persist()
      return
    }
    if (this.state && info.mtimeMs === this.mtimeMs) return
    this.state = migrateState(JSON.parse(await readFile(this.file, 'utf8')))
    this.mtimeMs = info.mtimeMs
  }

  async persist() {
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(this.state))
    await rename(tmp, this.file)
    this.mtimeMs = (await stat(this.file)).mtimeMs
  }

  /** 串行执行，避免同一进程内的并发写互相覆盖。 */
  run(task) {
    const next = this.queue.then(task, task)
    this.queue = next.catch(() => {})
    return next
  }

  read() {
    return this.run(async () => {
      await this.refresh()
      return this.state
    })
  }

  /** @param {(state: object) => any} mutate - 就地修改状态。 */
  mutate(label, mutate, { undoable = true } = {}) {
    return this.run(async () => {
      await this.refresh()
      const before = undoable ? JSON.stringify(this.state) : null
      const result = await mutate(this.state)
      if (undoable) {
        const after = JSON.stringify(this.state)
        // 什么都没改的操作不占撤销位
        if (after !== before) {
          this.undo.push({ label, before, after })
          if (this.undo.length > MAX_UNDO) this.undo.shift()
        }
      }
      await this.persist()
      return result
    })
  }

  undoLast() {
    return this.run(async () => {
      const entry = this.undo.pop()
      if (!entry) return null
      await this.refresh()
      this.state = revertChange(JSON.parse(entry.before), JSON.parse(entry.after), this.state)
      await this.persist()
      return entry.label
    })
  }
}
