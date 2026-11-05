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
async function firstSheetGid(id){
  try{
    const response=await fetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/htmlview`,{cache:'no-store',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)});
    if(!response.ok)return '';
    const html=await response.text();
    const literal='"(?:\\\\.|[^"\\\\])*"';
    const pattern=new RegExp('items\\.push\\(\\{name:\\s*'+literal+',\\s*pageUrl:\\s*'+literal+',\\s*gid:\\s*"(\\d+)"');
    return html.match(pattern)?.[1]||'';
  }catch{return '';}
}
function error(message,status){return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sheet preview</title></head><body style="font:16px/1.6 system-ui;padding:24px;max-width:650px;margin:auto"><p>${message}</p></body></html>`,{status,headers});}

export async function onRequestGet({request}){
  const params=new URL(request.url).searchParams;
  const id=params.get('id')||params.get('ID')||'';
  if(!/^[a-zA-Z0-9_-]{20,}$/.test(id))return error('Use /a1?id=YOUR_SHEET_ID to preview the HTML or Markdown in cell A1.',400);
  const gid=params.get('gid');
  if(gid!==null&&!/^\d+$/.test(gid))return error('The worksheet ID must be a number.',400);
  const url=new URL(`https://docs.google.com/spreadsheets/d/${id}/export`);
  url.searchParams.set('format','csv');url.searchParams.set('range','A:B');url.searchParams.set('_',crypto.randomUUID());
  if(gid!==null)url.searchParams.set('gid',gid);
  try{
    const response=await fetch(url,{cache:'no-store',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)});
    if(!response.ok||/text\/html/i.test(response.headers.get('content-type')||''))return error('Could not read A1. Share the Google Sheet as “Anyone with the link can view,” then refresh.',502);
    const rows=parseCsv(await response.text());
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
    const configured=['0','none'].includes(params.get('menu'))?[]:undefined;
    const items=utilityItems(params.get('pages')==='0'?[]:pageLinks,configured);
    if(items.length){
      const editUrl=new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`);
      const editRow=slug===null?1:rows.findIndex(row=>normalizeSlug(row[1])===slug)+1;
      const editGid=gid??await firstSheetGid(id);
      const editHash=new URLSearchParams();if(editGid){editUrl.searchParams.set('gid',editGid);editHash.set('gid',editGid);}editHash.set('range',`A${editRow}`);editUrl.hash=editHash.toString();
      const copyIndex=items.findIndex(item=>item.action==='copy');
      items.splice(copyIndex<0?0:copyIndex+1,0,{label:'Edit Sheet',href:editUrl.href});
    }
    const utilityScriptUrl=new URL('/utility-client.js',request.url);utilityScriptUrl.searchParams.set('v','20261105-1000ms');
    const html=injectUtilityMenu(getRenderableHtml(content),{source:content,items,scriptUrl:utilityScriptUrl.href});
    return new Response(html,{headers});
  }catch{return error('Google could not return A1. Refresh to try again.',502);}
}
