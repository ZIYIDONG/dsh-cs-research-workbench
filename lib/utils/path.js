import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export function nonempty(value,label='value') { if(typeof value!=='string'||!value.trim()||value.includes('\0')) throw new Error(`${label} must be a nonempty string`); return value; }
export function inside(root,target) { const r=path.relative(root,target); return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r)); }
export async function safePath(root,relative='',{allowRoot=false}={}) {
  root=path.resolve(nonempty(root,'root'));
  if(typeof relative!=='string'||relative.includes('\0')||/^[a-z]:/i.test(relative)||relative.includes(':')||relative.split(/[\\/]/).some(p=>p==='..')) throw new Error('Path traversal or invalid path refused');
  const target=path.resolve(root,relative);
  if(!inside(root,target)||(!allowRoot&&target===root)) throw new Error('Path escapes root or targets root itself');
  const parsed=path.parse(target); let current=parsed.root;
  for(const part of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,part);
    try {
      const stat=await fs.lstat(current);
      if(stat.isSymbolicLink())throw new Error('Symbolic links/junctions are not allowed');
      const real=await fs.realpath(current);
      const comparable=p=>process.platform==='win32'?p.toLowerCase():p;
      if(comparable(path.resolve(real))!==comparable(path.resolve(current)))throw new Error('Symbolic links/junctions are not allowed');
    } catch(e) { if(e.code==='ENOENT') break; throw e; }
  }
  return target;
}
export async function exists(file) { try{await fs.lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;} }
export async function walk(root,{signal,exclude=()=>false,maxFiles=100000}={}) {
  const out=[]; root=await safePath(root,'',{allowRoot:true});
  async function scan(dir,prefix='') {
    signal?.throwIfAborted();
    for(const ent of await fs.readdir(dir,{withFileTypes:true})) {
      signal?.throwIfAborted();const rel=prefix?`${prefix}/${ent.name}`:ent.name;if(exclude(rel,ent))continue;
      const full=await safePath(root,rel); if(ent.isSymbolicLink())throw new Error('Symbolic links are not allowed');
      if(ent.isDirectory())await scan(full,rel);else if(ent.isFile()){out.push({relative:rel,path:full});if(out.length>maxFiles)throw new Error('File limit exceeded');}
    }
  }
  await scan(root);return out;
}
export async function atomicJson(file,value,signal) {
  signal?.throwIfAborted();await safePath(path.dirname(file),path.basename(file));await fs.mkdir(path.dirname(file),{recursive:true});
  const temp=`${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600,signal});
  signal?.throwIfAborted();await fs.rename(temp,file);
}
