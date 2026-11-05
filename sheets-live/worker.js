const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health')return json({ok:!!env.GOOGLE_AUTH,googleConnected:!!env.GOOGLE_AUTH},env.GOOGLE_AUTH?200:503);
    const id=url.pathname.startsWith('/notify/')?url.pathname.slice(8):url.searchParams.get('id');
    if(!(env.SHEET_IDS||'').split(',').includes(id))return json({error:'Sheet is not connected for live updates.'},404);
    if(url.pathname!=='/live'&&!url.pathname.startsWith('/notify/'))return json({error:'Not found'},404);
    return env.SHEET_LIVE.get(env.SHEET_LIVE.idFromName(id)).fetch(request);
  }
};

export class SheetLive {
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async google(path,body){
    if(!this.token||this.tokenExpires<Date.now()+60000){
      const auth=JSON.parse(this.env.GOOGLE_AUTH);
      const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({...auth,grant_type:'refresh_token',scope:'https://www.googleapis.com/auth/drive.metadata.readonly'})});
      if(!response.ok)throw new Error('Google authorization needs attention');
      const value=await response.json();this.token=value.access_token;this.tokenExpires=Date.now()+value.expires_in*1000;
    }
    const response=await fetch('https://www.googleapis.com/drive/v3/'+path,{method:'POST',headers:{authorization:'Bearer '+this.token,'content-type':'application/json'},body:JSON.stringify(body)});
    if(!response.ok){console.error('Google watch request failed',response.status);throw new Error('Could not subscribe to sheet changes');}
    return response.status===204?null:response.json();
  }
  async subscribe(id,origin){
    const previous=await this.ctx.storage.get('watch');
    if(previous&&Number(previous.expiration)>Date.now()+3600000)return;
    const channel={id:crypto.randomUUID(),token:crypto.randomUUID()+crypto.randomUUID()};
    await this.ctx.storage.put('pending',channel);
    const watch=await this.google('files/'+encodeURIComponent(id)+'/watch',{...channel,type:'web_hook',address:origin+'/notify/'+id,expiration:String(Date.now()+86400000)});
    await this.ctx.storage.put({watch:{...watch,token:channel.token},sheetId:id,origin});
    await this.ctx.storage.delete('pending');
    await this.ctx.storage.setAlarm(Number(watch.expiration)-3600000);
    if(previous?.resourceId){try{await this.google('channels/stop',{id:previous.id,resourceId:previous.resourceId});}catch{}}
  }
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/notify/')){
      if(request.method!=='POST')return new Response(null,{status:405});
      const [watch,pending]=await Promise.all([this.ctx.storage.get('watch'),this.ctx.storage.get('pending')]);
      const channel=request.headers.get('x-goog-channel-id'),token=request.headers.get('x-goog-channel-token');
      if(![watch,pending].some(w=>w&&w.id===channel&&w.token===token))return new Response(null,{status:403});
      if(request.headers.get('x-goog-resource-state')==='sync')return new Response(null,{status:204});
      const revision=crypto.randomUUID();await this.ctx.storage.put('revision',revision);
      for(const ws of this.ctx.getWebSockets()){try{ws.send(JSON.stringify({type:'changed',revision}));}catch{}}
      return new Response(null,{status:204});
    }
    if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return json({error:'Use a WebSocket connection'},426);
    try{
      if(!this.subscribing)this.subscribing=this.subscribe(url.searchParams.get('id'),url.origin).finally(()=>{this.subscribing=null;});
      await this.subscribing;
    }
    catch(error){console.error(error.message);return json({error:error.message},503);}
    const [client,server]=Object.values(new WebSocketPair());this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({type:'ready',revision:await this.ctx.storage.get('revision')||'initial'}));
    return new Response(null,{status:101,webSocket:client});
  }
  async alarm(){
    if(!this.ctx.getWebSockets().length)return;
    try{await this.subscribe(await this.ctx.storage.get('sheetId'),await this.ctx.storage.get('origin'));}
    catch(error){console.error(error.message);await this.ctx.storage.setAlarm(Date.now()+300000);}
  }
  webSocketClose(ws,code,reason){ws.close(code,reason);}
  webSocketError(ws){try{ws.close(1011,'Connection error');}catch{}}
}
