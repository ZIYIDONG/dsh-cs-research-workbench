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
    // 双半片 API 契约：路由 path 与 lib/desk/ids.js 的 ROUTES 保持一致（check-identifiers 校验）。
    const ROUTES = { state: 'state', ops: 'ops', undo: 'undo', settings: 'settings', models: 'models', chat: 'chat', backups: 'backups', vaultSync: 'vault-sync' }
    const HERO = { w: 540, h: 372 }

    // ---------- 原有工具面板：配置、连接检测、备份（并入设置页，不再单独占一个侧栏入口） ----------
    const TOOLS_EN = {title:'CS research workbench',intro:'Workspace configuration, connection checks, sync and versioned backups.',workspace:'Workspace directory',session:'Session ID',load:'Load configuration',save:'Save field',open:'Open workbench',config:'Configuration',actions:'Operations',result:'Last result',pending:'Running…',cancel:'Cancel',confirm:'Confirm this write operation',approval:'Review the target workspace and arguments before confirming. This operation may change local or remote files.',secret:'Passwords are not stored here. Configure credentials in the DSH credential store or NUTSTORE_USERNAME / NUTSTORE_PASSWORD environment variables.',context:'Select an existing session to provide a permission and audit context. No model turn is started.',error:'Request failed',health:'Check plugin',git:'Git status',zotero:'Check Zotero',dav:'Check WebDAV',list:'List remote directory',push:'Upload directory',pull:'Download directory',obsidian:'Back up Obsidian',backupZotero:'Back up Zotero',dsh:'Back up DSH',verify:'Verify snapshot',local:'Local sync directory',remote:'Remote subdirectory',snapshot:'Snapshot directory',sources:'Backup paths come from the current workspace configuration. Restore remains available through the explicit-confirmation tool.',choose:'Choose directory',noSession:'Choose a session first',notLoaded:'Load the workspace configuration first',boolean:'Boolean',field:'Configuration field',value:'Value',operationsHint:'Network checks contact only the configured endpoints; backups create local files.',empty:'No result yet',yes:'Enabled',no:'Disabled',cloudBackup:'Cloud backup',nutstore:'Nutstore',nutstoreHint:'Credentials come from the DSH credential store (api-key) or NUTSTORE_USERNAME / NUTSTORE_PASSWORD env vars, never entered in the UI.',logs:'Sync logs',deleteRemote:'Delete remote',backupWorkspace:'Backup config',backupUpload:'Upload Nutstore',backupGithub:'Backup GitHub',backupAll:'Backup all',obsidianTools:'Obsidian tools',links:'Links',backlinks:'Backlinks',brokenLinks:'Broken links',listDir:'List',template:'Template',daily:'Daily',attach:'Attach',rename:'Rename',graph:'Graph',canvas:'Canvas',bookmarks:'Bookmarks',paperNote:'Paper note',path:'Path',destination:'Destination',source:'Source',date:'Date',scope:'Scope',templatePath:'Template',zkey:'Zotero key'};
    const TOOLS_ZH = {title:'CS科研工作台',intro:'工作区配置、连接检测、增量同步与版本化备份。',workspace:'工作区目录',session:'会话 ID',load:'加载配置',save:'保存此项',open:'打开工作台',config:'配置',actions:'操作',result:'最近结果',pending:'执行中…',cancel:'取消',confirm:'确认执行此写入操作',approval:'请核对目标工作区和参数后确认；此操作可能修改本地或远端文件。',secret:'这里不保存密码。请使用 DSH 凭据存储，或 NUTSTORE_USERNAME / NUTSTORE_PASSWORD 环境变量。',context:'选择已有会话作为权限与审计上下文，不会启动模型对话。',error:'请求失败',health:'检查插件',git:'Git 状态',zotero:'检测 Zotero',dav:'检测 WebDAV',list:'列出远端目录',push:'上传目录',pull:'下载目录',obsidian:'备份 Obsidian',backupZotero:'备份 Zotero',dsh:'备份 DSH',verify:'校验快照',local:'本地同步目录',remote:'远端子目录',snapshot:'快照目录',sources:'备份路径读取当前工作区配置。恢复仍通过带显式确认的工具执行。',choose:'选择目录',noSession:'请先选择会话',notLoaded:'请先加载工作区配置',boolean:'布尔值',field:'配置字段',value:'值',operationsHint:'连接检测只访问配置中的端点；备份会创建本地文件。',empty:'暂无结果',yes:'启用',no:'停用',cloudBackup:'云端备份',nutstore:'坚果云',nutstoreHint:'凭据由 DSH 凭据存储（api-key）或 NUTSTORE_USERNAME / NUTSTORE_PASSWORD 环境变量提供，不在界面录入。',logs:'同步日志',deleteRemote:'删除远端',backupWorkspace:'备份参数',backupUpload:'上传坚果云',backupGithub:'备份 GitHub',backupAll:'一键备份',obsidianTools:'Obsidian 工具',links:'双链',backlinks:'反链',brokenLinks:'死链',listDir:'列目录',template:'模板生成',daily:'日记',attach:'附件',rename:'重命名',graph:'图谱',canvas:'Canvas',bookmarks:'书签',paperNote:'文献笔记',path:'路径',destination:'目标',source:'源文件',date:'日期',scope:'目录',templatePath:'模板',zkey:'Zotero key'};
    const TOOLS_FIELDS = ['obsidian.vaultPath','obsidian.autoDetect','obsidian.trashDir','obsidian.ideasDir','obsidian.notesDir','git.remote','git.branch','git.autoInit','git.pullRebase','git.backupRemote','git.backupBranch','git.backupRepoDir','zotero.localApi','zotero.dataDir','nutstore.baseUrl','nutstore.remoteRoot','nutstore.username','nutstore.credentialKey','nutstore.retry','nutstore.retryDelay','backup.target','backup.localDir','backup.dshHome','backup.dshProfile','backup.includeDshSessions','backup.keep','backup.mode'];
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
        h('div',{className:'dsh-csrw-card'},h('h2',null,t('nutstore')),h('p',null,t('nutstoreHint')),h('div',{className:'dsh-csrw-row'},action('dav','dsh_csrw_nutstore_test'),action('logs','dsh_csrw_nutstore_logs',{limit:20})),h('div',{className:'dsh-csrw-row'},input('remote',remote,setRemote),action('deleteRemote','dsh_csrw_nutstore_delete',{remotePath:remote,confirm:true},true))),
        h('div',{className:'dsh-csrw-card'},h('h2',null,t('obsidianTools')),h('div',{className:'dsh-csrw-row'},input('path',obsPath,setObsPath),action('links','dsh_csrw_obsidian_links',{path:obsPath}),action('backlinks','dsh_csrw_obsidian_backlinks',{path:obsPath}),action('brokenLinks','dsh_csrw_obsidian_broken_links',{path:obsPath})),h('div',{className:'dsh-csrw-row'},input('scope',obsScope,setObsScope),action('listDir','dsh_csrw_obsidian_list',{scope:obsScope}),action('graph','dsh_csrw_obsidian_graph',{}),action('bookmarks','dsh_csrw_obsidian_bookmarks',{})),h('div',{className:'dsh-csrw-row'},input('templatePath',obsTemplate,setObsTemplate),input('destination',obsDest,setObsDest),action('template','dsh_csrw_obsidian_template',{template:obsTemplate,destination:obsDest},true)),h('div',{className:'dsh-csrw-row'},input('date',obsDate,setObsDate),action('daily','dsh_csrw_obsidian_daily',{date:obsDate},true)),h('div',{className:'dsh-csrw-row'},input('source',obsSource,setObsSource),input('destination',obsDest,setObsDest),action('attach','dsh_csrw_obsidian_attach',{source:obsSource,destination:obsDest},true)),h('div',{className:'dsh-csrw-row'},input('path',obsFrom,setObsFrom),input('destination',obsDest,setObsDest),action('rename','dsh_csrw_obsidian_rename',{path:obsFrom,destination:obsDest},true)),h('div',{className:'dsh-csrw-row'},input('path',obsPath,setObsPath),action('canvas','dsh_csrw_obsidian_canvas',{path:obsPath,operation:'read'}))),
        h('div',{className:'dsh-csrw-card'},h('h2',null,t('paperNote')),h('div',{className:'dsh-csrw-row'},input('zkey',paperKey,setPaperKey),action('paperNote','dsh_csrw_paper_to_note',{key:paperKey},true))),
        pending&&h('div',{className:'dsh-csrw-card dsh-csrw-alert',role:'region','aria-label':t('confirm')},h('p',null,t('approval')),h('pre',null,JSON.stringify({workspace,...pending},null,2)),h('div',{className:'dsh-csrw-row'},h('button',{disabled:busy,onClick:()=>{const p=pending;setPending(null);return run(p.operation,p.args,true);}},t('confirm')),h('button',{disabled:busy,onClick:()=>setPending(null)},t('cancel')))),
        h('div',{className:'dsh-csrw-card','aria-live':'polite'},h('h2',null,t('result')),busy&&h('div',null,t('pending'),' ',h('button',{onClick:()=>request.current?.abort()},t('cancel'))),error&&h('p',{className:'dsh-csrw-error',role:'alert'},error),h('pre',null,result?JSON.stringify(result,null,2):t('empty'))));
    }

    // ---------- 文案 ----------
    const zh = {
      workbench: '科研工作台',
      navTodo: '待办', navProject: '项目', navPaper: '文献库', navIdea: '想法', navKb: '知识库', navBrain: '想法 · 知识库', backupSync: '备份 / 同步', backupSyncHint: '选择会话作为权限上下文；一键备份先建本地快照，再按配置上传坚果云与 GitHub。', backupCenter: '备份中心', backupSettings: '备份设置', cloudSettings: '云端设置', saveConfig: '保存配置', backupAll: '一键备份', backupObsidian: '备份 Obsidian', backupZotero: '备份 Zotero', backupDsh: '备份 DSH', backupWorkspace: '备份工作区', backupUpload: '上传坚果云', backupGithub: '备份 GitHub', snapshotVerify: '校验快照', snapshotPrune: '清理旧快照', nutstoreTest: '连接检测', nutstoreLogs: '同步日志', snapshotPath: '快照路径', tabActions: '操作', tabConfig: '配置', target: '目标', localDir: '本地目录', keep: '保留数量', mode: '模式', includeSessions: '包含会话', dshHome: 'DSH Home', dshProfile: 'DSH Profile', remoteRoot: '远端目录', credentialKey: '凭据名', retry: '重试次数', retryDelay: '重试间隔(ms)', backupRemote: 'GitHub 远程', backupBranch: '分支', backupRepoDir: '仓库目录', load: '加载配置', baseUrl: 'Base URL', username: '用户名', yes: '启用', no: '停用', session: '会话', mdEdit: '编辑', mdPreview: '预览', mdSplit: '分栏', brEmpty: '选择左侧条目开始编辑，或点击「＋」新建', deleteEntry: '删除', editItem: '编辑条目', syncVault: '同步', syncPickIdeas: '选择想法目录', syncPickNotes: '选择知识库目录', syncNoDir: '请先选择同步目录', syncing: '同步中…', syncDone: '同步完成', syncConflict: '发现冲突',
      pendingLine: '还有{n}件事等你推进',
      heroPlaceholder: '记下一件事、一个想法，或贴一个 DOI / 链接',
      send: '记下',
      related: '找到 {n} 条相关的内容，放在了旁边',
      back: '放回去',
      sample: '示例数据 · 清空',
      sampleTitle: '现在看到的内容都是示例，可以一键清空',
      scatter: '散落', list: '列表', calendar: '日历',
      all: '全部', task: '任务', project: '项目', paper: '文献', idea: '想法', note: '笔记',
      undo: '撤销上一步', gear: '设置', assistant: '助手', dashboard: '监控台', dueToday: '今日到期', backups: '备份', noBackups: '暂无备份',
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
      title: '标题', body: '内容', due: '截止', priority: '优先级', estimate: '预计分钟', notes: '备注',
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
      // 撤销 label：调用方只传语言无关的 key，渲染时才翻译（见 labelText）。
      // 与 host.js 共用同一批字符串，改名前先对齐 host。
      labelOpDefault: '操作', labelChat: '对话',
      labelAddPaper: '记下一篇文献', labelAddIdea: '记下一个想法', labelAddLink: '记下一个链接', labelAddTodo: '记下一件事',
      labelArrange: '摆放卡片',
      workspaceRequired: '请先填入工作区绝对路径', choose: '选择目录',
      externalConfirm: '备份源位于工作区之外：{path}；确认后将以该路径继续。',
      githubConfirm: '将推送到 {remote}；仓库目录 {repoDir}',
      backupAllConfirm: '将创建本地快照并推送到 {remote}（{repoDir}）；若 backup.target 为 nutstore，快照还会上传坚果云（该步骤无确认门）。',
      noRemoteHint: '未配置 git.backupRemote，本次不会推送。',
      localRoot: '本地根', snapshotDir: '快照目录', secretBlocked: '含疑似密钥，未上传：{n} 个文件',
      saveFailed: '以下字段保存失败：{keys}',
      credentialChangeTitle: '凭据发送目标变更（保存后凭据将发往新地址）',
      pathChangeTitle: '读写位置变更（该位置在工作区之外）',
      pruneConfirm: '将删除保留数量以外的旧快照，操作不可恢复。确认执行？',
      uploadConfirm: '将把本地备份目录增量上传到坚果云；内容冲突时保留 .local/.remote 副本，上传期间远端被改动会报错并要求重跑。确认执行？',
      pageSoon: '这一页的骨架下一轮补上。现在先把首页做扎实。',
    }
    const en = {
      workbench: 'Research desk',
      navTodo: 'Todo', navProject: 'Projects', navPaper: 'Papers', navIdea: 'Ideas', navKb: 'KnowledgeBase', navBrain: 'Ideas & KB', backupSync: 'Backup / Sync', backupSyncHint: 'Choose a session as permission context. Backup all creates a local snapshot, then uploads to Nutstore and GitHub per config.', backupCenter: 'Backup center', backupSettings: 'Backup settings', cloudSettings: 'Cloud settings', saveConfig: 'Save config', backupAll: 'Backup all', backupObsidian: 'Back up Obsidian', backupZotero: 'Back up Zotero', backupDsh: 'Back up DSH', backupWorkspace: 'Back up workspace', backupUpload: 'Upload Nutstore', backupGithub: 'Backup GitHub', snapshotVerify: 'Verify snapshot', snapshotPrune: 'Prune snapshots', nutstoreTest: 'Check connection', nutstoreLogs: 'Sync logs', snapshotPath: 'Snapshot path', tabActions: 'Operations', tabConfig: 'Configuration', target: 'Target', localDir: 'Local directory', keep: 'Keep', mode: 'Mode', includeSessions: 'Include sessions', dshHome: 'DSH Home', dshProfile: 'DSH Profile', remoteRoot: 'Remote root', credentialKey: 'Credential key', retry: 'Retry count', retryDelay: 'Retry delay (ms)', backupRemote: 'GitHub remote', backupBranch: 'Branch', backupRepoDir: 'Repo directory', load: 'Load config', baseUrl: 'Base URL', username: 'Username', yes: 'Enabled', no: 'Disabled', session: 'Session', mdEdit: 'Edit', mdPreview: 'Preview', mdSplit: 'Split', brEmpty: 'Select an entry to edit, or click "+" to create', deleteEntry: 'Delete', editItem: 'Edit item', syncVault: 'Sync', syncPickIdeas: 'Pick ideas dir', syncPickNotes: 'Pick notes dir', syncNoDir: 'Pick sync directories first', syncing: 'Syncing…', syncDone: 'Synced', syncConflict: 'Conflicts',
      pendingLine: '{n} things waiting for you',
      heroPlaceholder: 'Log a task, an idea, or paste a DOI / link',
      send: 'Log',
      related: 'Found {n} related items, placed nearby',
      back: 'Put back',
      sample: 'Sample data · clear',
      sampleTitle: 'Everything you see is sample data; clear it in one click',
      scatter: 'Scatter', list: 'List', calendar: 'Calendar',
      all: 'All', task: 'Task', project: 'Project', paper: 'Paper', idea: 'Idea', note: 'Note',
      undo: 'Undo', gear: 'Settings', assistant: 'Assistant', dashboard: 'Dashboard', dueToday: 'Due today', backups: 'Backups', noBackups: 'No backups yet',
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
      title: 'Title', body: 'Content', due: 'Due', priority: 'Priority', estimate: 'Minutes', notes: 'Notes',
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
      labelOpDefault: 'Operation', labelChat: 'Chat',
      labelAddPaper: 'Log a paper', labelAddIdea: 'Log an idea', labelAddLink: 'Log a link', labelAddTodo: 'Log a task',
      labelArrange: 'Arrange cards',
      workspaceRequired: 'Enter the absolute workspace path first', choose: 'Choose directory',
      externalConfirm: 'The source resolves outside the workspace: {path}. Confirm to continue with that path.',
      githubConfirm: 'Will push to {remote}; repo directory {repoDir}',
      backupAllConfirm: 'Creates a local snapshot, then pushes to {remote} ({repoDir}); with backup.target=nutstore the snapshot is also uploaded to Nutstore (that step has no confirmation gate).',
      noRemoteHint: 'git.backupRemote is not configured; nothing will be pushed.',
      localRoot: 'Local root', snapshotDir: 'Snapshot dir', secretBlocked: 'Held back as possible secrets: {n} files',
      saveFailed: 'Fields that failed to save: {keys}',
      credentialChangeTitle: 'Credential target change (secrets will be sent to the new address)',
      pathChangeTitle: 'Read/write location change (that location is outside the workspace)',
      pruneConfirm: 'Snapshots beyond the keep count will be permanently deleted. This cannot be undone. Continue?',
      uploadConfirm: 'Upload the local backup directory to Nutstore; content conflicts keep .local/.remote copies, but a mid-upload remote change errors out and must be retried.',
      pageSoon: 'This page is coming in the next round; the home page comes first.',
    }
    let language = 'zh'
    let ctxRef = null
    const dict = () => (language === 'en' ? en : zh)
    function t(key, vars) {
      const value = dict()[key] ?? zh[key] ?? key
      if (typeof value !== 'string') return value
      return vars ? value.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? '')) : value
    }
    // 撤销 label 可能是语言无关的 key（新契约），也可能是历史/外部调用传进来的原文。
    // 命中 key 就翻译；未命中的 camelCase 串按 key 处理并回退到通用文案，避免把裸 key 显示给用户。
    function labelText(value) {
      if (typeof value !== 'string' || !value) return ''
      const hit = dict()[value] ?? zh[value]
      if (typeof hit === 'string') return hit
      return /^[a-z][A-Za-z0-9]*$/.test(value) ? t('labelOpDefault') : value
    }
    const statusText = (kind, value) => (dict()[(kind === 'task' ? 'todoStatus' : kind === 'project' ? 'projectStatus' : kind === 'paper' ? 'paperStatus' : 'ideaStatus')] ?? {})[value] ?? value

    // ---------- 请求与状态 ----------
    let snapshot = {
      state: null, canUndo: false, error: null, view: 'todo', mode: 'scatter', kindFilter: 'all',
      query: '', related: null, capture: null, dockOpen: true, chatInput: '', thinking: false,
      toast: null, focusId: null, dashboardOpen: true, cam: { x: 0, y: 0, z: 1 }, camAnim: false,
      modelsOpen: false, models: [], modelsLoading: false, backupOpen: false, editing: null,
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
        const data = await request(ROUTES.state)
        if (data.state?.settings?.language) language = data.state.settings.language
        setDesk({ state: data.state, canUndo: data.canUndo, error: null, dockOpen: data.state?.settings?.dockOpen !== false, dashboardOpen: true })
      } catch (err) {
        setDesk({ error: err.message })
      }
    }

    async function dispatchOps(ops, { label = 'labelOpDefault', undoable = true, silent = false } = {}) {
      try {
        const data = await request(ROUTES.ops, { ops, label, undoable })
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
        const data = await request(ROUTES.undo, {})
        setDesk({ state: data.state, canUndo: data.canUndo, toast: null })
        if (data.label) toast(t('cleared', { label: labelText(data.label) }))
      } catch (err) {
        toast(err.message, { error: true })
      }
    }

    async function saveSettings(patch) {
      try {
        const data = await request(ROUTES.settings, patch)
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
        const data = await request(ROUTES.models)
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
        const data = await request(ROUTES.chat, { message: text })
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
        return { ops: [{ op: 'add_item', kind: 'paper', title: value.replace(/^https?:\/\/\S+$/i, '').slice(0, 90) || '待补充标题', doi: /^10\./.test(value) ? value : '', url: /^https?:/i.test(value) ? value : '' }], label: 'labelAddPaper' }
      }
      if (/^(问题|假设|方法|局限)[:：]/.test(value)) {
        return { ops: [{ op: 'add_item', kind: 'idea', title: value.replace(/^(问题|假设|方法|局限)[:：]/, '').slice(0, 90), kind: /^假设/.test(value) ? 'hypothesis' : /^问题/.test(value) ? 'question' : /^方法/.test(value) ? 'method' : 'idea' }], label: 'labelAddIdea' }
      }
      if (/^https?:\/\//i.test(value)) {
        return { ops: [{ op: 'add_item', kind: 'idea', title: value.slice(0, 90), body: '', kind: 'link' }], label: 'labelAddLink' }
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
      return { ops: [{ op: 'add_item', kind: 'todo', title: value.slice(0, 90), ...patch }], label: 'labelAddTodo' }
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
      gauge: [['path', { d: 'M4 15a8 8 0 1 1 16 0' }], ['path', { d: 'M12 15l3.5-4.5' }]],
      backup: [['rect', { x: 4, y: 5, width: 16, height: 15, rx: 2 }], ['path', { d: 'M4 10h16' }], ['path', { d: 'M8 14h8' }]],
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
.rd-nav-dash{display:inline-flex;align-items:center;gap:6px;font-weight:600;color:var(--dsw-alias-label-primary)}
.rd-nav-sep{width:1px;height:18px;background:var(--dsw-alias-border-l1);margin:0 3px;align-self:center}
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
.rd-dash{position:absolute;inset:0;overflow:auto;padding:88px 28px 120px}
.rd-dash-inner{max-width:860px;width:100%;margin:0 auto;display:flex;flex-direction:column;gap:14px}
.rd-dash-head{display:flex;align-items:center;justify-content:space-between;font-size:20px;font-weight:700;color:var(--dsw-alias-label-primary)}
.rd-dash-head button{border:0;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:15px;line-height:1;width:30px;height:30px;border-radius:50%;display:grid;place-items:center}
.rd-dash-stats{display:flex;gap:10px;flex-wrap:wrap}
.rd-dash-stat{flex:1;min-width:110px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:18px 12px;border-radius:14px;background:var(--glass);border:.5px solid var(--dsw-alias-border-l1)}
.rd-dash-stat b{font-size:28px;font-weight:700;color:var(--dsw-alias-label-primary)}
.rd-dash-stat span{font-size:12px;color:var(--dsw-alias-label-secondary)}
.rd-dash-sec{display:flex;flex-direction:column;gap:8px;padding:16px 18px;border-radius:14px;background:var(--glass);border:.5px solid var(--dsw-alias-border-l1)}
.rd-dash-sec h4{margin:0 0 4px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-tertiary,#9a9a9a);letter-spacing:.03em}
.rd-dash-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:13px;line-height:1.5}
.rd-dash-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.rd-dash-row em{flex:none;font-style:normal;font-size:11px;color:var(--dsw-alias-label-tertiary,#9a9a9a);max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rd-dash-empty{font-size:12px;color:var(--dsw-alias-label-tertiary,#9a9a9a);margin:0}
.rd-root.is-compact .rd-dash{padding:80px 14px 110px}
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
.rd-glass-panel{border-radius:20px;background:var(--glass);border:.5px solid var(--dsw-alias-border-l1);backdrop-filter:blur(24px) saturate(1.05);-webkit-backdrop-filter:blur(24px) saturate(1.05);box-shadow:0 8px 32px rgb(0 0 0 / 6%);overflow:hidden}
.rd-todo-split{position:absolute;inset:0;padding:72px 20px 20px;display:flex;flex-direction:column;gap:16px;overflow:hidden}
.rd-pane-top{position:relative;flex:1 1 55%;min-height:0}
.rd-pane-top .rd-hero-anchor{top:44%;transform:translate(-50%,-50%) scale(.88)}
.rd-pane-bottom{flex:0 0 45%;min-height:0;display:flex;flex-direction:column}
.rd-pane-corner{position:absolute;right:14px;bottom:14px;z-index:7}
.rd-todo-list{flex:1;min-height:0;display:flex;flex-direction:column}
.rd-todo-list-head{display:flex;align-items:center;gap:12px;padding:16px 24px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.rd-todo-list-head h2{margin:0;font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary)}
.rd-todo-list-count{font-size:12px;color:var(--dsw-alias-label-tertiary,#9a9a9a)}
.rd-todo-list-body{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;padding:16px 24px 24px}
.rd-todo-bucket{min-width:0;display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:12px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 2px 8px rgb(0 0 0 / 4%)}
.rd-todo-bucket h3{margin:0 0 2px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.rd-todo-bucket-rows{display:flex;flex-direction:column;gap:5px}
.rd-todo-row{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;font-size:12px;line-height:1.4;border:0;background:transparent;color:inherit;font-family:inherit;text-align:left;padding:3px 5px;border-radius:6px;cursor:pointer}
.rd-todo-row:hover{background:var(--dsw-alias-bg-layer-1)}
.rd-todo-row-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.rd-root.is-compact .rd-todo-split{padding:64px 10px 10px;gap:10px}
.rd-root.is-compact .rd-pane-bottom{flex-basis:50%}
.rd-root.is-compact .rd-todo-list-body{grid-template-columns:repeat(2,minmax(0,1fr))}
.rd-brain{position:absolute;inset:0;padding:64px 18px 18px}
.rd-br-sync{display:flex;align-items:center;gap:10px;padding:0 4px 12px}
.rd-br-sync-dir{font-size:12px;color:var(--dsw-alias-label-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rd-br-sync-warn{font-size:12px;color:var(--dsw-alias-state-warn-primary)}
.rd-br{display:flex;height:100%;border-radius:16px;overflow:hidden;background:var(--glass);border:.5px solid var(--dsw-alias-border-l1);backdrop-filter:blur(24px)}
.rd-br-list{width:280px;flex:none;overflow:auto;padding:16px 12px;display:flex;flex-direction:column;gap:4px;border-right:1px solid var(--dsw-alias-border-l1)}
.rd-br-list-head{display:flex;align-items:center;justify-content:space-between;padding:10px 4px 6px;margin-top:6px}
.rd-br-list-head h2{margin:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.rd-br-add{width:26px;height:26px;border-radius:50%;border:0;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:16px;line-height:1}
.rd-br-item{display:flex;flex-direction:column;gap:2px;text-align:left;padding:8px 10px;border-radius:10px;border:0;background:transparent;cursor:pointer;font:inherit}
.rd-br-item:hover{background:var(--dsw-alias-bg-layer-1)}
.rd-br-item.is-on{background:var(--dsw-alias-bg-layer-1)}
.rd-br-item-title{font-size:13px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rd-br-item-meta{font-size:11px;color:var(--dsw-alias-label-tertiary,#9a9a9a)}
.rd-br-main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:auto}
.rd-br-empty{flex:1;display:grid;place-items:center;color:var(--dsw-alias-label-tertiary,#9a9a9a);font-size:13px;padding:40px}
.rd-br-editor{display:flex;flex-direction:column;gap:12px;padding:20px 24px;height:100%}
.rd-br-editor-head{display:flex;gap:10px;align-items:center}
.rd-br-title{flex:1;min-width:0;height:40px;font-size:18px;font-weight:600;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:inherit;padding:0 12px;font:inherit}
.rd-br-editor-head select{height:40px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;padding:0 8px}
.rd-br-toolbar{display:flex;align-items:center;gap:10px}
.rd-br-split{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.rd-br-body{flex:1;min-height:0;width:100%;resize:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base);color:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.6;padding:14px}
.rd-br-preview{flex:1;min-height:0;overflow:auto;padding:14px 18px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base)}
.rd-md{font-size:14px;line-height:1.7;color:var(--dsw-alias-label-primary)}
.rd-md-h{margin:0 0 8px;font-weight:600}
.rd-md-p{margin:0 0 10px}
.rd-md-ul,.rd-md-ol{margin:0 0 10px;padding-left:22px}
.rd-md-pre{margin:0 0 12px;padding:12px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);overflow:auto}
.rd-md-pre code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.rd-md-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;background:var(--dsw-alias-bg-layer-1);padding:1px 5px;border-radius:4px}
.rd-md-wiki{color:var(--dsw-alias-brand-primary);text-decoration:underline;text-decoration-style:dotted;cursor:pointer}
.rd-md-link{color:var(--dsw-alias-brand-primary)}
.rd-md-quote{margin:0 0 10px;padding:4px 12px;border-left:3px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.rd-root.is-compact .rd-br-list{width:220px}
.rd-backup-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.rd-backup-result{white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;background:var(--dsw-alias-bg-base);padding:12px;border-radius:8px;font-size:12px}
.rd-backup-dialog{max-width:760px;max-height:86vh;overflow:auto}
.rd-backup-section{display:flex;flex-direction:column;gap:10px;margin:6px 0}
.rd-backup-section h4{margin:8px 0 0;font-size:12px;font-weight:600;color:var(--dsw-alias-label-tertiary,#9a9a9a);letter-spacing:.03em}
.rd-backup-row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.rd-backup-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.rd-backup-path{flex:1 1 220px;min-width:160px;height:34px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:13px;padding:0 10px}
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
.rd-btn.is-danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent)}
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
            dispatchOps([{ op: 'set_pos', kind: item.kind === 'task' ? 'todo' : item.kind, id: item.id, pos: { x: movedX, y: movedY, r: node.r } }], { label: 'labelArrange', undoable: false, silent: true })
          } else {
            setDesk({ editing: { kind: item.kind, id: item.id } })
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

    function TodoList() {
      const state = useSel((s) => s.state)
      const todos = state?.todos ?? []
      const papers = state?.papers ?? []
      const ideas = state?.ideas ?? []
      const notes = state?.notes ?? []
      const projectName = (id) => (state?.projects ?? []).find((row) => row.id === id)?.name
      const open = todos.filter((row) => row.status !== 'done')
      const buckets = [
        ['all', 'Todo: All', open.map((row) => ({ id: row.id, kind: 'task', title: row.title, meta: statusText('task', row.status) }))],
        ['projects', 'Todo: Projects', open.filter((row) => row.projectId).map((row) => ({ id: row.id, kind: 'task', title: row.title, meta: projectName(row.projectId) ?? '' }))],
        ['paper', 'Todo: Paper', papers.filter((row) => row.status === 'inbox' || row.status === 'reading').map((row) => ({ id: row.id, kind: 'paper', title: row.title, meta: statusText('paper', row.status) }))],
        ['ideas', 'Todo: Idea', ideas.filter((row) => row.status === 'seed').map((row) => ({ id: row.id, kind: 'idea', title: row.title, meta: statusText('idea', row.status) }))],
        ['notes', 'Todo: 知识库', notes.filter((row) => row.status === 'draft').map((row) => ({ id: row.id, kind: 'note', title: row.title, meta: row.kb ?? '' }))],
      ]
      return h('div', { className: 'rd-todo-list' },
        h('div', { className: 'rd-todo-list-head' },
          h('h2', null, t('navTodo')),
          h('span', { className: 'rd-todo-list-count' }, String(open.length)),
          h('span', { style: { flex: 1 } }),
          h('button', { type: 'button', className: 'rd-btn', onClick: () => setDesk({ capture: 'task' }) }, t('capture'))),
        h('div', { className: 'rd-todo-list-body' },
          ...buckets.map(([key, title, rows]) => h('section', { key, className: 'rd-todo-bucket' },
            h('h3', null, title),
            rows.length
              ? h('div', { className: 'rd-todo-bucket-rows' }, ...rows.slice(0, 6).map((row) => h('button', { key: row.id, type: 'button', className: 'rd-todo-row', onClick: () => setDesk({ editing: { kind: row.kind, id: row.id } }) },
                h('span', { className: 'rd-todo-row-title' }, row.title),
                row.meta ? h('span', { className: 'rd-tag' }, row.meta) : null)))
              : h('p', { className: 'rd-board-empty' }, t('empty'))))))
    }

    function TodoSplit() {
      return h('div', { className: 'rd-todo-split' },
        h('section', { className: 'rd-glass-panel rd-pane-top', 'aria-label': t('dashboard') },
          h(Hero), h(ScatterView),
          h('div', { className: 'rd-pane-corner' },
            h('div', { className: 'rd-zoom' },
              h('button', { type: 'button', title: t('zoomOut'), 'aria-label': t('zoomOut'), onClick: () => zoomCenter(1 / 1.25) }, '−'),
              h('button', { type: 'button', className: 'rd-zoom-fit', title: t('zoomFit'), 'aria-label': t('zoomFit'), onClick: resetCamera }, h(Icon, { name: 'target', size: 15 })),
              h('button', { type: 'button', title: t('zoomIn'), 'aria-label': t('zoomIn'), onClick: () => zoomCenter(1.25) }, '+')))),
        h('section', { className: 'rd-glass-panel rd-pane-bottom', 'aria-label': t('navTodo') }, h(TodoList)))
    }

    function inlineMd(text) {
      const tokens = text.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_([^_]+)_|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g)
      return tokens.filter(Boolean).map((token, i) => {
        if (token.startsWith('**') && token.endsWith('**')) return h('strong', { key: i }, token.slice(2, -2))
        if (token.startsWith('__') && token.endsWith('__')) return h('strong', { key: i }, token.slice(2, -2))
        if (token.startsWith('*') && token.endsWith('*')) return h('em', { key: i }, token.slice(1, -1))
        if (token.startsWith('`') && token.endsWith('`')) return h('code', { key: i, className: 'rd-md-code' }, token.slice(1, -1))
        if (token.startsWith('[[') && token.endsWith(']]')) {
          const inner = token.slice(2, -2)
          const [target, alias] = inner.split('|')
          return h('span', { key: i, className: 'rd-md-wiki' }, alias || target)
        }
        const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (link) return h('a', { key: i, className: 'rd-md-link', href: link[2], target: '_blank', rel: 'noreferrer' }, link[1])
        return token
      })
    }

    function markdownToVdom(md) {
      const lines = (md ?? '').replace(/\r\n/g, '\n').split('\n')
      const out = []
      let i = 0
      while (i < lines.length) {
        const line = lines[i]
        if (line.trim().startsWith('```')) {
          const buf = []; i += 1
          while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i += 1 }
          i += 1
          out.push(h('pre', { key: out.length, className: 'rd-md-pre' }, h('code', null, buf.join('\n'))))
          continue
        }
        const hd = line.match(/^(#{1,6})\s+(.*)$/)
        if (hd) {
          const level = hd[1].length
          out.push(h(`h${level}`, { key: out.length, className: 'rd-md-h' }, ...inlineMd(hd[2])))
          i += 1; continue
        }
        const ul = line.match(/^\s*[-*+]\s+(.*)$/)
        if (ul) {
          const items = []
          while (i < lines.length && lines[i].match(/^\s*[-*+]\s+(.*)$/)) { items.push(h('li', { key: items.length }, ...inlineMd(lines[i].match(/^\s*[-*+]\s+(.*)$/)[1]))); i += 1 }
          out.push(h('ul', { key: out.length, className: 'rd-md-ul' }, ...items)); continue
        }
        const ol = line.match(/^\s*\d+\.\s+(.*)$/)
        if (ol) {
          const items = []
          while (i < lines.length && lines[i].match(/^\s*\d+\.\s+(.*)$/)) { items.push(h('li', { key: items.length }, ...inlineMd(lines[i].match(/^\s*\d+\.\s+(.*)$/)[1]))); i += 1 }
          out.push(h('ol', { key: out.length, className: 'rd-md-ol' }, ...items)); continue
        }
        const quote = line.match(/^\s*>\s?(.*)$/)
        if (quote) {
          const items = []
          while (i < lines.length && lines[i].match(/^\s*>\s?(.*)$/)) { items.push(lines[i].match(/^\s*>\s?(.*)$/)[1]); i += 1 }
          out.push(h('blockquote', { key: out.length, className: 'rd-md-quote' }, ...inlineMd(items.join(' ')))); continue
        }
        if (!line.trim()) { i += 1; continue }
        out.push(h('p', { key: out.length, className: 'rd-md-p' }, ...inlineMd(line)))
        i += 1
      }
      return out
    }

    function BrainView() {
      const state = useSel((s) => s.state)
      const [selected, setSelected] = useState(null)
      const [mode, setMode] = useState('edit')
      const [draft, setDraft] = useState({ title: '', kind: 'idea', kb: 'concept', status: 'seed', body: '' })
      const [syncInfo, setSyncInfo] = useState(null)
      const ideas = state?.ideas ?? []
      const notes = state?.notes ?? []
      const vaultSync = state?.settings?.vaultSync
      const ideasDir = vaultSync?.ideasDir ?? ''
      const notesDir = vaultSync?.notesDir ?? ''
      const saveVaultSync = async (patch) => {
        await fetch(API_BASE + ROUTES.settings, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vaultSync: { ...(vaultSync ?? {}), ...patch } }) })
        loadDesk()
      }
      const pickDir = async (key) => {
        try {
          const p = await ctxRef?.get('uiWorkspace')?.pickDirectory()
          if (p) await saveVaultSync({ [key]: p })
        } catch (err) { toast(err.message, { error: true }) }
      }
      const doSync = async () => {
        if (!ideasDir && !notesDir) { toast(t('syncNoDir'), { error: true }); return }
        setSyncInfo('busy')
        try {
          const res = await fetch(API_BASE + ROUTES.vaultSync, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ideasDir, notesDir }) })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || t('error'))
          setSyncInfo(data)
          loadDesk()
          toast(t('syncDone'))
        } catch (err) {
          setSyncInfo(null)
          toast(err.message, { error: true })
        }
      }
      const ideaKind = (k) => ({ idea: dict() === en ? 'Idea' : '想法', hypothesis: dict() === en ? 'Hypothesis' : '假设', question: dict() === en ? 'Question' : '问题', method: dict() === en ? 'Method' : '方法' })[k] ?? k
      const kbLabel = (k) => (dict().kb ?? zh.kb)[k] ?? k ?? 'note'
      const open = (kind, row) => { setSelected({ kind, id: row.id, isNew: false }); setMode('edit'); setDraft({ title: row.title ?? '', kind: row.kind ?? 'idea', kb: row.kb ?? 'concept', status: row.status ?? 'seed', body: row.body ?? '' }) }
      const create = (kind) => { setSelected({ kind, id: null, isNew: true }); setMode('edit'); setDraft({ title: '', kind: 'idea', kb: 'concept', status: 'seed', body: '' }) }
      const set = (key, value) => setDraft((p) => ({ ...p, [key]: value }))
      const save = async () => {
        if (!selected) return
        const title = String(draft.title ?? '').trim()
        if (!title) return
        if (selected.isNew) {
          const op = { op: 'add_item', kind: selected.kind, title }
          if (selected.kind === 'idea') { op.kind = draft.kind; op.body = draft.body }
          else { op.kb = draft.kb; op.body = draft.body }
          await dispatchOps([op], { label: dict() === en ? 'Create entry' : '新建条目' })
        } else {
          const patch = { title }
          if (selected.kind === 'idea') { patch.kind = draft.kind; patch.status = draft.status; patch.body = draft.body }
          else { patch.kb = draft.kb; patch.body = draft.body }
          await dispatchOps([{ op: 'update_item', kind: selected.kind, id: selected.id, patch }], { label: dict() === en ? 'Edit entry' : '编辑条目' })
        }
        setSelected(null)
      }
      const remove = async () => {
        if (!selected) return
        if (selected.isNew) { setSelected(null); return }
        await dispatchOps([{ op: 'delete_item', kind: selected.kind, id: selected.id }], { label: dict() === en ? 'Delete entry' : '删除条目' })
        setSelected(null)
      }
      const item = (kind, row, label) => h('button', {
        key: row.id, type: 'button',
        className: `rd-br-item ${selected && selected.kind === kind && selected.id === row.id ? 'is-on' : ''}`,
        onClick: () => open(kind, row),
      }, h('span', { className: 'rd-br-item-title' }, row.title), h('span', { className: 'rd-br-item-meta' }, label))
      const editor = selected ? h('div', { className: 'rd-br-editor' },
        h('div', { className: 'rd-br-editor-head' },
          h('input', { className: 'rd-br-title', value: draft.title, placeholder: t('title'), onChange: (e) => set('title', e.target.value) }),
          selected.kind === 'idea'
            ? h('select', { value: draft.kind, onChange: (e) => set('kind', e.target.value) }, ...['idea', 'hypothesis', 'question', 'method'].map((k) => h('option', { key: k, value: k }, ideaKind(k))))
            : h('select', { value: draft.kb, onChange: (e) => set('kb', e.target.value) }, ...Object.keys(zh.kb).map((k) => h('option', { key: k, value: k }, kbLabel(k)))),
          selected.kind === 'idea' ? h('select', { value: draft.status, onChange: (e) => set('status', e.target.value) }, ...['seed', 'exploring', 'parked'].map((s) => h('option', { key: s, value: s }, statusText('idea', s)))) : null),
        h('div', { className: 'rd-br-toolbar' },
          h('div', { className: 'rd-seg' },
            h('button', { type: 'button', className: mode === 'edit' ? 'is-on' : '', onClick: () => setMode('edit') }, t('mdEdit')),
            h('button', { type: 'button', className: mode === 'preview' ? 'is-on' : '', onClick: () => setMode('preview') }, t('mdPreview')),
            h('button', { type: 'button', className: mode === 'split' ? 'is-on' : '', onClick: () => setMode('split') }, t('mdSplit'))),
          h('span', { style: { flex: 1 } }),
          !selected.isNew ? h('button', { type: 'button', className: 'rd-btn', onClick: remove }, t('deleteEntry')) : null,
          h('button', { type: 'button', className: 'rd-btn is-primary', onClick: save }, t('save'))),
        mode === 'split'
          ? h('div', { className: 'rd-br-split' },
            h('textarea', { className: 'rd-br-body', value: draft.body, onChange: (e) => set('body', e.target.value) }),
            h('div', { className: 'rd-br-preview rd-md' }, ...markdownToVdom(draft.body)))
          : mode === 'preview'
            ? h('div', { className: 'rd-br-preview rd-md' }, ...markdownToVdom(draft.body))
            : h('textarea', { className: 'rd-br-body', value: draft.body, onChange: (e) => set('body', e.target.value) }))
      : h('div', { className: 'rd-br-empty' }, t('brEmpty'))
      const syncBar = h('div', { className: 'rd-br-sync' },
        h('span', { className: 'rd-br-sync-dir', title: ideasDir }, ideasDir ? (ideasDir.split(/[\\/]/).filter(Boolean).pop() || ideasDir) : t('syncPickIdeas')),
        h('span', { className: 'rd-br-sync-dir', title: notesDir }, notesDir ? (notesDir.split(/[\\/]/).filter(Boolean).pop() || notesDir) : t('syncPickNotes')),
        h('button', { type: 'button', className: 'rd-btn', onClick: () => pickDir('ideasDir') }, t('syncPickIdeas')),
        h('button', { type: 'button', className: 'rd-btn', onClick: () => pickDir('notesDir') }, t('syncPickNotes')),
        h('span', { style: { flex: 1 } }),
        syncInfo && syncInfo !== 'busy' && syncInfo.conflicts ? h('span', { className: 'rd-br-sync-warn' }, `${t('syncConflict')} ${syncInfo.conflicts}`) : null,
        h('button', { type: 'button', className: 'rd-btn is-primary', disabled: syncInfo === 'busy', onClick: doSync }, syncInfo === 'busy' ? t('syncing') : t('syncVault')))
      return h('div', { className: 'rd-brain' },
        syncBar,
        h('div', { className: 'rd-br' },
          h('aside', { className: 'rd-br-list' },
            h('div', { className: 'rd-br-list-head' }, h('h2', null, t('navIdea')), h('button', { type: 'button', className: 'rd-br-add', title: t('capture'), onClick: () => create('idea') }, '+')),
            ...ideas.map((row) => item('idea', row, ideaKind(row.kind))),
            h('div', { className: 'rd-br-list-head' }, h('h2', null, t('navKb')), h('button', { type: 'button', className: 'rd-br-add', title: t('capture'), onClick: () => create('note') }, '+')),
            ...notes.map((row) => item('note', row, kbLabel(row.kb)))),
          h('main', { className: 'rd-br-main' }, editor)))
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
        h('div', { className: 'rd-seg' }, ...modes.map(([id, label]) => h('button', { key: id, type: 'button', className: mode === id ? 'is-on' : '', onClick: () => setDesk({ mode: id, dashboardOpen: false }) }, label))),
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

    function ItemDialog() {
      const editing = useSel((s) => s.editing)
      const state = useSel((s) => s.state)
      const [form, setForm] = useState({})
      const kindMap = { task: 'todo', paper: 'paper', idea: 'idea', note: 'note' }
      const listMap = { todo: 'todos', paper: 'papers', idea: 'ideas', note: 'notes' }
      const kind = editing ? (kindMap[editing.kind] ?? editing.kind) : null
      const row = editing ? (state?.[listMap[kind]] ?? []).find((x) => x.id === editing.id) ?? null : null
      useEffect(() => {
        if (!row) return
        setForm({ title: row.title ?? '', due: row.due ?? '', priority: row.priority ?? 'P2', estimateMinutes: row.estimateMinutes ?? '', projectId: row.projectId ?? '', notes: row.notes ?? '', status: row.status ?? 'todo' })
      }, [editing])
      if (!editing || !row) return null
      const set = (key, value) => setForm((p) => ({ ...p, [key]: value }))
      const close = () => setDesk({ editing: null })
      const save = async () => {
        const title = String(form.title ?? '').trim()
        if (!title) return
        const ops = []
        if (kind === 'todo') {
          if (form.status && form.status !== row.status) ops.push({ op: 'set_status', kind: 'todo', id: editing.id, status: form.status })
          ops.push({ op: 'update_item', kind: 'todo', id: editing.id, patch: { title, due: form.due || null, priority: form.priority || 'P2', estimateMinutes: form.estimateMinutes ? Number(form.estimateMinutes) : null, projectId: form.projectId || null, notes: form.notes ?? '' } })
        } else {
          ops.push({ op: 'update_item', kind, id: editing.id, patch: { title } })
        }
        await dispatchOps(ops, { label: dict() === en ? 'Edit item' : '编辑条目' })
        close()
      }
      const remove = async () => {
        await dispatchOps([{ op: 'delete_item', kind, id: editing.id }], { label: dict() === en ? 'Delete item' : '删除条目' })
        close()
      }
      const field = (label, control) => h('label', { className: 'rd-field' }, h('span', null, label), control)
      const input = (key, props = {}) => h('input', { value: form[key] ?? '', onChange: (event) => set(key, event.target.value), ...props })
      return h('div', { className: 'rd-dialog-backdrop', onPointerDown: (event) => { if (event.target === event.currentTarget) close() } },
        h('form', { className: 'rd-dialog', onSubmit: (event) => { event.preventDefault(); save() } },
          h('h3', null, t('editItem')),
          field(t('title'), input('title', { autoFocus: true, required: true })),
          kind === 'todo' ? h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
            field(t('due'), input('due', { type: 'date' })),
            field(t('priority'), h('select', { value: form.priority ?? 'P2', onChange: (event) => set('priority', event.target.value) }, ...['P0', 'P1', 'P2', 'P3'].map((value) => h('option', { key: value, value }, value)))),
            field(t('estimate'), input('estimateMinutes', { type: 'number', min: 0, step: 5 })),
            field(t('projectOf'), h('select', { value: form.projectId ?? '', onChange: (event) => set('projectId', event.target.value) }, h('option', { value: '' }, t('none')), ...(state?.projects ?? []).map((r) => h('option', { key: r.id, value: r.id }, r.name)))),
            field(t('status'), h('select', { value: form.status ?? 'todo', onChange: (event) => set('status', event.target.value) }, ...['todo', 'doing', 'waiting', 'done'].map((value) => h('option', { key: value, value }, statusText('task', value)))))) : null,
          kind === 'todo' ? field(t('notes'), h('textarea', { value: form.notes ?? '', onChange: (event) => set('notes', event.target.value) })) : null,
          h('div', { className: 'rd-form-foot' },
            h('button', { type: 'button', className: 'rd-btn is-danger', onClick: remove }, t('deleteEntry')),
            h('span', { style: { flex: 1 } }),
            h('button', { type: 'button', className: 'rd-btn', onClick: close }, t('cancel')),
            h('button', { type: 'submit', className: 'rd-btn is-primary' }, t('save')))))
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

    function BackupDialog() {
      const open = useSel((s) => s.backupOpen)
      const [sessionId, setSessionId] = useState('')
      const [busy, setBusy] = useState(false)
      const [result, setResult] = useState(null)
      const [error, setError] = useState('')
      const [tab, setTab] = useState('actions')
      const [config, setConfig] = useState(null)
      const [form, setForm] = useState({})
      const [snapshotPath, setSnapshotPath] = useState('')
      const [workspace, setWorkspace] = useState('')
      const [pending, setPending] = useState(null)
      const failureRef = useRef(null)
      const abortRef = useRef(null)
      if (!open) return null
      // 传输层：只发请求 + 归一化失败（不碰 React 状态），供"面板先读一次 config_show"复用。
      const transport = async (operation, args, confirmed) => {
        const controller = new AbortController()
        abortRef.current?.abort()   // 新请求取代旧请求：保留可取消能力，不再用一次性 controller
        abortRef.current = controller
        try {
          const payload = { operation, args: { ...args, workspace: workspace.trim() }, confirmed }
          const remoteResult = await ctxRef?.remote?.commands?.execute(sessionId.trim(), '/dsh-csrw ' + JSON.stringify(payload), [], controller.signal)
          if (!remoteResult?.ok) return { ok: false, message: String(remoteResult?.error?.message ?? remoteResult?.error ?? t('error')) }
          const response = remoteResult.value
          if (!response || response.result?.kind !== 'success') {
            return { ok: false, message: response?.result?.text || t('error'), code: response?.result?.code, path: response?.result?.path }
          }
          return { ok: true, data: JSON.parse(response.result.text) }
        } catch (err) {
          return { ok: false, message: err?.message || String(err), code: err?.code, path: err?.path }
        }
      }
      const ready = () => {
        if (!sessionId.trim()) { setError(t('noSession')); return false }
        if (!workspace.trim()) { setError(t('workspaceRequired')); return false }
        return true
      }
      // 两个旗标互不代偿：confirm 只表达"批准这份 payload"；工具级 confirm 由调用点显式给定。
      const exec = async (operation, args = {}, confirm = false, toolConfirm = false) => {
        if (!ready()) return null
        setBusy(true); setError(''); setResult(null); setPending(null)
        const outcome = await transport(operation, toolConfirm ? { ...args, confirm: true } : args, confirm)
        setBusy(false)
        if (!outcome.ok) { failureRef.current = outcome; setError(outcome.message); return null }
        failureRef.current = null
        setResult(outcome.data)
        return outcome.data
      }
      const flat = (cfg) => {
        const out = {}
        for (const [section, values] of Object.entries(cfg ?? {})) {
          if (!values || typeof values !== 'object' || Array.isArray(values)) continue
          for (const [key, value] of Object.entries(values)) out[`${section}.${key}`] = value
        }
        return out
      }
      const loadConfig = async () => {
        const data = await exec('dsh_csrw_config_show')
        if (data?.config) { setConfig(data.config); setForm(flat(data.config)) }
      }
      const setField = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))
      // 敏感字段分两类（写时门）：凭据作用域改变"凭据发往哪里"，路径改变"读写哪个位置"。
      const CREDENTIAL_KEYS = ['nutstore.baseUrl', 'nutstore.username', 'nutstore.credentialKey']
      const PATH_SCOPED_KEYS = ['backup.localDir', 'obsidian.vaultPath', 'zotero.dataDir', 'backup.dshHome', 'backup.dshProfile']
      const saveAll = () => {
        if (!config) return
        const base = flat(config)
        const changes = Object.entries(form).filter(([key, value]) => String(value) !== String(base[key]))
        if (!changes.length) { setResult({ saved: 0, failed: [] }); return }
        setError('')
        // 先把 old -> new 摆到面板上；用户看过之后才逐个提交。
        setPending({ kind: 'save', changes: changes.map(([key, value]) => ({ key, from: base[key], to: value })) })
      }
      const runSave = async (rows) => {
        if (!ready()) return
        const base = flat(config)
        const failed = []
        let saved = 0
        for (const row of rows) {
          const original = base[row.key]
          const coerced = typeof original === 'boolean' ? (row.to === 'true' || row.to === true) : typeof original === 'number' ? Number(row.to) : row.to
          // 每次请求都独立带信封 confirmed=true；args.confirm 只给两类敏感字段，绝不传 confirmExternalPath
          // （config 里的路径没有 payload，越界控制点在 setConfig 的写时门）。
          const sensitive = CREDENTIAL_KEYS.includes(row.key) || PATH_SCOPED_KEYS.includes(row.key)
          const data = await exec('dsh_csrw_config_set', { key: row.key, value: coerced }, true, sensitive)
          if (data) saved += 1
          else failed.push({ key: row.key, error: failureRef.current?.message || '' })
        }
        const refreshed = await transport('dsh_csrw_config_show', {}, false)
        if (refreshed.ok && refreshed.data?.config) { setConfig(refreshed.data.config); setForm(flat(refreshed.data.config)) }
        setResult({ saved, failed })
      }
      const READ_OPS = new Set(['dsh_csrw_nutstore_test', 'dsh_csrw_nutstore_logs', 'dsh_csrw_snapshot_verify'])
      const PUSH_OPS = new Set(['dsh_csrw_backup_github', 'dsh_csrw_backup_all'])
      // 单击即写、且后果需要单独说明的操作：删除不可恢复 / 上传远端。
      // 不复用 kind:'call'（那句 externalConfirm 讲"路径在工作区外"，对这两类会误导）。
      const CONFIRM_OPS = new Map([
        ['dsh_csrw_snapshot_prune', { titleKey: 'pruneConfirm', toolConfirm: true }],
        ['dsh_csrw_backup_upload', { titleKey: 'uploadConfirm', toolConfirm: false }],
      ])
      // 面板先行：先只读读一次 config，把 remote/repoDir 冻结进面板，保证"看到的值 = 执行时用的值"。
      const openPushPanel = async (operation) => {
        if (!ready()) return
        setBusy(true); setError(''); setResult(null); setPending(null)
        const outcome = await transport('dsh_csrw_config_show', {}, false)
        setBusy(false)
        if (!outcome.ok) { setError(outcome.message); return }
        const git = outcome.data?.config?.git
        if (!git || typeof git.backupRemote !== 'string') { setError(t('error')); return }
        setPending({ kind: 'push', operation, remote: git.backupRemote, repoDir: typeof git.backupRepoDir === 'string' ? git.backupRepoDir : '' })
      }
      // 越界：先不带 confirmExternalPath 跑一次，只有命中 EXTERNAL_PATH_REQUIRED 才回显 host 给的绝对路径。
      const runExternalAware = async (operation, args = {}, toolConfirm = false) => {
        const data = await exec(operation, args, true, toolConfirm)
        if (data) return data
        const failure = failureRef.current
        if (failure?.code === 'EXTERNAL_PATH_REQUIRED') {
          setPending({ kind: 'call', operation, args: { ...args, confirmExternalPath: true }, toolConfirm, path: typeof failure.path === 'string' ? failure.path : '' })
        }
        return null
      }
      const runAction = (operation, args = {}) => {
        if (READ_OPS.has(operation)) return exec(operation, args, false, false)
        if (PUSH_OPS.has(operation)) return openPushPanel(operation)
        const confirmOp = CONFIRM_OPS.get(operation)
        if (confirmOp) {
          // 面板先行：用户点了"确认"之后才发第一个请求（不先跑一次再补确认）。
          setError(''); setResult(null)
          setPending({ kind: 'tool', operation, args, toolConfirm: confirmOp.toolConfirm, titleKey: confirmOp.titleKey })
          return null
        }
        return runExternalAware(operation, args, false)
      }
      const confirmPending = () => {
        const current = pending
        if (!current) return
        setPending(null)
        if (current.kind === 'save') return runSave(current.changes)
        if (current.kind === 'push') return exec(current.operation, {}, true, true)
        return exec(current.operation, current.args, true, current.toolConfirm)
      }
      const act = (operation, label, args = {}, primary = false) => h('button', { type: 'button', className: primary ? 'rd-btn is-primary' : 'rd-btn', disabled: busy || !sessionId.trim() || !workspace.trim(), onClick: () => runAction(operation, args) }, t(label))
      const field = (key, label, control) => h('label', { className: 'rd-field', key }, h('span', null, t(label)), control)
      const textField = (key, label) => field(key, label, h('input', { value: form[key] ?? '', disabled: busy, onChange: (event) => setField(key, event.target.value) }))
      const numberField = (key, label) => field(key, label, h('input', { type: 'number', min: 0, value: form[key] ?? '', disabled: busy, onChange: (event) => setField(key, event.target.value) }))
      const selectField = (key, label, options) => field(key, label, h('select', { value: String(form[key] ?? ''), disabled: busy, onChange: (event) => setField(key, event.target.value) }, ...options.map(([value, text]) => h('option', { key: value, value }, text))))
      const boolField = (key, label) => selectField(key, label, [['true', t('yes')], ['false', t('no')]])
      const actionsTab = h('div', { className: 'rd-backup-section' },
        h('p', { className: 'rd-hint' }, t('backupSyncHint')),
        h('div', { className: 'rd-backup-row' }, act('dsh_csrw_backup_all', 'backupAll', {}, true)),
        h('h4', null, t('backupSettings')),
        h('div', { className: 'rd-backup-row' }, act('dsh_csrw_backup_obsidian', 'backupObsidian'), act('dsh_csrw_backup_zotero', 'backupZotero'), act('dsh_csrw_backup_dsh', 'backupDsh'), act('dsh_csrw_backup_workspace', 'backupWorkspace')),
        h('h4', null, t('cloudSettings')),
        h('div', { className: 'rd-backup-row' }, act('dsh_csrw_backup_upload', 'backupUpload'), act('dsh_csrw_backup_github', 'backupGithub'), act('dsh_csrw_nutstore_test', 'nutstoreTest'), act('dsh_csrw_nutstore_logs', 'nutstoreLogs')),
        h('h4', null, t('snapshotPath')),
        h('div', { className: 'rd-backup-row' }, h('input', { className: 'rd-backup-path', value: snapshotPath, placeholder: t('snapshotPath'), disabled: busy, onChange: (event) => setSnapshotPath(event.target.value) }), act('dsh_csrw_snapshot_verify', 'snapshotVerify', { snapshotPath }), act('dsh_csrw_snapshot_prune', 'snapshotPrune')))
      const configTab = h('div', { className: 'rd-backup-section' },
        !config
          ? h('div', { className: 'rd-backup-row' }, h('button', { type: 'button', className: 'rd-btn', disabled: busy || !sessionId.trim(), onClick: loadConfig }, t('load')))
          : h(React.Fragment, null,
            h('h4', null, t('backupSettings')),
            h('div', { className: 'rd-backup-grid' },
              selectField('backup.target', 'target', [['local', 'local'], ['nutstore', 'nutstore']]),
              textField('backup.localDir', 'localDir'),
              numberField('backup.keep', 'keep'),
              selectField('backup.mode', 'mode', [['full', 'full'], ['incremental', 'incremental']]),
              boolField('backup.includeDshSessions', 'includeSessions'),
              textField('backup.dshHome', 'dshHome'),
              textField('backup.dshProfile', 'dshProfile')),
            h('h4', null, t('cloudSettings')),
            h('div', { className: 'rd-backup-grid' },
              textField('nutstore.baseUrl', 'baseUrl'),
              textField('nutstore.remoteRoot', 'remoteRoot'),
              textField('nutstore.username', 'username'),
              textField('nutstore.credentialKey', 'credentialKey'),
              numberField('nutstore.retry', 'retry'),
              numberField('nutstore.retryDelay', 'retryDelay'),
              textField('git.backupRemote', 'backupRemote'),
              textField('git.backupBranch', 'backupBranch'),
              textField('git.backupRepoDir', 'backupRepoDir')),
            h('div', { className: 'rd-backup-row' }, h('button', { type: 'button', className: 'rd-btn is-primary', disabled: busy, onClick: saveAll }, t('saveConfig')))))
      const diffRow = (row, index) => h('p', { key: `d${index}`, className: 'rd-hint' }, `${row.key}：${String(row.from)} → ${String(row.to)}`)
      const pendingButtons = h('div', { className: 'rd-backup-row' },
        h('button', { type: 'button', className: 'rd-btn is-primary', disabled: busy, onClick: confirmPending }, t('confirm')),
        h('button', { type: 'button', className: 'rd-btn', disabled: busy, onClick: () => setPending(null) }, t('cancel')))
      const pendingPanel = (() => {
        if (!pending) return null
        if (pending.kind === 'save') {
          const credential = pending.changes.filter((row) => CREDENTIAL_KEYS.includes(row.key))
          const paths = pending.changes.filter((row) => PATH_SCOPED_KEYS.includes(row.key))
          const plain = pending.changes.filter((row) => !CREDENTIAL_KEYS.includes(row.key) && !PATH_SCOPED_KEYS.includes(row.key))
          return h('div', { className: 'rd-backup-section' },
            h('h4', null, t('saveConfig')),
            credential.length ? h('p', { className: 'rd-hint' }, t('credentialChangeTitle')) : null,
            ...credential.map((row, index) => diffRow(row, `c${index}`)),
            paths.length ? h('p', { className: 'rd-hint' }, t('pathChangeTitle')) : null,
            ...paths.map((row, index) => diffRow(row, `p${index}`)),
            ...plain.map((row, index) => diffRow(row, `n${index}`)),
            pendingButtons)
        }
        const title = pending.kind === 'push'
          ? t(pending.operation === 'dsh_csrw_backup_all' ? 'backupAllConfirm' : 'githubConfirm', { remote: pending.remote || t('none'), repoDir: pending.repoDir || t('none') })
          : pending.kind === 'tool'
            ? t(pending.titleKey)
            : t('externalConfirm', { path: pending.path || '—' })
        return h('div', { className: 'rd-backup-section' },
          h('h4', null, title),
          pending.kind === 'push' && !pending.remote ? h('p', { className: 'rd-hint' }, t('noRemoteHint')) : null,
          pendingButtons)
      })()
      // 结果区：本地根/快照目录三级兜底 + blocked / nutstore.blocked / nutstoreError + 部分保存失败。
      const sourceLine = (() => {
        if (!result || typeof result !== 'object') return null
        const direct = typeof result.source === 'string' ? result.source.trim() : ''
        if (direct) return { label: 'localRoot', path: direct }
        const nested = typeof result.nutstore?.source === 'string' ? result.nutstore.source.trim() : ''
        if (nested) return { label: 'localRoot', path: nested }
        const snapshot = typeof result.snapshotPath === 'string' ? result.snapshotPath.trim() : ''
        if (snapshot) return { label: 'snapshotDir', path: snapshot }
        return null
      })()
      const blockedRows = Array.isArray(result?.blocked) ? result.blocked : Array.isArray(result?.nutstore?.blocked) ? result.nutstore.blocked : []
      const blockedCount = typeof result?.secretsBlocked === 'number' ? result.secretsBlocked : blockedRows.length
      const failedRows = Array.isArray(result?.failed) ? result.failed : []
      const outcomeView = result ? h('div', null,
        sourceLine ? h('p', { className: 'rd-hint' }, `${t(sourceLine.label)}：${sourceLine.path}`) : null,
        blockedRows.length ? h('p', { className: 'rd-hint', style: { color: 'var(--dsw-alias-state-warn-primary)' } }, t('secretBlocked', { n: blockedCount })) : null,
        ...blockedRows.slice(0, 20).map((row, index) => h('p', { key: `bl${index}`, className: 'rd-hint' }, `${row?.path ?? ''}${row?.reason ? ` — ${row.reason}` : ''}`)),
        typeof result.nutstoreError === 'string' && result.nutstoreError ? h('p', { className: 'rd-hint', style: { color: 'var(--dsw-alias-state-error-primary)' } }, result.nutstoreError) : null,
        failedRows.length ? h('p', { className: 'rd-hint', style: { color: 'var(--dsw-alias-state-error-primary)' } }, t('saveFailed', { keys: failedRows.map((row) => row.key).join('、') })) : null,
        h('pre', { className: 'rd-backup-result' }, JSON.stringify(result, null, 2))) : null
      return h('div', { className: 'rd-dialog-backdrop', onPointerDown: (event) => { if (event.target === event.currentTarget) setDesk({ backupOpen: false }) } },
        h('div', { className: 'rd-dialog rd-backup-dialog' },
          h('h3', null, t('backupCenter')),
          h('label', { className: 'rd-field' }, h('span', null, t('workspace')), h('div', { className: 'rd-backup-row' },
            h('input', { value: workspace, placeholder: t('workspace'), disabled: busy, onChange: (event) => setWorkspace(event.target.value) }),
            h('button', { type: 'button', className: 'rd-btn', disabled: busy, onClick: async () => {
              try { const picked = await ctxRef?.get('uiWorkspace')?.pickDirectory(); if (picked) setWorkspace(picked) } catch (err) { setError(err?.message || String(err)) }
            } }, t('choose')))),
          h('label', { className: 'rd-field' }, h('span', null, t('session')), h('input', { value: sessionId, placeholder: t('noSession'), onChange: (event) => setSessionId(event.target.value) })),
          h('div', { className: 'rd-seg' },
            h('button', { type: 'button', className: tab === 'actions' ? 'is-on' : '', onClick: () => setTab('actions') }, t('tabActions')),
            h('button', { type: 'button', className: tab === 'config' ? 'is-on' : '', onClick: () => setTab('config') }, t('tabConfig'))),
          tab === 'actions' ? actionsTab : configTab,
          pendingPanel,
          error ? h('p', { className: 'rd-hint', style: { color: 'var(--dsw-alias-state-error-primary)' } }, error) : null,
          outcomeView,
          h('div', { className: 'rd-form-foot' }, h('button', { type: 'button', className: 'rd-btn', onClick: () => setDesk({ backupOpen: false }) }, t('cancel')))))
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

    function Dashboard() {
      const state = useSel((s) => s.state)
      const open = useSel((s) => s.dashboardOpen)
      const [backups, setBackups] = useState(null)
      useEffect(() => {
        if (!open) return
        fetch(API_BASE + ROUTES.backups).then((r) => r.json()).then((d) => setBackups(d.snapshots ?? [])).catch(() => setBackups([]))
      }, [open])
      if (!open) return null
      const todos = state?.todos ?? []
      const papers = state?.papers ?? []
      const projects = state?.projects ?? []
      const today = new Date().toISOString().slice(0, 10)
      const doing = todos.filter((x) => x.status === 'doing')
      const waiting = todos.filter((x) => x.status === 'waiting')
      const dueToday = todos.filter((x) => x.status !== 'done' && x.due === today)
      const count = (s) => papers.filter((x) => x.status === s).length
      const stat = (n, label) => h('div', { className: 'rd-dash-stat' }, h('b', null, n), h('span', null, label))
      const row = (id, title, meta) => h('div', { key: id, className: 'rd-dash-row' }, h('span', { className: 'rd-dash-title' }, title), meta ? h('em', null, meta) : null)
      return h('main', { className: 'rd-dash', 'aria-label': t('dashboard') },
        h('div', { className: 'rd-dash-inner' },
          h('div', { className: 'rd-dash-head' },
            h('span', null, t('dashboard')),
            h('button', { type: 'button', title: t('cancel'), 'aria-label': t('cancel'), onClick: () => setDesk({ dashboardOpen: false }) }, '×')),
          h('div', { className: 'rd-dash-stats' },
            stat(doing.length, statusText('task', 'doing')),
            stat(waiting.length, statusText('task', 'waiting')),
            stat(dueToday.length, t('dueToday'))),
          doing.length ? h('div', { className: 'rd-dash-sec' }, h('h4', null, statusText('task', 'doing')), ...doing.map((x) => row(x.id, x.title, x.estimateMinutes ? `~${x.estimateMinutes}m` : null))) : null,
          waiting.length ? h('div', { className: 'rd-dash-sec' }, h('h4', null, statusText('task', 'waiting')), ...waiting.map((x) => row(x.id, x.title, x.blockedReason))) : null,
          h('div', { className: 'rd-dash-sec' }, h('h4', null, t('navPaper')), h('div', { className: 'rd-dash-stats' }, ...['inbox', 'reading', 'read', 'cited'].map((s) => stat(count(s), statusText('paper', s))))),
          projects.length ? h('div', { className: 'rd-dash-sec' }, h('h4', null, t('navProject')), ...projects.map((pr) => { const ms = pr.milestones ?? []; const done = ms.filter((m) => m.done).length; return row(pr.id, pr.name, `${done}/${ms.length}`) })) : null,
          h('div', { className: 'rd-dash-sec' }, h('h4', null, t('backups')), backups === null ? h('p', { className: 'rd-dash-empty' }, '…') : backups.length ? row(backups[0].id, relTime(backups[0].createdAt), (backups[0].sources ?? []).join('/')) : h('p', { className: 'rd-dash-empty' }, t('noBackups')))))
    }

    function Topbar() {
      const view = useSel((s) => s.view)
      const ready = useSel((s) => Boolean(s.state))
      const dockOpen = useSel((s) => s.dockOpen)
      const dashOpen = useSel((s) => s.dashboardOpen)
      const nav = [['todo', t('navTodo')], ['project', t('navProject')], ['paper', t('navPaper')], ['idea', t('navBrain')]]
      const dashActive = view === 'todo' && dashOpen
      return h('header', { className: 'rd-topbar' },
        h('nav', { className: 'rd-nav', 'aria-label': t('workbench') },
          h('button', { type: 'button', className: `rd-nav-dash ${dashActive ? 'is-on' : ''}`, 'aria-current': dashActive ? 'page' : undefined, onClick: () => setDesk({ view: 'todo', dashboardOpen: true }) },
            h(Icon, { name: 'gauge', size: 15 }), h('span', null, t('dashboard'))),
          h('span', { className: 'rd-nav-sep', 'aria-hidden': 'true' }),
          ...nav.map(([id, label]) => h('button', {
            key: id, type: 'button', className: view === id && !dashOpen ? 'is-on' : '', 'aria-current': view === id && !dashOpen ? 'page' : undefined,
            onClick: () => setDesk({ view: id, dashboardOpen: false, focusId: null }),
          }, label))),
        h('span', { style: { flex: 1 } }),
        ready ? h(ModelButton) : null,
        ready ? h(IconButton, { name: 'backup', label: t('backupSync'), onClick: () => setDesk({ backupOpen: true }) }) : null,
        h(IconButton, { name: 'chat', label: t('assistant'), onClick: () => { const next = !dockOpen; setDesk({ dockOpen: next }); saveSettings({ dockOpen: next }) } }))
    }

    function Desk() {
      const ready = useSel((s) => Boolean(s.state))
      const error = useSel((s) => s.error)
      const view = useSel((s) => s.view)
      const mode = useSel((s) => s.mode)
      const dockOpen = useSel((s) => s.dockOpen)
      const dashboardOpen = useSel((s) => s.dashboardOpen)
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
      const Active = error ? null : view === 'todo' ? null : (view === 'idea' || view === 'kb') ? BrainView : PlaceholderView
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
                  ? (dashboardOpen ? h(Dashboard) : h(TodoSplit))
                  : h(Active)),
        ready ? h(AssistantDock) : null,
        ready ? h(CaptureDialog) : null,
        ready ? h(ItemDialog) : null,
        ready ? h(ModelPicker) : null,
        ready ? h(BackupDialog) : null,
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
        ctxRef = ctx
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
