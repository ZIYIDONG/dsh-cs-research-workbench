import fs from 'node:fs/promises';
import path from 'node:path';
import { safePath, nonempty, atomicJson, exists } from '../utils/path.js';
export const DEFAULTS = {git:{remote:'origin',branch:'main',autoInit:false,pullRebase:false,backupRemote:'',backupBranch:'backup',backupRepoDir:'.dsh-csrw/backup-repo'},nutstore:{baseUrl:'https://dav.jianguoyun.com/dav/',remoteRoot:'dsh-csrw',username:'',credentialKey:'dsh-csrw/nutstore'},obsidian:{vaultPath:'',autoDetect:true,trashDir:'.trash',ideasDir:'ideas',notesDir:'kb'},zotero:{localApi:'http://127.0.0.1:23119/api',dataDir:''},backup:{target:'local',localDir:'.dsh-csrw/backups',includeDshSessions:false,dshHome:'',dshProfile:''}};
const FIELDS=Object.fromEntries(Object.entries(DEFAULTS).flatMap(([section,values])=>Object.entries(values).map(([key,value])=>[`${section}.${key}`,typeof value])));
export const sensitiveKey=key=>/password|passwd|secret|token|authorization|api.?key|credential(?!Key$)|cookie/i.test(key);
function validate(key,value) {
 if(!Object.hasOwn(FIELDS,key)||sensitiveKey(key))throw new Error('Unsupported or sensitive config field');
 if(typeof value!==FIELDS[key])throw new Error(`Invalid type for ${key}`);
 if(typeof value==='string'&&value.includes('\0'))throw new Error('NUL is not allowed');
 if(key==='backup.target'&&!['local','nutstore'].includes(value))throw new Error('backup.target must be local or nutstore');
 if(['nutstore.baseUrl','zotero.localApi'].includes(key)) { const u=new URL(nonempty(value,key));if(u.username||u.password||u.search||u.hash)throw new Error('URL credentials/query/fragment are forbidden');if(key==='nutstore.baseUrl'&&u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw new Error('WebDAV requires HTTPS except loopback tests');if(key==='zotero.localApi'&&(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!['http:','https:'].includes(u.protocol)))throw new Error('Zotero API must be loopback'); }
 if(['git.remote','git.branch','git.backupBranch'].includes(key)&&(!value.trim()||value.startsWith('-')||/[\r\n\s]/.test(value)))throw new Error('Invalid git remote/branch');
 if(key==='git.backupRemote'&&value&&(/[\r\n\s]/.test(value)||value.startsWith('-')))throw new Error('Invalid git backupRemote');
 if(key==='nutstore.username'&&/[\r\n:]/.test(value))throw new Error('Invalid WebDAV username');
 if(['nutstore.remoteRoot','obsidian.trashDir','git.backupRepoDir'].includes(key)&&(path.isAbsolute(value)||value.split(/[\\/]/).some(p=>p==='..')||!value.trim()||value.includes(':')))throw new Error('Relative child path required');
}
export async function configPath(workspace) { nonempty(workspace,'workspace');if(!path.isAbsolute(workspace))throw new Error('workspace must be absolute');return safePath(workspace,'.dsh-csrw/config.json'); }
export const LEGACY_CONFIG='.csrw/config.json';
export async function legacyConfigPath(workspace) { nonempty(workspace,'workspace');if(!path.isAbsolute(workspace))throw new Error('workspace must be absolute');return safePath(workspace,LEGACY_CONFIG); }
export async function loadConfig(workspace,signal) {
 signal?.throwIfAborted(); const file=await configPath(workspace);let raw={};
 try{raw=JSON.parse(await fs.readFile(file,{encoding:'utf8',signal}));}catch(e){if(e.code!=='ENOENT')throw e;
  // 旧版目录 .csrw/ 兼容：读到后尽力复制到新路径，原文件不删
  try{raw=JSON.parse(await fs.readFile(await legacyConfigPath(workspace),{encoding:'utf8',signal}));}catch(e2){if(e2.code!=='ENOENT')throw e2;}
  if(raw&&typeof raw==='object'&&Object.keys(raw).length){try{await atomicJson(file,raw,signal);}catch{}}
 }
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Config must be an object');
 const config=structuredClone(DEFAULTS);
 for(const [section,values]of Object.entries(raw)) {if(!Object.hasOwn(DEFAULTS,section)||!values||typeof values!=='object'||Array.isArray(values))throw new Error('Unknown config section');for(const [key,value]of Object.entries(values)){validate(`${section}.${key}`,value);config[section][key]=value;}}
 return config;
}
export function redact(config) {return Object.fromEntries(Object.entries(config).map(([k,v])=>[k,sensitiveKey(k)?'[REDACTED]':v&&typeof v==='object'?redact(v):v]));}
export async function setConfig(workspace,key,value,signal) {nonempty(key,'key');validate(key,value);const config=await loadConfig(workspace,signal);const [a,b]=key.split('.');config[a][b]=value;await atomicJson(await configPath(workspace),config,signal);return {key,value:redact({[b]:value})[b],saved:true};}
export async function detectVault(workspace,config,signal) {
 signal?.throwIfAborted();if(config.obsidian.vaultPath){const root=path.resolve(workspace,config.obsidian.vaultPath);await safePath(root,'',{allowRoot:true});if(!(await fs.stat(root)).isDirectory())throw new Error('Vault is not a directory');return root;}
 if(!config.obsidian.autoDetect)throw new Error('Configure obsidian.vaultPath');
 const candidates=[];
 if(await exists(path.join(workspace,'.obsidian')))candidates.push(workspace);
 for(const ent of await fs.readdir(workspace,{withFileTypes:true})) {signal?.throwIfAborted();if(ent.isDirectory()&&!ent.isSymbolicLink()&&await exists(path.join(workspace,ent.name,'.obsidian')))candidates.push(await safePath(workspace,ent.name));}
 if(candidates.length!==1)throw new Error(`Vault auto-detection found ${candidates.length} candidates; configure obsidian.vaultPath`);return candidates[0];
}
