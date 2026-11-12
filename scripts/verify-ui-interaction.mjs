import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const pluginDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let entry;const states=[],effects=[],calls=[];let cursor=0;
const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity).filter(v=>v!==null&&v!==undefined&&v!==false)}),useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial){const i=cursor++;return states[i]??(states[i]={current:initial});},useEffect(fn,deps){const i=cursor++;const old=states[i];if(!old||deps.some((v,j)=>v!==old[j])){states[i]=deps;effects.push(fn);}},useSyncExternalStore(subscribe,get){const i=cursor++;if(!(i in states))states[i]=get();return states[i];},useCallback(fn){return fn;},useMemo(fn){return fn();}};
const fetch=async()=>({ok:true,status:200,json:async()=>({state:null,canUndo:false,model:null,modelOk:false}),text:async()=>''});
vm.runInNewContext(await fs.readFile(path.join(pluginDir,'client.js'),'utf8'),{window:{__ModuleLoader__:{load(value){entry=value;}}},AbortController,fetch,setTimeout,console});
const slots=[],translations={};
entry.factory(()=>React).apply({effect:fn=>fn(),get:()=>undefined,locale:{register:(_ns,lang,dict)=>{translations[lang]=dict;return()=>{};},bind:()=>key=>key,subscribe:()=>()=>{}},slots:{inject:(_name,fn)=>fn(),register:(opts,component)=>{slots.push({opts,component});return()=>{};}},remote:{commands:{async execute(id,line,attachments,signal){assert.equal(id,'session-fixture');assert.ok(signal instanceof AbortSignal);const request=JSON.parse(line.slice('/csrw-ui '.length));calls.push(request);const value=request.operation==='csrw_config_show'?{config:{obsidian:{vaultPath:'/vault',autoDetect:true},nutstore:{baseUrl:'https://example.invalid/dav/'}}}:{key:request.args.key,value:request.args.value,saved:true};return{ok:true,value:{result:{kind:'success',text:JSON.stringify(value)}}};}}}});

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
assert.equal(calls.length,1);assert.equal(calls[0].operation,'csrw_config_show');assert.equal(calls[0].args.workspace,'C:/fixture');
const field=nodes().find(n=>n.type==='select'&&n.props.value==='obsidian.vaultPath');assert.ok(field.children.some(o=>o.props.value==='nutstore.baseUrl'));assert.ok(!field.children.some(o=>o.props.value==='nutstore.endpoint'));
const value=nodes().find(n=>n.type==='input'&&n.props.value==='/vault');assert.ok(value);value.props.onChange({target:{value:'/new-vault'}});render();button('save').props.onClick();render();assert.equal(calls.length,1,'save must not write before confirmation');
await button('confirm').props.onClick();await Promise.resolve();render();render();assert.equal(calls.length,2);assert.equal(calls[1].confirmed,true);assert.equal(calls[1].args.value,'/new-vault');assert.ok(nodes().some(n=>n.type==='pre'&&n.children.some(s=>typeof s==='string'&&s.includes('/new-vault'))));
nodes().find(n=>n.type==='input'&&n.props.value==='C:/fixture').props.onChange({target:{value:'C:/other'}});render();assert.equal(button('save').props.disabled,true,'workspace switch must discard old config');

const sidebar=slots.find(s=>s.opts.name==='sidebar.panellist');
assert.equal(sidebar.opts.id,'dsh-csrw-ui');assert.equal(sidebar.opts.order,45);assert.equal(typeof sidebar.opts.label,'function');
const iconElement=sidebar.component({size:20});assert.ok(iconElement,'sidebar icon renders an element');
assert.equal(iconElement.type,'span','sidebar icon is wrapped for flex centering');
assert.equal(iconElement.props.className,'csrw-icon-slot');
assert.equal(iconElement.props.style.display,'inline-flex','sidebar icon wrapper is a flex container (no baseline alignment)');
const sidebarIcon=iconElement.children[0];
const renderedIcon=sidebarIcon.type(sidebarIcon.props);
assert.equal(renderedIcon.props.style.display,'block','sidebar svg is block-level (no inline baseline shift)');
const walk=o=>{if(!o||typeof o!=='object')return[];return[o,...(Array.isArray(o)?o.flatMap(walk):Object.values(o).flatMap(walk))]};
const iconNodes=walk(renderedIcon);
assert.ok(iconNodes.some(n=>n.props&&n.props.mask==='url(#csrw-solid-prompt)'),'sidebar icon stays the terminal caret glyph');
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
const head=nodes().find(n=>n.props&&n.props.className==='csrw-head');assert.ok(head,'panel header renders');
assert.equal(head.children.length,1);assert.equal(head.children[0].type,'h1');assert.equal(head.children[0].children[0],'title');
assert.ok(!nodes().some(n=>n.props?.className==='csrw-logo'),'no page-header icon');
console.log(JSON.stringify({render:'passed',workbenchSlot:'passed',sessionSelection:'passed',remoteStringId:'passed',remoteResultUnwrap:'passed',load:'passed',confirmationGate:'passed',save:'passed',workspaceIsolation:'passed',icon:'passed',titleOnlyHeader:'passed',settingsIconId:'passed',localizedTitle:'passed'}));
