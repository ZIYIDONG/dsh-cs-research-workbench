// Obsidian 笔记 frontmatter（YAML 子集）的解析与序列化。
// 仅覆盖常见场景：标量、布尔/数字/null、引号字符串、行内数组、块数组、嵌套映射、行内映射。
// 不依赖第三方 YAML 库；无法解析的行会按原文当作字符串返回，不抛错打断整个文件。

const DELIM = /^---\s*$/
const END = /^(?:---|\.\.\.)\s*$/

/** 把带 frontmatter 的正文拆成 { data, body }；没有 frontmatter 时 data 为空对象。 */
export function splitFrontmatter(text) {
  if (typeof text !== 'string' || !text.startsWith('---')) return { data: {}, body: text ?? '' }
  const lines = text.split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    if (END.test(lines[i])) {
      return {
        data: parseYaml(lines.slice(1, i).join('\n')),
        body: lines.slice(i + 1).join('\n'),
      }
    }
  }
  // 只有起始 --- 没有闭合时，视作普通正文
  return { data: {}, body: text }
}

export function parseYaml(src) {
  if (typeof src !== 'string' || !src.trim()) return {}
  const lines = src.split(/\r?\n/)
  let pos = 0
  const indent = (line) => { let n = 0; while (n < line.length && line[n] === ' ') n++; return n }
  const isBlank = (line) => !line.trim()

  function parseBlock(minIndent) {
    const obj = {}
    while (pos < lines.length) {
      const line = lines[pos]
      if (isBlank(line)) { pos++; continue }
      const ind = indent(line)
      if (ind < minIndent) break
      if (ind > minIndent) { pos++; continue }
      const m = /^([^:]+):(.*)$/.exec(line.slice(ind))
      if (!m) { pos++; continue }
      const key = m[1].trim()
      const rest = m[2]
      pos++
      if (!rest.trim()) {
        if (pos < lines.length && !isBlank(lines[pos]) && indent(lines[pos]) > minIndent) {
          const childIndent = indent(lines[pos])
          if (/^\s*-\s/.test(lines[pos])) obj[key] = parseList(childIndent)
          else obj[key] = parseBlock(childIndent)
        } else {
          obj[key] = null
        }
      } else {
        obj[key] = parseScalar(rest.trim())
      }
    }
    return obj
  }

  function parseList(minIndent) {
    const arr = []
    while (pos < lines.length) {
      const line = lines[pos]
      if (isBlank(line)) { pos++; continue }
      const ind = indent(line)
      if (ind < minIndent) break
      if (ind > minIndent) { pos++; continue }
      const m = /^\s*-\s?(.*)$/.exec(line)
      if (!m) break
      pos++
      const rest = m[1]
      if (!rest.trim()) {
        if (pos < lines.length && !isBlank(lines[pos]) && indent(lines[pos]) > minIndent) {
          const childIndent = indent(lines[pos])
          if (/^\s*-\s/.test(lines[pos])) arr.push(parseList(childIndent))
          else arr.push(parseBlock(childIndent))
        } else arr.push(null)
      } else {
        arr.push(parseScalar(rest.trim()))
      }
    }
    return arr
  }

  return parseBlock(0)
}

function parseScalar(t) {
  if (t === '' || t === '~' || /^null$/i.test(t)) return null
  if (t === 'true' || t === 'True' || t === 'TRUE') return true
  if (t === 'false' || t === 'False' || t === 'FALSE') return false
  if (/^-?\d+$/.test(t)) return Number(t)
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(t)
  if (t.startsWith('[') && t.endsWith(']')) return splitTopLevel(t.slice(1, -1)).map((s) => parseScalar(s.trim()))
  if (t.startsWith('{') && t.endsWith('}')) return parseInlineMap(t)
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
  return t
}

/** 按顶层逗号切分（忽略引号与嵌套括号内的逗号）。 */
function splitTopLevel(s) {
  const out = []
  let cur = ''
  let depth = 0
  let quote = null
  for (const ch of s) {
    if (quote) { if (ch === quote) quote = null; cur += ch; continue }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') depth--
    else if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

function parseInlineMap(t) {
  const obj = {}
  for (const part of splitTopLevel(t.slice(1, -1))) {
    const idx = part.indexOf(':')
    if (idx < 0) continue
    obj[part.slice(0, idx).trim()] = parseScalar(part.slice(idx + 1).trim())
  }
  return obj
}

/** 把数据对象序列化为 YAML 子集（多行、缩进 2 空格）。 */
export function serializeYaml(data) {
  const lines = []
  const scalar = (v) => {
    if (v === null || v === undefined) return '~'
    if (typeof v === 'string') {
      if (/[:#[\]{},"'\n]/.test(v) || /^\s|\s$/.test(v) || v === '') return JSON.stringify(v)
      return v
    }
    if (typeof v === 'boolean' || typeof v === 'number') return String(v)
    return JSON.stringify(v)
  }
  const walk = (obj, ind) => {
    const pad = ' '.repeat(ind)
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) { lines.push(`${pad}${k}:`); continue }
      if (Array.isArray(v)) {
        if (!v.length) { lines.push(`${pad}${k}: []`); continue }
        lines.push(`${pad}${k}:`)
        for (const item of v) {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            const entries = Object.entries(item)
            if (!entries.length) { lines.push(`${pad}  - {}`); continue }
            const [fk, fv] = entries[0]
            lines.push(`${pad}  - ${fk}: ${scalar(fv)}`)
            for (const [k2, v2] of entries.slice(1)) lines.push(`${pad}    ${k2}: ${scalar(v2)}`)
          } else {
            lines.push(`${pad}  - ${scalar(item)}`)
          }
        }
        continue
      }
      if (v && typeof v === 'object') { lines.push(`${pad}${k}:`); walk(v, ind + 2); continue }
      lines.push(`${pad}${k}: ${scalar(v)}`)
    }
  }
  walk(data, 0)
  return lines.join('\n') + '\n'
}

/** 生成完整笔记文本：frontmatter + 正文。data 为空时直接返回 body。 */
export function buildFrontmatter(data, body = '') {
  if (!data || typeof data !== 'object' || !Object.keys(data).length) return body
  return `---\n${serializeYaml(data)}---\n${body}`
}

/** 提取 aliases 为字符串数组（兼容单字符串/行内数组/块数组）。 */
export function aliasesOf(data) {
  const a = data?.aliases
  if (a == null) return []
  if (typeof a === 'string') return a.trim() ? [a.trim()] : []
  if (Array.isArray(a)) return a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
  return []
}
