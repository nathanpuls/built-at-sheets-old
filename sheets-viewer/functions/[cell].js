import {onRequestGet} from './A1.js';

export async function onRequest(context){
  if(String(context.params.cell).toLowerCase()==='a1'&&context.request.method==='GET')return onRequestGet(context);
  return context.next();
}
