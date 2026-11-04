import test from 'node:test';
import assert from 'node:assert/strict';
import {pagesFromTable,getRedirectUrl,pageUrl,extractSheetId} from '../public/model.js';
import {getRenderableHtml} from '../public/render.js';
import {onRequestGet,parseCsv} from '../functions/api/sheet.js';
const table=rows=>({rows:rows.map(r=>({c:r.map(v=>({v}))}))});
test('optional headers, blank slugs, and homepage in any row including A1',()=>{
 assert.equal(pagesFromTable(table([['<h1>First</h1>','index']])).get('index').content,'<h1>First</h1>');
 const p=pagesFromTable(table([['content','slug'],['ignored',''],['About','About'],['Home','/INDEX/']]));assert.deepEqual([...p.keys()],['about','index']);assert.equal(p.get('index').content,'Home');
});
test('duplicate and invalid slugs are explicit errors',()=>{assert.throws(()=>pagesFromTable(table([['one','About'],['two','/about/']])),/Duplicate/);assert.throws(()=>pagesFromTable(table([['x','../about']])),/Invalid/);});
test('redirects require an entire HTTP(S) URL',()=>{assert.equal(getRedirectUrl('https://example.com'),'https://example.com/');for(const v of ['javascript:alert(1)','<a href="https://example.com">Link</a>','Read https://example.com','https://user:pass@example.com'])assert.equal(getRedirectUrl(v),'');});
test('URL and Sheet extraction preserve routing',()=>{assert.equal(pageUrl('test','about','123'),'/?id=test&slug=about&gid=123');assert.equal(extractSheetId('https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrst/edit'),'abcdefghijklmnopqrst');});
test('original Markdown and HTML rendering remain usable',()=>{assert.match(getRenderableHtml('# Hello\n\nSome **bold** text.'),/<h1>Hello<\/h1>/);assert.match(getRenderableHtml('<main>HTML</main>'),/<main>HTML<\/main>/);});
test('Sheet retrieval is fresh and uses both columns with no implicit headers',async()=>{
 const original=global.fetch;let seen;global.fetch=async(url,options)=>{seen={url:new URL(url),options};return new Response('home,index');};
 try{const result=await onRequestGet({request:new Request('https://sheets.built.at/api/sheet?id=abcdefghijklmnopqrst')});assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/no-store/);assert.equal(seen.options.cache,'no-store');assert.ok(seen.url.pathname.endsWith('/export'));assert.equal(seen.url.searchParams.get('format'),'csv');assert.equal(seen.url.searchParams.get('range'),'A:B');assert.ok(seen.url.searchParams.get('_'));assert.equal((await result.json()).table.rows[0].c[0].v,'home');}finally{global.fetch=original;}
});
test('CSV preserves multiline HTML, quotes, commas, blank slugs and optional headers',()=>{assert.deepEqual(parseCsv('content,slug\r\n"<p title=""Hi"">One, two\nthree</p>",index\r\nignored,\r\n'),[['content','slug'],['<p title="Hi">One, two\nthree</p>','index'],['ignored','']]);});
test('fetch errors are visible and invalid IDs never reach Google',async()=>{const original=global.fetch;global.fetch=async()=>{throw new Error('offline');};try{assert.equal((await onRequestGet({request:new Request('https://sheets.built.at/api/sheet?id=bad')})).status,400);assert.equal((await onRequestGet({request:new Request('https://sheets.built.at/api/sheet?id=abcdefghijklmnopqrst')})).status,502);}finally{global.fetch=original;}});
