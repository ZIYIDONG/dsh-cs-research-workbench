// 运行期 ID 生成：前缀 + 时间戳 + 计数器 + 随机后缀。
// 下沉到 utils 层，供 desk/ops.js 与 services/vault-sync.js 共同使用，避免 services 反向依赖 desk。
let counter = 0
export function newId(prefix) {
  counter = (counter + 1) % 1296
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 4)}`
}
