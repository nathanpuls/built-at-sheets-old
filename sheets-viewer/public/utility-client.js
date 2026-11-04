function mountUtilityMenu(config){
  if(!config.items.length)return;
  const host=document.createElement('built-at-utility-menu');
  host.style.cssText='all:initial!important;position:fixed!important;top:0!important;right:0!important;width:52px!important;height:50px!important;padding:6px 8px 0 0!important;box-sizing:border-box!important;z-index:2147483647!important;display:block!important;';
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>
    :host{color-scheme:light}*{box-sizing:border-box}button,a{font:13px/1.4 system-ui,sans-serif;color:#333;letter-spacing:normal;text-transform:none}button{cursor:pointer}#toggle{display:block;margin-left:auto;width:36px;height:36px;padding:0;border:0;border-radius:5px;background:transparent;color:#777;font-size:25px;line-height:1}#toggle:hover,#toggle:focus-visible{color:#111;background:rgba(127,127,127,.08)}#panel{position:absolute;right:8px;top:42px;min-width:172px;max-width:min(280px,calc(100vw - 24px));max-height:calc(100dvh - 64px);overflow:auto;padding:5px;background:#fff;border-radius:7px;box-shadow:0 3px 20px #00000018}#panel button,#panel a{display:block;width:100%;margin:0;padding:10px 12px;border:0;border-radius:4px;text-align:left;text-decoration:none;background:none;overflow-wrap:anywhere}#panel button:hover,#panel a:hover,#panel button:focus-visible,#panel a:focus-visible{background:#f3f3f3;color:#111}#panel a[aria-current]{font-weight:650}#panel a.page-link{position:relative}#panel a.page-link::after{content:"";position:absolute;left:12px;right:12px;bottom:4px;height:2px;border-radius:2px;background:#333;transform:scaleX(0);transform-origin:left}#panel a.page-link.dwell::after{animation:dwell-progress 2s linear forwards}@keyframes dwell-progress{to{transform:scaleX(1)}}#notice{position:fixed;left:50%;top:14px;transform:translateX(-50%);white-space:nowrap;max-width:calc(100vw - 80px);font:500 13px/1.4 system-ui,sans-serif;color:#fff;background:#252525;padding:9px 16px;border-radius:999px;box-shadow:0 3px 14px #00000018;pointer-events:none}[hidden]{display:none!important}@media(max-width:600px){#toggle{width:44px;height:44px}#panel{top:50px}#panel button,#panel a{min-height:44px;padding:12px}}
  </style><span id="notice" role="status" aria-live="polite" hidden></span><button id="toggle" type="button" aria-label="Page utilities" aria-haspopup="menu" aria-expanded="false" aria-controls="panel">⋯</button><div id="panel" role="menu" aria-label="Page utilities" hidden></div>`;
  const toggle=root.getElementById('toggle'),panel=root.getElementById('panel'),notice=root.getElementById('notice');let timer,closeTimer,dwellTimer;
  const hoverCapable=matchMedia('(hover: hover) and (pointer: fine)');
  const cancelDwell=()=>{clearTimeout(dwellTimer);panel.querySelectorAll('.dwell').forEach(entry=>entry.classList.remove('dwell'));};
  const close=()=>{clearTimeout(closeTimer);cancelDwell();panel.hidden=true;toggle.setAttribute('aria-expanded','false');};
  const open=()=>{clearTimeout(closeTimer);show(config.items);panel.hidden=false;toggle.setAttribute('aria-expanded','true');};
  const deferClose=()=>{clearTimeout(closeTimer);closeTimer=setTimeout(()=>{if(!panel.contains(root.activeElement))close();},650);};
  const tell=text=>{notice.textContent=text;notice.hidden=false;clearTimeout(timer);timer=setTimeout(()=>{notice.hidden=true;},1600);};
  async function copy(){
    // The synchronous fallback also works in the page's opaque-origin sandbox.
    const area=document.createElement('textarea');area.value=config.source;area.readOnly=true;area.setAttribute('aria-label','Page source');area.style.cssText='position:fixed;top:0;left:-9999px;opacity:0;font-size:16px;';
    root.append(area);area.focus();area.select();area.setSelectionRange(0,area.value.length);
    const onCopy=event=>{event.clipboardData?.setData('text/plain',config.source);event.preventDefault();};
    document.addEventListener('copy',onCopy,true);
    let copied=false;try{copied=document.execCommand('copy');}catch{}document.removeEventListener('copy',onCopy,true);area.remove();
    if(!copied){try{await navigator.clipboard.writeText(config.source);copied=true;}catch{}}
    tell(copied?'Source copied':'Could not copy');toggle.focus();
  }
  const actions={copy};
  function show(items){
    panel.replaceChildren();
    for(const item of items){
      const entry=document.createElement(item.href?'a':'button');entry.textContent=item.label;entry.setAttribute('role','menuitem');
      if(item.href){entry.href=item.href;if(item.current)entry.setAttribute('aria-current','page');else if(item.current===false){entry.classList.add('page-link');entry.addEventListener('pointerenter',event=>{if(!hoverCapable.matches||event.pointerType!=='mouse')return;cancelDwell();entry.classList.add('dwell');dwellTimer=setTimeout(()=>{entry.click();},2000);});entry.addEventListener('pointerleave',cancelDwell);}entry.addEventListener('click',close);}
      else{entry.type='button';entry.addEventListener('click',()=>{close();actions[item.action]?.(item);});}
      panel.append(entry);
    }
  }
  host.addEventListener('pointerenter',event=>{if(hoverCapable.matches&&event.pointerType==='mouse')clearTimeout(closeTimer);});
  host.addEventListener('pointerleave',event=>{if(hoverCapable.matches&&event.pointerType==='mouse'&&!panel.contains(root.activeElement))deferClose();});
  toggle.addEventListener('pointerenter',event=>{if(hoverCapable.matches&&event.pointerType==='mouse')open();});
  panel.addEventListener('pointerenter',event=>{if(hoverCapable.matches&&event.pointerType==='mouse')clearTimeout(closeTimer);});
  toggle.addEventListener('click',()=>{
    if(!panel.hidden){close();return;}
    open();
  });
  document.addEventListener('pointerdown',e=>{if(!e.composedPath().includes(host))close();});
  document.addEventListener('focusin',e=>{if(!e.composedPath().includes(host))close();});
  root.addEventListener('keydown',e=>{
    if(e.key==='Escape'){close();toggle.focus();e.preventDefault();}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(panel.hidden)open();const entries=[...panel.querySelectorAll('button,a')];const index=entries.indexOf(root.activeElement);entries[(index+(e.key==='ArrowDown'?1:-1)+entries.length)%entries.length]?.focus();}
  });
  document.body.append(host);
}

const configElement=document.querySelector("script[data-built-at-utility-config]");
if(configElement)mountUtilityMenu(JSON.parse(configElement.textContent));
