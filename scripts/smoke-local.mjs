import {definitions} from '../lib/index.js';
const defs=new Map(definitions({get:()=>undefined}).map(d=>[d.name,d]));
const controller=new AbortController();const timer=setTimeout(()=>controller.abort(new Error('Local smoke test timed out after 3 seconds')),3000);
try{
 const args={workspace:process.cwd(),query:'a',limit:1};const search=await defs.get('csrw_zotero_search').execute(args,{signal:controller.signal});
 if(search.items[0]){await defs.get('csrw_zotero_item').execute({workspace:process.cwd(),key:search.items[0].key},{signal:controller.signal});console.log(JSON.stringify({zotero:{connected:true,search:true,itemRead:true}}));}
 else console.log(JSON.stringify({zotero:{connected:true,search:true,itemRead:false,reason:'No matching real item'}}));
}catch(error){console.log(JSON.stringify({zotero:{connected:false,search:false,itemRead:false,reason:error.message}}));}finally{clearTimeout(timer);}
