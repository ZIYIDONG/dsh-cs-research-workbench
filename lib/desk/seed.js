// 示例数据与状态迁移。示例条目带 sample:true；清空示例不会动真实数据。
const day = 86_400_000
const iso = (now, offsetDays, hour = 10) => {
  const date = new Date(now.getTime() + offsetDays * day)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}
const dateOnly = (now, offsetDays) => iso(now, offsetDays).slice(0, 10)

const milestones = (now) => [
  { id: 'ms_baseline', title: '完成 baseline 复现', done: true, due: dateOnly(now, -6) },
  { id: 'ms_ablation', title: '消融实验跑完三组', done: false, due: dateOnly(now, 5) },
  { id: 'ms_draft', title: '论文初稿完成', done: false, due: dateOnly(now, 20) },
]

export function buildSeed(now = new Date()) {
  const at = (offset) => iso(now, offset)
  return {
    version: 1,
    createdAt: at(0),
    todos: [
      {
        id: 'todo_ablation', title: '把 NeuSym 的消融实验跑起来', status: 'doing', priority: 'P0',
        due: dateOnly(now, 0), projectId: 'prj_neusym', estimateMinutes: 120,
        notes: '三组配置：去掉符号约束、去掉 RAG、全量。',
        tags: [], pos: null, createdAt: at(-1), updatedAt: at(-1), sample: true,
      },
      {
        id: 'todo_read_attention', title: '读《Attention Is All You Need》§3', status: 'todo', priority: 'P1',
        due: dateOnly(now, 1), projectId: null, estimateMinutes: 45, notes: '', tags: [],
        pos: null, createdAt: at(-2), updatedAt: at(-2), sample: true,
      },
      {
        id: 'todo_intro', title: '写引言初稿 300 字', status: 'todo', priority: 'P1',
        due: dateOnly(now, 2), projectId: 'prj_neusym', estimateMinutes: 60, notes: '', tags: [],
        pos: null, createdAt: at(-2), updatedAt: at(-2), sample: true,
      },
      {
        id: 'todo_review', title: '回复审稿意见', status: 'waiting', priority: 'P0',
        due: dateOnly(now, 3), projectId: null, estimateMinutes: 30,
        blockedReason: '等合作者补齐实验数据', notes: '', tags: [],
        pos: null, createdAt: at(-4), updatedAt: at(-1), sample: true,
      },
      {
        id: 'todo_table', title: '补实验对比表', status: 'todo', priority: 'P2',
        due: dateOnly(now, 4), projectId: 'prj_neusym', estimateMinutes: 30, notes: '', tags: [],
        pos: null, createdAt: at(-3), updatedAt: at(-3), sample: true,
      },
      {
        id: 'todo_done_log', title: '整理本周实验日志', status: 'done', priority: 'P2',
        due: dateOnly(now, -1), projectId: null, estimateMinutes: 20, notes: '', tags: [],
        doneAt: at(-1), pos: null, createdAt: at(-5), updatedAt: at(-1), sample: true,
      },
    ],
    projects: [
      {
        id: 'prj_neusym', name: 'NeuSym 神经符号验证', status: 'active',
        goal: '让 LLM 生成的约束能被符号执行引擎直接验证。',
        venue: 'S&P', milestones: milestones(now), pos: null,
        createdAt: at(-30), updatedAt: at(-1), sample: true,
      },
    ],
    papers: [
      {
        id: 'paper_attention', title: 'Attention Is All You Need', authors: 'Vaswani et al.',
        venue: 'NeurIPS', year: 2017, status: 'reading', doi: '', url: 'https://arxiv.org/abs/1706.03762',
        readBy: dateOnly(now, 1), notes: '重点看 §3 多头注意力的实现细节。', pos: null,
        createdAt: at(-2), updatedAt: at(-1), sample: true,
      },
      {
        id: 'paper_sok', title: 'SoK: LLM-based Vulnerability Detection', authors: 'Anonymous',
        venue: 'S&P', year: 2025, status: 'inbox', doi: '', url: '',
        readBy: dateOnly(now, 3), notes: '', pos: null,
        createdAt: at(-1), updatedAt: at(-1), sample: true,
      },
      {
        id: 'paper_kan', title: 'KAN: Kolmogorov-Arnold Networks', authors: 'Liu et al.',
        venue: 'arXiv', year: 2024, status: 'read', doi: '10.48550/arXiv.2404.19756', url: '',
        readBy: null, notes: '和可解释约束有关系，值得对照。', pos: null,
        createdAt: at(-8), updatedAt: at(-3), sample: true,
      },
    ],
    ideas: [
      {
        id: 'idea_constraint_rag', title: '把符号执行路径约束当作 RAG 的检索键，可能降低生成式补丁的幻觉',
        kind: 'hypothesis', status: 'exploring',
        body: '路径约束天然携带程序状态；用它做检索键，检索到的上下文更接近真实执行路径。',
        pos: null, createdAt: at(-6), updatedAt: at(-2), sample: true,
      },
      {
        id: 'idea_cross_function', title: 'LLM 生成的补丁为什么在跨函数上下文里更容易失败？',
        kind: 'question', status: 'seed', body: '', pos: null,
        createdAt: at(-3), updatedAt: at(-3), sample: true,
      },
      {
        id: 'idea_differential', title: '用差分测试给生成式漏洞检测器构造对抗样本',
        kind: 'method', status: 'seed',
        body: '同一语义、不同实现的两个函数，检测器结论应该一致。',
        pos: null, createdAt: at(-5), updatedAt: at(-5), sample: true,
      },
    ],
    notes: [
      {
        id: 'note_path_constraint', title: '路径约束（Path Constraint）', kb: 'concept',
        body: '符号执行里让程序走到某条分支需要满足的约束集合。把它翻译成 SMT 公式就能交给求解器。',
        pos: null, createdAt: at(-12), updatedAt: at(-4), sample: true,
      },
      {
        id: 'note_windows_realpath', title: 'Windows 下 fs.realpath 与 junction 的行为', kb: 'pitfall',
        body: 'pnpm 默认 junction 布局下，realpath 不展开目录联接，Node ESM 解析会找不到被链接的包。',
        pos: null, createdAt: at(-9), updatedAt: at(-9), sample: true,
      },
    ],
    chat: [],
    metrics: [],
    tagRegistry: [],
    settings: { assistant: null, language: 'zh', dockOpen: true },
  }
}

/** 旧版本状态补齐：缺的集合补空数组，缺的版本号补 1。 */
export function migrateState(state) {
  if (!state || typeof state !== 'object') return buildSeed()
  const next = { ...state }
  next.version = Number(next.version) || 1
  for (const key of ['todos', 'projects', 'papers', 'ideas', 'notes', 'chat', 'metrics', 'tagRegistry']) {
    if (!Array.isArray(next[key])) next[key] = []
  }
  if (!next.settings || typeof next.settings !== 'object') next.settings = { assistant: null, language: 'zh', dockOpen: true }
  return next
}
