export function normalizeSlug(value){return String(value??'').trim().toLowerCase().replace(/^\/+|\/+$/g,'');}
export function extractSheetId(value){const text=String(value||'').trim();return text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1]||(/^[a-zA-Z0-9_-]{20,}$/.test(text)?text:'');}
export function pagesFromTable(table){
  const pages=new Map();
  for(const row of table.rows||[]){const content=String(row.c?.[0]?.v??'');const raw=String(row.c?.[1]?.v??'');
    if(content.trim().toLowerCase()==='content'&&raw.trim().toLowerCase()==='slug')continue;
    const slug=normalizeSlug(raw);if(!slug)continue;
    if(pages.has(slug))throw new Error(`Duplicate slug “${slug}”. Give each page a unique slug in column B.`);
    if(/[?#\\\s]/.test(slug)||slug.split('/').some(s=>!s||s==='.'||s==='..'))throw new Error(`Invalid slug “${slug}”. Use words separated by hyphens or slashes.`);
    pages.set(slug,{slug,content});
  }return pages;
}
export function getRedirectUrl(content){
 const text=String(content).trim();if(!text||/[\s<>"'`\\]/.test(text))return '';
 let target=text;
 if(text.startsWith('//'))target='https:'+text;
 else if(!/^https?:\/\//i.test(text)){
   if(!/^(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}|localhost)(?::\d{1,5})?(?:[/?#].*)?$/i.test(text))return '';
   target='https://'+text;
 }
 try{const url=new URL(target);return !['http:','https:'].includes(url.protocol)||url.username||url.password?'':url.href;}catch{return '';}
}
export function pageUrl(id,slug='home',gid=''){const p=new URLSearchParams({id});if(slug!=='home')p.set('slug',slug);if(gid)p.set('gid',gid);return '/?'+p;}
