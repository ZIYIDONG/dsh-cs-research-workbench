import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));process.chdir(root);
async function files(dir){const result=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const name=path.join(dir,entry.name);if(entry.isDirectory())result.push(...await files(name));else if(/\.(js|mjs)$/.test(name))result.push(name);}return result;}
for(const file of [...await files('lib'),...await files('bin')]){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw new Error('Syntax check failed: '+file);}
const pkg=JSON.parse(await fs.readFile('package.json','utf8'));assert.equal(pkg.name,'dsh-cs-research-workbench');assert.ok(pkg.bin['dsh-csrw']);for(const file of ['README.md','LICENSE','.dsh-csrw.example.json','patches/bundle.yaml','icon.svg','locale/zh.json','locale/en.json'])assert.ok((await fs.stat(file)).isFile(),file);for(const locale of ['zh','en']){const content=JSON.parse(await fs.readFile(`locale/${locale}.json`,'utf8'));assert.ok(content.meta?.title?.length>5);assert.ok(content.meta?.description?.length>20);}assert.match(await fs.readFile('icon.svg','utf8'),/<svg/);assert.match(await fs.readFile('patches/bundle.yaml','utf8'),/dsh-cs-research-workbench/);
const {definitions,MODULES}=await import('../lib/index.js');const tools=definitions({get:()=>undefined});assert.equal(new Set(tools.map(t=>t.name)).size,tools.length);assert.ok(tools.every(t=>t.name.startsWith('dsh_csrw_')));assert.ok(Object.values(MODULES).every(value=>value==='ready'));assert.equal(tools.length,49);for(const tool of tools){assert.ok(tool.output?.schema);}
// 示例配置必须与 config.js 的 DEFAULTS 逐字段同构：按 section.key 展开，字段名集合与类型都要一致。
// 只 stat 文件存在不够——少一个字段或类型漂移会让用户照抄出一份加载即失败的配置。
const {DEFAULTS}=await import('../lib/services/config.js');
const flatten=sections=>{const out=new Map();for(const [section,values] of Object.entries(sections)){assert.ok(values&&typeof values==='object'&&!Array.isArray(values),`example config section ${section} must be an object`);for(const [key,value] of Object.entries(values))out.set(`${section}.${key}`,typeof value);}return out;};
const exampleFields=flatten(JSON.parse(await fs.readFile('.dsh-csrw.example.json','utf8')));
const defaultFields=flatten(DEFAULTS);
assert.deepEqual([...exampleFields.keys()].sort(),[...defaultFields.keys()].sort(),'.dsh-csrw.example.json field set must match config DEFAULTS');
for(const [key,type] of defaultFields)assert.equal(exampleFields.get(key),type,`example config field ${key} must be ${type}, got ${exampleFields.get(key)}`);
console.log(JSON.stringify({syntax:'passed',metadata:'passed',exampleConfig:'passed',tools:tools.length,modules:MODULES}));
