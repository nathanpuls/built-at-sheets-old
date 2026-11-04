import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/A1.js';
test('A1 serves the exact full HTML with no viewer chrome and no cache',async()=>{
  const original=global.fetch;let requested;
  const html='<!doctype html><html><body><h1>Hello, world</h1><script>document.title="Works"</script></body></html>';
  global.fetch=async(url,options)=>{requested={url:new URL(url),options};return new Response('"'+html.replaceAll('"','""')+'",index\r\nOther page,about',{headers:{'content-type':'text/csv'}});};
  try{const r=await onRequestGet({request:new Request('https://sheets.built.at/A1?ID=abcdefghijklmnopqrst')});assert.equal(r.status,200);assert.equal(await r.text(),html);assert.equal(requested.url.searchParams.get('range'),'A1');assert.equal(requested.options.cache,'no-store');assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('content-security-policy'),/sandbox allow-scripts/);assert.doesNotMatch(r.headers.get('content-security-policy'),/allow-same-origin/);}finally{global.fetch=original;}
});
test('A1 supports fragments and explicit worksheet IDs',async()=>{
  const original=global.fetch;global.fetch=async url=>{assert.equal(new URL(url).searchParams.get('gid'),'123');return new Response('<h1>Fragment</h1>');};
  try{const r=await onRequestGet({request:new Request('https://sheets.built.at/A1?id=abcdefghijklmnopqrst&gid=123')});assert.match(await r.text(),/<body><h1>Fragment<\/h1><\/body>/);}finally{global.fetch=original;}
});
test('A1 rejects invalid IDs and Google login responses',async()=>{
  const original=global.fetch;global.fetch=async()=>new Response('<html>Login</html>',{headers:{'content-type':'text/html'}});
  try{assert.equal((await onRequestGet({request:new Request('https://sheets.built.at/A1?id=bad')})).status,400);const r=await onRequestGet({request:new Request('https://sheets.built.at/A1?id=abcdefghijklmnopqrst')});assert.equal(r.status,502);assert.doesNotMatch(await r.text(),/<html>Login/);}finally{global.fetch=original;}
});
