# Obsidian 本地可实现能力清单（dsh-csrw）

> 本文档梳理「工作台 ↔ Obsidian vault」集成中，**仅凭直接读写本地 `.md` 文件就能实现**的能力，
> 作为逐步实现的规划依据。判断标准与"做不了"的边界见文末。
>
> **状态：§2 清单中的 21 项能力已全部实现**（对应 `lib/utils/wikilink.js` 与 `lib/tools/obsidian.js` / `paper.js`）；**§6.4 的磁盘索引缓存也已落地**（原为规划），不再是待实现项。

## 1. 判断标准

Obsidian 的功能分两层：

- **数据层**：存在 `.md` / JSON 文件里（Markdown 正文、frontmatter、`[[wikilink]]`、标签、Canvas、书签等）。
  外部工具可 100% 复刻。
- **执行/渲染层**：跑在 Obsidian 本体或社区插件内部（编辑器交互、插件查询引擎、同步、渲染）。
  外部工具只能"生成兼容数据，交给 Obsidian 去跑"。

本插件是 DSH 内的外部工具，**只做数据层**；渲染、预览、图谱、Dataview 检索等交给 Obsidian 白得。

## 2. 能力总览

| # | 模块 | 能力 | 状态 | 优先级 | 依赖 |
|---|---|---|---|---|---|
| 1 | 文件基础 | `read` / `write` / `append` / `move` / `trash` | ✅ 已实现 | — | — |
| 2 | 文件基础 | vault 自动发现 + 路径安全（拒越界/链接） | ✅ 已实现 | — | — |
| 3 | 元数据 | frontmatter 解析（title/tags/aliases/created/updated） | ✅ 已实现 | P0 | YAML 子集解析器 |
| 4 | 元数据 | frontmatter 写入（保留既有字段，不破坏） | ✅ 已实现 | P0 | 3 |
| 5 | 元数据 | `aliases` 提取（供双链解析） | ✅ 已实现 | P0 | 3 |
| 6 | 双链 | `[[...]]` 语法解析（别名/标题/块/嵌入/显式路径） | ✅ 已实现 | P0 | — |
| 7 | 双链 | 最短唯一路径消歧（同名文件） | ✅ 已实现 | P0 | 5,6 |
| 8 | 双链 | 反向链接（backlinks） | ✅ 已实现 | P0 | 6,7 |
| 9 | 双链 | 未链接提及（unlinked mentions） | ✅ 已实现 | P1 | 全文搜索 |
| 10 | 双链 | `move`/`rename` 时全库重写 `[[链接]]` | ✅ 已实现 | P1 | 6,7 |
| 11 | 检索 | 全文搜索（已有）+ 按 `tag:` / `path:` / 属性过滤 | ✅ 已实现 | P0 | 3 |
| 12 | 检索 | 批量读取目录（列目录/读多篇） | ✅ 已实现 | P1 | — |
| 13 | 结构化生成 | 模板引擎（读模板 + 变量替换） | ✅ 已实现 | P0 | 3,4 |
| 14 | 结构化生成 | 日记 daily notes（按命名规则建文件） | ✅ 已实现 | P1 | 读 `.obsidian/daily-notes.json` |
| 15 | 结构化生成 | 文献笔记生成（`[[cite:KEY]]` + frontmatter + `![[附件]]`） | ✅ 已实现 | P1 | 3,6 + 文献工具 |
| 16 | 结构化生成 | 附件拷贝（图片/PDF 进 vault 附件目录） | ✅ 已实现 | P1 | — |
| 17 | 维护 | 死链检测（broken link） | ✅ 已实现 | P1 | 6,7 |
| 18 | 维护 | 批量重命名（含全库链接重写） | ✅ 已实现 | P1 | 6,7,10 |
| 19 | 图谱 | 导出节点/边数据（只算不画） | ✅ 已实现 | P2 | 6,8 |
| 20 | JSON 结构 | Canvas（`.canvas`）解析/生成 | ✅ 已实现 | P2 | — |
| 21 | JSON 结构 | 书签（`.obsidian/bookmarks.json`）解析 | ✅ 已实现 | P2 | — |

## 3. 依赖分层

按依赖顺序，后面的层依赖前面的层：

1. **元数据（3→4→5）**：frontmatter 是地基——双链解析要 `aliases`，检索要 `tags`，模板要字段读写。**必须先做。**
2. **双链（6→7→8）**：语法解析 → 消歧 → 反链。
3. **检索与生成（11→12→13→14→15→16）**：依赖 frontmatter 就绪；模板 + 文献笔记是"工作台 → vault 落盘"的主链路。
4. **维护与进阶（9→10→17→18→19→20→21）**：死链、批量重命名、图谱数据、Canvas 都依赖双链索引成熟。

## 4. 实施里程碑

| 阶段 | 交付 | 产出 |
|---|---|---|
| **M1** | frontmatter 解析/写入 + aliases | ✅ `lib/utils/frontmatter.js` + `dsh_csrw_obsidian_attributes` 工具 |
| **M2** | 双链解析 + 消歧 + 反向链接 + 未链接提及 | ✅ `lib/utils/wikilink.js` + `dsh_csrw_obsidian_links` / `backlinks` 工具 |
| **M3** | 检索增强 + 模板 + 文献笔记 + 附件 | ✅ 检索过滤、`dsh_csrw_obsidian_template`、`dsh_csrw_obsidian_daily`、`dsh_csrw_obsidian_attach`、`dsh_csrw_paper_to_note` |
| **M4** | 维护：死链 + 批量重命名（重写链接） | ✅ `dsh_csrw_obsidian_rename`、`dsh_csrw_obsidian_broken_links` |
| **M5** | 图谱数据 + Canvas + 书签 | ✅ `dsh_csrw_obsidian_graph`、`dsh_csrw_obsidian_canvas`、`dsh_csrw_obsidian_bookmarks` |

## 5. 明确不做（"做不了"边界）

- Dataview / DataviewJS 的**查询执行引擎**（只能解析代码块，不能求值）
- Tasks / Templater 的动态查询与函数执行
- 关系图谱的**力导向渲染**（只出节点/边数据）
- 编辑器实时交互（自动补全、悬浮预览、Properties 建议、Vim、主题）
- Obsidian Sync / Publish 云端服务
- 通过 `obsidian://` 触发第三方插件命令（内置 open/search 除外）

## 6. 技术要点

### 6.1 frontmatter

- 以行首 `---` 起、`---` 或 `...` 止；内容是 YAML 子集。
- 需覆盖：标量、布尔/数字/null、引号字符串、行内数组 `[a, b]`、块数组 `- item`、嵌套映射、行内映射 `{k: v}`。
- 常见字段：`title` / `tags` / `aliases` / `created` / `updated` / `cssclasses`。
- `aliases` 支持单字符串、行内数组、块数组三种写法。

### 6.2 wikilink 解析与消歧

- 拆分顺序：先切 `|` 别名，再切 `#` 段落（`|` 在文件名中非法，`indexOf('|')` 安全）。
- 目标可为 `Note` 或 `Folder/Note`；匹配**不区分大小写**。
- 同名文件用**最短唯一路径**消歧（段数少者优先，再比总长度）；仍并列时返回候选并标记 `ambiguous`，不静默选错。

### 6.3 反向链接

- 反链不是存储的，是扫描后反推：解析每篇笔记的正向链接 → 按"解析后的真实路径"反聚合。
- 别名链接、显式路径链接都要归到真实目标头上；嵌入 `![[...]]` 不计入反链。

### 6.4 性能与磁盘索引缓存（已落地）

- 全量扫描 O(总字节数)，中小 vault（几百篇）单次调用够用；`links` / `backlinks` / `graph` 等需要建索引的工具走同一入口 `buildIndex`（`lib/utils/wikilink.js`）。
- **磁盘索引缓存已实现**，不再是规划项：
  - **文件名与位置**：固定在 `<workspace>/.dsh-csrw/obsidian-index.json`，以 workspace（而非 vault root）为基准，保证缓存文件本身不成为 vault 的笔记内容；只有落点在 vault 之外、或位于已被 `excludeDirs` 排除的 `.dsh-csrw` 插件数据目录时才启用，否则退化为纯内存全量扫描（`lib/tools/obsidian.js` 的 `indexOf`）。
  - **增量依据**：按 `stat` 的 `mtimeMs + size` 判定命中，命中则不重新解析；变化/新增文件重新解析，已删除文件不写回、自然从缓存剔除。命中时还复核 `Buffer.byteLength(text) === stat.size`，防 `stat` 与 `read` 之间被改动导致脏数据（`lib/utils/wikilink.js`）。
  - **只存结构化元数据，不存正文**：缓存项仅含 `mtimeMs / size / bodyLine / title / tags / aliases / links` 等解析结果与元数据；命中时按正文起始行偏移 `bodyLine` 从原文件还原正文，绝不把笔记正文写入缓存文件。
  - **原子写 + 失败降级**：通过 `atomicJson`（`tmp + rename`，`lib/utils/path.js`）整份覆写；缓存缺失、损坏、格式不符一律当作「无缓存」，本次全量解析并自愈，写失败或路径非法则降级为纯内存全量扫描，**不让工具调用失败**（`test/obsidian-index-cache.test.js` 覆盖损坏/不可写/路径非法降级与命中）。
  - **被备份与同步排除**：`obsidian-index.json` 与坚果云同步日志 `nutstore.log` 含 vault 绝对路径、笔记相对路径、title/tags/links 等元数据，属于运行时状态。workspace 快照与坚果云同步都按 **basename 精确命中** 这两个文件名排除（不引入 `logs/` 目录段，避免误伤用户在其它源里同名的正常目录）；快照侧还把命中项记进 `manifest.excluded` 并标 `reason:'runtime-state'`，便于核查而非静默丢弃（`lib/services/snapshot.js`、`lib/services/nutstore.js` 的 `RUNTIME_BASENAMES`）。

### 6.5 安全边界（沿用现有红线）

- 路径一律 `safePath`（拒 `..`、盘符、符号链接/目录联接）。
- 不碰 `.obsidian/` 内部配置目录；回收目录按 `obsidian.trashDir` 处理。
- 原子写 `tmp + rename`；覆盖需显式 `overwrite`；删除只进 `.trash`。
