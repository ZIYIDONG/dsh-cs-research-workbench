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

test('registerDesk waits for webServer through conditional injection',()=>{
  const routes=[];
  const disposers=[];
  const scoped={
    webServer:{register:route=>{routes.push(route);const dispose=()=>{disposers.push('disposed');};return dispose;}},
    effect:fn=>{const dispose=fn();disposers.push(dispose);return dispose;},
  };
  let requested=null;
  const mounted=registerDesk({inject:(deps,callback)=>{requested=deps;callback(scoped);}});
  assert.equal(mounted,true);
  assert.deepEqual(requested,['webServer']);
  assert.equal(routes.length,1);
  assert.equal(routes[0].kind,'prefix');
  assert.equal(routes[0].path,'/dsh-csrw/api');
  assert.equal(typeof routes[0].handler,'function');
  assert.equal(disposers.length,1);
});

test('registerDesk falls back to a present service when inject is unavailable',()=>{
  const routes=[];
  const mounted=registerDesk({
    get:name=>name==='webServer'?{register:route=>{routes.push(route);return()=>{};}}:undefined,
    effect:fn=>{const dispose=fn();return dispose;},
  });
  assert.equal(mounted,true);
  assert.equal(routes[0].path,'/dsh-csrw/api');
});

test('store copies the legacy csrw-desk state without deleting it',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'dsh-csrw-migrate-'));
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
  const dir=await mkdtemp(path.join(tmpdir(),'dsh-csrw-broken-'));
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

// ---- 第二波回归：applyOps 剩余操作与四类集合（追加，不改既有断言） ----

test('applyOps update_item 只改白名单字段，非法枚举被丢弃',()=>{
  const state=buildSeed(new Date());
  const id=state.todos[0].id;
  const result=applyOps(state,[{op:'update_item',kind:'todo',id,patch:{title:'改过的标题',priority:'P9',status:'bogus',notes:'附注',tags:['x',7,'y'],estimateMinutes:12.6,id:'被篡改',hack:'x'}}]);
  assert.deepEqual(result.errors,[]);
  const row=state.todos.find(r=>r.id===id);
  assert.equal(row.title,'改过的标题');
  assert.equal(row.notes,'附注');
  assert.deepEqual(row.tags,['x','y'],'非字符串 tag 必须被过滤');
  assert.equal(row.estimateMinutes,13,'数字字段四舍五入');
  assert.equal(row.priority,'P0','非法 priority 枚举必须被丢弃，保留原值');
  assert.equal(row.status,'doing','非法 status 枚举必须被丢弃，保留原值');
  assert.equal(row.id,id,'id 不可被 patch 改写');
  assert.equal(row.hack,undefined,'非白名单字段不得写入');
  assert.ok(row.updatedAt);
});

test('applyOps clear_samples 只清示例条目与示例对话，保留真实数据',()=>{
  const state=buildSeed(new Date());
  const created=applyOps(state,[{op:'add_item',kind:'todo',title:'真实任务'}]);
  assert.deepEqual(created.errors,[]);
  const realId=state.todos[0].id;
  assert.equal(state.todos[0].sample,false);
  state.chat.push({id:'c_sample',role:'user',text:'示例',sample:true});
  state.chat.push({id:'c_real',role:'user',text:'真实',sample:false});
  const result=applyOps(state,[{op:'clear_samples'}]);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.receipts.length,1);
  assert.deepEqual(state.todos.map(r=>r.id),[realId]);
  for(const key of ['projects','papers','ideas','notes']) assert.equal(state[key].length,0,`${key} 的示例数据必须被清空`);
  assert.deepEqual(state.chat.map(r=>r.id),['c_real']);
});

test('applyOps clear_chat 清空对话但不动任何条目',()=>{
  const state=buildSeed(new Date());
  state.chat.push({id:'c1',role:'user',text:'a'},{id:'c2',role:'assistant',text:'b',engine:'local'});
  const result=applyOps(state,[{op:'clear_chat'}]);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.receipts.length,1);
  assert.deepEqual(state.chat,[]);
  assert.equal(state.todos.length,6);
  assert.equal(state.papers.length,3);
});

/** 四类集合共用的 add / update / set_status / delete + 非法枚举 + 空标题回归。 */
function collectionCase(kind,list,label,{defaultStatus,legalStatus,addFields,updateFields,expectAdd}){
  return ()=>{
    const state=buildSeed(new Date());
    const initial=state[list].length;
    const empty=applyOps(state,[{op:'add_item',kind,title:'   '}]);
    assert.ok(empty.errors.some(e=>e.includes('标题不能为空')),`${kind} 空标题必须被拒`);
    assert.equal(state[list].length,initial);
    const added=applyOps(state,[{op:'add_item',kind,title:`新${label}`,status:'bogus',...addFields}]);
    assert.deepEqual(added.errors,[]);
    assert.equal(added.receipts.length,1);
    assert.equal(added.receipts[0].kind,kind);
    assert.ok(added.receipts[0].text.includes(`已创建${label}`));
    const id=added.receipts[0].target;
    const row=state[list].find(r=>r.id===id);
    assert.ok(row);
    assert.equal(state[list].length,initial+1);
    assert.equal(row.status,defaultStatus,`${kind} 非法枚举必须被丢弃，落回默认状态`);
    expectAdd(row);
    const updated=applyOps(state,[{op:'update_item',kind,id,patch:{...updateFields,status:'bogus'}}]);
    assert.deepEqual(updated.errors,[]);
    assert.equal(row.status,defaultStatus,`${kind} update_item 的非法枚举必须被丢弃`);
    const [key,value]=Object.entries(updateFields)[0];
    assert.equal(row[key],value,`${kind} 白名单字段 ${key} 必须被更新`);
    const badStatus=applyOps(state,[{op:'set_status',kind,id,status:'bogus'}]);
    assert.ok(badStatus.errors.some(e=>e.includes('状态值无效')),`${kind} 非法状态必须报错`);
    assert.equal(row.status,defaultStatus);
    const okStatus=applyOps(state,[{op:'set_status',kind,id,status:legalStatus}]);
    assert.deepEqual(okStatus.errors,[]);
    assert.equal(row.status,legalStatus);
    const deleted=applyOps(state,[{op:'delete_item',kind,id}]);
    assert.deepEqual(deleted.errors,[]);
    assert.equal(deleted.receipts[0].kind,kind);
    assert.equal(state[list].length,initial);
  };
}

test('applyOps project：add/update/set_status/delete + 非法枚举 + 空标题',collectionCase('project','projects','项目',{
  defaultStatus:'active',legalStatus:'paused',
  addFields:{goal:'目标',venue:'S&P',milestones:[{title:'m1'},'bad']},
  updateFields:{name:'改名',venue:'USENIX'},
  expectAdd:row=>{
    assert.equal(row.name,'新项目');
    assert.equal(row.goal,'目标');
    assert.deepEqual(row.milestones,[{title:'m1'}],'非对象 milestone 必须被过滤');
    assert.equal(row.title,undefined,'project 用 name 而非 title');
  },
}));

test('applyOps paper：add/update/set_status/delete + 非法枚举 + 空标题',collectionCase('paper','papers','文献',{
  defaultStatus:'inbox',legalStatus:'reading',
  addFields:{authors:'A',venue:'NeurIPS',year:2025,url:'https://example.com/x'},
  updateFields:{title:'改名',notes:'重点'},
  expectAdd:row=>{
    assert.equal(row.title,'新文献');
    assert.equal(row.year,2025);
    assert.equal(row.url,'https://example.com/x');
  },
}));

test('applyOps idea：add/update/set_status/delete + 非法枚举 + 空标题',collectionCase('idea','ideas','想法',{
  defaultStatus:'seed',legalStatus:'exploring',
  // op.kind 是集合选择器（'idea' / 'ideas'），不能同时当作条目的 kind 字段传 'hypothesis'。
  addFields:{body:'内容'},
  updateFields:{title:'改名',body:'新内容'},
  expectAdd:row=>{
    assert.equal(row.title,'新想法');
    assert.equal(row.body,'内容');
    assert.equal(row.kind,'idea','add_item 的 op.kind 只作集合选择器，条目 kind 落默认值');
  },
}));

test('applyOps idea.kind 可经 update_item.patch 写入（白名单可达性）',()=>{
  const state=buildSeed(new Date());
  const added=applyOps(state,[{op:'add_item',kind:'idea',title:'带类型的想法'}]);
  assert.deepEqual(added.errors,[]);
  const id=added.receipts[0].target;
  assert.equal(state.ideas[0].kind,'idea');
  const updated=applyOps(state,[{op:'update_item',kind:'idea',id,patch:{kind:'hypothesis',body:'正文'}}]);
  assert.deepEqual(updated.errors,[]);
  assert.equal(state.ideas[0].kind,'hypothesis');
  assert.equal(state.ideas[0].body,'正文');
});

test('applyOps note：add/update/set_status/delete + 非法枚举 + 空标题',collectionCase('note','notes','笔记',{
  defaultStatus:undefined,legalStatus:'stable',
  addFields:{body:'内容',kb:'pitfall'},
  updateFields:{title:'改名',body:'新内容'},
  expectAdd:row=>{
    assert.equal(row.title,'新笔记');
    assert.equal(row.kb,'pitfall');
    assert.equal(row.body,'内容');
    assert.equal(row.status,undefined,'note 白名单不含 status，add 不得凭空生成');
  },
}));

test('applyOps 接受集合名别名，拒绝未知类型 / 未知操作 / 畸形操作',()=>{
  const state=buildSeed(new Date());
  const alias=applyOps(state,[{op:'add_item',kind:'papers',title:'别名新增'}]);
  assert.deepEqual(alias.errors,[]);
  assert.equal(state.papers.length,4);
  assert.equal(state.papers[0].title,'别名新增');
  const bad=applyOps(state,[
    {op:'add_item',kind:'unknown',title:'x'},
    {op:'noop',kind:'todo',id:state.todos[0].id},
    {hello:'world'},
    {op:'set_pos',kind:'todo',id:state.todos[0].id,pos:{x:'a',y:2}},
  ]);
  assert.ok(bad.errors.some(e=>e.includes('未知的数据类型')));
  assert.ok(bad.errors.some(e=>e.includes('未知操作')));
  assert.ok(bad.errors.some(e=>e.includes('操作格式无效')));
  assert.ok(bad.errors.some(e=>e.includes('坐标无效')));
  assert.equal(state.papers.length,4);
  assert.equal(state.todos.length,6);
});
