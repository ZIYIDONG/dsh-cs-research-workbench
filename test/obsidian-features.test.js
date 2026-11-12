import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {obsidianTools} from '../lib/tools/obsidian.js';
const base=path.resolve('.test-artifacts');await fs.mkdir(base,{recursive:true});

async function makeVault(prefix){
  const w=await fs.mkdtemp(path.join(base,prefix));
  await fs.mkdir(path.join(w,'.obsidian'));
  const definitions=Object.fromEntries(obsidianTools({get:()=>undefined}).map(d=>[d.name,d]));
  const run=(name,args)=>definitions['dsh_csrw_obsidian_'+name].execute({workspace:w,...args},{signal:new AbortController().signal});
  return {w,run};
}

test('links resolve targets via path, basename and alias with disambiguation',async()=>{
  const {run}=await makeVault('feat-links-');
  await run('write',{path:'a.md',text:'See [[b]], [[Sub/C]] and [[Alpha]].'});
  await run('write',{path:'b.md',text:'B'});
  await run('write',{path:'Sub/C.md',text:'C'});
  await run('write',{path:'aliased.md',text:'---\naliases: [Alpha]\n---\nbody'});
  const links=await run('links',{path:'a.md'});
  assert.equal(links.links.length,3);
  const find=t=>links.links.find(l=>l.target===t);
  assert.equal(find('b').resolved,'b.md');
  assert.equal(find('Sub/C').resolved,'Sub/C.md');
  assert.equal(find('Alpha').resolved,'aliased.md');
  assert.equal(find('Alpha').via,'alias');
});

test('backlinks aggregates forward links including aliases and reports unlinked mentions',async()=>{
  const {run}=await makeVault('feat-back-');
  await run('write',{path:'a.md',text:'---\naliases: [Alpha]\n---\nroot'});
  await run('write',{path:'b.md',text:'Link to [[a|page]]'});
  await run('write',{path:'Sub/C.md',text:'Link to [[Alpha]]'});
  await run('write',{path:'d.md',text:'Alpha appears here unlinked'});
  const bl=await run('backlinks',{path:'a.md'});
  assert.deepEqual(bl.backlinks.map(x=>x.from).sort(),['Sub/C.md','b.md']);
  assert.ok(bl.unlinked.some(u=>u.from==='d.md'&&u.name==='Alpha'));
});

test('rename rewrites forward links across the vault but leaves aliases intact',async()=>{
  const {w,run}=await makeVault('feat-rename-');
  await run('write',{path:'a.md',text:'See [[b]] and [[b|bee]].'});
  await run('write',{path:'b.md',text:'B content'});
  const r=await run('rename',{path:'b.md',destination:'renamed.md'});
  assert.equal(r.linksRewritten,2);
  assert.deepEqual(r.rewrittenFiles,['a.md']);
  const text=(await run('read',{path:'a.md'})).text;
  assert.match(text,/\[\[renamed\]\]/);
  assert.match(text,/\[\[renamed\|bee\]\]/);
  assert.equal((await run('read',{path:'renamed.md'})).text,'B content');
});

test('broken_links reports dead targets and ambiguous duplicates',async()=>{
  const {run}=await makeVault('feat-broken-');
  await run('write',{path:'a.md',text:'See [[missing]] and [[dup]].'});
  await run('write',{path:'x/dup.md',text:'one'});
  await run('write',{path:'y/dup.md',text:'two'});
  const r=await run('broken_links',{});
  assert.equal(r.broken.length,1);
  assert.equal(r.broken[0].target,'missing');
  assert.equal(r.ambiguous.length,1);
  assert.equal(r.ambiguous[0].target,'dup');
  assert.deepEqual(r.ambiguous[0].candidates.sort(),['x/dup.md','y/dup.md']);
});

test('search filters by tag, scope and property',async()=>{
  const {run}=await makeVault('feat-search-');
  await run('write',{path:'a.md',text:'---\ntags: [ml]\nstatus: reading\n---\nneural network'});
  await run('write',{path:'b.md',text:'---\ntags: [systems]\n---\noperating system'});
  await run('write',{path:'sub/c.md',text:'---\ntags: [ml]\n---\ndeep learning'});
  const byTag=await run('search',{tag:'ml'});
  assert.deepEqual(byTag.matches.map(m=>m.path).sort(),['a.md','sub/c.md']);
  const byScope=await run('search',{query:'network',scope:'sub'});
  assert.equal(byScope.matches.length,0);
  const byProp=await run('search',{property:'status=reading'});
  assert.equal(byProp.matches.length,1);
  assert.equal(byProp.matches[0].path,'a.md');
});

test('list enumerates markdown with optional content',async()=>{
  const {run}=await makeVault('feat-list-');
  await run('write',{path:'a.md',text:'A'});
  await run('write',{path:'sub/b.md',text:'B'});
  const all=await run('list',{});
  assert.deepEqual(all.files.map(f=>f.path).sort(),['a.md','sub/b.md']);
  const scoped=await run('list',{scope:'sub',readContent:true});
  assert.equal(scoped.files.length,1);
  assert.equal(scoped.files[0].text,'B');
});

test('template renders built-in and custom variables, writes destination',async()=>{
  const {run}=await makeVault('feat-tpl-');
  await run('write',{path:'tpl.md',text:'# {{title}}\nDate: {{date}}\nTag: {{tag}}'});
  const r=await run('template',{template:'tpl.md',variables:{title:'Hello',tag:'x'},destination:'out.md'});
  assert.equal(r.destination,'out.md');
  assert.match(r.text,/# Hello/);
  assert.match(r.text,/Date: \d{4}-\d{2}-\d{2}/);
  assert.match(r.text,/Tag: x/);
  await assert.rejects(run('template',{template:'tpl.md',variables:{},destination:'out.md'}),/overwrite/);
});

test('daily note creates and reuses dated file',async()=>{
  const {run}=await makeVault('feat-daily-');
  const r=await run('daily',{date:'2026-11-12'});
  assert.equal(r.created,true);
  assert.equal(r.path,'2026-11-12.md');
  assert.match(r.text,/# 2026-11-12/);
  const again=await run('daily',{date:'2026-11-12'});
  assert.equal(again.created,false);
});

test('attach copies an external file into the vault',async()=>{
  const {w,run}=await makeVault('feat-attach-');
  const src=path.join(base,'attach-src.png');
  await fs.writeFile(src,'fake-image');
  const r=await run('attach',{source:src});
  assert.equal(r.destination,'attachments/attach-src.png');
  assert.equal(await fs.readFile(path.join(w,r.destination),'utf8'),'fake-image');
  await assert.rejects(run('attach',{source:src}),/overwrite/);
});

test('canvas writes and reads JSON nodes and edges',async()=>{
  const {run}=await makeVault('feat-canvas-');
  const created=await run('canvas',{path:'board.canvas',operation:'write',nodes:[{id:'n1',type:'text',x:0,y:0,text:'hi'}],edges:[]});
  assert.equal(created.path,'board.canvas');
  const read=await run('canvas',{path:'board.canvas'});
  assert.equal(read.nodes.length,1);
  assert.equal(read.nodes[0].text,'hi');
  await assert.rejects(run('canvas',{path:'board.canvas',operation:'write',nodes:[]}),/overwrite/);
});

test('bookmarks flattens file/search/group entries',async()=>{
  const {w,run}=await makeVault('feat-book-');
  await fs.writeFile(path.join(w,'.obsidian','bookmarks.json'),JSON.stringify({items:[{type:'group',title:'G',items:[{type:'file',title:'T',path:'a.md'}]},{type:'search',title:'S',query:'tag:ml'}]}));
  const r=await run('bookmarks',{});
  assert.deepEqual(r.items,[{type:'group',title:'G'},{type:'file',title:'T',path:'a.md'},{type:'search',title:'S',query:'tag:ml'}]);
});

test('graph exports nodes and resolved edges',async()=>{
  const {run}=await makeVault('feat-graph-');
  await run('write',{path:'a.md',text:'[[b]]'});
  await run('write',{path:'b.md',text:'back'});
  const g=await run('graph',{});
  assert.equal(g.nodes.length,2);
  assert.equal(g.edges.length,1);
  assert.equal(g.edges[0].from,'a.md');
  assert.equal(g.edges[0].to,'b.md');
});
