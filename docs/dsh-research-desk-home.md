# 首页设计（仿 dsh-media-desk 首页）v1.0

> 目标：**直接复刻 dsh-media-desk 的首页形态**——首屏一句话 + 一句话记录 + 散落卡片墙 + 底部 dock + 右侧助手——把"灵感"换成"研究"。
> 首页 = **TODO 页的默认视图**（不新增第六个页面）；同一页还有「列表」「日历」两种模式，规格见 [dsh-research-desk-pages.md](dsh-research-desk-pages.md)。
> 参考实现：`dsh-media-desk/client/canvas.jsx`（HomeView/Scatter/Feed/Hero）、`card.jsx`、`layout.js`、`styles.css`（78KB）。

---

## 1. 逐元素对应表

| media-desk 首页 | research-desk 首页 | 说明 |
|---|---|---|
| 顶部玻璃导航：灵感/内容/排期/复盘/风格 | TODO / Project / Paper / Idea / Knowledge Base | 保持五个页签，首页为第一个 |
| 右上：示例数据·清空 / 撤销 / 模型 / 设置 / 助手 | 同 | 完全一致 |
| 首屏日期行 `2026 · 11 月 2 日 · 周一` | 同（加"第 N 周"可选） | 字号 13/20，色 ink3 |
| `还有 12 个灵感 等你成稿` | `还有 N 件事 等你推进` | N = 未完成任务数（todo+doing） |
| `3 条内容 排在本周` | `M 篇文献 排在本周` | M = 本周阅读计划（reading + 本周到期） |
| `你已经连续记录 14 天。` | `你已经连续记录 X 天。` | X = 连续有产出/记录的天数，斜体衬线 |
| 首屏行内圆形缩略图（36px） | 项目/文献/想法的**圆形色块**（首字或 venue 缩写） | 由 id 哈希决定色相，无图也能有视觉 |
| 一句话输入 `记下一个灵感，或贴一个链接` | `记下一件事、一个想法，或贴 DOI/arXiv` | 48px 高、20px 圆角、聚焦上浮 1px |
| 回车 → 建灵感卡；URL → 抓取网页卡 | 回车 → 按前缀/链接路由到 任务/想法/文献/笔记 | 解析失败也建任务，不报错 |
| `找到 N 条相关的灵感，放在了旁边` + 放回去 | `找到 N 条相关记录，放在了旁边` + 放回去 | Esc 也可清除 |
| 首屏下方 10 天"邮票" | 10 天"研究戳" | 每天一枚，有色=当天有记录，点击看当天 |
| 散落墙（无限画布） | 同 | 卡片=任务/项目/文献/想法/笔记 |
| 底部 dock：散落/信息流 + 全部/图片/视频/网页/金句/笔记 + ＋ | 散落/列表/日历 + 全部/任务/项目/文献/想法/笔记 + ＋ | 多一个"日历"，因为研究必须看时间 |
| 右下缩放控件（缩小/回中/放大） | 同 | 玻璃胶囊，18px 距边 |
| 右侧助手 dock（336px）`想改什么，直接说` | 同 | 对话/回执/撤销共用 |
| 卡片：媒体卡/金句卡/笔记卡 + 状态点/来源/时间 | 任务卡/项目卡/文献卡/想法卡/笔记卡 + 状态点/来源/时间 | 见 §6 |
| 示例数据徽标、加载文案"正在铺开灵感…" | 同，文案改"正在铺开研究桌面…" | |

**唯一有意的偏差**：media-desk 是「散落/信息流」两模式；我们加「日历」第三模式（任务改期是研究场景刚需），其余逐项对齐。

---

## 2. 视觉基线（照抄 media-desk 的设计语言）

```css
/* 根容器：直接用 DSH 主题变量，天然适配深浅色 */
.rd-root {
  --ink: var(--dsw-alias-label-primary);
  --ink2: var(--dsw-alias-label-secondary);
  --ink3: var(--dsw-alias-label-tertiary);
  --line: var(--dsw-alias-border-l2);
  --line-strong: var(--dsw-alias-border-l4);
  --hover: var(--dsw-alias-interactive-bg-hover);
  --active: var(--dsw-alias-interactive-bg-active);
  --bg: var(--dsw-alias-bg-base);
  --card: var(--dsw-alias-bg-layer-2);
  --primary: var(--dsw-alias-button-primary-fill);
  --on-primary: var(--dsw-alias-label-primary-inverted);
  --glass: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 72%, transparent);
  --serif: "Songti SC", "STSong", "Noto Serif SC", Georgia, serif;
  --latin-serif: "Iowan Old Style", "Palatino", Georgia, serif;
  --ease: cubic-bezier(.2, .8, .2, 1);
  --r-md: 12px; --r-lg: 16px; --r-xl: 20px; --dock-w: 336px;
}
```

- **背景氛围**：3 个大光斑（`56vmax` 圆、`blur(70px)`、`opacity .5`），冷蓝/淡粉/淡绿各一，42s 缓慢漂移（`translate(6vmax,4vmax) scale(1.12)`）。深浅色都用 `color-mix` 与底色混合，不写死颜色。
- **画布网格**：`.rd-stage` 点阵背景，`radial-gradient(circle, color-mix(in srgb, var(--ink) 11%, transparent) 1px, transparent 1.2px)`，`28px × 28px`，随相机平移（`--grid-x/--grid-y`），缩放时 `--grid-size: 28 * scale`。
- **玻璃层**（导航/dock/缩放/助手）：`background: var(--glass); backdrop-filter: blur(24px) saturate(160%)`，配 `--dsw-elevation-soft` 阴影。
- **字体**：正文 14px/22；首屏标题 33px/46、字重 300、字距 -.015em，粗体数字 400；连续天数用衬线斜体；卡片标题 15–16px，正文 13/20。
- **圆角**：导航 16、dock 24（胶囊）、卡片 20、输入 20、缩略图圆形。
- 所有颜色、阴影、圆角来自 `--dsw-*` 变量，深色模式零额外适配。

---

## 3. 首屏 Hero（页面中心，世界坐标原点）

结构（宽度 520px，世界坐标 `translate(-50%,-50%)`）：

```jsx
<section className="rd-hero">
  <p className="rd-hero-date">2026 · 11 月 12 日 · 周四</p>
  <h1 className="rd-hero-line">
    还有 <Inline src={posterOf(tasks)} /> <b>{n} 件事</b> 等你推进，
    <br />
    <Inline src={posterOf(papers)} /> <b>{m} 篇文献</b> 排在本周，
    <br />
    你已经连续记录 <b className="rd-hero-streak">{x} 天</b>。
  </h1>
  <form className="rd-hero-input">
    <Icon name="spark" size={16} />
    <input placeholder="记下一件事、一个想法，或贴 DOI/arXiv" />
    <button className="rd-send" aria-label="记下"><Icon name="send" size={15} /></button>
  </form>
  <p className="rd-hero-hint">找到 3 条相关记录，放在了旁边 <button>放回去</button></p>
  <MiniStamps />
</section>
```

### 3.1 三个数字的口径

| 位置 | 文案 | 计算 |
|---|---|---|
| 第 1 行 | `还有 {n} 件事 等你推进，` | `todos.filter(status in ['todo','doing']).length`（不含等待中） |
| 第 2 行 | `{m} 篇文献 排在本周，` | `papers.filter(status==='reading' 或 (status==='inbox' && readBy<=本周日)).length` |
| 第 3 行 | `你已经连续记录 {x} 天。` | `daysWithActivity(最近 60 天)` 的尾部连续段；活动=新建/完成/更新任一卡片 |

- 数字变化时用 300ms 数字滚动（`requestAnimationFrame` 插值），不整页闪。
- 行内缩略图：取对应集合里最近一条的 `poster` 圆形图（36px）；没有就显示空灰圆。

### 3.2 poster（无图也有视觉）

- 项目：目标首字 + 由 `hash(id)` 决定的双色渐变（HSL 色相 = hash%360，第二个色 +40°）。
- 文献：venue 缩写（如 "S&P" / "CCS" / "USENIX"）+ 深色渐变底。
- 想法：kind 图标（? / H / M）+ 浅色渐变底。
- 实现：`posterOf(item)` 返回 `{kind:'gradient', hue, text}`，渲染为 `<span class="rd-poster">` 而非 img，避免引入图片资源。

### 3.3 研究戳 MiniStamps

- 10 天网格（`grid-template-columns: repeat(10, 34px); gap: 4px`），每枚 `34×43`，用 `mask` 径向渐变打孔做出邮票齿孔（照抄 media-desk 的 `.md-stamp` mask 技巧）。
- 每枚内容：当天活动强度色块（0=空白描边，1=浅，2=中，3+=深）+ 右下角小数字（当天完成+新建数）。
- 今天：外框加深 + 微旋转 -2°；hover 放大 1.08 rotate(-2deg)。
- 点击某枚：切到「日历」模式并定位到那天；右侧末尾 `＋` 打开日历模式。

---

## 4. 一句话记录（Hero 输入框）

### 4.1 路由规则（提交时，顺序执行）

| 输入特征 | 落点 | 动作 |
|---|---|---|
| `https://doi.org/…`、`10.xxxx/…`、`arxiv.org/abs/…`、`arXiv:2401.xxxxx` | 文献 | 抓元数据建卡（Crossref/arXiv，10s 超时），失败建"待补全"卡 |
| 其他 `https://…` | 想法（link 类型） | 建卡并尝试取标题（host 抓取，失败用 URL） |
| 以 `问题:` / `假设:` / `方法:` / `局限:` 开头 | 想法 | 对应 `kind`，去掉前缀作 title |
| 含日期/`@项目`/`#P0`/`~2h` | 任务 | 走 `intents` 解析，带 due/project/priority/estimate |
| 其他文本 | 任务 | title=首句截 60 字，其余进 notes |

- 提交后**立刻清空输入框并保持焦点**，卡片出现在视野中心偏下；相机若需要则平滑跟过去（见 §5.3）。
- 解析失败不报错：建任务，标题=原文。
- 连续记录：每次提交都更新当天活动。

### 4.2 提交后的反馈

- 卡片入场动画 + 底部 dock 上方 1.6s 轻提示：`已记下：<标题前 20 字>`，带「撤销」。
- 若命中相关记录：首屏下方出现 `找到 N 条相关记录，放在了旁边` + `放回去`；相关卡向首屏四周聚拢，其余卡变暗（`opacity .13; saturate(.4)`）。
- 相关度算法：标题/正文分词（中文按 2-gram，英文按词），与近 200 条卡的标题/标签求 Jaccard；≥0.2 或共享显式标签（除 facet 默认值）即相关；取前 6 条。

---

## 5. 散落画布（核心交互，逐项照抄）

### 5.1 布局算法（`scatterLayout`，确定性）

```
按 createdAt 倒序；
对第 i 张卡：
  angle = i * 2.39996 + rand() * 0.5        // 黄金角螺旋
  radius = 210 + 112 * sqrt(i + 1)
  x = cos(angle) * radius * 1.34            // 椭圆横向更宽
  y = sin(angle) * radius * 0.86
  r = (rand() - .5) * 7                     // 初始微旋转
迭代最多 240 轮推开重叠：
  - 先保证不压中心 hero 区（540×372 + 20px gap）
  - 两两重叠时沿重叠较小轴各推一半
  - 手动摆过的卡（pos 存在）固定，不参与移动
最终 r 用 hash(id)%13-6 /100 固定微旋转（±6%）
```

- 随机数用固定种子（如 7919），**同一批数据刷新后布局完全一致**；筛选/新增不让整墙洗牌（只在新增时找空位）。
- 卡片尺寸：有 poster 的 176–256 宽（hash%5*20）按 4:3 比例 + 66 底；纯文本 232×186；想法/引文卡 220–260×186。

### 5.2 卡片节点

- `position:absolute; left/top; transform: translate(-50%,-50%) rotate(var(--r))`。
- hover：`rotate(0) translateY(-4px) scale(1.025)`，阴影加深；`transition .5s cubic-bezier(.2,1.3,.4,1)`。
- 拖动：`pointerdown` 卡上超过 4px 才进入拖拽（避免误触打开）；拖动时 `z-index:20`、缩放 1.05、旋转减半；松开写 `pos`（`undoable:false, silent:true`，与 media-desk 一致）。
- 入场：从中心方向 `translate(-pos*0.25) scale(.8) rotate(±10deg)` + 淡入，`duration 420ms`，`delay = min(i*32, 620)`；`prefers-reduced-motion` 时直接出现。
- 选中：点击后 `box-shadow: 0 0 0 1.5px var(--ink)`，Esc 取消。

### 5.3 相机（弹簧）

```
cam = {x, y, s, vx, vy, vs, tx, ty, ts}
每帧：v += (90*(t - v_current) - 17*v)*dt; p += v*dt   // k=90, d=17
home：x=w/2, y=h/2+8, s = w<760 ? .66 : w<1040 ? .8 : w<1400 ? .92 : 1
```

- 拖动空白：即时平移（`instant:true`），松手带 180ms 惯性。
- 滚轮：默认平移；`Ctrl/⌘ + 滚轮`：以指针为中心缩放，`factor = exp(-deltaY*0.01)`，范围 0.3–2.2。
- 右下控件：缩小（×0.8，动画）/回中（flyTo home）/放大（×1.25）。
- 新增卡片若在视野外：自动把镜头平移最小距离使其可见（边距 90px）。
- 拉出相关卡时：镜头自动缩放到能装下"hero + 相关卡"（`min(home.s, (w-80)/(2*halfX), (h-150)/(2*halfY))`）。
- 键盘 Tab 到屏外卡片：镜头跟随（边距 72px）。
- 窗口宽度变化：镜头平移 `delta/2` 保持视觉中心稳定。

### 5.4 拖拽放置（研究特有）

- 从卡片拖出并悬停到底部 dock 的「任务/文献/想法」chip 上：转换类型（仅任务↔想法，需确认）。
- 拖任务卡到日历模式日期格：改期（见 §8.3）。
- 拖到项目卡上：建立关联（`projectId`/`projectIds`）。

---

## 6. 卡片类型（5 种，共用一个 Card 外壳）

外壳：`border-radius:20px; background:var(--card); box-shadow:elevation-soft; overflow:hidden;`，内边距 14–16，底部 footer 高 30（状态点 + 来源 + 时间），hover 显示快捷动作（右上角 1–3 个小圆钮）。

| 类型 | 主体 | footer 左 | footer 右 | 快捷动作 |
|---|---|---|---|---|
| **任务** | 圆形勾选框 + 标题（2 行）+ chips：P0/P1、今天/周四、@项目 | 状态点（todo 灰/doing 蓝/waiting 黄/done 绿） | 相对时间或"等回复" | 完成、开始、置顶、改期 |
| **项目** | 顶部 16:7 渐变条（色相来自 id）+ 目标 2 行 + 里程碑进度条 | 状态点（active/paused/done） | `2/5 里程碑` | 打开项目、生成周报 |
| **文献** | 顶部 16:7 venue 色块（venue 缩写大字）+ 标题 3 行 + 作者一句 | 状态点（inbox/reading/read/cited） | `2023 · S&P` | 开始读、写笔记、加入对比 |
| **想法** | kind 标签（假设/问题/方法/局限）+ 引文式标题 3 行（衬线斜体，照抄 md-card-quote） | 状态点（seed/exploring/…） | 相对时间 | 升级项目、生成提案 |
| **笔记** | 标题 + 正文 3 行（隔行浅色横线，照抄 md-card-note 的 ruled 效果） | kb 分类 chip | 更新时间 | 打开、导出 |

- 文字截断一律 `-webkit-line-clamp`，不撑破卡片。
- 卡片整体可点击（打开对应详情抽屉）；键盘 Enter/Space 等效。
- 已完成任务：标题加删除线、整卡 `opacity .55`，勾选框为实心绿。

---

## 7. 底部 Dock

```jsx
<div className="rd-dockbar">
  <Segmented value={mode} options={[散落, 列表, 日历]} />
  <sep />
  <chips>{全部 任务 项目 文献 想法 笔记}</chips>
  <sep />
  <button className="rd-round is-primary"><Icon name="plus" /></button>
</div>
```

- 位置：`left:50%; bottom:18px; translateX(-50%)`，胶囊 24px 圆角、玻璃模糊 28px。
- 模式切换：散落↔列表↔日历；切模式保留筛选，滚动位置各自记忆。
- chips 单选（默认全部），只影响画布上显示的卡片；计数显示在 chip 内（如 `任务 12`）。
- `＋` 打开快速记录弹窗（§8.1），默认 Tab 跟随当前 chip。
- 有抽屉/弹窗/助手输入聚焦时，dock 淡出下移（`opacity 0; translateY(12px)`），照抄 media-desk。
- 窄屏（<780）：dock 只留「＋」和小号模式切换，chips 横向滚动。

---

## 8. 三种模式

### 8.1 散落（默认）

即 §5 的画布：hero + 卡片墙 + dock + 缩放控件 + 助手。

### 8.2 列表

- hero 置顶（滚动到顶时可见），下方为按状态的紧凑列表：
  - 分组：今日 / 本周 / 等待中 / 无日期 / 已完成（折叠）。
  - 行：勾选框、标题、chips（项目、优先级、截止、标签）、估算、右侧相对时间；行 hover 出现「开始 / 置顶 / 拆解 / ⋯」。
  - 顶部一行工具：排序（截止/优先级/创建）、分组（按项目/按日期/不分组）、显示已完成开关。
- 详情：点击行打开右侧抽屉（与散落卡同一抽屉）。
- 列表模式下的完整行为沿用 [dsh-research-desk-pages.md](dsh-research-desk-pages.md) §1 的说明。

### 8.3 日历

- 月视图（默认）/周视图切换；有任务的日期显示最多 3 个色点（按优先级着色），超出显示 `+n`。
- 点击日期：底部展开该日任务清单，可直接勾选完成、拖拽改期（拖到其他日期格）。
- 拖拽跨日改期写 `due`；拖到"等待中"区域改 `status=waiting` 并提示选择阻塞原因。
- 今天列高亮；逾期任务在日期格内红色小条。
- 点击任务：右侧抽屉。

---

## 9. 快速记录弹窗（照抄 CaptureDialog）

- 标题：`记下一条`；宽 480。
- Tab：**任务 / 想法 / 文献 / 笔记**。
  - 任务：标题（必填）+ 截止（可选）+ 优先级 P0–P3 + 项目选择 + 标签选择；副文案："回车即建，日期/项目也可以直接写在标题里"。
  - 想法：kind 分段（想法/假设/问题/方法）+ 正文 textarea；占位："想到什么就写什么，之后再让助手补全。"（照抄 media-desk 文案风格）
  - 文献：DOI/arXiv/URL 输入 + "会自动读取标题、作者和摘要。"；也可切到"手动填写"。
  - 笔记：标题 + 正文，落到 Knowledge Base。
- 底部：取消 / `放到桌上`（主按钮）。
- 提交后关闭弹窗，卡片出现在画布；失败保留弹窗内容并 toast。

---

## 10. 右侧助手 Dock

- 宽 336，玻璃背景，从右侧滑入；`has-dock` 时主区右侧让出 336（内容仍可被覆盖，按 media-desk 的浮层方式）。
- 头部：`助手 · <模型名>` + 模型切换按钮（打开 ModelPicker）+ 关闭。
- 消息流：用户气泡靠右、助手靠左；回执卡显示 `已创建 2 个任务 · 已改期 1 条` 与「撤销」；AI 生成进度用 shimmer 文案（"正在想…"）。
- 输入：`想改什么，直接说` 单行输入 + 发送；`⌘Enter` 发送；空模型时占位改为"本地规则：可新建/改期/查询"。
- 无模型时仍可用本地规则：建任务、改期、改状态、查询今日/本周；返回带 `engine:"local"` 标记。

---

## 11. 空、加载、错误

| 状态 | 表现 |
|---|---|
| 首次加载 | 全屏 `正在铺开研究桌面…` shimmer + 3 个呼吸占位卡 |
| 空数据 | hero 下方提示："写下今天要做的一件事，或贴一个 DOI。右上角的助手也能替你记。"；画布不显示示例卡，只有 hero |
| 示例数据 | 右上 `示例数据 · 清空`；清空后 hero 数字变 0，不弹二次确认（照抄 media-desk） |
| 读取失败 | 中央错误块："工作台加载失败：<message>" + 「重试」；不显示 dock 写操作 |
| 单卡打开失败 | toast 错误 + 卡片保持原位 |
| 模型不可用 | 助手输入可用（本地模式）；无模型生成按钮置灰 |
| 生成中 | 卡片 footer 显示 shimmer `正在成稿`（与 media-desk 同款），完成后变 `已成稿` |

---

## 12. 实现清单（client.js 单文件手写，不引入构建）

1. `Store`：state 拉取、乐观更新、5s 轮询、`canUndo`。
2. `Camera`：`useCamera` 弹簧相机（x/y/s + 目标值 + rAF）。
3. `Scatter`：`scatterLayout` + `posOf`（手动 pos > 相关位 > 布局位）+ 拖拽/缩放/滚轮/键盘聚焦跟随。
4. `Hero`：日期、三行数字、输入、相关提示、MiniStamps。
5. `Cards`：5 种卡片 + 统一 footer + hover 动作。
6. `Dockbar`：模式分段 + chips + ＋。
7. `CaptureDialog`：4 Tab 表单 → `POST /ops`。
8. `AssistantDock`：消息流 + 本地规则兜底。
9. `MiniStamps`：10 天戳 + 点击跳日历。
10. `Modal/Drawer/Toast/ConfirmGate`：与 pages 文档共用组件。

> 所有写操作仍走唯一 `POST /research-desk/ops`；拖拽位置 `undoable:false`，其余可撤销；不新增任何 npm 依赖。

---

## 13. 验收标准

1. 打开即见首屏三行数字（未完成数/本周文献/连续天数），数字与列表页手算一致。
2. 输入 `明天下午跑消融实验 @NeuSym ~2h` 回车 → 任务卡出现、带 due/project/estimate，输入框清空、焦点保留。
3. 输入 `10.1145/xxx` 或 arXiv 链接 → 文献卡出现（或"待补全"卡），重复导入提示已存在。
4. 输入与既有卡片相关的词 → 相关卡聚拢到 hero 周围、其余变暗，出现"找到 N 条相关记录"，点「放回去」或 Esc 恢复。
5. 拖动卡片后刷新，位置保持；撤销不会因拖动产生一步（与 media-desk 一致）。
6. 滚轮平移、Ctrl+滚轮缩放、右下三键、回中均可用；新卡在视野外时自动跟过去。
7. chips 筛选即时生效且不重排布局；切换散落/列表/日历保留筛选。
8. 日历拖拽改期成功；逾期红色标记；撤销恢复。
9. 窄屏 <1020 助手默认收起；<780 dock 收缩；无横向滚动条。
10. `prefers-reduced-motion` 下无入场/相机动画，功能不受影响。

*首页设计 v1.0；研究戳、poster、卡片类型是相对 media-desk 的科研化替换，交互与视觉语言逐项对齐。*
