import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildSeed} from '../lib/desk/seed.js';
import {applyOps} from '../lib/desk/ops.js';
import {Store} from '../lib/desk/store.js';
import {registerDesk} from '../lib/desk/host.js';

test('seed gives a usable sample workbench',()=>{
  const state=buildSeed(new Date());
  assert.equal(state.todos.length,6);
  assert.equal(state.papers.length,3);
  assert.ok(state.todos.every(row=>row.sample===true));
  assert.equal(state.settings.language,'zh');
});

test('applyOps creates todos and rejects empty titles',()=>{
  const state=buildSeed(new Date());
  const created=applyOps(state,[{op:'add_item',kind:'todo',title:'写消融实验',priority:'P0'}]);
  assert.deepEqual(created.errors,[]);
  assert.equal(state.todos.length,7);
  assert.equal(state.todos[0].title,'写消融实验');
  const rejected=applyOps(state,[{op:'add_item',kind:'todo',title:'   '}]);
  assert.ok(rejected.errors.length>0);
  assert.equal(state.todos.length,7);
});

test('applyOps updates status and canvas position in place',()=>{
  const state=buildSeed(new Date());
  const id=state.todos[0].id;
  assert.deepEqual(applyOps(state,[{op:'set_status',kind:'todo',id,status:'done'}]).errors,[]);
  assert.ok(state.todos.find(row=>row.id===id).doneAt);
  assert.deepEqual(applyOps(state,[{op:'set_pos',kind:'todo',id,pos:{x:12.4,y:-30,r:2}}]).errors,[]);
  assert.deepEqual(state.todos.find(row=>row.id===id).pos,{x:12,y:-30,r:2});
  assert.deepEqual(applyOps(state,[{op:'delete_item',kind:'todo',id}]).errors,[]);
  assert.equal(state.todos.length,5);
});

test('store persists with mtime refresh and three-way undo',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'csrw-desk-'));
  const previous=process.env.DSH_HOME;
  process.env.DSH_HOME=dir;
  try{
    const store=new Store();
    const before=await store.read();
    assert.equal(before.todos.length,6);
    const original=before.todos[0].title;
    await store.mutate('改标题',draft=>{draft.todos[0].title='改过的标题';});
    assert.equal((await store.read()).todos[0].title,'改过的标题');
    await store.undoLast();
    assert.equal((await store.read()).todos[0].title,original);
  }finally{
    if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;
    await rm(dir,{recursive:true,force:true});
  }
});

test('registerDesk stays inert without a web server',()=>{
  assert.equal(registerDesk({get:()=>undefined}),false);
});

test('store copies the legacy csrw-desk state without deleting it',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'csrw-migrate-'));
  const legacy=path.join(dir,'csrw-desk');
  const target=path.join(dir,'dsh-csrw');
  await mkdir(legacy,{recursive:true});
  const seeded=buildSeed(new Date());
  seeded.todos[0].title='旧目录里的任务';
  await writeFile(path.join(legacy,'state.json'),JSON.stringify(seeded));
  try{
    const store=new Store(target,legacy);
    assert.equal((await store.read()).todos[0].title,'旧目录里的任务');
    assert.ok((await stat(path.join(legacy,'state.json'))).isFile(),'旧文件必须保留');
    assert.ok((await readFile(path.join(target,'.migrated-from-csrw-desk'),'utf8')).includes('csrw-desk'));
    await store.mutate('改标题',draft=>{draft.todos[0].title='迁移后改的标题';});
    const reopened=new Store(target,legacy);
    assert.equal((await reopened.read()).todos[0].title,'迁移后改的标题','已迁移的目录不能被旧文件覆盖');
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});

test('store refuses to migrate an unparsable legacy state',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'csrw-broken-'));
  const legacy=path.join(dir,'csrw-desk');
  await mkdir(legacy,{recursive:true});
  await writeFile(path.join(legacy,'state.json'),'{"todos":[');
  try{
    const store=new Store(path.join(dir,'dsh-csrw'),legacy);
    await assert.rejects(()=>store.read(),/无法解析/);
    assert.ok((await stat(path.join(legacy,'state.json'))).isFile(),'坏文件不能被删除');
    assert.equal(await stat(path.join(dir,'dsh-csrw','state.json')).then(()=>true,()=>false),false,'坏文件不能被复制成新状态');
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
