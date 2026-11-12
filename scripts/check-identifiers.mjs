// 命名一致性守卫：client.js 与 lib/desk/ 必须共用同一套全局标识。
// 任何一处只改一边的改动都会在这里失败，而不是等到运行时 404 或面板点不开。
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { API_PREFIX, DATA_DIR, LEGACY_DATA_DIR, NAMESPACE, UI_ID, ROUTES } from '../lib/desk/ids.js'
import { DEFAULTS } from '../lib/services/config.js'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => fs.readFile(path.join(dir, relative), 'utf8')

assert.equal(NAMESPACE, 'dsh-csrw')
assert.equal(UI_ID, `${NAMESPACE}-ui`)
assert.equal(API_PREFIX, `/${NAMESPACE}/api`)
assert.equal(DATA_DIR, NAMESPACE)
assert.equal(LEGACY_DATA_DIR, 'csrw-desk')

const client = await read('client.js')
const clientUi = client.match(/const UI_ID = '([^']+)'/)
const clientApi = client.match(/const API_BASE = '([^']+)'/)
assert.ok(clientUi && clientApi, 'client.js 必须声明 UI_ID 与 API_BASE')
assert.equal(clientUi[1], UI_ID, 'client.js 的 UI_ID 与 lib/desk/ids.js 不一致')
assert.equal(clientApi[1], `${NAMESPACE}/api/`, '浏览器基址必须保持相对写法并跟随命名空间')
assert.ok(client.includes('fetch(API_BASE + path'), '请求必须走 API_BASE')
assert.ok(!client.includes('csrw-workbench'), 'client.js 仍残留旧面板 ID')
assert.ok(!client.includes("'csrw-desk/'"), 'client.js 仍残留旧路由基址')
for (const [key, value] of Object.entries(ROUTES)) {
  assert.ok(client.includes(`${key}: '${value}'`), `client.js 的 ROUTES.${key} 与 ids.js 不一致`)
}
// 字段收敛守护：client.js 的 TOOLS_FIELDS 必须覆盖 config.js DEFAULTS 的所有字段
const defaultFields = Object.entries(DEFAULTS).flatMap(([section, values]) => Object.entries(values).map(([key]) => `${section}.${key}`))
const toolsFieldsMatch = client.match(/const TOOLS_FIELDS = \[([^\]]+)\]/)
assert.ok(toolsFieldsMatch, 'client.js 必须声明 TOOLS_FIELDS')
const toolsFields = toolsFieldsMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''))
assert.deepEqual(toolsFields.sort(), defaultFields.slice().sort(), 'client.js 的 TOOLS_FIELDS 与 config.js DEFAULTS 不一致')

const host = await read('lib/desk/host.js')
assert.ok(host.includes("import { API_PREFIX, ROUTES } from './ids.js'"), 'host.js 必须从 ids.js 取路由前缀与路由常量')
assert.ok(host.includes('const PREFIX = API_PREFIX'), 'host.js 的路由前缀必须由 ids.js 推导')
assert.ok(!host.includes("'/csrw-desk'"), 'host.js 仍注册旧路由')

const store = await read('lib/desk/store.js')
assert.ok(store.includes('DATA_DIR'), 'store.js 必须用 DATA_DIR 定位状态目录')
assert.ok(store.includes('LEGACY_DATA_DIR'), 'store.js 必须声明旧目录用于迁移')
assert.ok(store.includes('async migrateLegacy()'), 'store.js 缺少旧目录迁移')

const readme = await read('README.md')
for (const needle of [UI_ID, API_PREFIX, `$DSH_HOME/${DATA_DIR}/`]) {
  assert.ok(readme.includes(needle), `README 未记录 ${needle}`)
}

console.log(JSON.stringify({ identifiers: 'passed', uiId: UI_ID, apiPrefix: API_PREFIX, dataDir: DATA_DIR }))
