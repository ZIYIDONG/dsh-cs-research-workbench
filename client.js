// dsh-cs-research-workbench 浏览器半片：科研工作台首页（仿 dsh-media-desk）+ 原有工具面板。
// 手写 IIFE + React.createElement，不引入构建步骤；保存即被 DSH HMR 热更。
window.__ModuleLoader__.load({
  id: 'dsh-cs-research-workbench',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useSyncExternalStore, useCallback } = React

    // 全局标识：与 lib/desk/ids.js 保持一致（浏览器半片不能 import Node 模块，由 check-identifiers 校验）。
    const UI_ID = 'dsh-csrw-ui'
    // 相对路径：沿用改造前的解析方式，避免子路径部署时变成绝对地址。
    const API_BASE = 'dsh-csrw/api/'
    const HERO = { w: 540, h: 372 }

    // ---------- 原有工具面板：配置、连接检测、备份（并入设置页，不再单独占一个侧栏入口） ----------
    const TOOLS_EN = {title:'CS research workbench',intro:'Workspace configuration, connection checks, sync and versioned backups.',workspace:'Workspace directory',session:'Session ID',load:'Load configuration',save:'Save field',open:'Open workbench',config:'Configuration',actions:'Operations',result:'Last result',pending:'Running…',cancel:'Cancel',confirm:'Confirm this write operation',approval:'Review the target workspace and arguments before confirming. This operation may change local or remote files.',secret:'Passwords are not stored here. Configure credentials in the DSH credential store or NUTSTORE_USERNAME / NUTSTORE_PASSWORD environment variables.',context:'Select an existing session to provide a permission and audit context. No model turn is started.',error:'Request failed',health:'Check plugin',git:'Git status',zotero:'Check Zotero',dav:'Check WebDAV',list:'List remote directory',push:'Upload directory',pull:'Download directory',obsidian:'Back up Obsidian',backupZotero:'Back up Zotero',dsh:'Back up DSH',verify:'Verify snapshot',local:'Local sync directory',remote:'Remote subdirectory',snapshot:'Snapshot directory',sources:'Backup paths come from the current workspace configuration. Restore remains available through the explicit-confirmation tool.',choose:'Choose directory',noSession:'Choose a session first',notLoaded:'Load the workspace configuration first',boolean:'Boolean',field:'Configuration field',value:'Value',operationsHint:'Network checks contact only the configured endpoints; backups create local files.',empty:'No result yet',yes:'Enabled',no:'Disabled',cloudBackup:'Cloud backup',backupWorkspace:'Backup config',backupUpload:'Upload Nutstore',backupGithub:'Backup GitHub',backupAll:'Backup all',obsidianTools:'Obsidian tools',links:'Links',backlinks:'Backlinks',brokenLinks:'Broken links',listDir:'List',template:'Template',daily:'Daily',attach:'Attach',rename:'Rename',graph:'Graph',canvas:'Canvas',bookmarks:'Bookmarks',paperNote:'Paper note',path:'Path',destination:'Destination',source:'Source',date:'Date',scope:'Scope',templatePath:'Template',zkey:'Zotero key'};
    const TOOLS_ZH = {title:'CS科研工作台',intro:'工作区配置、连接检测、增量同步与版本化备份。',workspace:'工作区目录',session:'会话 ID',load:'加载配置',save:'保存此项',open:'打开工作台',config:'配置',actions:'操作',result:'最近结果',pending:'执行中…',cancel:'取消',confirm:'确认执行此写入操作',approval:'请核对目标工作区和参数后确认；此操作可能修改本地或远端文件。',secret:'这里不保存密码。请使用 DSH 凭据存储，或 NUTSTORE_USERNAME / NUTSTORE_PASSWORD 环境变量。',context:'选择已有会话作为权限与审计上下文，不会启动模型对话。',error:'请求失败',health:'检查插件',git:'Git 状态',zotero:'检测 Zotero',dav:'检测 WebDAV',list:'列出远端目录',push:'上传目录',pull:'下载目录',obsidian:'备份 Obsidian',backupZotero:'备份 Zotero',dsh:'备份 DSH',verify:'校验快照',local:'本地同步目录',remote:'远端子目录',snapshot:'快照目录',sources:'备份路径读取当前工作区配置。恢复仍通过带显式确认的工具执行。',choose:'选择目录',noSession:'请先选择会话',notLoaded:'请先加载工作区配置',boolean:'布尔值',field:'配置字段',value:'值',operationsHint:'连接检测只访问配置中的端点；备份会创建本地文件。',empty:'暂无结果',yes:'启用',no:'停用',cloudBackup:'云端备份',backupWorkspace:'备份参数',backupUpload:'上传坚果云',backupGithub:'备份 GitHub',backupAll:'一键备份',obsidianTools:'Obsidian 工具',links:'双链',backlinks:'反链',brokenLinks:'死链',listDir:'列目录',template:'模板生成',daily:'日记',attach:'附件',rename:'重命名',graph:'图谱',canvas:'Canvas',bookmarks:'书签',paperNote:'文献笔记',path:'路径',destination:'目标',source:'源文件',date:'日期',scope:'目录',templatePath:'模板',zkey:'Zotero key'};
    const TOOLS_FIELDS = ['obsidian.vaultPath','obsidian.autoDetect','obsidian.trashDir','git.remote','git.branch','git.autoInit','git.pullRebase','zotero.localApi','zotero.dataDir','nutstore.baseUrl','nutstore.remoteRoot','nutstore.username','nutstore.credentialKey','backup.localDir','backup.dshHome','backup.dshProfile','backup.includeDshSessions'];
    const TOOLS_CSS = '.dsh-csrw-panel{box-sizing:border-box;max-width:1040px;width:100%;margin:0 auto;padding:28px;color:var(--dsw-alias-label-primary);font-size:14px;overflow:auto;height:100%}.dsh-csrw-panel *{box-sizing:border-box}.dsh-csrw-panel h1{font-size:24px;margin:0}.dsh-csrw-head{margin:0 0 10px}.dsh-csrw-panel h2{font-size:17px;margin:0 0 16px}.dsh-csrw-panel p{color:var(--dsw-alias-label-secondary);line-height:1.6}.dsh-csrw-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:20px;margin:18px 0}.dsh-csrw-row{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:12px 0}.dsh-csrw-panel label{display:flex;flex-direction:column;gap:7px;flex:1 1 240px}.dsh-csrw-panel input,.dsh-csrw-panel select{width:100%;min-height:36px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:7px 10px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit}.dsh-csrw-panel button{min-height:36px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:7px 14px;background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit;cursor:pointer}.dsh-csrw-panel button:disabled{opacity:.5;cursor:not-allowed}.dsh-csrw-panel button:focus-visible,.dsh-csrw-panel input:focus-visible,.dsh-csrw-panel select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.dsh-csrw-panel pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto;background:var(--dsw-alias-bg-base);padding:14px;border-radius:8px;font-size:12px}.dsh-csrw-alert{border-left:3px solid var(--dsw-alias-state-warn-primary);padding:12px}.dsh-csrw-error{color:var(--dsw-alias-state-error-primary)}.dsh-csrw-icon-slot{display:inline-flex;align-items:center;justify-content:center;line-height:1;vertical-align:middle;align-self:center;flex:none}.dsh-csrw-icon-slot svg{display:block}';
    const toolsGlyph = { fill: 'none', stroke: '#000', strokeWidth: 0.5333333333333333, strokeLinecap: 'round', strokeLinejoin: 'round' };
    function ToolsIcon({ size = 20 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true, style: { display: 'block' } }, h('defs', null, h('mask', { id: 'dsh-csrw-solid-prompt', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 24, height: 24 }, h('rect', { x: 0, y: 0, width: 24, height: 24, fill: '#fff' }), h('path', { ...toolsGlyph, d: 'M5.4 8.35 6.4333 9.2367 5.4 10.1233' }), h('path', { ...toolsGlyph, d: 'M6.9667 10.1233h1.2333' }))), h('g', { mask: 'url(#dsh-csrw-solid-prompt)', fill: 'currentColor' }, h('path', { d: 'M4.5 6.05H19.5A1.4 1.4 0 0 1 20.9 7.45V17.9167H3.1V7.45A1.4 1.4 0 0 1 4.5 6.05Z' }), h('rect', { x: 1.5, y: 18.1167, width: 21, height: 0.9333, rx: 0.4667 })));
    }
    function ToolsPanel(props) {
      const ctx = props.ctx;
      const t = props.t;
      const desk = props.desk;
      const useSessions = props.useSessions;
      const sessionList = useSessions ? useSessions((s) => s) : { ids: [], byId: {} };
      const [,localeUpdate]=useState(0);useEffect(()=>ctx.locale.subscribe(()=>localeUpdate(v=>v+1)),[]);
      const [workspace,setWorkspace]=useState(''),[sessionId,setSessionId]=useState(''),[config,setConfig]=useState(null),[field,setField]=useState(TOOLS_FIELDS[0]),[value,setValue]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState(null),[error,setError]=useState(''),[pending,setPending]=useState(null),[local,setLocal]=useState(''),[remote,setRemote]=useState(''),[snapshot,setSnapshot]=useState(''),[obsPath,setObsPath]=useState(''),[obsDest,setObsDest]=useState(''),[obsTemplate,setObsTemplate]=useState(''),[obsDate,setObsDate]=useState(''),[obsSource,setObsSource]=useState(''),[obsScope,setObsScope]=useState(''),[obsFrom,setObsFrom]=useState(''),[paperKey,setPaperKey]=useState('');
      useEffect(()=>{if(sessionId&&!sessionList.byId[sessionId]){setSessionId('');setPending(null);}},[sessionList,sessionId]);
      const [prefLang,setPrefLang]=useState('zh'),[prefDock,setPrefDock]=useState(true),[prefBusy,setPrefBusy]=useState(false),[prefError,setPrefError]=useState('');
      useEffect(()=>{fetch(API_BASE+'state').then(r=>r.json()).then(d=>{const s=d.state&&d.state.settings;if(s){setPrefLang(s.language||'zh');setPrefDock(s.dockOpen!==false);}}).catch(()=>{});},[]);
      async function prefPost(path,body){const res=await fetch(API_BASE+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'preferences failed');return data;}
      async function changeLang(next){setPrefBusy(true);setPrefError('');try{await prefPost('settings',{language:next});desk.setLanguage(next);desk.setDesk({});setPrefLang(next);}catch(err){setPrefError(err.message);}finally{setPrefBusy(false);}}
      async function changeDock(value){setPrefBusy(true);setPrefError('');try{await prefPost('settings',{dockOpen:value});desk.setDesk({dockOpen:value});setPrefDock(value);}catch(err){setPrefError(err.message);}finally{setPrefBusy(false);}}
      async function clearSamples(){setPrefBusy(true);setPrefError('');try{await prefPost('ops',{ops:[{op:'clear_samples'}],label:desk.t('clearSamples')});desk.loadDesk();}catch(err){setPrefError(err.message);}finally{setPrefBusy(false);}}
      const request=useRef(null);useEffect(()=>()=>request.current?.abort(),[]);
      async function run(operation,args={},confirmed=false){
        if(!sessionId){setError(t('noSession'));return;}
        const controller=new AbortController();request.current=controller;setBusy(true);setError('');
        try{const remoteResult=await ctx.remote.commands.execute(sessionId,'/dsh-csrw '+JSON.stringify({operation,args:{...args,workspace},confirmed}),[],controller.signal);if(!remoteResult.ok)throw remoteResult.error;const response=remoteResult.value;if(!response||response.result.kind!=='success')throw new Error(response?.result?.text||t('error'));const data=JSON.parse(response.result.text);if(!controller.signal.aborted){setResult(data);if(operation==='dsh_csrw_config_show')setConfig(data.config);if(operation==='dsh_csrw_config_set')setConfig(previous=>{if(!previous)return previous;const [section,key]=args.key.split('.');return {...previous,[section]:{...previous[section],[key]:args.value}};});}}
        catch(err){if(!controller.signal.aborted)setError(err.message);}finally{if(request.current===controller){request.current=null;setBusy(false);}}
      }
      function input(label,val,set,type='text'){return h('label',null,t(label),h('input',{type,value:val,onChange:e=>set(e.target.value),disabled:busy}));}
      function action(label,operation,args={},write=false){return h('button',{type:'button',disabled:busy||!workspace||!sessionId,onClick:()=>write?setPending({operation,args}):run(operation,args)},t(label));}
      const actual=field.split('.').reduce((a,k)=>a?.[k],config),isBoolean=typeof actual==='boolean';
      useEffect(()=>{setValue(actual??'');},[field,config]);
      return h('section',{className:'dsh-csrw-panel','aria-label':t('title')},h('style',null,TOOLS_CSS),h('header',{className:'dsh-csrw-head'},h('h1',null,t('title'))),
        h('div',{className:'dsh-csrw-card'},h('h2',null,desk.t('settings')),h('div',{className:'dsh-csrw-row'},h('label',null,desk.t('language'),h('select',{value:prefLang,disabled:prefBusy,onChange:e=>changeLang(e.target.value)},h('option',{value:'zh'},'中文'),h('option',{value:'en'},'English'))),h('label',null,desk.t('dockOpen'),h('select',{value:String(prefDock),disabled:prefBusy,onChange:e=>changeDock(e.target.value==='true')},h('option',{value:'true'},'√'),h('option',{value:'false'},'—')))),h('div',{className:'dsh-csrw-row'},h('button',{type:'button',disabled:prefBusy,onClick:clearSamples},desk.t('clearSamples'))),prefError?h('p',{className:'dsh-csrw-error',role:'alert'},prefError):null,h('p',null,desk.t('undoHint'))),
        h('div',{className:'dsh-csrw-card'},h('div',{className:'dsh-csrw-row'},input('workspace',workspace,v=>{setWorkspace(v);setConfig(null);setPending(null);setResult(null);setError('');}),h('button',{type:'button',disabled:busy,onClick:async()=>{try{const p=await ctx.get('uiWorkspace')?.pickDirectory();if(p){setWorkspace(p);setConfig(null);setPending(null);setResult(null);setError('');}}catch(e){setError(e.message);}}},t('choose')),h('label',null,t('session'),h('select',{value:sessionId,disabled:busy,onChange:e=>{setSessionId(e.target.value);setPending(null);setResult(null);setConfig(null);}},h('option',{value:''},t('noSession')),...sessionList.ids.map(id=>h('option',{value:id,key:id},sessionList.byId[id]?.displayTitle||id))))),h('p',null,t('context')),h('div',{className:'dsh-csrw-row'},action('load','dsh_csrw_config_show'),action('health','dsh_csrw_health'))),
        h('div',{className:'dsh-csrw-card'},h('h2',null,t('config')),h('p',null,t('secret')),h('div',{className:'dsh-csrw-row'},h('label',null,t('field'),h('select',{value:field,onChange:e=>setField(e.target.value),disabled:busy},...TOOLS_FIELDS.map(k=>h('option',{key:k,value:k},k)))),h('label',null,t('value'),isBoolean?h('select',{value:String(value),onChange:e=>setValue(e.target.value==='true'),disabled:busy},h('option',{value:'true'},t('yes')),h('option',{value:'false'},t('no'))):h('input',{value:String(value),disabled:busy,onChange:e=>setValue(e.target.value)})),h('button',{disabled:busy||!config,onClick:()=>setPending({operation:'dsh_csrw_config_set',args:{key:field,value}})},t('save'))),config&&h('pre',null,JSON.stringify(config,null,2))),
        h('div',{className:'dsh-csrw-card'},h('h2',null,t('actions')),h('p',null,t('operationsHint')),h('div',{className:'dsh-csrw-row'},action('git','dsh_csrw_git_status'),action('zotero','dsh_csrw_zotero_search',{query:'a',limit:1}),action('dav','dsh_csrw_nutstore_test'),action('list','dsh_csrw_nutstore_list',{remotePath:remote})),h('div',{className:'dsh-csrw-row'},input('local',local,setLocal),input('remote',remote,setRemote)),h('div',{className:'dsh-csrw-row'},action('push','dsh_csrw_nutstore_push',{localPath:local,remotePath:remote},true),action('pull','dsh_csrw_nutstore_pull',{localPath:local,remotePath:remote},true)),h('p',null,t('sources')),h('div',{className:'dsh-csrw-row'},action('obsidian','dsh_csrw_backup_obsidian',{},true),action('backupZotero','dsh_csrw_backup_zotero',{},true),action('dsh','dsh_csrw_backup_dsh',{},true)),h('div',{className:'dsh-csrw-row'},input('snapshot',snapshot,setSnapshot),action('verify','dsh_csrw_snapshot_verify',{snapshotPath:snapshot}))),
        h('div',{className:'dsh-csrw-card'},h('h2',null,t('cloudBackup')),h('p',null,t('sources')),h('div',{className:'dsh-csrw-row'},action('backupWorkspace','dsh_csrw_backup_workspace',{},true),action('backupUpload','dsh_csrw_backup_upload',{},true)),h('div',{className:'dsh-csrw-row'},action('backupGithub','dsh_csrw_backup_github',{},true),action('backupAll','dsh_csrw_backup_all',{},true))),
        h('div',{className:'dsh-csrw-card'},h('h2',null,t('obsidianTools')),h('div',{className:'dsh-csrw-row'},input('path',obsPath,setObsPath),action('links','dsh_csrw_obsidian_links',{path:obsPath}),action('backlinks','dsh_csrw_obsidian_backlinks',{path:obsPath}),action('brokenLinks','dsh_csrw_obsidian_broken_links',{path:obsPath})),h('div',{className:'dsh-csrw-row'},input('scope',obsScope,setObsScope),action('listDir','dsh_csrw_obsidian_list',{scope:obsScope}),action('graph','dsh_csrw_obsidian_graph',{}),action('bookmarks','dsh_csrw_obsidian_bookmarks',{})),h('div',{className:'dsh-csrw-row'},input('templatePath',obsTemplate,setObsTemplate),input('destination',obsDest,setObsDest),action('template','dsh_csrw_obsidian_template',{template:obsTemplate,destination:obsDest},true)),h('div',{className:'dsh-csrw-row'},input('date',obsDate,setObsDate),action('daily','dsh_csrw_obsidian_daily',{date:obsDate},true)),h('div',{className:'dsh-csrw-row'},input('source',obsSource,setObsSource),input('destination',obsDest,setObsDest),action('attach','dsh_csrw_obsidian_attach',{source:obsSource,destination:obsDest},true)),h('div',{className:'dsh-csrw-row'},input('path',obsFrom,setObsFrom),input('destination',obsDest,setObsDest),action('rename','dsh_csrw_obsidian_rename',{path:obsFrom,destination:obsDest},true)),h('div',{className:'dsh-csrw-row'},input('path',obsPath,setObsPath),action('canvas','dsh_csrw_obsidian_canvas',{path:obsPath,operation:'read'}))),
        h('div',{className:'dsh-csrw-card'},h('h2',null,t('paperNote')),h('div',{className:'dsh-csrw-row'},input('zkey',paperKey,setPaperKey),action('paperNote','dsh_csrw_paper_to_note',{key:paperKey},true))),
        pending&&h('div',{className:'dsh-csrw-card dsh-csrw-alert',role:'region','aria-label':t('confirm')},h('p',null,t('approval')),h('pre',null,JSON.stringify({workspace,...pending},null,2)),h('div',{className:'dsh-csrw-row'},h('button',{disabled:busy,onClick:()=>{const p=pending;setPending(null);return run(p.operation,p.args,true);}},t('confirm')),h('button',{disabled:busy,onClick:()=>setPending(null)},t('cancel')))),
        h('div',{className:'dsh-csrw-card','aria-live':'polite'},h('h2',null,t('result')),busy&&h('div',null,t('pending'),' ',h('button',{onClick:()=>request.current?.abort()},t('cancel'))),error&&h('p',{className:'dsh-csrw-error',role:'alert'},error),h('pre',null,result?JSON.stringify(result,null,2):t('empty'))));
    }

    // ---------- 文案 ----------
    const zh = {
      workbench: '科研工作台',
      navTodo: '待办', navProject: '项目', navPaper: '文献库', navIdea: '想法', navKb: '知识库',
      pendingLine: '还有{n}件事等你推进',
      heroPlaceholder: '记下一件事、一个想法，或贴一个 DOI / 链接',
      send: '记下',
      related: '找到 {n} 条相关的内容，放在了旁边',
      back: '放回去',
      sample: '示例数据 · 清空',
      sampleTitle: '现在看到的内容都是示例，可以一键清空',
      scatter: '散落', list: '列表', calendar: '日历',
      all: '全部', task: '任务', project: '项目', paper: '文献', idea: '想法', note: '笔记',
      undo: '撤销上一步', gear: '设置', assistant: '助手',
      zoomIn: '放大', zoomOut: '缩小', zoomFit: '回到中心',
      model: '模型', modelPick: '选择助手模型', modelLocal: '本地规则', modelEmpty: '没有可用的模型',
      modelHint: '选中后助手用该模型回答；不选则用本地规则。',
      clearSamples: '清空示例数据', undoHint: '撤销：Ctrl / Cmd + Z',
      loading: '正在铺开研究台…',
      error: '工作台加载失败：{error}', retry: '重试',
      empty: '研究台还是空的。记下第一件事，或按 + 快速记录。',
      capture: '快速记录', captureHint: '先记下来，之后再整理。',
      addTask: '放到研究台',
      cancel: '取消',
      assistantPlaceholder: '想改什么，直接说',
      assistantEmpty: '告诉我今天要做什么，或者问我现在积压了多少事。',
      assistantSuggestion1: '今天有什么事？', assistantSuggestion2: '积压了多少？', assistantSuggestion3: '记一件事',
      engineModel: '模型', engineLocal: '本地规则', clearChat: '清空对话',
      title: '标题', body: '内容', due: '截止', priority: '优先级', estimate: '预计分钟',
      authors: '作者', venue: '发表场所', year: '年份', doi: 'DOI', url: '链接', status: '状态',
      projectOf: '所属项目', none: '无',
      save: '保存', settings: '偏好', language: '语言', dockOpen: '显示助手',
      noDue: '无截止', minutes: '{n} 分钟', milestone: '里程碑 {done}/{total}',
      paperStatus: { inbox: '待读', reading: '精读', read: '已读', cited: '已引用' },
      todoStatus: { todo: '待办', doing: '进行中', waiting: '等待', done: '已完成' },
      projectStatus: { active: '进行中', paused: '暂停', done: '已完成' },
      ideaStatus: { seed: '种子', exploring: '探索中', parked: '搁置' },
      kb: { concept: '概念', pitfall: '踩坑', formula: '公式', tool: '工具', snippet: '代码', template: '模板' },
      cleared: '已撤销：{label}', toastAdd: '已记下',
      pageSoon: '这一页的骨架下一轮补上。现在先把首页做扎实。',
    }
    const en = {
      workbench: 'Research desk',
      navTodo: 'Todo', navProject: 'Projects', navPaper: 'Papers', navIdea: 'Ideas', navKb: 'KnowledgeBase',
      pendingLine: '{n} things waiting for you',
      heroPlaceholder: 'Log a task, an idea, or paste a DOI / link',
      send: 'Log',
      related: 'Found {n} related items, placed nearby',
      back: 'Put back',
      sample: 'Sample data · clear',
      sampleTitle: 'Everything you see is sample data; clear it in one click',
      scatter: 'Scatter', list: 'List', calendar: 'Calendar',
      all: 'All', task: 'Task', project: 'Project', paper: 'Paper', idea: 'Idea', note: 'Note',
      undo: 'Undo', gear: 'Settings', assistant: 'Assistant',
      zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomFit: 'Reset view',
      model: 'Model', modelPick: 'Pick an assistant model', modelLocal: 'Local rules', modelEmpty: 'No model available',
      modelHint: 'The assistant answers with this model; unset falls back to local rules.',
      clearSamples: 'Clear sample data', undoHint: 'Undo: Ctrl / Cmd + Z',
      loading: 'Unfolding the desk…',
      error: 'Failed to load the desk: {error}', retry: 'Retry',
      empty: 'The desk is empty. Log something or press + to capture.',
      capture: 'Quick capture', captureHint: 'Capture first, organize later.',
      addTask: 'Add to desk',
      cancel: 'Cancel',
      assistantPlaceholder: 'Tell me what to change',
      assistantEmpty: 'Tell me what to do today, or ask how much is queued.',
      assistantSuggestion1: 'What is due today?', assistantSuggestion2: 'How much is queued?', assistantSuggestion3: 'Log something',
      engineModel: 'Model', engineLocal: 'Local', clearChat: 'Clear chat',
      title: 'Title', body: 'Content', due: 'Due', priority: 'Priority', estimate: 'Minutes',
      authors: 'Authors', venue: 'Venue', year: 'Year', doi: 'DOI', url: 'URL', status: 'Status',
      projectOf: 'Project', none: 'None',
      save: 'Save', settings: 'Preferences', language: 'Language', dockOpen: 'Show assistant',
      noDue: 'No due date', minutes: '{n} min', milestone: '{done}/{total} milestones',
      paperStatus: { inbox: 'Inbox', reading: 'Reading', read: 'Read', cited: 'Cited' },
      todoStatus: { todo: 'Todo', doing: 'Doing', waiting: 'Waiting', done: 'Done' },
      projectStatus: { active: 'Active', paused: 'Paused', done: 'Done' },
      ideaStatus: { seed: 'Seed', exploring: 'Exploring', parked: 'Parked' },
      kb: { concept: 'Concept', pitfall: 'Pitfall', formula: 'Formula', tool: 'Tool', snippet: 'Snippet', template: 'Template' },
      cleared: 'Undid: {label}', toastAdd: 'Logged',
      pageSoon: 'This page is coming in the next round; the home page comes first.',
    }
    let language = 'zh'
    const dict = () => (language === 'en' ? en : zh)
    function t(key, vars) {
      const value = dict()[key] ?? zh[key] ?? key
      if (typeof value !== 'string') return value
      return vars ? value.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? '')) : value
    }
    const statusText = (kind, value) => (dict()[(kind === 'task' ? 'todoStatus' : kind === 'project' ? 'projectStatus' : kind === 'paper' ? 'paperStatus' : 'ideaStatus')] ?? {})[value] ?? value

    // ---------- 请求与状态 ----------
    let snapshot = {
      state: null, canUndo: false, error: null, view: 'todo', mode: 'scatter', kindFilter: 'all',
      query: '', related: null, capture: null, dockOpen: true, chatInput: '', thinking: false,
      toast: null, focusId: null, cam: { x: 0, y: 0, z: 1 }, camAnim: false,
      modelsOpen: false, models: [], modelsLoading: false,
      month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    }
    const listeners = new Set()
    function setDesk(patch) {
      snapshot = { ...snapshot, ...(typeof patch === 'function' ? patch(snapshot) : patch) }
      listeners.forEach((fn) => fn())
    }
    const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
    const useSel = (selector) => useSyncExternalStore(subscribe, () => selector(snapshot))

    async function request(path, body) {
      const res = await fetch(API_BASE + path, body === undefined ? {} : {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
      return data
    }

    let toastTimer = null
    function toast(text, { undo = false, error = false } = {}) {
      clearTimeout(toastTimer)
      setDesk({ toast: { text, undo, error, key: Date.now() } })
      toastTimer = setTimeout(() => setDesk({ toast: null }), undo || text.length > 24 ? 6000 : 3200)
    }

    async function loadDesk() {
      try {
        const data = await request('state')
        if (data.state?.settings?.language) language = data.state.settings.language
        setDesk({ state: data.state, canUndo: data.canUndo, error: null, dockOpen: data.state?.settings?.dockOpen !== false })
      } catch (err) {
        setDesk({ error: err.message })
      }
    }

    async function dispatchOps(ops, { label = '操作', undoable = true, silent = false } = {}) {
      try {
        const data = await request('ops', { ops, label, undoable })
        setDesk({ state: data.state, canUndo: undoable || snapshot.canUndo })
        if (data.errors?.length) toast(data.errors[0], { error: true })
        else if (!silent && data.receipts?.[0]) toast(data.receipts[0].text, { undo: undoable })
        return data
      } catch (err) {
        toast(err.message, { error: true })
        return null
      }
    }

    async function undoDesk() {
      try {
        const data = await request('undo', {})
        setDesk({ state: data.state, canUndo: data.canUndo, toast: null })
        if (data.label) toast(t('cleared', { label: data.label }))
      } catch (err) {
        toast(err.message, { error: true })
      }
    }

    async function saveSettings(patch) {
      try {
        const data = await request('settings', patch)
        if (patch.language) language = patch.language
        setDesk({ state: data.state, dockOpen: data.settings.dockOpen !== false })
        return true
      } catch (err) {
        toast(err.message, { error: true })
        return false
      }
    }

    async function openModels() {
      setDesk({ modelsOpen: true, modelsLoading: true })
      try {
        const data = await request('models')
        setDesk({ models: data.models ?? [], modelsLoading: false })
      } catch (err) {
        setDesk({ models: [], modelsLoading: false })
        toast(err.message, { error: true })
      }
    }

    async function chooseModel(entry) {
      setDesk({ modelsOpen: false })
      await saveSettings({ assistant: entry ? { provider: entry.provider, model: entry.id } : null })
    }

    async function sendChat(message) {
      const text = String(message || '').trim()
      if (!text || snapshot.thinking) return
      setDesk((s) => ({
        thinking: true, chatInput: '',
        state: { ...s.state, chat: [...(s.state?.chat ?? []), { id: `tmp_${Date.now()}`, role: 'user', text, at: new Date().toISOString() }] },
      }))
      try {
        const data = await request('chat', { message: text })
        setDesk({ state: data.state, canUndo: true })
      } catch (err) {
        toast(err.message, { error: true })
        await loadDesk()
      } finally {
        setDesk({ thinking: false })
      }
    }

    // ---------- 相机 ----------
    function zoomCenter(factor) {
      const cam = snapshot.cam
      const nextZ = Math.min(2.2, Math.max(0.3, cam.z * factor))
      const ratio = nextZ / cam.z
      setDesk({ cam: { z: nextZ, x: cam.x * ratio, y: cam.y * ratio }, camAnim: true })
    }
    function resetCamera() { setDesk({ cam: { x: 0, y: 0, z: 1 }, camAnim: true }) }

    // ---------- 数据与布局 ----------
    const CATEGORY = { todo: 'task', project: 'project', paper: 'paper', idea: 'idea', note: 'note' }
    const COLLECTION = { task: 'todos', project: 'projects', paper: 'papers', idea: 'ideas', note: 'notes' }

    function hash(text) {
      let value = 0
      for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) | 0
      return Math.abs(value)
    }
    function seeded(seed) {
      let state = seed
      return () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646 }
    }

    function displayItems(state) {
      if (!state) return []
      const out = []
      for (const kind of ['task', 'project', 'paper', 'idea', 'note']) {
        for (const row of state[COLLECTION[kind]] ?? []) out.push({ ...row, kind, id: row.id, collection: COLLECTION[kind] })
      }
      return out
    }

    function cardSize(item) {
      const value = hash(item.id)
      if (item.kind === 'paper') return { w: 196 + (value % 3) * 20, h: 262 }
      if (item.kind === 'project') return { w: 248 + (value % 2) * 16, h: 206 }
      if (item.kind === 'idea') return { w: 220 + (value % 3) * 18, h: 200 }
      return { w: 210 + (value % 4) * 16, h: 188 }
    }

    function scatterLayout(items) {
      const ordered = [...items].sort((a, b) => Date.parse(b.createdAt ?? 0) - Date.parse(a.createdAt ?? 0) || a.id.localeCompare(b.id))
      const rand = seeded(7919)
      const nodes = ordered.map((item, index) => {
        const angle = index * 2.39996 + rand() * 0.5
        const radius = 210 + 112 * Math.sqrt(index + 1)
        const size = cardSize(item)
        const jitter = (rand() - 0.5) * 7
        return {
          id: item.id, x: item.pos?.x ?? Math.cos(angle) * radius * 1.34, y: item.pos?.y ?? Math.sin(angle) * radius * 0.86,
          w: size.w, h: size.h, fixed: Boolean(item.pos), r: item.pos?.r ?? jitter,
        }
      })
      const gap = 20
      for (let step = 0; step < 240; step += 1) {
        let moved = false
        for (let i = 0; i < nodes.length; i += 1) {
          const a = nodes[i]
          const hx = (a.w + HERO.w) / 2 + gap - Math.abs(a.x)
          const hy = (a.h + HERO.h) / 2 + gap - Math.abs(a.y)
          if (hx > 0 && hy > 0 && !a.fixed) {
            if (hx < hy) a.x += Math.sign(a.x || 1) * hx
            else a.y += Math.sign(a.y || 1) * hy
            moved = true
          }
          for (let j = i + 1; j < nodes.length; j += 1) {
            const b = nodes[j]
            if (a.fixed && b.fixed) continue
            const ox = (a.w + b.w) / 2 + gap - Math.abs(a.x - b.x)
            const oy = (a.h + b.h) / 2 + gap - Math.abs(a.y - b.y)
            if (ox <= 0 || oy <= 0) continue
            moved = true
            const horizontal = ox < oy
            const push = (horizontal ? ox : oy) / 2
            const dir = horizontal ? Math.sign(a.x - b.x || 1) : Math.sign(a.y - b.y || 1)
            const shareA = b.fixed ? 2 : a.fixed ? 0 : 1
            const shareB = a.fixed ? 2 : b.fixed ? 0 : 1
            if (horizontal) { a.x += dir * push * shareA; b.x -= dir * push * shareB }
            else { a.y += dir * push * shareA; b.y -= dir * push * shareB }
          }
        }
        if (!moved) break
      }
      return Object.fromEntries(nodes.map((node) => [node.id, { x: Math.round(node.x), y: Math.round(node.y), w: node.w, h: node.h, r: node.r, d: node.fixed ? 0 : (hash(node.id) % 13 - 6) / 100 }]))
    }

    const tokens = (text) => {
      const value = String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
      const out = new Set()
      for (const word of value.split(/\s+/)) if (word) out.add(word)
      for (const chunk of value.match(/[\u4e00-\u9fff]{2,}/g) ?? []) for (let i = 0; i < chunk.length - 1; i += 1) out.add(chunk.slice(i, i + 2))
      return out
    }

    function relatedIds(items, query) {
      const tokensOfQuery = tokens(query)
      if (!tokensOfQuery.size) return null
      const scored = items.map((item) => {
        const own = tokens([item.title, item.name, item.body, item.notes, item.goal].filter(Boolean).join(' '))
        let hit = 0
        for (const token of tokensOfQuery) if (own.has(token)) hit += 1
        return { id: item.id, score: hit / Math.max(1, tokensOfQuery.size) }
      }).filter((row) => row.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, 6)
      return scored.length ? scored.map((row) => row.id) : null
    }

    const DAY = 86_400_000
    const dateKey = (date) => new Date(date).toISOString().slice(0, 10)
    function relTime(value) {
      if (!value) return ''
      const diff = Date.now() - new Date(value).getTime()
      if (!Number.isFinite(diff)) return ''
      if (diff < 60_000) return dict() === en ? 'just now' : '刚刚'
      if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))} ${dict() === en ? 'min ago' : '分钟前'}`
      if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} ${dict() === en ? 'h ago' : '小时前'}`
      return `${Math.round(diff / DAY)} ${dict() === en ? 'd ago' : '天前'}`
    }

    function heroNumbers(state) {
      if (!state) return { pending: 0 }
      const todos = state.todos ?? []
      const pending = todos.filter((row) => row.status === 'todo' || row.status === 'doing').length
      return { pending }
    }

    function classify(text) {
      const value = String(text || '').trim()
      if (!value) return null
      if (/^(10\.\d{4,9}\/|arxiv:|https?:\/\/(arxiv\.org|doi\.org))/i.test(value) || /doi/i.test(value)) {
        return { ops: [{ op: 'add_item', kind: 'paper', title: value.replace(/^https?:\/\/\S+$/i, '').slice(0, 90) || '待补充标题', doi: /^10\./.test(value) ? value : '', url: /^https?:/i.test(value) ? value : '' }], label: '记下一篇文献' }
      }
      if (/^(问题|假设|方法|局限)[:：]/.test(value)) {
        return { ops: [{ op: 'add_item', kind: 'idea', title: value.replace(/^(问题|假设|方法|局限)[:：]/, '').slice(0, 90), kind: /^假设/.test(value) ? 'hypothesis' : /^问题/.test(value) ? 'question' : /^方法/.test(value) ? 'method' : 'idea' }], label: '记下一个想法' }
      }
      if (/^https?:\/\//i.test(value)) {
        return { ops: [{ op: 'add_item', kind: 'idea', title: value.slice(0, 90), body: '', kind: 'link' }], label: '记下一个链接' }
      }
      const patch = {}
      const due = value.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}月\d{1,2}日)/)
      if (due) patch.due = /^\d{4}-/.test(due[1]) ? due[1] : `${new Date().getFullYear()}-${due[1].replace(/月|日/g, '-').replace(/-$/, '')}`
      const estimate = value.match(/(\d+)\s*(分钟|min)/i)
      if (estimate) patch.estimateMinutes = Number(estimate[1])
      const priority = value.match(/#(P[0-3])/i)
      if (priority) patch.priority = priority[1].toUpperCase()
      const project = value.match(/@([^\s，,。]+)/)
      if (project) patch.projectId = project[1]
      return { ops: [{ op: 'add_item', kind: 'todo', title: value.slice(0, 90), ...patch }], label: '记下一件事' }
    }

    // ---------- 图标 ----------
    const ICONS = {
      scatter: [['circle', { cx: 7, cy: 8, r: 2 }], ['circle', { cx: 17, cy: 6, r: 2.5 }], ['circle', { cx: 12, cy: 15, r: 2 }], ['circle', { cx: 18, cy: 16, r: 1.5 }]],
      list: [['path', { d: 'M4 7h16M4 12h16M4 17h10' }]],
      calendar: [['rect', { x: 4, y: 5, width: 16, height: 15, rx: 2 }], ['path', { d: 'M4 10h16M8 3v4M16 3v4' }]],
      plus: [['path', { d: 'M12 5v14M5 12h14' }]],
      send: [['path', { d: 'M12 19V5M6 11l6-6 6 6' }]],
      undo: [['path', { d: 'M9 7H5v4M5 11a8 8 0 1 1 2.3 5.7' }]],
      gear: [
        ['path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' }],
        ['circle', { cx: 12, cy: 12, r: 3.1 }],
      ],
      target: [['circle', { cx: 12, cy: 12, r: 3.6 }], ['path', { d: 'M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2' }]],
      chevron: [['path', { d: 'M6 9.5 12 15.5 18 9.5' }]],
      chat: [['path', { d: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4z' }]],
      spark: [['path', { d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z' }]],
      send: [['path', { d: 'M12 19V5M6 11l6-6 6 6' }]],
    }
    function Icon({ name, size = 18 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        ...(ICONS[name] ?? []).map(([tag, props], index) => h(tag, { key: index, ...props })))
    }

    // ---------- 样式 ----------
    const CSS = `
.rd-shell{position:relative;width:100%;height:100%;min-height:560px;overflow:hidden}
.rd-root{--glass:color-mix(in srgb,var(--dsw-alias-bg-base) 62%,transparent);--serif:ui-serif,Georgia,"Times New Roman",serif;--r-lg:14px;--r-xl:20px;--dock-w:336px;position:absolute;inset:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px;font-family:inherit;contain:layout paint}
.rd-root *{box-sizing:border-box}
.rd-ambient{position:absolute;inset:0;overflow:hidden;pointer-events:none;filter:blur(70px);opacity:.5}
.rd-ambient i{position:absolute;width:56vmax;height:56vmax;border-radius:50%;animation:rd-drift 42s ease-in-out infinite alternate}
.rd-ambient i:nth-child(1){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 32%,transparent);left:-18vmax;top:-20vmax}
.rd-ambient i:nth-child(2){background:color-mix(in srgb,#ff9ecb 26%,transparent);right:-20vmax;top:6vmax;animation-delay:-14s}
.rd-ambient i:nth-child(3){background:color-mix(in srgb,#7fe7c4 24%,transparent);left:22vmax;bottom:-28vmax;animation-delay:-27s}
@keyframes rd-drift{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(4vmax,-3vmax,0) scale(1.12)}}
.rd-main{position:absolute;inset:0;display:flex;flex-direction:column}
.rd-topbar{position:absolute;top:0;left:0;right:0;z-index:30;display:flex;align-items:center;gap:10px;padding:14px 18px;pointer-events:none}
.rd-topbar>*{pointer-events:auto}
.rd-nav{display:flex;gap:2px;padding:4px;border-radius:999px;background:var(--glass);border:.5px solid var(--dsw-alias-border-l1);backdrop-filter:blur(24px);box-shadow:0 8px 30px rgb(0 0 0 / 6%)}
.rd-nav button{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;padding:6px 14px;border-radius:999px;cursor:pointer;transition:background .18s,color .18s}
.rd-nav button:hover{color:var(--dsw-alias-label-primary)}
.rd-nav button.is-on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 4px rgb(0 0 0 / 8%)}
.rd-tool{display:flex;align-items:center;gap:6px;margin-left:auto}
.rd-iconbtn{width:32px;height:32px;display:grid;place-items:center;border-radius:999px;border:.5px solid var(--dsw-alias-border-l1);background:var(--glass);backdrop-filter:blur(24px);color:var(--dsw-alias-label-secondary);cursor:pointer}
.rd-iconbtn:hover{color:var(--dsw-alias-label-primary)}
/* 右下角：缩放/定位。吸附在内容区（.rd-main）四角，
   助手展开时随内容区一起左移，不会压到助手栏。 */
.rd-corner{position:absolute;bottom:18px;z-index:31;display:flex;align-items:center;gap:8px}
.rd-corner.is-right{right:18px}
.rd-root.has-dock .rd-corner.is-right{right:calc(var(--dock-w) + 18px)}
.rd-zoom{display:flex;align-items:center;gap:2px;padding:3px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l1);background:var(--glass);backdrop-filter:blur(24px);box-shadow:0 8px 30px rgb(0 0 0 / 6%)}
.rd-zoom button{width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:16px;line-height:1;cursor:pointer;transition:background .16s,color .16s}
.rd-zoom button:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.rd-zoom button.rd-zoom-fit{font-size:0}
/* 右上角模型选择：与设置按钮同高同圆角，长文案省略 */
.rd-model{height:32px;display:flex;align-items:center;gap:6px;max-width:210px;padding:0 10px 0 11px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l1);background:var(--glass);backdrop-filter:blur(24px);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.rd-model:hover{color:var(--dsw-alias-label-primary)}
.rd-model span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* spark 的墨迹中心在 viewBox y=10（不是 12），14px 下高出约 1.2px，单独补偿 */
.rd-model svg:first-of-type{transform:translateY(2.5px)}
.rd-model-dialog{width:min(420px,90vw)}
.rd-model-hint{margin:0 0 12px;color:var(--dsw-alias-label-tertiary,#8a8a8a);font-size:12px;line-height:1.5}
.rd-model-list{display:flex;flex-direction:column;gap:4px;max-height:320px;overflow:auto;margin:0 0 14px}
.rd-model-row{display:flex;align-items:baseline;gap:10px;padding:9px 12px;border-radius:10px;border:.5px solid transparent;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;text-align:left;cursor:pointer}
.rd-model-row:hover{background:var(--dsw-alias-bg-layer-1)}
.rd-model-row.is-on{border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}
.rd-model-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rd-model-provider{color:var(--dsw-alias-label-tertiary,#8a8a8a);font-size:11px}
.rd-model-empty{margin:0 0 14px;color:var(--dsw-alias-label-tertiary,#8a8a8a);font-size:12px}
.rd-sample{height:30px;padding:0 12px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l1);background:var(--glass);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.rd-open-dock{height:32px;display:flex;align-items:center;gap:6px;padding:0 12px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l1);background:var(--glass);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.rd-content{position:absolute;inset:0;overflow:hidden;transition:right .22s ease}
/* 右侧助手展开时，内容区整体让出 --dock-w；所有全宽布局都必须放进 .rd-content，
   不要用 position:fixed 或 100vw 自行定位，否则会被助手栏遮住。 */
.rd-root.has-dock .rd-content{right:var(--dock-w)}
.rd-root.has-dock .rd-topbar{right:var(--dock-w)}
.rd-loading{position:absolute;inset:0;display:grid;place-items:center;color:var(--dsw-alias-label-secondary)}
.rd-shimmer{animation:rd-pulse 1.6s ease-in-out infinite}
@keyframes rd-pulse{0%,100%{opacity:.45}50%{opacity:1}}
.rd-page{position:absolute;inset:0;overflow:auto;padding:96px 28px 120px}
.rd-hero-anchor{position:absolute;left:50%;top:50%;width:576px;transform:translate(-50%,-50%);z-index:6;pointer-events:auto;padding:28px 28px 24px;border-radius:26px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 20%,transparent);border:.5px solid color-mix(in srgb,var(--dsw-alias-border-l1) 55%,transparent);backdrop-filter:blur(26px) saturate(1.02);-webkit-backdrop-filter:blur(26px) saturate(1.02);box-shadow:0 16px 44px rgb(0 0 0 / 5%)}
.rd-hero{pointer-events:auto;display:flex;flex-direction:column;gap:14px}
.rd-hero-date{color:var(--dsw-alias-label-tertiary,#8a8a8a);font-size:13px;letter-spacing:.02em;text-align:center}
.rd-hero-line{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:33px;line-height:1.46;font-weight:300;letter-spacing:-.01em;margin:0;text-align:center;width:100%}
.rd-hero-row{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px;min-height:48px;width:100%;white-space:pre-wrap}
.rd-hero-line b{font-weight:600}
.rd-hero-num{position:relative;isolation:isolate;flex:none;font-family:"Times New Roman",Times,"Nimbus Roman",serif;font-size:1.06em;font-weight:600;line-height:inherit;letter-spacing:.01em;font-variant-numeric:lining-nums;color:color-mix(in srgb,#8d2733 82%,var(--dsw-alias-label-primary));transform:translateY(calc(.11em + 1.25px))}
.rd-hero-num::before{content:'';position:absolute;left:50%;bottom:calc(.35em + 2px);width:calc(.92em - 2px);height:calc(.92em - 2px);transform:translateX(-50%);background:color-mix(in srgb,#8d2733 12%,transparent);border-radius:.18em;z-index:-1}
.rd-hero-num-txt{display:inline-block;transform:translateY(calc(-.07em - 1px))}
.rd-hero-input{display:flex;align-items:center;gap:8px;height:48px;padding:0 6px 0 16px;border-radius:20px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);box-shadow:0 10px 30px rgb(0 0 0 / 7%);transition:transform .18s,box-shadow .18s}
.rd-hero-input:focus-within{transform:translateY(-1px);box-shadow:0 14px 36px rgb(0 0 0 / 10%)}
.rd-hero-input > svg{flex:none;color:var(--dsw-alias-brand-primary);transform:translateY(1.5px)}
.rd-hero-input button svg{color:inherit}
.rd-hero-input input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:inherit;font:inherit;font-size:15px}
.rd-hero-input input::placeholder{color:var(--dsw-alias-label-tertiary,#9a9a9a)}
.rd-hero-input button{flex:none;width:36px;height:36px;border:0;border-radius:50%;background:var(--dsw-alias-brand-primary);color:#fff;display:grid;place-items:center;cursor:pointer}
.rd-hero-input button:disabled{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);color:var(--dsw-alias-brand-primary);opacity:1;cursor:default}
.rd-hero-hint{font-size:12px;color:var(--dsw-alias-label-secondary);text-align:center}
.rd-hero-hint button{border:0;background:none;color:var(--dsw-alias-brand-primary);font:inherit;font-size:12px;cursor:pointer;padding:0 4px}
.rd-stage{position:absolute;inset:0;cursor:grab;overflow:hidden;touch-action:none}
.rd-stage.is-panning{cursor:grabbing}
.rd-stage::before{content:"";position:absolute;inset:0;background-image:radial-gradient(var(--dsw-alias-border-l1) 1px,transparent 1px);background-size:28px 28px;opacity:.5;pointer-events:none}
.rd-world{position:absolute;left:50%;top:50%;width:0;height:0;transform-origin:0 0}
.rd-world.is-anim{transition:transform .42s cubic-bezier(.22,.68,.18,1)}
.rd-node{position:absolute;transform:translate(-50%,-50%) rotate(var(--r,0deg));cursor:default;z-index:1;transition:transform .2s,opacity .25s,filter .25s}
.rd-node:hover{transform:translate(-50%,-50%) translateY(-4px) scale(1.025) rotate(var(--r,0deg));z-index:9}
.rd-node.is-dim{opacity:.13;filter:saturate(.4)}
.rd-node.is-drag{z-index:20;transform:translate(-50%,-50%) scale(1.05) rotate(var(--r,0deg));cursor:grabbing}
.rd-card{background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--r-xl);box-shadow:0 8px 26px rgb(0 0 0 / 8%);overflow:hidden;display:flex;flex-direction:column;user-select:none}
.rd-card-top{flex:1;padding:16px;display:flex;flex-direction:column;gap:8px;min-height:0}
.rd-card-foot{display:flex;align-items:center;gap:6px;padding:8px 14px 10px;border-top:.5px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary)}
.rd-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-brand-primary);flex:none}
.rd-dot.is-done{background:#4bc0a4}.rd-dot.is-wait{background:#f0a84a}.rd-dot.is-seed{background:#9a9a9a}
.rd-tag{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.rd-tag.is-p0{background:color-mix(in srgb,#ff6b6b 18%,transparent);color:#d64545}
.rd-tag.is-p1{background:color-mix(in srgb,#f0a84a 20%,transparent);color:#a8711e}
.rd-card-title{font-size:14px;line-height:1.45;margin:0;font-weight:600;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.rd-card-body{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary);margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.rd-paper-card .rd-paper-venue{font-size:11px;color:var(--dsw-alias-label-secondary);letter-spacing:.03em;text-transform:uppercase}
.rd-paper-card .rd-card-title{font-family:var(--serif);font-size:15px;font-weight:500;line-height:1.4}
.rd-quote-card{background:linear-gradient(160deg,color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,var(--dsw-alias-bg-layer-1)),var(--dsw-alias-bg-layer-1))}
.rd-note-card .rd-card-top{padding:14px 16px}
.rd-note-lines{background-image:repeating-linear-gradient(transparent,transparent 23px,var(--dsw-alias-border-l1) 23px,var(--dsw-alias-border-l1) 23.5px);flex:1;border-radius:4px}
.rd-milestones{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.rd-milestones span{display:flex;align-items:center;gap:6px}
.rd-dockbar{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:12;display:flex;align-items:center;gap:10px;padding:7px 10px 7px 7px;border-radius:24px;background:var(--glass);border:.5px solid var(--dsw-alias-border-l1);backdrop-filter:blur(28px);box-shadow:0 14px 40px rgb(0 0 0 / 12%);transition:opacity .2s}
.rd-root.has-dock .rd-toast{left:calc(50% - var(--dock-w)/2)}
.rd-seg{display:flex;padding:3px;border-radius:999px;background:var(--dsw-alias-bg-layer-2)}
.rd-seg button{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;height:28px;padding:0 11px;border-radius:999px;cursor:pointer}
.rd-seg button.is-on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px rgb(0 0 0 / 8%)}
.rd-round-plus{width:34px;height:34px;border-radius:50%;border:0;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);display:grid;place-items:center;cursor:pointer}
.rd-list{padding:104px 28px 120px;max-width:1080px;margin:0 auto;overflow:auto;height:100%}
.rd-board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:start}
.rd-board-col{display:flex;flex-direction:column;gap:14px;min-width:0}
.rd-board-card{padding:16px 16px 12px;border-radius:16px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);box-shadow:0 8px 24px rgb(0 0 0 / 5%)}
.rd-board-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:10px}
.rd-board-head h2{font-size:14px;font-weight:600;margin:0;letter-spacing:.01em}
.rd-board-count{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8a8a);font-variant-numeric:tabular-nums}
.rd-board-body{display:flex;flex-direction:column;gap:6px}
.rd-board-row{display:flex;align-items:center;gap:8px;min-width:0;padding:8px 10px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);font-size:13px}
.rd-board-row .rd-card-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rd-board-empty{padding:8px 2px 4px;font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8a8a)}
.rd-root.is-narrow .rd-board{grid-template-columns:repeat(2,minmax(0,1fr))}
.rd-root.is-compact .rd-board{grid-template-columns:1fr}
.rd-calendar{padding:100px 24px 120px;height:100%;display:flex;flex-direction:column;gap:10px}
.rd-cal-head{display:flex;align-items:center;gap:10px;padding:0 4px}
.rd-cal-head button{width:28px;height:28px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;cursor:pointer}
.rd-cal-grid{flex:1;display:grid;grid-template-columns:repeat(7,1fr);gap:6px;min-height:0}
.rd-cal-weekday{font-size:11px;color:var(--dsw-alias-label-secondary);text-align:center;padding:2px 0}
.rd-cal-cell{border-radius:10px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);padding:6px;overflow:hidden;display:flex;flex-direction:column;gap:3px;min-height:0}
.rd-cal-cell.is-today{outline:1.5px solid var(--dsw-alias-brand-primary);outline-offset:-1.5px}
.rd-cal-cell.is-out{opacity:.35}
.rd-cal-day{font-size:11px;color:var(--dsw-alias-label-secondary)}
.rd-cal-item{font-size:11px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:2px 5px;border-radius:5px;background:var(--dsw-alias-bg-layer-2)}
.rd-cal-item.is-paper{background:color-mix(in srgb,#5f8dff 14%,transparent)}
.rd-cal-item.is-done{text-decoration:line-through;opacity:.6}
.rd-dialog-backdrop{position:absolute;inset:0;z-index:60;background:rgb(0 0 0 / 18%);backdrop-filter:blur(2px);display:grid;place-items:center}
.rd-dialog{width:480px;max-width:calc(100% - 40px);max-height:calc(100% - 60px);overflow:auto;border-radius:var(--r-xl);background:var(--dsw-alias-bg-base);border:.5px solid var(--dsw-alias-border-l1);box-shadow:0 30px 80px rgb(0 0 0 / 25%);padding:20px}
.rd-dialog h3{font-size:16px;margin:0 0 4px}
.rd-dialog .rd-hint{font-size:12px;color:var(--dsw-alias-label-secondary);margin:0 0 12px}
.rd-tabs{display:flex;gap:4px;margin-bottom:14px}
.rd-tabs button{height:28px;padding:0 12px;border-radius:999px;border:0;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.rd-tabs button.is-on{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base)}
.rd-field{display:flex;flex-direction:column;gap:5px;margin-bottom:10px}
.rd-field>span{font-size:12px;color:var(--dsw-alias-label-secondary)}
.rd-field input,.rd-field select,.rd-field textarea{width:100%;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:13px;padding:7px 9px;outline:none}
.rd-field input:focus,.rd-field select:focus,.rd-field textarea:focus{border-color:var(--dsw-alias-brand-primary)}
.rd-field textarea{min-height:88px;resize:vertical}
.rd-form-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.rd-btn{height:34px;padding:0 14px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:13px;cursor:pointer}
.rd-btn.is-primary{border-color:transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base)}
.rd-btn:disabled{opacity:.45;cursor:default}
.rd-dock{position:absolute;top:0;right:0;bottom:0;width:var(--dock-w);z-index:25;display:flex;flex-direction:column;background:var(--glass);border-left:.5px solid var(--dsw-alias-border-l1);backdrop-filter:blur(28px)}
.rd-dock-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px 10px;font-size:13px;color:var(--dsw-alias-label-primary)}
.rd-dock-title{display:flex;align-items:center;gap:8px;font-weight:600}
.rd-dock-engine{font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary,#9a9a9a);padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis}
.rd-dock-actions{display:flex;align-items:center;gap:4px}
.rd-dock-clear{border:0;background:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:11px;padding:4px 8px;border-radius:999px}
.rd-dock-clear:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}
.rd-dock-head button{border:0;background:none;color:inherit;cursor:pointer;font:inherit;font-size:16px;line-height:1}
.rd-chat{flex:1;overflow:auto;padding:8px 16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}
.rd-msg{font-size:13px;line-height:1.55;max-width:86%;display:flex;flex-direction:column;gap:3px}
.rd-msg.is-user{align-self:flex-end;background:var(--dsw-alias-bg-layer-2);padding:8px 12px;border-radius:14px 14px 4px 14px}
.rd-msg.is-bot{align-self:flex-start;background:var(--dsw-alias-bg-layer-1);padding:8px 12px;border-radius:4px 14px 14px 14px;color:var(--dsw-alias-label-primary);white-space:pre-wrap}
.rd-msg-engine{align-self:flex-start;font-size:10px;color:var(--dsw-alias-label-tertiary,#9a9a9a);letter-spacing:.02em}
.rd-msg-time{align-self:flex-end;font-size:10px;color:var(--dsw-alias-label-tertiary,#9a9a9a)}
.rd-chat-empty{color:var(--dsw-alias-label-tertiary,#9a9a9a);font-size:12px;line-height:1.6;margin-top:12px}
.rd-chat-empty p{margin:0 0 10px}
.rd-suggest{display:flex;flex-wrap:wrap;gap:6px}
.rd-suggest button{border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:6px 10px;border-radius:999px;cursor:pointer}
.rd-suggest button:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary)}
.rd-thinking{flex-direction:row;gap:5px;align-items:center;padding:10px 12px}
.rd-thinking-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-secondary);animation:rd-blink 1.2s infinite}
.rd-thinking-dot:nth-child(2){animation-delay:.2s}
.rd-thinking-dot:nth-child(3){animation-delay:.4s}
@keyframes rd-blink{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
.rd-chat-input{display:flex;gap:6px;padding:10px 12px 14px;align-items:flex-end}
.rd-chat-input textarea{flex:1;min-width:0;min-height:36px;max-height:120px;resize:none;border-radius:10px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:13px;line-height:1.5;padding:8px 10px;outline:none}
.rd-chat-input button{width:36px;height:36px;border-radius:10px;border:0;background:var(--dsw-alias-brand-primary);color:#fff;display:grid;place-items:center;cursor:pointer;flex:none}
.rd-chat-input button:disabled{opacity:.55;cursor:default}
.rd-chat-input button.is-loading{opacity:1}
.rd-spinner{width:14px;height:14px;border:2px solid rgb(255 255 255 / 35%);border-top-color:#fff;border-radius:50%;animation:rd-spin .7s linear infinite}
@keyframes rd-spin{to{transform:rotate(360deg)}}
.rd-toast{position:absolute;left:50%;bottom:76px;transform:translateX(-50%);z-index:70;display:flex;align-items:center;gap:12px;padding:9px 14px;border-radius:12px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);font-size:12px;box-shadow:0 14px 40px rgb(0 0 0 / 18%)}
.rd-toast.is-error{background:#d64545;color:#fff}
.rd-toast button{border:0;background:transparent;color:inherit;font:inherit;font-size:12px;text-decoration:underline;cursor:pointer;padding:0}
.rd-empty{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.7;z-index:5;pointer-events:none}
.rd-root.is-narrow .rd-hero-anchor{width:420px}
.rd-root.is-narrow .rd-hero-line{font-size:27px}
.rd-root.is-compact .rd-hero-anchor{width:340px}
.rd-root.is-compact .rd-hero-line{font-size:23px}
.rd-root.is-compact .rd-dock{width:min(320px,88%);box-shadow:-12px 0 40px rgb(0 0 0 / 16%)}
.rd-root.is-compact.has-dock .rd-content{right:0}
.rd-root.is-compact.has-dock .rd-topbar{right:0}
@media (prefers-reduced-motion:reduce){.rd-ambient i{animation:none}.rd-node,.rd-hero-input,.rd-world,.rd-content,.rd-thinking-dot,.rd-spinner{transition:none}.rd-thinking-dot,.rd-spinner{animation:none}}
`

    // ---------- 组件 ----------
    function IconButton({ name, label, onClick }) {
      return h('button', { type: 'button', className: 'rd-iconbtn', title: label, 'aria-label': label, onClick }, h(Icon, { name, size: 16 }))
    }

    function Toast() {
      const data = useSel((s) => s.toast)
      if (!data) return null
      return h('div', { className: `rd-toast ${data.error ? 'is-error' : ''}`, role: 'status' },
        h('span', null, data.text),
        data.undo ? h('button', { type: 'button', onClick: () => undoDesk() }, t('undo')) : null)
    }

    function Hero() {
      const state = useSel((s) => s.state)
      const [value, setValue] = useState('')
      const numbers = heroNumbers(state)
      const now = new Date()
      const dateLine = dict() === en
        ? now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
        : `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · 星期${'日一二三四五六'[now.getDay()]}`
      const heroRow = (key, extraClass, template, number) => {
        const parts = template.split('{n}')
        const children = []
        parts.forEach((part, index) => {
          if (part) children.push(h('span', { key: `${key}-t${index}` }, part))
          if (index < parts.length - 1) children.push(h('span', { key: `${key}-n${index}`, className: `rd-hero-num${extraClass ? ` ${extraClass}` : ''}` }, h('span', { className: 'rd-hero-num-txt' }, number)))
        })
        return h('span', { key, className: 'rd-hero-row' }, ...children)
      }
      const submit = () => {
        const plan = classify(value)
        if (!plan) return
        setValue('')
        dispatchOps(plan.ops, { label: plan.label })
        toast(t('toastAdd'), { undo: true })
        // 新卡片在坐标原点附近出现，把镜头带过去
        setDesk({ cam: { x: 0, y: 0, z: snapshot.cam.z }, camAnim: true, query: '' })
      }
      return h('div', { className: 'rd-hero-anchor' },
        h('div', { className: 'rd-hero' },
          h('div', { className: 'rd-hero-date' }, dateLine),
          h('h1', { className: 'rd-hero-line' },
            heroRow('n1', '', t('pendingLine'), numbers.pending)),
          h('div', { className: 'rd-hero-input' },
            h(Icon, { name: 'spark', size: 17 }),
            h('input', {
              value, 'aria-label': t('heroPlaceholder'), placeholder: t('heroPlaceholder'),
              onChange: (event) => setValue(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) submit() },
            }),
            h('button', { type: 'button', disabled: !value.trim(), 'aria-label': t('send'), onClick: submit }, h(Icon, { name: 'send', size: 16 }))),
          h('div', { className: 'rd-hero-hint' }, dict() === en ? 'Enter to log; DOI / arXiv / links become papers or ideas.' : '回车即记下；DOI、arXiv 和链接会变成文献或想法。')))
    }

    function cardFor(item, projectName) {
      if (item.kind === 'project') {
        const done = (item.milestones ?? []).filter((row) => row.done).length
        const total = (item.milestones ?? []).length
        return h('div', { className: 'rd-card rd-project-card' },
          h('div', { className: 'rd-card-top' },
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              h('span', { className: 'rd-tag' }, statusText('project', item.status)),
              item.venue ? h('span', { className: 'rd-tag' }, item.venue) : null),
            h('h3', { className: 'rd-card-title' }, item.name),
            item.goal ? h('p', { className: 'rd-card-body' }, item.goal) : null,
            total ? h('div', { className: 'rd-milestones' },
              h('span', null, t('milestone', { done, total })),
              ...(item.milestones ?? []).slice(0, 3).map((row) => h('span', { key: row.id }, row.done ? '✓' : '○', ' ', row.title))) : null),
          h('div', { className: 'rd-card-foot' }, h('i', { className: 'rd-dot' }), t('project'), relTime(item.updatedAt)))
      }
      if (item.kind === 'paper') {
        return h('div', { className: 'rd-card rd-paper-card' },
          h('div', { className: 'rd-card-top' },
            h('div', { className: 'rd-paper-venue' }, [item.venue, item.year].filter(Boolean).join(' · ') || '—'),
            h('h3', { className: 'rd-card-title' }, item.title),
            item.authors ? h('p', { className: 'rd-card-body' }, item.authors) : null,
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' } },
              h('span', { className: 'rd-tag' }, statusText('paper', item.status)))),
          h('div', { className: 'rd-card-foot' },
            h('i', { className: `rd-dot ${item.status === 'read' ? 'is-done' : ''}` }), t('paper'), relTime(item.updatedAt)))
      }
      if (item.kind === 'idea') {
        return h('div', { className: 'rd-card rd-quote-card' },
          h('div', { className: 'rd-card-top' },
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              h('span', { className: 'rd-tag' }, item.kind ?? 'idea'),
              h('span', { className: 'rd-tag' }, statusText('idea', item.status))),
            h('h3', { className: 'rd-card-title' }, item.title),
            item.body ? h('p', { className: 'rd-card-body' }, item.body) : null),
          h('div', { className: 'rd-card-foot' }, h('i', { className: `rd-dot ${item.status === 'seed' ? 'is-seed' : ''}` }), t('idea'), relTime(item.updatedAt)))
      }
      if (item.kind === 'note') {
        return h('div', { className: 'rd-card rd-note-card' },
          h('div', { className: 'rd-card-top' },
            h('div', { style: { display: 'flex', gap: 6 } },
              h('span', { className: 'rd-tag' }, (dict().kb ?? zh.kb)[item.kb] ?? item.kb ?? 'note')),
            h('h3', { className: 'rd-card-title' }, item.title),
            item.body ? h('p', { className: 'rd-card-body' }, item.body) : null),
          h('div', { className: 'rd-card-foot' }, h('i', { className: 'rd-dot' }), t('note'), relTime(item.updatedAt)))
      }
      return h('div', { className: 'rd-card' },
        h('div', { className: 'rd-card-top' },
          h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
            h('span', { className: `rd-tag ${item.priority === 'P0' ? 'is-p0' : item.priority === 'P1' ? 'is-p1' : ''}` }, item.priority ?? 'P2'),
            item.projectId ? h('span', { className: 'rd-tag' }, projectName(item.projectId) ?? item.projectId) : null),
          h('h3', { className: 'rd-card-title' }, item.title),
          item.notes ? h('p', { className: 'rd-card-body' }, item.notes) : null,
          h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' } },
            item.due ? h('span', { className: 'rd-tag' }, item.due) : null,
            item.estimateMinutes ? h('span', { className: 'rd-tag' }, t('minutes', { n: item.estimateMinutes })) : null)),
        h('div', { className: 'rd-card-foot' },
          h('i', { className: `rd-dot ${item.status === 'done' ? 'is-done' : item.status === 'waiting' ? 'is-wait' : ''}` }),
          statusText('task', item.status), relTime(item.updatedAt)))
    }

    function ScatterView() {
      const state = useSel((s) => s.state)
      const mode = useSel((s) => s.mode)
      const filter = useSel((s) => s.kindFilter)
      const related = useSel((s) => s.related)
      const cam = useSel((s) => s.cam)
      const camAnim = useSel((s) => s.camAnim)
      const stageRef = useRef(null)
      const [drag, setDrag] = useState(null)
      const [override, setOverride] = useState({})
      const items = displayItems(state)
      const shown = items.filter((item) => filter === 'all' || item.kind === filter)
      const layout = scatterLayout(shown)
      const projectName = (id) => (state?.projects ?? []).find((row) => row.id === id)?.name

      const zoomAt = (clientX, clientY, factor) => {
        const rect = stageRef.current.getBoundingClientRect()
        const nextZ = Math.min(2.2, Math.max(0.3, snapshot.cam.z * factor))
        const ratio = nextZ / snapshot.cam.z
        const offsetX = clientX - rect.left - rect.width / 2
        const offsetY = clientY - rect.top - rect.height / 2
        setDesk({ cam: { z: nextZ, x: offsetX - (offsetX - snapshot.cam.x) * ratio, y: offsetY - (offsetY - snapshot.cam.y) * ratio }, camAnim: false })
      }

      const onWheel = (event) => {
        event.preventDefault()
        if (event.ctrlKey || event.metaKey) zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.01))
        else setDesk({ cam: { ...snapshot.cam, x: snapshot.cam.x - event.deltaX, y: snapshot.cam.y - event.deltaY }, camAnim: false })
      }

      const camRef = useRef(cam)
      camRef.current = cam

      const onStageDown = (event) => {
        if (event.button !== 0 || event.target.closest('.rd-node')) return
        const start = { x: event.clientX, y: event.clientY, cam: { ...camRef.current } }
        const move = (ev) => setDesk({ cam: { ...start.cam, x: start.cam.x + ev.clientX - start.x, y: start.cam.y + ev.clientY - start.y }, camAnim: false })
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setDesk({ panning: false }) }
        setDesk({ panning: true })
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }

      const onNodeDown = (event, item, node) => {
        if (event.button !== 0) return
        const start = { x: event.clientX, y: event.clientY, node }
        let moved = false
        const move = (ev) => {
          if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return
          moved = true
          setDrag(item.id)
          setOverride((previous) => ({ ...previous, [item.id]: { x: node.x + (ev.clientX - start.x) / camRef.current.z, y: node.y + (ev.clientY - start.y) / camRef.current.z } }))
        }
        const up = (ev) => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          setDrag(null)
          setOverride((previous) => { const next = { ...previous }; delete next[item.id]; return next })
          if (moved) {
            const movedX = node.x + (ev.clientX - start.x) / camRef.current.z
            const movedY = node.y + (ev.clientY - start.y) / camRef.current.z
            dispatchOps([{ op: 'set_pos', kind: item.kind === 'task' ? 'todo' : item.kind, id: item.id, pos: { x: movedX, y: movedY, r: node.r } }], { label: dict() === en ? 'Arrange cards' : '摆放卡片', undoable: false, silent: true })
          }
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }

      if (!items.length) return h('div', { className: 'rd-empty' }, t('empty'))

      return h('div', {
        ref: stageRef, className: 'rd-stage', onWheel, onPointerDown: onStageDown,
        onDoubleClick: () => setDesk({ cam: { x: 0, y: 0, z: 1 }, camAnim: true }),
      },
        h('div', { className: `rd-world ${camAnim ? 'is-anim' : ''}`, style: { transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` } },
          ...shown.map((item) => {
            const node = layout[item.id]
            if (!node) return null
            const shownNode = override[item.id] ? { ...node, ...override[item.id] } : node
            const dim = related ? !related.includes(item.id) : false
            return h('div', {
              key: item.id,
              className: `rd-node ${dim ? 'is-dim' : ''} ${drag === item.id ? 'is-drag' : ''}`,
              style: {
                left: shownNode.x, top: shownNode.y, width: node.w, '--r': `${node.d}rad`,
                zIndex: drag === item.id ? 20 : undefined,
              },
              onPointerDown: (event) => onNodeDown(event, item, shownNode),
            }, cardFor(item, projectName))
          })))
    }

    function ListView() {
      const state = useSel((s) => s.state)
      const todos = state?.todos ?? []
      const papers = state?.papers ?? []
      const ideas = state?.ideas ?? []
      const notes = state?.notes ?? []
      const projectName = (id) => (state?.projects ?? []).find((row) => row.id === id)?.name
      const open = todos.filter((row) => row.status !== 'done')
      const buckets = {
        all: { title: 'Todo: All', rows: open.map((row) => ({ id: row.id, title: row.title, meta: statusText('task', row.status) })) },
        projects: { title: 'Todo: Projects', rows: open.filter((row) => row.projectId).map((row) => ({ id: row.id, title: row.title, meta: projectName(row.projectId) ?? t('navProject') })) },
        paper: { title: 'Todo: Paper', rows: papers.filter((row) => row.status === 'inbox' || row.status === 'reading').map((row) => ({ id: row.id, title: row.title, meta: statusText('paper', row.status) })) },
        ideas: { title: 'Todo: Idea 整理', rows: ideas.filter((row) => row.status === 'seed').map((row) => ({ id: row.id, title: row.title, meta: statusText('idea', row.status) })) },
        notes: { title: 'Todo: 知识库整理', rows: notes.filter((row) => row.status === 'draft').map((row) => ({ id: row.id, title: row.title, meta: row.kb ?? '' })) },
      }
      const columns = [['all'], ['projects', 'paper'], ['ideas', 'notes']]
      const card = (key) => h('section', { key, className: 'rd-board-card' },
        h('div', { className: 'rd-board-head' },
          h('h2', null, buckets[key].title),
          h('span', { className: 'rd-board-count' }, String(buckets[key].rows.length))),
        buckets[key].rows.length
          ? h('div', { className: 'rd-board-body' }, ...buckets[key].rows.map((row) => h('div', { key: row.id, className: 'rd-board-row' },
            h('span', { className: 'rd-dot' }),
            h('span', { className: 'rd-card-title' }, row.title),
            row.meta ? h('span', { className: 'rd-tag' }, row.meta) : null)))
          : h('div', { className: 'rd-board-empty' }, t('empty')))
      return h('div', { className: 'rd-list' },
        h('div', { className: 'rd-board' }, ...columns.map((column, index) => h('div', { key: `col${index}`, className: 'rd-board-col' }, ...column.map(card)))))
    }

    function CalendarView() {
      const state = useSel((s) => s.state)
      const month = useSel((s) => s.month)
      const first = new Date(month.getFullYear(), month.getMonth(), 1)
      const start = new Date(first)
      start.setDate(1 - ((first.getDay() + 6) % 7))
      const cells = []
      for (let index = 0; index < 42; index += 1) {
        const date = new Date(start.getTime() + index * DAY)
        cells.push(date)
      }
      const byDay = {}
      const put = (key, row, kind) => { (byDay[key] ??= []).push({ row, kind }) }
      for (const row of state?.todos ?? []) if (row.due) put(row.due, row, 'task')
      for (const row of state?.papers ?? []) if (row.readBy) put(row.readBy, row, 'paper')
      for (const row of state?.projects ?? []) for (const ms of row.milestones ?? []) if (ms.due) put(ms.due, { ...ms, title: `${row.name} · ${ms.title}` }, 'project')
      const label = dict() === en ? month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : `${month.getFullYear()} 年 ${month.getMonth() + 1} 月`
      return h('div', { className: 'rd-calendar' },
        h('div', { className: 'rd-cal-head' },
          h('button', { type: 'button', onClick: () => setDesk({ month: new Date(month.getFullYear(), month.getMonth() - 1, 1) }) }, '‹'),
          h('button', { type: 'button', onClick: () => setDesk({ month: new Date(month.getFullYear(), month.getMonth() + 1, 1) }) }, '›'),
          h('strong', null, label),
          h('span', { style: { flex: 1 } }),
          h('button', { type: 'button', onClick: () => setDesk({ month: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }) }, dict() === en ? 'Today' : '今天')),
        h('div', { className: 'rd-cal-grid' },
          ...(dict() === en ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['一', '二', '三', '四', '五', '六', '日']).map((day) => h('div', { key: day, className: 'rd-cal-weekday' }, day)),
          ...cells.map((date) => {
            const key = dateKey(date)
            const rows = byDay[key] ?? []
            const out = date.getMonth() !== month.getMonth()
            return h('div', { key, className: `rd-cal-cell ${out ? 'is-out' : ''} ${key === dateKey(Date.now()) ? 'is-today' : ''}` },
              h('span', { className: 'rd-cal-day' }, String(date.getDate())),
              ...rows.slice(0, 3).map((row, index) => h('span', { key: index, className: `rd-cal-item ${row.kind === 'paper' ? 'is-paper' : ''} ${row.row.status === 'done' ? 'is-done' : ''}`, title: row.row.title }, row.row.title ?? row.row.name)))
          })))
    }

    function Dockbar() {
      const mode = useSel((s) => s.mode)
      const dockOpen = useSel((s) => s.dockOpen)
      const modes = [['scatter', t('scatter')], ['list', t('list')], ['calendar', t('calendar')]]
      return h('div', { className: 'rd-dockbar' },
        h('div', { className: 'rd-seg' }, ...modes.map(([id, label]) => h('button', { key: id, type: 'button', className: mode === id ? 'is-on' : '', onClick: () => setDesk({ mode: id }) }, label))),
        h('button', { type: 'button', className: 'rd-round-plus', title: t('capture'), 'aria-label': t('capture'), onClick: () => setDesk({ capture: 'task' }) }, h(Icon, { name: 'plus', size: 17 })),
        dockOpen ? null : h('button', { type: 'button', className: 'rd-open-dock', onClick: () => setDesk({ dockOpen: true }) }, h(Icon, { name: 'chat', size: 14 }), t('assistant')))
    }

    const CAPTURE_TABS = [['task', 'task'], ['idea', 'idea'], ['paper', 'paper'], ['note', 'note']]
    function CaptureDialog() {
      const tab = useSel((s) => s.capture)
      const state = useSel((s) => s.state)
      const [form, setForm] = useState({})
      useEffect(() => { setForm({}) }, [tab])
      if (!tab) return null
      const set = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))
      const close = () => setDesk({ capture: null })
      const submit = async (event) => {
        event.preventDefault()
        const title = String(form.title ?? '').trim()
        if (!title) return
        const ops = [{ op: 'add_item', kind: tab === 'task' ? 'todo' : tab, title }]
        if (tab === 'task') {
          if (form.due) ops[0].due = form.due
          if (form.priority) ops[0].priority = form.priority
          if (form.estimateMinutes) ops[0].estimateMinutes = Number(form.estimateMinutes)
          if (form.projectId) ops[0].projectId = form.projectId
          if (form.notes) ops[0].notes = form.notes
        }
        if (tab === 'idea') { ops[0].kind = form.kind ?? 'idea'; if (form.body) ops[0].body = form.body }
        if (tab === 'paper') {
          for (const key of ['authors', 'venue', 'doi', 'url']) if (form[key]) ops[0][key] = form[key]
          if (form.year) ops[0].year = Number(form.year)
          if (form.status) ops[0].status = form.status
        }
        if (tab === 'note') { if (form.kb) ops[0].kb = form.kb; if (form.body) ops[0].body = form.body }
        close()
        await dispatchOps(ops, { label: `${t('capture')} · ${title.slice(0, 16)}` })
        setDesk({ cam: { x: 0, y: 0, z: snapshot.cam.z }, camAnim: true })
      }
      const field = (label, control) => h('label', { className: 'rd-field' }, h('span', null, label), control)
      const input = (key, props = {}) => h('input', { value: form[key] ?? '', onChange: (event) => set(key, event.target.value), ...props })
      return h('div', { className: 'rd-dialog-backdrop', onPointerDown: (event) => { if (event.target === event.currentTarget) close() } },
        h('form', { className: 'rd-dialog', onSubmit: submit },
          h('h3', null, t('capture')),
          h('p', { className: 'rd-hint' }, t('captureHint')),
          h('div', { className: 'rd-tabs' }, ...CAPTURE_TABS.map(([id, label]) => h('button', { key: id, type: 'button', className: tab === id ? 'is-on' : '', onClick: () => setDesk({ capture: id }) }, t(label)))),
          field(t('title'), input('title', { autoFocus: true, required: true, placeholder: tab === 'paper' ? 'Attention Is All You Need' : tab === 'task' ? '把消融实验跑起来' : '' })),
          tab === 'task' ? h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
            field(t('due'), input('due', { type: 'date' })),
            field(t('priority'), h('select', { value: form.priority ?? 'P2', onChange: (event) => set('priority', event.target.value) }, ...['P0', 'P1', 'P2', 'P3'].map((value) => h('option', { key: value, value }, value)))),
            field(t('estimate'), input('estimateMinutes', { type: 'number', min: 0, step: 5 })),
            field(t('projectOf'), h('select', { value: form.projectId ?? '', onChange: (event) => set('projectId', event.target.value) }, h('option', { value: '' }, t('none')), ...(state?.projects ?? []).map((row) => h('option', { key: row.id, value: row.id }, row.name))))) : null,
          tab === 'idea' ? field(dict() === en ? 'Kind' : '类型', h('select', { value: form.kind ?? 'idea', onChange: (event) => set('kind', event.target.value) }, ...[['idea', '想法'], ['hypothesis', '假设'], ['question', '问题'], ['method', '方法']].map(([value, label]) => h('option', { key: value, value }, label)))) : null,
          tab === 'paper' ? h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
            field(t('authors'), input('authors')),
            field(t('venue'), input('venue')),
            field(t('year'), input('year', { type: 'number', min: 1900, max: 2100 })),
            field(t('status'), h('select', { value: form.status ?? 'inbox', onChange: (event) => set('status', event.target.value) }, ...['inbox', 'reading', 'read', 'cited'].map((value) => h('option', { key: value, value }, statusText('paper', value))))),
            field(t('doi'), input('doi')),
            field(t('url'), input('url', { type: 'url' }))) : null,
          tab === 'note' ? field(dict() === en ? 'Kind' : '分类', h('select', { value: form.kb ?? 'concept', onChange: (event) => set('kb', event.target.value) }, ...Object.keys(zh.kb).map((value) => h('option', { key: value, value }, (dict().kb ?? zh.kb)[value])))) : null,
          (tab === 'idea' || tab === 'note') ? field(t('body'), h('textarea', { value: form.body ?? '', onChange: (event) => set('body', event.target.value) })) : null,
          h('div', { className: 'rd-form-foot' },
            h('button', { type: 'button', className: 'rd-btn', onClick: close }, t('cancel')),
            h('button', { type: 'submit', className: 'rd-btn is-primary' }, t('addTask')))))
    }

    function AssistantDock() {
      const state = useSel((s) => s.state)
      const dockOpen = useSel((s) => s.dockOpen)
      const thinking = useSel((s) => s.thinking)
      const [value, setValue] = useState('')
      const chatRef = useRef(null)
      const chat = state?.chat ?? []
      const chosen = state?.settings?.assistant
      const engineLabel = chosen && typeof chosen === 'object' ? (chosen.model ?? t('modelLocal')) : t('modelLocal')
      const submit = () => {
        const text = value.trim()
        if (!text || thinking) return
        setValue('')
        sendChat(text)
      }
      useEffect(() => {
        const el = chatRef.current
        if (el) el.scrollTop = el.scrollHeight
      }, [chat.length, thinking])
      if (!dockOpen) return null
      const suggestions = [t('assistantSuggestion1'), t('assistantSuggestion2'), t('assistantSuggestion3')]
      return h('aside', { className: 'rd-dock', 'aria-label': t('assistant') },
        h('div', { className: 'rd-dock-head' },
          h('span', { className: 'rd-dock-title' }, t('assistant'), h('span', { className: 'rd-dock-engine' }, engineLabel)),
          h('div', { className: 'rd-dock-actions' },
            chat.length ? h('button', { type: 'button', className: 'rd-dock-clear', onClick: () => dispatchOps([{ op: 'clear_chat' }], { label: t('clearChat') }) }, t('clearChat')) : null,
            h('button', { type: 'button', title: t('cancel'), 'aria-label': t('cancel'), onClick: () => { setDesk({ dockOpen: false }); saveSettings({ dockOpen: false }) } }, '×'))),
        h('div', { ref: chatRef, className: 'rd-chat' },
          chat.length
            ? chat.map((row) => h('div', { key: row.id, className: `rd-msg ${row.role === 'user' ? 'is-user' : 'is-bot'}` },
                row.role === 'assistant' && row.engine ? h('span', { className: 'rd-msg-engine' }, row.engine === 'model' ? t('engineModel') : t('engineLocal')) : null,
                h('span', null, row.text),
                row.at ? h('time', { className: 'rd-msg-time', dateTime: row.at }, relTime(row.at)) : null))
            : h('div', { className: 'rd-chat-empty' },
                h('p', null, t('assistantEmpty')),
                h('div', { className: 'rd-suggest' }, ...suggestions.map((s) => h('button', { key: s, type: 'button', onClick: () => sendChat(s) }, s)))),
          thinking ? h('div', { className: 'rd-msg is-bot rd-thinking' },
            h('span', { className: 'rd-thinking-dot' }), h('span', { className: 'rd-thinking-dot' }), h('span', { className: 'rd-thinking-dot' })) : null),
        h('form', { className: 'rd-chat-input', onSubmit: (event) => { event.preventDefault(); submit() } },
          h('textarea', {
            value, rows: 1, placeholder: t('assistantPlaceholder'), 'aria-label': t('assistantPlaceholder'),
            onChange: (event) => setValue(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit() } },
          }),
          h('button', { type: 'submit', disabled: !value.trim() || thinking, className: thinking ? 'is-loading' : '', 'aria-label': t('send') },
            thinking ? h('span', { className: 'rd-spinner' }) : h(Icon, { name: 'send', size: 15 }))))
    }

    function ModelButton() {
      const state = useSel((s) => s.state)
      const chosen = state?.settings?.assistant
      const label = chosen && typeof chosen === 'object' ? (chosen.model ?? t('modelLocal')) : t('modelLocal')
      return h('button', { type: 'button', className: 'rd-model', title: t('modelPick'), 'aria-label': t('modelPick'), onClick: openModels },
        h(Icon, { name: 'spark', size: 14 }),
        h('span', null, label),
        h(Icon, { name: 'chevron', size: 12 }))
    }

    function ModelPicker() {
      const open = useSel((s) => s.modelsOpen)
      const models = useSel((s) => s.models)
      const loading = useSel((s) => s.modelsLoading)
      const state = useSel((s) => s.state)
      if (!open) return null
      const chosen = state?.settings?.assistant
      const active = (entry) => Boolean(chosen && typeof chosen === 'object' && chosen.provider === entry.provider && chosen.model === entry.id)
      return h('div', { className: 'rd-dialog-backdrop', onPointerDown: (event) => { if (event.target === event.currentTarget) setDesk({ modelsOpen: false }) } },
        h('div', { className: 'rd-dialog rd-model-dialog' },
          h('h3', null, t('modelPick')),
          h('p', { className: 'rd-model-hint' }, t('modelHint')),
          loading
            ? h('p', { className: 'rd-model-empty' }, '…')
            : models.length
              ? h('div', { className: 'rd-model-list' }, ...models.map((entry) => h('button', {
                key: `${entry.provider}:${entry.id}`, type: 'button',
                className: `rd-model-row ${active(entry) ? 'is-on' : ''}`,
                onClick: () => chooseModel(entry),
              }, h('span', { className: 'rd-model-name' }, entry.name), h('span', { className: 'rd-model-provider' }, entry.providerName))))
              : h('p', { className: 'rd-model-empty' }, t('modelEmpty')),
          h('div', { className: 'rd-form-foot' },
            h('button', { type: 'button', className: 'rd-btn', onClick: () => chooseModel(null) }, t('modelLocal')),
            h('button', { type: 'button', className: 'rd-btn', onClick: () => setDesk({ modelsOpen: false }) }, dict() === en ? 'Close' : '关闭'))))
    }

    function PlaceholderView() {
      const state = useSel((s) => s.state)
      const view = useSel((s) => s.view)
      const counts = {
        project: (state?.projects ?? []).length,
        paper: (state?.papers ?? []).length,
        idea: (state?.ideas ?? []).length,
        kb: (state?.notes ?? []).length,
        todo: (state?.todos ?? []).length,
      }
      const titles = { todo: t('navTodo'), project: t('navProject'), paper: t('navPaper'), idea: t('navIdea'), kb: t('navKb') }
      return h('div', { className: 'rd-page' },
        h('h2', { style: { fontSize: 20, margin: '0 0 8px' } }, titles[view] ?? view),
        h('p', { style: { color: 'var(--dsw-alias-label-secondary)' } }, `${counts[view] ?? 0} 条记录 · ${t('pageSoon')}`))
    }

    function Topbar() {
      const view = useSel((s) => s.view)
      const ready = useSel((s) => Boolean(s.state))
      const dockOpen = useSel((s) => s.dockOpen)
      const nav = [['todo', 'Todo'], ['project', 'Projects'], ['paper', 'Papers'], ['idea', 'Ideas'], ['kb', 'KnowledgeBase']]
      return h('header', { className: 'rd-topbar' },
        h('nav', { className: 'rd-nav', 'aria-label': t('workbench') }, ...nav.map(([id, label]) => h('button', {
          key: id, type: 'button', className: view === id ? 'is-on' : '', 'aria-current': view === id ? 'page' : undefined,
          onClick: () => setDesk({ view: id, focusId: null }),
        }, label))),
        h('span', { style: { flex: 1 } }),
        ready ? h(ModelButton) : null,
        h(IconButton, { name: 'chat', label: t('assistant'), onClick: () => { const next = !dockOpen; setDesk({ dockOpen: next }); saveSettings({ dockOpen: next }) } }))
    }

    function Desk() {
      const ready = useSel((s) => Boolean(s.state))
      const error = useSel((s) => s.error)
      const view = useSel((s) => s.view)
      const mode = useSel((s) => s.mode)
      const dockOpen = useSel((s) => s.dockOpen)
      const narrow = useSel((s) => s.width < 1020)
      const compact = useSel((s) => s.width < 780)
      const rootRef = useRef(null)

      useEffect(() => { loadDesk() }, [])
      useEffect(() => {
        const el = rootRef.current
        if (!el) return undefined
        const observer = new ResizeObserver(([entry]) => {
          const width = entry.contentRect.width
          const first = snapshot.width === undefined
          setDesk({ width })
          if (first) setDesk({ cam: { x: 0, y: 0, z: width < 780 ? 0.66 : width < 1020 ? 0.8 : width < 1400 ? 0.92 : 1 } })
        })
        observer.observe(el)
        return () => observer.disconnect()
      }, [])
      useEffect(() => {
        // 窄屏下助手栏会盖住内容，默认收起；用户仍可从顶栏重新打开
        if (compact && snapshot.dockOpen) setDesk({ dockOpen: false })
      }, [compact])
      useEffect(() => {
        const onKey = (event) => {
          const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable
          if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey && !typing && snapshot.canUndo) {
            event.preventDefault()
            undoDesk()
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [])
      const showDock = dockOpen && !snapshot.focusId
      const Active = error ? null : view === 'todo' ? null : PlaceholderView
      return h('div', { ref: rootRef, className: 'rd-shell' },
        h('div', { className: `rd-root ${narrow ? 'is-narrow' : ''} ${compact ? 'is-compact' : ''} ${showDock ? 'has-dock' : ''}` },
        h('style', null, CSS),
        h('div', { className: 'rd-ambient', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
        h('div', { className: 'rd-main' },
          h(Topbar),
          h('main', { className: 'rd-content', key: view },
            error ? h('div', { className: 'rd-page' }, h('p', { style: { color: 'var(--dsw-alias-label-secondary)' } }, t('error', { error })), h('button', { type: 'button', className: 'rd-btn', onClick: () => loadDesk() }, t('retry')))
              : !ready ? h('div', { className: 'rd-loading' }, h('span', { className: 'rd-shimmer' }, t('loading')))
                : view === 'todo'
                  ? h(React.Fragment, null,
                    mode === 'scatter' ? h(ScatterView) : mode === 'list' ? h(ListView) : h(CalendarView),
                    mode === 'scatter' ? h(Hero) : null,
                    h(Dockbar))
                  : h(Active)),
          ready && view === 'todo' && mode === 'scatter' ? h('div', { className: 'rd-corner is-right' },
            h('div', { className: 'rd-zoom' },
              h('button', { type: 'button', title: t('zoomOut'), 'aria-label': t('zoomOut'), onClick: () => zoomCenter(1 / 1.25) }, '−'),
              h('button', { type: 'button', className: 'rd-zoom-fit', title: t('zoomFit'), 'aria-label': t('zoomFit'), onClick: resetCamera }, h(Icon, { name: 'target', size: 15 })),
              h('button', { type: 'button', title: t('zoomIn'), 'aria-label': t('zoomIn'), onClick: () => zoomCenter(1.25) }, '+'))) : null,
        ready ? h(AssistantDock) : null,
        ready ? h(CaptureDialog) : null,
        ready ? h(ModelPicker) : null,
        h(Toast))))
    }

    function PanelIcon({ size }) {
      // 侧栏入口沿用插件原有图标（终端提示符线稿）。这里全部用内联样式：
      // 侧栏行是 flex + line-height:22px，svg 若按 inline 参与基线对齐会被顶高约 4~5px，
      // 表现为图标上下边界都比标签文字高。flex 容器 + display:block 可彻底消除基线影响。
      return h('span', { className: 'dsh-csrw-icon-slot', style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 } }, h(ToolsIcon, { size }))
    }

    return {
      inject: ['slots', 'locale', 'remote.commands'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('dsh-csrw', 'en', TOOLS_EN))
        ctx.effect(() => ctx.locale.register('dsh-csrw', 'zh', TOOLS_ZH))
        const tt = ctx.locale.bind('dsh-csrw')
        const register = (name, options, component) => ctx.slots.inject(name, () => ctx.slots.register({ name, ...options }, component))
        const desk = { t, setLanguage: (value) => { language = value }, setDesk, loadDesk }
        const toolsPanel = (props) => h(ToolsPanel, { ...props, ctx, t: tt, desk })
        register('main', { key: UI_ID }, Desk)
        register('sidebar.panellist', { id: UI_ID, order: 45, label: () => tt('title') }, PanelIcon)
        register('settings.section', { id: UI_ID, order: 17, label: () => tt('title') }, toolsPanel)
        register('settings.section.icon', { id: UI_ID }, ToolsIcon)
        register('plugins.bundle.config', { key: 'dsh-cs-research-workbench' }, toolsPanel)
      },
    }
  },
})
