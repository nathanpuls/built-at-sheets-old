import {onRequestGet} from './A1.js';

export async function onRequest(context){
  const url=new URL(context.request.url);
  if(context.request.method!=='GET'||(!url.searchParams.has('id')&&!url.searchParams.has('ID')))return context.next();
  if(!url.searchParams.has('slug'))url.searchParams.set('slug',url.searchParams.get('page')||'home');
  return onRequestGet({...context,request:new Request(url,context.request)});
}
