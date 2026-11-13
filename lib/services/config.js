import fs from 'node:fs/promises';
import path from 'node:path';
import { safePath, nonempty, atomicJson, exists, inside } from '../utils/path.js';
import { assertRemoteUrl } from '../utils/remote.js';
export const DEFAULTS = {git:{remote:'origin',branch:'main',autoInit:false,pullRebase:false,backupRemote:'',backupBranch:'backup',backupRepoDir:'.dsh-csrw/backup-repo'},nutstore:{baseUrl:'https://dav.jianguoyun.com/dav/',remoteRoot:'dsh-csrw',username:'',credentialKey:'dsh-csrw/nutstore',retry:2,retryDelay:1000},obsidian:{vaultPath:'',autoDetect:true,trashDir:'.trash',ideasDir:'ideas',notesDir:'kb'},zotero:{localApi:'http://127.0.0.1:23119/api',dataDir:''},backup:{target:'local',localDir:'.dsh-csrw/backups',includeDshSessions:false,dshHome:'',dshProfile:'',keep:10,mode:'full'}};
const FIELDS=Object.fromEntries(Object.entries(DEFAULTS).flatMap(([section,values])=>Object.entries(values).map(([key,value])=>[`${section}.${key}`,typeof value])));
export const sensitiveKey=key=>/password|passwd|secret|token|authorization|api.?key|credential(?!Key$)|cookie/i.test(key);

// 两层控制的边界（改代码前先读这段）：
// - enforced at use（真边界，改 config 也绕不过）：git remote scheme/凭据、DAV host 白名单、SECRET 内容扫描、各种 safePath 围栏。
// - advisory at write（人机确认，不是安全边界）：下面的 CREDENTIAL_SCOPED_KEYS / PATH_SCOPED_KEYS 与其 confirm。
//   config.json 是工作区里的普通文件，能写工作区文件的 agent 可以直接改它跳过 setConfig —— 所以写时确认的价值是
//   「防止人类误操作被静默放行」，不是「阻止恶意 agent」。
export const ALLOWED_DAV_HOSTS = new Set(['dav.jianguoyun.com', '127.0.0.1', 'localhost', '[::1]']);
export const CREDENTIAL_SCOPED_KEYS = new Set(['nutstore.baseUrl', 'nutstore.username', 'nutstore.credentialKey']);
export const PATH_SCOPED_KEYS = new Set(['backup.localDir', 'obsidian.vaultPath', 'zotero.dataDir', 'backup.dshHome', 'backup.dshProfile']);
export function assertDavHost(hostname) { if (!ALLOWED_DAV_HOSTS.has(hostname)) throw new Error(`WebDAV host is not allowlisted: ${hostname}`); }
// 只做结构性违规（host / scheme / 凭据内嵌）。路径是否在工作区外不算违规：vault/Zotero 库放别处是常态，常告警等于没告警。
const POLICY = [
 ['nutstore.baseUrl', value => assertDavHost(new URL(value).hostname)],
 ['git.backupRemote', value => { if (value) assertRemoteUrl(value, 'git.backupRemote'); }],
];
export function enforcePolicy(key, value) { for (const [name, check] of POLICY) if (name === key) check(value); }
/** 写时校验：结构校验 + 策略校验。load 期只走 validate()，不能走这里，否则存量配置会把配置读死。 */
export function validateForWrite(key, value) { validate(key, value); enforcePolicy(key, value); }
export function policyViolations(config) {
 const out = [];
 for (const [key, check] of POLICY) {
  const [section, field] = key.split('.');
  const value = config?.[section]?.[field];
  if (!value) continue;
  try { check(value); } catch (error) { out.push({ key, message: error.message }); }
 }
 return out;
}
function validate(key,value) {
 if(!Object.hasOwn(FIELDS,key)||sensitiveKey(key))throw new Error('Unsupported or sensitive config field');
 if(typeof value!==FIELDS[key])throw new Error(`Invalid type for ${key}`);
 if(typeof value==='string'&&value.includes('\0'))throw new Error('NUL is not allowed');
 if(key==='backup.target'&&!['local','nutstore'].includes(value))throw new Error('backup.target must be local or nutstore');
 if(key==='backup.mode'&&!['full','incremental'].includes(value))throw new Error('backup.mode must be full or incremental');
 if(['backup.keep','nutstore.retry','nutstore.retryDelay'].includes(key)&&(!Number.isInteger(value)||value<0))throw new Error(`${key} must be a non-negative integer`);
 if(['nutstore.baseUrl','zotero.localApi'].includes(key)) { const u=new URL(nonempty(value,key));if(u.username||u.password||u.search||u.hash)throw new Error('URL credentials/query/fragment are forbidden');if(key==='nutstore.baseUrl'&&u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw new Error('WebDAV requires HTTPS except loopback tests');if(key==='zotero.localApi'&&(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!['http:','https:'].includes(u.protocol)))throw new Error('Zotero API must be loopback'); }
 if(['git.remote','git.branch','git.backupBranch'].includes(key)&&(!value.trim()||value.startsWith('-')||/[\r\n\s]/.test(value)))throw new Error('Invalid git remote/branch');
 if(key==='git.backupRemote'&&value&&(/[\r\n\s]/.test(value)||value.startsWith('-')))throw new Error('Invalid git backupRemote');
 if(key==='nutstore.username'&&/[\r\n:]/.test(value))throw new Error('Invalid WebDAV username');
 if(['nutstore.remoteRoot','obsidian.trashDir','git.backupRepoDir'].includes(key)&&(path.isAbsolute(value)||value.split(/[\\/]/).some(p=>p==='..')||!value.trim()||value.includes(':')))throw new Error('Relative child path required');
}
export async function configPath(workspace) { nonempty(workspace,'workspace');if(!path.isAbsolute(workspace))throw new Error('workspace must be absolute');return safePath(workspace,'.dsh-csrw/config.json'); }
export const LEGACY_CONFIG='.csrw/config.json';
export async function legacyConfigPath(workspace) { nonempty(workspace,'workspace');if(!path.isAbsolute(workspace))throw new Error('workspace must be absolute');return safePath(workspace,LEGACY_CONFIG); }
// legacy 迁移前的结构检查：只挡「会让配置永久读不出来」的内容（未知 section、类型错误、敏感字段名、非法 URL 形态）。
// 不通过就不写新文件、legacy 原样保留，随后 :32 的 validate 仍照常 fail-loud。
// 注意它挡不住「绝对路径类值被迁移固化」——那些值在 validate 下本来就合法，属 advisory 层，不在本修复范围。
function shapeValid(raw) {
 try {
  for (const [section, values] of Object.entries(raw)) {
   if (!Object.hasOwn(DEFAULTS, section) || !values || typeof values !== 'object' || Array.isArray(values)) return false;
   for (const [key, value] of Object.entries(values)) validate(`${section}.${key}`, value);
  }
  return true;
 } catch { return false; }
}
export async function loadConfig(workspace,signal) {
 signal?.throwIfAborted(); const file=await configPath(workspace);let raw={};
 try{raw=JSON.parse(await fs.readFile(file,{encoding:'utf8',signal}));}catch(e){if(e.code!=='ENOENT')throw e;
  // 旧版目录 .csrw/ 兼容：读到后尽力复制到新路径，原文件不删
  try{raw=JSON.parse(await fs.readFile(await legacyConfigPath(workspace),{encoding:'utf8',signal}));}catch(e2){if(e2.code!=='ENOENT')throw e2;}
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).length&&shapeValid(raw)){try{await atomicJson(file,raw,signal);}catch{}}
 }
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Config must be an object');
 const config=structuredClone(DEFAULTS);
 for(const [section,values]of Object.entries(raw)) {if(!Object.hasOwn(DEFAULTS,section)||!values||typeof values!=='object'||Array.isArray(values))throw new Error('Unknown config section');for(const [key,value]of Object.entries(values)){validate(`${section}.${key}`,value);config[section][key]=value;}}
 return config;
}
export function redact(config) {return Object.fromEntries(Object.entries(config).map(([k,v])=>[k,sensitiveKey(k)?'[REDACTED]':v&&typeof v==='object'?redact(v):v]));}
export async function setConfig(workspace,key,value,signal,{confirm=false}={}) {
 nonempty(key,'key');
 // 写时才做策略校验（load 期只走 validate）：否则存量 file:// remote 之类会让配置直接读不出来，用户无法自救。
 validateForWrite(key,value);
 const config=await loadConfig(workspace,signal);const [a,b]=key.split('.');
 const previous=config[a]?.[b];
 // scopeChanged = 这次写入改变了「凭据发往哪里」或「数据读写到哪里」。要求一次显式确认（advisory 层，非安全边界）。
 // 凭据类：值变化即算；路径类：解析后落在工作区外才算（工作区内的相对路径是常态，不该每次都要确认）。
 let scopeChanged=false, reason='';
 // baseUrl 换成回环地址不改变凭据外发面（数据仍在本机），因此不算作用域变化；换成其它主机才算。
 const loopbackDav=key==='nutstore.baseUrl'&&(()=>{try{return ['127.0.0.1','localhost','[::1]'].includes(new URL(String(value)).hostname);}catch{return false;}})();
 if(CREDENTIAL_SCOPED_KEYS.has(key)&&previous!==value&&!loopbackDav){scopeChanged=true;reason='changes the credential scope';}
 else if(PATH_SCOPED_KEYS.has(key)&&!inside(workspace,path.resolve(workspace,String(value)))){scopeChanged=true;reason='points outside the workspace';}
 if(scopeChanged&&confirm!==true)throw new Error(`${key} ${reason}; rerun with confirm:true`);
 config[a][b]=value;await atomicJson(await configPath(workspace),config,signal);
 return {key,value:redact({[b]:value})[b],saved:true,scopeChanged};
}
export async function detectVault(workspace,config,signal) {
 signal?.throwIfAborted();if(config.obsidian.vaultPath){const root=path.resolve(workspace,config.obsidian.vaultPath);await safePath(root,'',{allowRoot:true});if(!(await fs.stat(root)).isDirectory())throw new Error('Vault is not a directory');return root;}
 if(!config.obsidian.autoDetect)throw new Error('Configure obsidian.vaultPath');
 const candidates=[];
 if(await exists(path.join(workspace,'.obsidian')))candidates.push(workspace);
 for(const ent of await fs.readdir(workspace,{withFileTypes:true})) {signal?.throwIfAborted();if(ent.isDirectory()&&!ent.isSymbolicLink()&&await exists(path.join(workspace,ent.name,'.obsidian')))candidates.push(await safePath(workspace,ent.name));}
 if(candidates.length!==1)throw new Error(`Vault auto-detection found ${candidates.length} candidates; configure obsidian.vaultPath`);return candidates[0];
}
