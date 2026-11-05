import {parseCsv} from './api/sheet.js';
import {getRenderableHtml} from '../public/render.js';
import {pagesFromTable,getRedirectUrl,normalizeSlug} from '../public/model.js';
import {injectUtilityMenu,utilityItems} from '../public/utility-menu.js';

const headers={
  'content-type':'text/html; charset=utf-8',
  'cache-control':'no-store, max-age=0',
  'cdn-cache-control':'no-store',
  'cloudflare-cdn-cache-control':'no-store',
  'referrer-policy':'no-referrer',
  'x-content-type-options':'nosniff',
  'content-security-policy':'sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation'
};
const sheetFetchOptions = () => ({
  cache: 'no-store',
  headers: {'cache-control': 'no-cache'},
  signal: AbortSignal.timeout(20000)
});

async function sheetTabs(id) {
  try {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${id}/htmlview`, sheetFetchOptions());
    if (!response.ok) return [];
    const html = await response.text();
    const literal = '"(?:\\\\.|[^"\\\\])*"';
    const pattern = new RegExp('items\\.push\\(\\{name:\\s*(' + literal + '),\\s*pageUrl:\\s*' + literal + ',\\s*gid:\\s*"(\\d+)"', 'g');
    return Array.from(html.matchAll(pattern), ([, name, gid]) => ({name: JSON.parse(name), gid}));
  } catch {
    return [];
  }
}

async function sheetRows(id, gid, range) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${id}/export`);
  url.searchParams.set('format', 'csv');
  url.searchParams.set('range', range);
  url.searchParams.set('_', crypto.randomUUID());
  if (gid !== null) url.searchParams.set('gid', gid);
  const response = await fetch(url, sheetFetchOptions());
  if (!response.ok || /text\/html/i.test(response.headers.get('content-type') || '')) {
    throw new Error('Google did not return CSV.');
  }
  return parseCsv(await response.text());
}

function optionalTabRows(id, tabs, name, range) {
  const tab = tabs.find(tab => tab.name.toLowerCase() === name);
  return tab ? sheetRows(id, tab.gid, range) : [];
}

function addTheme(html, css) {
  if (!css.trim()) return html;
  // Keep literal closing style tags in CSS from becoming HTML markup.
  const style = `<style data-built-at-theme>${css.replace(/<(?=\/style[\s/>])/gi, '\\3C ')}</style>`;
  const position = html.search(/<\/head\s*>|<body[\s>]/i);
  if (position !== -1) return html.slice(0, position) + style + html.slice(position);
  const endOfPreamble = html.match(/^(?:<!doctype[^>]*>\s*)?(?:<html\b[^>]*>\s*)?/i)[0].length;
  return html.slice(0, endOfPreamble) + style + html.slice(endOfPreamble);
}

function error(message,status){return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sheet preview</title></head><body style="font:16px/1.6 system-ui;padding:24px;max-width:650px;margin:auto"><p>${message}</p></body></html>`,{status,headers});}

export async function onRequestGet({request}){
  const params=new URL(request.url).searchParams;
  const id=params.get('id')||params.get('ID')||'';
  if(!/^[a-zA-Z0-9_-]{20,}$/.test(id))return error('Use /a1?id=YOUR_SHEET_ID to preview the HTML or Markdown in cell A1.',400);
  const gid=params.get('gid');
  if(gid!==null&&!/^\d+$/.test(gid))return error('The worksheet ID must be a number.',400);
  try {
    const [rows, tabs] = await Promise.all([
      sheetRows(id, gid, 'A:B').catch(() => null),
      sheetTabs(id)
    ]);
    if (!rows) return error('Could not read A1. Share the Google Sheet as “Anyone with the link can view,” then refresh.',502);
    const [themeRows, settingsRows] = await Promise.all([
      optionalTabRows(id, tabs, 'theme', 'A1'),
      optionalTabRows(id, tabs, 'settings', 'A1:B1')
    ]);
    const css = themeRows[0]?.[0] ?? '';
    const [menuLabel = '', menuValue = ''] = settingsRows[0] ?? [];
    const hideMenu = menuLabel.trim().toLowerCase() === 'show default menu'
      && /^(?:false|off|no|0)$/i.test(menuValue.trim());
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([rows, css, hideMenu])));
    const revision=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    if(params.get('live')==='check')return Response.json({revision},{headers:{'cache-control':'no-store','access-control-allow-origin':'*'}});
    const slug=params.has('slug')?normalizeSlug(params.get('slug')):null;
    let pages=new Map();try{pages=pagesFromTable({rows:rows.map(row=>({c:row.slice(0,2).map(v=>({v}))}))});}catch{if(slug!==null)return error('Page slugs must be valid and unique in column B.',400);}
    if(slug!==null&&!pages.has(slug))return error('This page slug was not found in column B.',404);
    const content=slug===null?(rows[0]?.[0]||''):pages.get(slug).content;
    if(!content.trim())return error('A1 is empty. Put HTML or Markdown in A1, then refresh this page.',404);
    const redirect=getRedirectUrl(content);
    if(redirect)return new Response(null,{status:302,headers:{...headers,location:redirect}});
    const pageLinks=[...pages.values()].filter(page=>page.content.trim()).map(page=>{
      const href=new URL('/a1',request.url);href.searchParams.set('id',id);href.searchParams.set('slug',page.slug);if(gid!==null)href.searchParams.set('gid',gid);
      return {label:page.slug==='home'?'Home':page.slug.replace(/[-_]/g,' '),href:href.pathname+href.search,current:slug===page.slug||(slug===null&&page.content===content)};
    });
    const configured=hideMenu||['0','none'].includes(params.get('menu'))?[]:undefined;
    const items=utilityItems(params.get('pages')==='0'?[]:pageLinks,configured);
    if(items.length){
      const editUrl=new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`);
      const editRow=slug===null?1:rows.findIndex(row=>normalizeSlug(row[1])===slug)+1;
      const editGid=gid??tabs[0]?.gid;
      const editHash=new URLSearchParams();if(editGid){editUrl.searchParams.set('gid',editGid);editHash.set('gid',editGid);}editHash.set('range',`A${editRow}`);editUrl.hash=editHash.toString();
      const copyIndex=items.findIndex(item=>item.action==='copy');
      items.splice(copyIndex<0?0:copyIndex+1,0,{label:'Edit Sheet',href:editUrl.href});
    }
    const utilityScriptUrl=new URL('/utility-client.js',request.url);utilityScriptUrl.searchParams.set('v','20261105-1000ms');
    let html=injectUtilityMenu(addTheme(getRenderableHtml(content),css),{source:content,items,scriptUrl:utilityScriptUrl.href});
    if(params.get('live')!=='0'){
      const checkUrl=new URL(request.url);checkUrl.searchParams.set('live','check');
      const config=JSON.stringify({revision,checkUrl:checkUrl.href}).replace(/</g,'\\u003c');
      const client=new URL('/live-client.js?v=20261105-fast',request.url).href;
      const script=`<script type="application/json" data-built-at-live-config>${config}</script><script src="${client}" defer></script>`;
      const closing=[...html.matchAll(/<\/body\s*>/gi)].at(-1);
      html=closing?html.slice(0,closing.index)+script+html.slice(closing.index):html+script;
    }
    return new Response(html,{headers});
  }catch{return error('Google could not return A1. Refresh to try again.',502);}
}

