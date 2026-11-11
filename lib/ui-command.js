import path from 'node:path';
const READ = new Set(['csrw_health','csrw_config_show','csrw_git_status','csrw_nutstore_test','csrw_nutstore_list','csrw_zotero_search','csrw_snapshot_verify']);
const WRITE = new Set(['csrw_config_set','csrw_nutstore_push','csrw_nutstore_pull','csrw_backup_obsidian','csrw_backup_zotero','csrw_backup_dsh']);
export function registerUiCommand(ctx, definitions) {
 const commands=ctx.get('commands');
 if(!commands)return;
 const byName=new Map(definitions.map(d=>[d.name,d]));
 ctx.effect(()=>commands.register({name:'csrw-ui',description:'科研工作台界面调用：复用工作区配置、检测、同步和备份工具。',input:{hint:'JSON request; no credentials'},recordInput:false,
  async handler({rawInput,agent,signal}) {
   try {
    if(rawInput.length>20000)throw new Error('Request too large');
    const request=JSON.parse(rawInput);
    if(!request||Array.isArray(request)||typeof request!=='object')throw new Error('Invalid request');
    const {operation,args={},confirmed}=request;
    if(!READ.has(operation)&&!WRITE.has(operation))throw new Error('Operation is not exposed by the workbench');
    if(!args||Array.isArray(args)||typeof args!=='object')throw new Error('Invalid arguments');
    if(typeof args.workspace!=='string'||!path.isAbsolute(args.workspace))throw new Error('Select an absolute workspace directory');
    if(WRITE.has(operation)&&confirmed!==true)throw new Error('Explicit user confirmation is required');
    const result=await byName.get(operation).execute(args,{agent,signal});
    return {kind:'success',text:JSON.stringify(result)};
   }catch(error){return {kind:'error',text:error.message};}
  }
 }));
}
