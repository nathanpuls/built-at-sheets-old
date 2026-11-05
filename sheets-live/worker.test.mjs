import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{SheetLive} from './worker.js';

test('only configured public sheets can subscribe',async()=>{
  const response=await worker.fetch(new Request('https://live.example/live?id=private'),{SHEET_IDS:'public'});
  assert.equal(response.status,404);
});

test('authenticated change notifications broadcast; sync and spoofed events do not',async()=>{
  const values=new Map([['watch',{id:'channel',token:'secret'}]]),messages=[];
  const ctx={storage:{get:async k=>values.get(k),put:async(k,v)=>values.set(k,v)},getWebSockets:()=>[{send:value=>messages.push(JSON.parse(value))}]};
  const room=new SheetLive(ctx,{});
  const notify=(token,state)=>room.fetch(new Request('https://live.example/notify/public',{method:'POST',headers:{'x-goog-channel-id':'channel','x-goog-channel-token':token,'x-goog-resource-state':state}}));
  assert.equal((await notify('wrong','update')).status,403);
  assert.equal((await notify('secret','sync')).status,204);
  assert.equal(messages.length,0);
  assert.equal((await notify('secret','update')).status,204);
  assert.equal(messages.length,1);assert.equal(messages[0].type,'changed');
  assert.equal(messages[0].revision,values.get('revision'));
});

test('watch registration uses metadata scope and renews before expiration',async()=>{
  const original=globalThis.fetch,calls=[],values=new Map();let alarm;
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).includes('oauth2'))return Response.json({access_token:'test-access-token',expires_in:3600});
    const input=JSON.parse(options.body);
    return Response.json({id:input.id,resourceId:'resource',expiration:input.expiration});
  };
  const storage={get:async k=>values.get(k),put:async(k,v)=>typeof k==='string'?values.set(k,v):Object.entries(k).forEach(([key,value])=>values.set(key,value)),delete:async k=>values.delete(k),setAlarm:async value=>{alarm=value;}};
  try{
    const room=new SheetLive({storage},{GOOGLE_AUTH:JSON.stringify({client_id:'test',client_secret:'test',refresh_token:'test'})});
    await room.subscribe('public','https://live.example');
    assert.equal(calls.length,2);
    assert.equal(calls[0].options.body.get('scope'),'https://www.googleapis.com/auth/drive.metadata.readonly');
    assert.equal(JSON.parse(calls[1].options.body).address,'https://live.example/notify/public');
    assert.equal(alarm,Number(values.get('watch').expiration)-3600000);
    await room.subscribe('public','https://live.example');assert.equal(calls.length,2);
  }finally{globalThis.fetch=original;}
});
