import {parseCsv} from './api/sheet.js';

const headers={
  'content-type':'text/html; charset=utf-8',
  'cache-control':'no-store, max-age=0',
  'cdn-cache-control':'no-store',
  'cloudflare-cdn-cache-control':'no-store',
  'referrer-policy':'no-referrer',
  'x-content-type-options':'nosniff',
  'content-security-policy':'sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation'
};
function error(message,status){return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sheet preview</title></head><body style="font:16px/1.6 system-ui;padding:24px;max-width:650px;margin:auto"><p>${message}</p></body></html>`,{status,headers});}

export async function onRequestGet({request}){
  const params=new URL(request.url).searchParams;
  const id=params.get('id')||params.get('ID')||'';
  if(!/^[a-zA-Z0-9_-]{20,}$/.test(id))return error('Use /A1?id=YOUR_SHEET_ID to preview the HTML in cell A1.',400);
  const gid=params.get('gid');
  if(gid!==null&&!/^\d+$/.test(gid))return error('The worksheet ID must be a number.',400);
  const url=new URL(`https://docs.google.com/spreadsheets/d/${id}/export`);
  url.searchParams.set('format','csv');url.searchParams.set('range','A1');url.searchParams.set('_',crypto.randomUUID());
  if(gid!==null)url.searchParams.set('gid',gid);
  try{
    const response=await fetch(url,{cache:'no-store',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)});
    if(!response.ok||/text\/html/i.test(response.headers.get('content-type')||''))return error('Could not read A1. Share the Google Sheet as “Anyone with the link can view,” then refresh.',502);
    const content=parseCsv(await response.text())[0]?.[0]||'';
    if(!content.trim())return error('A1 is empty. Put HTML in A1, then refresh this page.',404);
    const html=/<!doctype\s+html|<html[\s>]/i.test(content)?content:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sheet preview</title></head><body>${content}</body></html>`;
    return new Response(html,{headers});
  }catch{return error('Google could not return A1. Refresh to try again.',502);}
}
