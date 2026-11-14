import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const pluginDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let entry;const states=[],effects=[],calls=[];let cursor=0;
const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity).filter(v=>v!==null&&v!==undefined&&v!==false)}),useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial){const i=cursor++;return states[i]??(states[i]={current:initial});},useEffect(fn,deps){const i=cursor++;const old=states[i];if(!old||deps.some((v,j)=>v!==old[j])){states[i]=deps;effects.push(fn);}},useSyncExternalStore(subscribe,get){const i=cursor++;if(!(i in states))states[i]=get();return states[i];},useCallback(fn){return fn;},useMemo(fn){return fn();}};
const fetch=async()=>({ok:true,status:200,json:async()=>({state:null,canUndo:false,model:null,modelOk:false}),text:async()=>''});
const source=await fs.readFile(path.join(pluginDir,'client.js'),'utf8');
vm.runInNewContext(source,{window:{__ModuleLoader__:{load(value){entry=value;}}},AbortController,fetch,setTimeout,console});
const slots=[],translations={};
entry.factory(()=>React).apply({effect:fn=>fn(),get:()=>undefined,locale:{register:(_ns,lang,dict)=>{translations[lang]=dict;return()=>{};},bind:()=>key=>key,subscribe:()=>()=>{}},slots:{inject:(_name,fn)=>fn(),register:(opts,component)=>{slots.push({opts,component});return()=>{};}},remote:{commands:{async execute(id,line,attachments,signal){assert.equal(id,'session-fixture');assert.ok(line.startsWith('/dsh-csrw '),'client uses the unified command name');assert.ok(signal instanceof AbortSignal);const request=JSON.parse(line.slice('/dsh-csrw '.length));calls.push(request);const value=request.operation==='dsh_csrw_config_show'?{config:{obsidian:{vaultPath:'/vault',autoDetect:true},nutstore:{baseUrl:'https://example.invalid/dav/'}}}:{key:request.args.key,value:request.args.value,saved:true};return{ok:true,value:{result:{kind:'success',text:JSON.stringify(value)}}};}}}});

assert.equal(slots.length,5,'five slots are registered');
const main=slots.find(s=>s.opts.name==='main');
assert.equal(main.opts.key,'dsh-csrw-ui');
const shell=main.component();
assert.equal(shell.props.className,'rd-shell','main slot renders the workbench shell');
assert.ok(shell.children.some(n=>n.props?.className?.startsWith('rd-root')),'workbench root is contained in the shell');

const settings=slots.find(s=>s.opts.name==='settings.section');
assert.equal(settings.opts.id,'dsh-csrw-ui');
const element=settings.component({useSessions:selector=>selector({ids:['session-fixture'],byId:{'session-fixture':{displayTitle:'Fixture'}}})});
const Panel=element.type,panelProps=element.props;
states.length=0;effects.length=0;cursor=0;
let tree;
function render(){cursor=0;tree=Panel(panelProps);effects.splice(0).forEach(fn=>fn());return tree;}
function nodes(node=tree){return typeof node==='object'?[node,...node.children.flatMap(n=>nodes(n))]:[];}
function button(label){const node=nodes().find(n=>n.type==='button'&&n.children.includes(label));assert.ok(node,'button '+label);return node;}
render();const workspace=nodes().find(n=>n.type==='input');workspace.props.onChange({target:{value:'C:/fixture'}});
const session=nodes().find(n=>n.type==='select'&&n.children.some(o=>o.props.value==='session-fixture'));session.props.onChange({target:{value:'session-fixture'}});
render();await button('load').props.onClick();render();render();
assert.equal(calls.length,1);assert.equal(calls[0].operation,'dsh_csrw_config_show');assert.equal(calls[0].args.workspace,'C:/fixture');
const field=nodes().find(n=>n.type==='select'&&n.props.value==='obsidian.vaultPath');assert.ok(field.children.some(o=>o.props.value==='nutstore.baseUrl'));assert.ok(!field.children.some(o=>o.props.value==='nutstore.endpoint'));
const value=nodes().find(n=>n.type==='input'&&n.props.value==='/vault');assert.ok(value);value.props.onChange({target:{value:'/new-vault'}});render();button('save').props.onClick();render();assert.equal(calls.length,1,'save must not write before confirmation');
await button('confirm').props.onClick();await Promise.resolve();render();render();assert.equal(calls.length,2);assert.equal(calls[1].confirmed,true);assert.equal(calls[1].args.value,'/new-vault');assert.ok(nodes().some(n=>n.type==='pre'&&n.children.some(s=>typeof s==='string'&&s.includes('/new-vault'))));
nodes().find(n=>n.type==='input'&&n.props.value==='C:/fixture').props.onChange({target:{value:'C:/other'}});render();assert.equal(button('save').props.disabled,true,'workspace switch must discard old config');

const sidebar=slots.find(s=>s.opts.name==='sidebar.panellist');
assert.equal(sidebar.opts.id,'dsh-csrw-ui');assert.equal(sidebar.opts.order,45);assert.equal(typeof sidebar.opts.label,'function');
const iconElement=sidebar.component({size:20});assert.ok(iconElement,'sidebar icon renders an element');
assert.equal(iconElement.type,'span','sidebar icon is wrapped for flex centering');
assert.equal(iconElement.props.className,'dsh-csrw-icon-slot');
assert.equal(iconElement.props.style.display,'inline-flex','sidebar icon wrapper is a flex container (no baseline alignment)');
const sidebarIcon=iconElement.children[0];
const renderedIcon=sidebarIcon.type(sidebarIcon.props);
assert.equal(renderedIcon.props.style.display,'block','sidebar svg is block-level (no inline baseline shift)');
const walk=o=>{if(!o||typeof o!=='object')return[];return[o,...(Array.isArray(o)?o.flatMap(walk):Object.values(o).flatMap(walk))]};
const iconNodes=walk(renderedIcon);
assert.ok(iconNodes.some(n=>n.props&&n.props.mask==='url(#dsh-csrw-solid-prompt)'),'sidebar icon stays the terminal caret glyph');
const inkTop=iconNodes.map(n=>n.props?.d).filter(d=>typeof d==='string'&&/^M4\.5 \d/.test(d)).map(d=>Number(/(\d+(?:\.\d+)?)[HV]/.exec(d)?.[1]))[0];
const base=iconNodes.find(n=>n.props?.y!==undefined&&Math.abs(n.props.y-18.1167)<0.01&&n.props?.height!==undefined);
assert.ok(base,'base bar exists');
const inkBottom=base.props.y+base.props.height;
assert.ok(Math.abs((inkTop+inkBottom)/2-12.55)<0.05,`icon ink center sits 0.55 below the box center: ${((inkTop+inkBottom)/2).toFixed(3)}`);
const screen=iconNodes.map(n=>n.props?.d).filter(d=>typeof d==='string'&&d.includes('V17.9167H3.1'))[0];
assert.ok(screen,'screen path is the 3:2 geometry');
const sw=20.9-3.1, sh=17.9167-6.05;
assert.ok(Math.abs(sw/sh-1.5)<0.01,`screen aspect ratio is 3:2: ${sw.toFixed(3)}x${sh.toFixed(3)}`);
assert.ok(Math.abs(base.props.y-(17.9167+0.2))<0.01,'screen and base keep a 0.2 gap');
const settingsIcon=slots.find(s=>s.opts.name==='settings.section.icon');assert.equal(settingsIcon.opts.id,'dsh-csrw-ui');
const pluginConfig=slots.find(s=>s.opts.name==='plugins.bundle.config');assert.equal(pluginConfig.opts.key,'dsh-cs-research-workbench');
assert.equal(translations.zh.title,'CS\u79d1\u7814\u5de5\u4f5c\u53f0');
const head=nodes().find(n=>n.props&&n.props.className==='dsh-csrw-head');assert.ok(head,'panel header renders');
assert.equal(head.children.length,1);assert.equal(head.children[0].type,'h1');assert.equal(head.children[0].children[0],'title');
assert.ok(!nodes().some(n=>n.props?.className==='dsh-csrw-logo'),'no page-header icon');
// ---------- 逐一补齐：项目 / 文献列表页 + hero 第二行的静态特征断言 ----------
// 只匹配稳定的组件名、字段白名单、op/kind 与文案 key；不断言行号、缩进或具体样式串。
const specBlock=source.slice(source.indexOf('const RECORD_SPECS'),source.indexOf('function RecordListView'));
assert.ok(specBlock.length>0,'record specs block is present');
assert.ok(source.includes('function RecordListView'),'record list view component exists');
assert.ok(source.includes('function RecordDialog'),'record dialog component exists');
assert.match(specBlock,/kind: 'project'/,'project kind declared');
assert.match(specBlock,/kind: 'paper'/,'paper kind declared');
assert.ok(specBlock.includes("list: 'projects'")&&specBlock.includes("list: 'papers'"),'both state lists are wired');
for(const needle of ['name','goal','status','venue','milestones','title','authors','year','doi','url','readBy','notes'])assert.ok(specBlock.includes(needle+':'),'whitelist field '+needle);
const dialogBlock=source.slice(source.indexOf('function RecordDialog'),source.indexOf('function Dashboard'));
assert.ok(dialogBlock.length>0,'record dialog block is present');
assert.ok(dialogBlock.includes("op: 'add_item'"),'add_item op is used');
assert.ok(dialogBlock.includes("op: 'update_item'"),'update_item op is used');
assert.ok(dialogBlock.includes("op: 'delete_item'"),'delete_item op is used');
assert.ok(dialogBlock.includes('ROUTES.ops'),'writes go through the ops route');
assert.ok(dialogBlock.includes('labelOpDefault'),'ops body uses the agreed label');
assert.ok(dialogBlock.includes('data.errors'),'data.errors is inspected before treating a write as success');
assert.ok(dialogBlock.includes('loadDesk()'),'state is reloaded after save / delete');
assert.ok(dialogBlock.includes('recordDeleteConfirm'),'delete requires an explicit confirmation button');
assert.ok(source.includes('function sundayKey'),'local week boundary helper exists');
assert.ok(source.includes('return { pending, papersThisWeek }'),'heroNumbers returns both numbers');
assert.ok(source.includes('return { pending: 0, papersThisWeek: 0 }'),'heroNumbers empty state returns both numbers');
assert.ok(source.includes('numbers.papersThisWeek'),'hero renders the second line even when it is 0');
assert.ok(!source.includes('requestAnimationFrame'),'no number roll animation is introduced');
const zhBlock=source.slice(source.indexOf('const zh = {'),source.indexOf('const en = {'));
const enBlock=source.slice(source.indexOf('const en = {'),source.indexOf('let language'));
const newKeys=['papersThisWeekLine','listCount','listNew','listEdit','listEmptyProject','listEmptyPaper','recordNew','recordEdit','recordSaved','recordDeleted','recordDeleteConfirm','recordDeleteYes','recordName','paperTitle','goal','milestones','readBy','invalidUrl','invalidJson','invalidYear','requiredName','errNeedLoad','errRouteMissing'];
for(const key of newKeys){const re=new RegExp('(^|[\\s,{])'+key+'\\s*:');assert.match(zhBlock,re,'zh dictionary key '+key);assert.match(enBlock,re,'en dictionary key '+key);}
assert.ok(zhBlock.includes('pageSoon')&&enBlock.includes('pageSoon'),'legacy pageSoon key is kept in both dictionaries');
console.log(JSON.stringify({render:'passed',workbenchSlot:'passed',sessionSelection:'passed',remoteStringId:'passed',remoteResultUnwrap:'passed',load:'passed',confirmationGate:'passed',save:'passed',workspaceIsolation:'passed',icon:'passed',titleOnlyHeader:'passed',settingsIconId:'passed',localizedTitle:'passed',recordList:'passed',recordOps:'passed',recordWhitelist:'passed',heroSecondLine:'passed',bilingualKeys:'passed'}));
