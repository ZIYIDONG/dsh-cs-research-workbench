import { tool,s,workspaceOf,outputObject } from './common.js';
import { loadConfig,redact,setConfig } from '../services/config.js';
export function configTools(ctx){return [
 tool('csrw_config_show','查看科研工作台配置及默认值，敏感字段脱敏；不读取或返回凭据。',{},async(a,e)=>({config:redact(await loadConfig(await workspaceOf(ctx,a,e),e.signal))}),outputObject({config:{type:'json',required:true}})),
 tool('csrw_config_set','设置一个允许的非敏感配置字段；拒绝密码、令牌和未知字段，不设置凭据。',{key:s('点分字段名，例如 obsidian.vaultPath。'),value:{oneOf:[{type:'string'},{type:'boolean'}],required:true,description:'字符串或布尔值，类型必须匹配字段。'}},async(a,e)=>setConfig(await workspaceOf(ctx,a,e),a.key,a.value,e.signal),outputObject({key:{type:'string',required:true},value:{type:'json',required:true},saved:{type:'boolean',required:true}}))
 ];}
