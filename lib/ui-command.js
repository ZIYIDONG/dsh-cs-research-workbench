import path from 'node:path';
const READ = new Set(['dsh_csrw_health','dsh_csrw_config_show','dsh_csrw_git_status','dsh_csrw_nutstore_test','dsh_csrw_nutstore_list','dsh_csrw_nutstore_logs','dsh_csrw_zotero_search','dsh_csrw_snapshot_verify','dsh_csrw_obsidian_links','dsh_csrw_obsidian_backlinks','dsh_csrw_obsidian_list','dsh_csrw_obsidian_broken_links','dsh_csrw_obsidian_graph','dsh_csrw_obsidian_bookmarks','dsh_csrw_obsidian_canvas']);
const WRITE = new Set(['dsh_csrw_config_set','dsh_csrw_nutstore_push','dsh_csrw_nutstore_pull','dsh_csrw_backup_obsidian','dsh_csrw_backup_zotero','dsh_csrw_backup_dsh','dsh_csrw_backup_workspace','dsh_csrw_backup_upload','dsh_csrw_backup_github','dsh_csrw_backup_all','dsh_csrw_snapshot_prune','dsh_csrw_nutstore_delete','dsh_csrw_obsidian_template','dsh_csrw_obsidian_daily','dsh_csrw_obsidian_attach','dsh_csrw_obsidian_rename','dsh_csrw_paper_to_note']);
// 信封 confirmed 只能表达「用户批准了这份 payload」。门若依赖 payload 之外的信息（解析后的绝对路径、config 里的
// remote、凭据作用域 old→new），必须由 args 显式表达，不能用信封代偿 —— 否则确认面板上永远不会出现那个真实后果。
// ENVELOPE_CONFIRMABLE：门语义完全在 payload 内（删除这份 remotePath / 清理这个 keep 数）→ 信封可等价为 confirm。
// EXTERNAL_PATH_ARGS：越界门只在该路径键**确实出现在 payload 里**时才存在（省略时路径来自 config，不在 payload 内）。
const ENVELOPE_CONFIRMABLE=new Set(['dsh_csrw_nutstore_delete','dsh_csrw_snapshot_prune']);
const EXTERNAL_PATH_ARGS={dsh_csrw_nutstore_push:'localPath',dsh_csrw_nutstore_pull:'localPath',dsh_csrw_backup_upload:'localPath',dsh_csrw_snapshot_prune:'backupDir'};
const PREFIX='dsh_csrw_';
const USAGE='用法：/dsh-csrw <模块> [操作] [--workspace <目录>] [--key K --value V] [--remote-path P] [--local-path P] [--snapshot-path P] [--query Q] [--limit N] [--confirm]；也接受整行 JSON。需要 args.confirm / confirmExternalPath 的操作（如 config set 改凭据作用域或数据位置类字段）请用 JSON，例如 {"operation":"dsh_csrw_config_set","args":{"workspace":"/abs/dir","key":"backup.localDir","value":"D:/backups","confirm":true},"confirmed":true}。';
function tokenize(raw){const out=[];let cur='';let quote=null;for(let i=0;i<raw.length;i++){const ch=raw[i];if(quote){if(ch===quote)quote=null;else cur+=ch;}else if(ch==='"'||ch==="'")quote=ch;else if(/\s/.test(ch)){if(cur){out.push(cur);cur='';}}else cur+=ch;}if(cur)out.push(cur);return out;}
function coerce(value){if(value==='true')return true;if(value==='false')return false;if(/^-?\d+$/.test(value))return Number(value);return value;}
export function registerUiCommand(ctx, definitions) {
 const byName=new Map(definitions.map(d=>[d.name,d]));
 const run=async(request,exec)=>{
  let {operation,args={},confirmed}=request;
  if(!READ.has(operation)&&!WRITE.has(operation))throw new Error('Operation is not exposed by the workbench');
  if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Invalid arguments');
  if(typeof args.workspace!=='string'||!path.isAbsolute(args.workspace))throw new Error('Select an absolute workspace directory');
  if(WRITE.has(operation)&&confirmed!==true)throw new Error('Explicit user confirmation is required');
  if(WRITE.has(operation)&&confirmed===true){
   // 用 in 判断而不是比较值：显式传 confirm:false 时必须保持 false（fail-closed），不被信封覆盖。
   if(ENVELOPE_CONFIRMABLE.has(operation)&&!('confirm' in args))args={...args,confirm:true};
   const pathKey=EXTERNAL_PATH_ARGS[operation];
   if(pathKey&&typeof args[pathKey]==='string'&&args[pathKey].trim()&&!('confirmExternalPath' in args))args={...args,confirmExternalPath:true};
  }
  return byName.get(operation).execute(args,exec);
 };
 const parseJson=text=>{const request=JSON.parse(text);if(!request||Array.isArray(request)||typeof request!=='object')throw new Error('Invalid request');return request;};
 const parseCli=raw=>{
  const tokens=tokenize(raw);const words=[];const args={};let confirmed=false;
  for(let i=0;i<tokens.length;i++){
   const token=tokens[i];
   if(token==='--confirm'||token==='-y'){confirmed=true;continue;}
   if(token==='--workspace'||token==='-w'){args.workspace=tokens[++i];continue;}
   if(token.startsWith('--')){
    const name=token.slice(2).replace(/-([a-z])/g,(_m,c)=>c.toUpperCase());
    const value=tokens[++i];
    if(value===undefined)throw new Error(`--${token.slice(2)} needs a value`);
    if(name==='sources')args.sources=value.split(',').map(v=>v.trim()).filter(Boolean);
    else args[name]=coerce(value);
    continue;
   }
   if(token.startsWith('-'))throw new Error(`Unknown option: ${token}`);
   words.push(token);
  }
  if(!words.length)throw new Error(USAGE);
  const direct=PREFIX+words[0];
  const operation=byName.has(direct)?direct:PREFIX+words.slice(0,2).join('_');
  return {operation,args,confirmed};
 };
 const mount=commands=>ctx.effect(()=>commands.register({name:'dsh-csrw',description:'科研工作台命令：界面用的 JSON 通道，也可直接按 dsh-csrw <模块> <操作> 手敲。',input:{hint:'JSON request, or <module> <operation> --workspace <dir> [--flag value] [--confirm]'},recordInput:false,
  async handler({rawInput,agent,signal}) {
   try {
    if(rawInput.length>20000)throw new Error('Request too large');
    const text=rawInput.trim();
    if(!text)throw new Error(USAGE);
    if(text==='help'||text==='--help'){
     const lines=[...byName.keys()].map(name=>`${name.slice(PREFIX.length).replace(/_/g,' ')}${WRITE.has(name)?' (需要 --confirm)':''}`);
     return {kind:'success',text:USAGE+'\n'+lines.join('\n')};
    }
    const request=text.startsWith('{')?parseJson(text):parseCli(text);
    const result=await run(request,{agent,signal});
    return {kind:'success',text:JSON.stringify(result)};
   }catch(error){
   // text 保持不变（CLI 与既有消费者不依赖新字段）；机器可读标记按有值才带，避免普通错误带上无关字段。
   const payload={kind:'error',text:error.message};
   if(error.code)payload.code=error.code;
   if(error.path)payload.path=error.path;
   if(Array.isArray(error.violations))payload.violations=error.violations;
   return payload;
  }
  }
 }));
 // commands 可能晚于本插件 apply 就绪：条件注入等待服务，避免一次性 ctx.get 永久错过。
 if(typeof ctx.inject==='function'){ctx.inject(['commands'],mount);return;}
 const commands=ctx.get('commands');
 if(commands)mount(commands);
}
