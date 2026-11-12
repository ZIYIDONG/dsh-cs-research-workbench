import { registerUiCommand } from './ui-command.js';
import { registerDesk } from './desk/host.js';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { tool, register, workspaceOf, outputObject } from './tools/common.js';
import { configTools } from './tools/config.js';
import { obsidianTools } from './tools/obsidian.js';
import { gitTools } from './tools/git.js';
import { zoteroTools } from './tools/zotero.js';
import { nutstoreTools } from './tools/nutstore.js';
import { backupTools } from './tools/backup.js';
import { paperTools } from './tools/paper.js';
export const name='dsh-csrw';
export const inject=['tools'];
export const VERSION='0.1.0';
export const MODULES={config:'ready',obsidian:'ready',git:'ready',zotero:'ready',nutstore:'ready',backup:'ready'};
export function definitions(ctx) {return [tool('dsh_csrw_health','检查科研工作台版本、配置存在性和模块实现状态；ready 表示代码已实现，不代表外部服务已连接。',{},async(a,e)=>{const w=await workspaceOf(ctx,a,e);let configExists=false;for(const rel of ['.dsh-csrw/config.json','.csrw/config.json']){try{await access(path.join(w,...rel.split('/')));configExists=true;break;}catch(err){if(err.code!=='ENOENT')throw err;}}return {version:VERSION,configExists,modules:MODULES};},outputObject({version:{type:'string',required:true},configExists:{type:'boolean',required:true},modules:{type:'json',required:true}})),...configTools(ctx),...obsidianTools(ctx),...gitTools(ctx),...zoteroTools(ctx),...nutstoreTools(ctx),...backupTools(ctx),...paperTools(ctx)];}
export function apply(ctx){const all=definitions(ctx);register(ctx,all);registerUiCommand(ctx,all);registerDesk(ctx);}
