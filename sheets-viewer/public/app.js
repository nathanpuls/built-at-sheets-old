import {escapeHtml,getRenderableHtml} from './render.js';
import {normalizeSlug,extractSheetId,pagesFromTable,getRedirectUrl,pageUrl} from './model.js';
const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
const id=extractSheetId(query.get('id')),slug=normalizeSlug(query.get('slug')||query.get('page'))||'home',gid=query.get('gid')||'';
let requestNumber=0;
$('open').addEventListener('submit',e=>{e.preventDefault();const value=$('sheet').value;const sheetId=extractSheetId(value);if(!sheetId){$('form-error').textContent='Paste a valid Google Sheet link or ID.';return;}const worksheet=value.match(/[#?&]gid=(\d+)/)?.[1]||'';location.assign(pageUrl(sheetId,'home',worksheet));});
function status(title,message){$('status').innerHTML=`<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`;$('status').hidden=false;}
async function loadSheet(){const params=new URLSearchParams({id,_:String(Date.now())});if(gid)params.set('gid',gid);const res=await fetch('/api/sheet?'+params,{cache:'no-store'});const data=await res.json();if(!res.ok)throw new Error(data.error||'Could not load this Sheet.');return data;}
function prepareDocument(content,pages){
 const doc=new DOMParser().parseFromString(getRenderableHtml(content),'text/html');
 // Relative page links navigate the viewer, preserving the Sheet ID.
 for(const link of doc.querySelectorAll('a[href]')){const href=link.getAttribute('href');if(href.startsWith('#'))continue;if(!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)){
   const local=href.split('#')[0].split('?')[0];const target=normalizeSlug(local.replace(/^\.\//,''))||'home';
   if(pages.has(target)){link.setAttribute('href',new URL(pageUrl(id,target,gid),location.origin).href+(href.includes('#')?'#'+href.split('#').slice(1).join('#'):''));link.target='_top';continue;}
 }link.target='_blank';link.rel='noopener noreferrer';}
 return '<!doctype html>\n'+doc.documentElement.outerHTML;
}
async function renderUserPage(){
 const current=++requestNumber;$('refresh').disabled=true;$('status').hidden=true;
 try{const data=await loadSheet();if(current!==requestNumber)return;const pages=pagesFromTable(data.table);
   $('pages').replaceChildren();for(const page of pages.values()){const a=document.createElement('a');a.textContent=page.slug==='home'?'Home':page.slug.replace(/[-_]/g,' ');a.href=pageUrl(id,page.slug,gid);if(page.slug===slug)a.setAttribute('aria-current','page');$('pages').append(a);}
   const page=pages.get(slug);if(!page)throw new Error(slug==='home'?'Add a row with “home” in column B to create your homepage.':`There is no page with slug “${slug}” in column B.`);
   if(!page.content.trim())throw new Error(`The “${slug}” page has no content in column A.`);
   const redirect=getRedirectUrl(page.content);if(redirect){if(new URL(redirect).href===location.href)throw new Error('This redirect points back to itself.');location.replace(redirect);return;}
   $('preview').srcdoc=prepareDocument(page.content,pages);$('preview').hidden=false;$('status').hidden=true;
   document.title=(slug==='home'?'Preview':slug.replace(/[-_]/g,' '))+' — Built.at Sheets';
 }catch(error){if(current!==requestNumber)return;$('preview').hidden=true;status('Could not show this page',error.message);}finally{if(current===requestNumber)$('refresh').disabled=false;}
}
if(query.has('id')){$('setup').hidden=true;$('refresh').hidden=false;$('refresh').addEventListener('click',renderUserPage);if(!id){status('Invalid Sheet ID','Paste a Google Sheet link or ID on the homepage.');}else{$('edit').href=`https://docs.google.com/spreadsheets/d/${id}/edit${gid?'#gid='+gid:''}`;$('edit').hidden=false;renderUserPage();}}
window.addEventListener('pageshow',e=>{if(e.persisted&&id)renderUserPage();});
