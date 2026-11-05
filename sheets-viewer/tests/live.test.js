import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {onRequestGet} from '../functions/A1.js';

test('revision checks change after edits and retain public sandbox compatibility',async()=>{
  const original=global.fetch;let content='Before,home';
  global.fetch=async()=>new Response(content);
  try{
    const request=new Request('https://sheets.built.at/a1?id=abcdefghijklmnopqrst&live=check');
    const before=await onRequestGet({request});
    assert.equal(before.headers.get('access-control-allow-origin'),'*');
    assert.match(before.headers.get('cache-control'),/no-store/);
    const first=(await before.json()).revision;
    assert.equal((await (await onRequestGet({request})).json()).revision,first);
    content='After,home';
    assert.notEqual((await (await onRequestGet({request})).json()).revision,first);
  }finally{global.fetch=original;}
});

test('automatic checks pause in hidden tabs and reload changed content',async()=>{
  let scheduled,fetches=0,reloads=0,revision='before';const events={};
  const document={hidden:false,querySelector:()=>({textContent:JSON.stringify({revision:'before',checkUrl:'https://example.test/check'})}),addEventListener:(key,fn)=>events[key]=fn};
  vm.runInNewContext(readFileSync(new URL('../public/live-client.js',import.meta.url),'utf8'),{document,Date,AbortSignal,Error,JSON,fetch:async()=>{fetches++;return {ok:true,json:async()=>({revision})};},location:{reload:()=>reloads++},setTimeout:(fn,ms)=>{scheduled={fn,ms};return 1;},clearTimeout:()=>{},addEventListener:(key,fn)=>events[key]=fn});
  assert.equal(scheduled.ms,1000);
  document.hidden=true;await scheduled.fn();assert.equal(fetches,0);
  document.hidden=false;await events.visibilitychange();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(fetches,1);assert.equal(reloads,0);
  revision='after';await scheduled.fn();assert.equal(reloads,1);
});
