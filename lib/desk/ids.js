// 全局标识的唯一来源：DSH 注册表、HTTP 路由和 $DSH_HOME 下的持久化目录共用 dsh-csrw 命名空间。
// client.js 是浏览器半片，无法 import 本文件，那里重复声明同样的值；
// scripts/check-identifiers.mjs 负责校验两处一致，避免只改一边造成静默错配。
export const NAMESPACE = 'dsh-csrw'
export const UI_ID = 'dsh-csrw-ui'
export const API_PREFIX = '/dsh-csrw/api'
export const DATA_DIR = 'dsh-csrw'
// 双半片 API 契约：host 路由 path 的唯一来源。client.js 无法 import，那里重复声明同样的值，
// scripts/check-identifiers.mjs 校验两处一致。
export const ROUTES = { state: 'state', backups: 'backups', vaultSync: 'vault-sync', models: 'models', settings: 'settings', ops: 'ops', undo: 'undo', chat: 'chat' }
// 0.1.0 之前工作台状态放在 $DSH_HOME/csrw-desk/，只用于一次性迁移，不参与新的读写。
export const LEGACY_DATA_DIR = 'csrw-desk'
