import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
let entry;const states=[],effects=[],calls=[];let cursor=0;
const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity).filter(v=>v!==null&&v!==undefined&&v!==false)}),useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial){const i=cursor++;return states[i]??(states[i]={current:initial});},useEffect(fn,deps){const i=cursor++;const old=states[i];if(!old||deps.some((v,j)=>v!==old[j])){states[i]=deps;effects.push(fn);}}};
vm.runInNewContext(await fs.readFile('client.js','utf8'),{window:{__ModuleLoader__:{load(value){entry=value;}}},AbortController});
const slots=[];
entry.factory(()=>React).apply({effect:fn=>fn(),get:()=>undefined,locale:{register:()=>()=>{},bind:()=>key=>key,subscribe:()=>()=>{}},slots:{inject:(_name,fn)=>fn(),register:(opts,component)=>{slots.push({opts,component});return()=>{};}},remote:{commands:{async execute(id,line,attachments,signal){assert.equal(id,'session-fixture');assert.ok(signal instanceof AbortSignal);const request=JSON.parse(line.slice('/csrw-ui '.length));calls.push(request);const value=request.operation==='csrw_config_show'?{config:{obsidian:{vaultPath:'/vault',autoDetect:true},nutstore:{baseUrl:'https://example.invalid/dav/'}}}:{key:request.args.key,value:request.args.value,saved:true};return{ok:true,value:{result:{kind:'success',text:JSON.stringify(value)}}};}}}});
const Panel=slots.find(s=>s.opts.name==='main').component;
let tree;const props={useSessions:selector=>selector({ids:['session-fixture'],byId:{'session-fixture':{displayTitle:'Fixture'}}})};
function render(){cursor=0;tree=Panel(props);effects.splice(0).forEach(fn=>fn());return tree;}
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
const iconSlot=slots.find(s=>s.opts.name==='sidebar.panellist');assert.ok(iconSlot,'sidebar icon registered');
function walk(node,out=[]){if(node&&typeof node==='object'){out.push(node);(node.children||[]).forEach(child=>walk(child,out));}return out;}
const svg=iconSlot.component({size:20}),parts=walk(svg);
assert.equal(svg.type,'svg');assert.equal(svg.props.viewBox,'0 0 24 24');assert.equal(svg.props['aria-hidden'],true);
const rects=parts.filter(n=>n.type==='rect');assert.equal(rects.length,2,'screen frame + base only');
assert.deepEqual([rects[0].props.fill,rects[0].props.stroke,rects[0].props.strokeWidth],['none','currentColor',1.5],'screen is a 1.5 stroke frame');
assert.equal(rects[1].props.fill,'currentColor','base is solid');
const glyphs=parts.filter(n=>n.type==='path');assert.equal(glyphs.length,2);glyphs.forEach(p=>{assert.equal(p.props.stroke,'currentColor');assert.equal(p.props.strokeWidth,0.85);});
assert.ok(glyphs[0].props.d.includes('8.95')&&glyphs[1].props.d.includes('9.9'));
assert.equal(parts.filter(n=>n.type==='mask').length,0,'no mask needed once the screen is a frame');
const head=nodes().find(n=>n.props&&n.props.className==='csrw-head');assert.ok(head,'panel header renders');
const logo=head.children[0];assert.equal(logo.props.className,'csrw-logo');assert.equal(logo.children[0].props.size,26,'logo icon is 26px at the top-left');
assert.ok(head.children[1].children.some(c=>c.type==='h1'),'title stays an h1 next to the logo');
console.log(JSON.stringify({render:'passed',sessionSelection:'passed',remoteStringId:'passed',remoteResultUnwrap:'passed',load:'passed',confirmationGate:'passed',save:'passed',workspaceIsolation:'passed',icon:'passed',headerIcon:'passed'}));
