import test from 'node:test';
import assert from 'node:assert/strict';
import {injectUtilityMenu,utilityItems} from '../public/utility-menu.js';
import {onRequestGet} from '../functions/A1.js';
import {onRequest} from '../functions/index.js';
test('Copy is first, page navigation is optional, and empty configuration adds nothing',()=>{
 assert.deepEqual(utilityItems([]).map(x=>x.action),['copy']);assert.deepEqual(utilityItems([{label:'Home',href:'/'}]).map(x=>x.action),['copy','pages']);assert.equal(injectUtilityMenu('<p>Unchanged</p>',{source:'raw',items:[]}),'<p>Unchanged</p>');
});
test('menu preserves exact source and safely embeds closing script tags',()=>{
 const source='  # Markdown\n\n<script>test</script>\n';const output=injectUtilityMenu('<html><body><h1>Rendered</h1></body></html>',{source,items:[{label:'Copy source',action:'copy'}]});
 assert.ok(output.includes('<h1>Rendered</h1>'));assert.ok(output.endsWith('</body></html>'));assert.ok(output.includes('"source":'+JSON.stringify(source).replace(/</g,'\\u003c').replace(/>/g,'\\u003e')));assert.equal((output.match(/<\/script>/g)||[]).length,1);
});
test('slug pages copy their own source and navigation keeps Sheet and worksheet IDs',async()=>{
 const old=global.fetch;global.fetch=async()=>new Response('"# Home",index\n"Plain source",about');
 try{const response=await onRequestGet({request:new Request('https://sheets.built.at/a1?id=abcdefghijklmnopqrst&gid=123&slug=about')});const html=await response.text();assert.ok(html.includes('"source":"Plain source"'));assert.ok(html.includes('slug=index'));assert.ok(html.includes('gid=123'));assert.doesNotMatch(html,/<header>/);}finally{global.fetch=old;}
});
test('legacy page URLs use the same minimal viewer and preserve the selected slug',async()=>{
 const old=global.fetch;global.fetch=async()=>new Response('Home,index\nOther,about');
 try{const response=await onRequest({request:new Request('https://sheets.built.at/?id=abcdefghijklmnopqrst&slug=about'),next:()=>{throw Error('Should render page');}});assert.ok((await response.text()).includes('"source":"Other"'));}finally{global.fetch=old;}
});
