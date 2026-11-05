// One active request per visible page. Hidden tabs make no automatic requests.
const element=document.querySelector('script[data-built-at-live-config]');
if(element){
  const config=JSON.parse(element.textContent);
  let timer,checking=false,stopped=false;
  async function check(){
    clearTimeout(timer);
    if(stopped||document.hidden||checking)return;
    checking=true;
    const started=Date.now();let delay=1000;
    try{
      const response=await fetch(config.checkUrl,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Sheet unavailable');
      const value=await response.json();
      if(value.revision&&value.revision!==config.revision){stopped=true;location.reload();return;}
    }catch{delay=5000;}
    finally{
      checking=false;
      if(!stopped&&!document.hidden)timer=setTimeout(check,Math.max(250,delay-(Date.now()-started)));
    }
  }
  document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)check();});
  addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);});
  addEventListener('pageshow',event=>{if(event.persisted){stopped=false;check();}});
  timer=setTimeout(check,1000);
}
