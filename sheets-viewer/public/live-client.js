// Change checks run on push events and reconnection, never on a polling timer.
const element=document.querySelector('script[data-built-at-live-config]');
if(element){
  const config=JSON.parse(element.textContent);
  let socket,reconnectTimer,retry=1000,stopped=false,checking=false,again=false;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function check(attempts){
    if(checking){again=true;return;}
    checking=true;
    try{
      for(let attempt=0;attempt<attempts;attempt++){
        if(attempt)await sleep(Math.min(500*2**(attempt-1),4000));
        try{
          const response=await fetch(config.checkUrl,{cache:'no-store',credentials:'omit'});
          if(!response.ok)continue;
          const value=await response.json();
          if(value.revision&&value.revision!==config.revision){stopped=true;socket?.close();location.reload();return;}
        }catch{}
      }
    }finally{checking=false;if(again&&!stopped){again=false;check(4);}}
  }
  function connect(){
    if(stopped)return;
    socket=new WebSocket(config.socketUrl);
    socket.onopen=()=>{retry=1000;};
    socket.onmessage=event=>{
      try{
        const message=JSON.parse(event.data);
        if(message.type==='changed')check(5);
        else if(message.type==='ready')check(1);
      }catch{}
    };
    socket.onclose=()=>{
      if(stopped)return;
      clearTimeout(reconnectTimer);
      reconnectTimer=setTimeout(connect,retry+Math.random()*500);retry=Math.min(retry*2,30000);
    };
  }
  addEventListener('pagehide',()=>{stopped=true;clearTimeout(reconnectTimer);socket?.close();});
  addEventListener('pageshow',event=>{if(event.persisted){stopped=false;connect();}});
  connect();
}
