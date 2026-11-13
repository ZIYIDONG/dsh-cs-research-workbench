import { tool,s,b,workspaceOf,outputObject } from './common.js';
import { loadConfig,redact,setConfig,policyViolations } from '../services/config.js';
export function configTools(ctx){return [
 tool('dsh_csrw_config_show','查看科研工作台配置及默认值，敏感字段脱敏；不读取或返回凭据。',{},async(a,e)=>{const workspace=await workspaceOf(ctx,a,e);const config=await loadConfig(workspace,e.signal);return {config:redact(config),policyViolations:policyViolations(config)};},outputObject({config:{type:'json',required:true},policyViolations:{type:'json',required:true}})),
 tool('dsh_csrw_config_set','设置一个允许的非敏感配置字段；拒绝密码、令牌和未知字段，不设置凭据。',{key:s('点分字段名，例如 obsidian.vaultPath。'),value:{oneOf:[{type:'string'},{type:'boolean'}],required:true,description:'字符串或布尔值，类型必须匹配字段。'},confirm:b('修改凭据作用域或数据位置类字段（nutstore.baseUrl/username/credentialKey、backup.localDir、obsidian.vaultPath、zotero.dataDir、backup.dshHome/dshProfile）时需显式 true。',false)},async(a,e)=>setConfig(await workspaceOf(ctx,a,e),a.key,a.value,e.signal,{confirm:a.confirm===true}),outputObject({key:{type:'string',required:true},value:{type:'json',required:true},saved:{type:'boolean',required:true},scopeChanged:{type:'boolean',required:true}}))
 ];}
