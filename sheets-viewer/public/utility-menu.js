// Add links or supported actions here. An empty array hides the menu.
export const DEFAULT_UTILITY_ITEMS = [{label:'Copy source',action:'copy'},{label:'Pages',action:'pages'}];

export function utilityItems(pages,configured=DEFAULT_UTILITY_ITEMS){
  return configured.map(item=>item.action==='pages'?{...item,items:pages}:item).filter(item=>item.action!=='pages'||item.items.length>0);
}


export function injectUtilityMenu(html,{source,items,scriptUrl="/utility-client.js"}){
  if(!items.length)return html;
  const json=JSON.stringify({source,items,scriptUrl="/utility-client.js"}).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const script=`<script type="application/json" data-built-at-utility-config>${json}</script><script src="${scriptUrl}" defer></script>`;
  const closing=[...html.matchAll(/<\/body\s*>/gi)].at(-1);
  return closing?html.slice(0,closing.index)+script+html.slice(closing.index):html+script;
}
