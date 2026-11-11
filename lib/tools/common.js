import { defineTool } from '@deepseek-ai/dsh-tools';
import path from 'node:path';
import { nonempty } from '../utils/path.js';
export const workspaceParameter={type:'string',description:'工作区绝对路径；省略时使用当前会话目录。'};
export const s=(description,required=true)=>({type:'string',description,...(required?{required:true}:{})});
export const b=(description,required=false)=>({type:'boolean',description,...(required?{required:true}:{})});
export const outputObject=properties=>({type:'object',additionalProperties:false,properties});
export const jsonOutput={type:'object',additionalProperties:true,properties:{}};
export function tool(name,description,parameters,execute,schema=jsonOutput) {return defineTool({name,description,parameters:{workspace:workspaceParameter,...parameters},output:{schema,render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},isConcurrencySafe:()=>false,async execute(args,exec){exec.signal.throwIfAborted();const result=await execute(args,exec);exec.signal.throwIfAborted();return result;}});}
export async function workspaceOf(ctx,args,exec) { const cwd=args.workspace??(exec.agent&&await ctx.get('workingDirectory')?.ensure(exec.agent,exec.signal))??process.cwd();nonempty(cwd,'workspace');if(!path.isAbsolute(cwd))throw new Error('workspace must be absolute');return path.resolve(cwd); }
export function register(ctx,definitions){for(const definition of definitions)ctx.effect(()=>ctx.tools.register(definition));}
