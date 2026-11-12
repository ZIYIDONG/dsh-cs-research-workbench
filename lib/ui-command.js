import path from 'node:path';
const READ = new Set(['dsh_csrw_health','dsh_csrw_config_show','dsh_csrw_git_status','dsh_csrw_nutstore_test','dsh_csrw_nutstore_list','dsh_csrw_zotero_search','dsh_csrw_snapshot_verify']);
const WRITE = new Set(['dsh_csrw_config_set','dsh_csrw_nutstore_push','dsh_csrw_nutstore_pull','dsh_csrw_backup_obsidian','dsh_csrw_backup_zotero','dsh_csrw_backup_dsh']);
const PREFIX='dsh_csrw_';
const USAGE='用法：/dsh-csrw <模块> [操作] [--workspace <目录>] [--key K --value V] [--remote-path P] [--local-path P] [--snapshot-path P] [--query Q] [--limit N] [--confirm]；也接受整行 JSON。';
function tokenize(raw){const out=[];let cur='';let quote=null;for(let i=0;i<raw.length;i++){const ch=raw[i];if(quote){if(ch===quote)quote=null;else cur+=ch;}else if(ch==='"'||ch==="'")quote=ch;else if(/\s/.test(ch)){if(cur){out.push(cur);cur='';}}else cur+=ch;}if(cur)out.push(cur);return out;}
function coerce(value){if(value==='true')return true;if(value==='false')return false;if(/^-?\d+$/.test(value))return Number(value);return value;}
export function registerUiCommand(ctx, definitions) {
 const commands=ctx.get('commands');
 if(!commands)return;
 const byName=new Map(definitions.map(d=>[d.name,d]));
 const run=async(request,exec)=>{
  const {operation,args={},confirmed}=request;
  if(!READ.has(operation)&&!WRITE.has(operation))throw new Error('Operation is not exposed by the workbench');
  if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Invalid arguments');
  if(typeof args.workspace!=='string'||!path.isAbsolute(args.workspace))throw new Error('Select an absolute workspace directory');
  if(WRITE.has(operation)&&confirmed!==true)throw new Error('Explicit user confirmation is required');
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
 ctx.effect(()=>commands.register({name:'dsh-csrw',description:'科研工作台命令：界面用的 JSON 通道，也可直接按 dsh-csrw <模块> <操作> 手敲。',input:{hint:'JSON request, or <module> <operation> --workspace <dir> [--flag value] [--confirm]'},recordInput:false,
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
   }catch(error){return {kind:'error',text:error.message};}
  }
 }));
}
