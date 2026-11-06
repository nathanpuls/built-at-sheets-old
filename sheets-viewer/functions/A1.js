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

function addSharedComponents(html, components) {
  if (!components.length) return html;
  const markup = components.join('\n');
  const closing = [...html.matchAll(/<\/body\s*>/gi)].at(-1);
  return closing ? html.slice(0, closing.index) + markup + html.slice(closing.index) : html + markup;
}


const endsSettingsGid = '990299918';

function siteSettings(rows) {
  const values = new Map();
  for (const [label = '', raw = '', , id = ''] of rows) {
    const key = (id.trim() || label.trim()).toLowerCase().replace(/\s+/g, '-');
    const value = raw.trim();
    if (value && !values.has(key)) values.set(key, value);
  }
  return {
    logo: values.get('logo') || values.get('favicon') || '',
    name: values.get('site-name') || '',
    description: values.get('seo-description') || '',
    homepage: values.get('homepage') || ''
  };
}

function addSiteSettings(html, settings, revision) {
  const escape = value => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
  let tags = '';
  if (settings.logo) {
    html = html.replace(/<link\b(?=[^>]*\brel\s*=\s*(?:"(?:shortcut )?icon"|'(?:shortcut )?icon'|icon(?=[\s/>])))[^>]*>/gi, '');
    tags += '<link rel="icon" href="/_assets/logo?v=' + revision + '">';
  }
  if (settings.name) {
    if (!/<title\b/i.test(html)) tags += '<title>' + escape(settings.name) + '</title>';
    tags += '<meta property="og:site_name" content="' + escape(settings.name) + '">';
  }
  if (settings.description && !/<meta\b[^>]*\bname\s*=\s*["']?description\b/i.test(html)) {
    tags += '<meta name="description" content="' + escape(settings.description) + '">';
  }
  return html.replace(/^(?:\s*<!doctype[^>]*>)?(?:\s*<html\b[^>]*>)?(?:\s*<head\b[^>]*>)?/i, start => start + tags);
}

async function previewLogo(value, method) {
  const missing = () => new Response(null, {status:404, headers:{'cache-control':'no-store'}});
  if (!value) return missing();
  let url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return missing();
  if (url.hostname === 'drive.google.com') {
    const file = /^\/file\/d\/([\w-]+)/.exec(url.pathname)?.[1]
      || (/^\/(?:open|uc)$/.test(url.pathname) ? url.searchParams.get('id') : '');
    if (file && /^[\w-]+$/.test(file)) {
      const resourceKey = url.searchParams.get('resourcekey');
      url = new URL('https://drive.google.com/uc?export=download');
      url.searchParams.set('id', file);
      if (resourceKey) url.searchParams.set('resourcekey', resourceKey);
    }
  }
  const response = await fetch(url, sheetFetchOptions());
  if (!response.ok) return missing();
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 25 * 1024 * 1024) return missing();
  const prefix = new TextDecoder().decode(bytes.slice(0, 4096));
  const svg = /^(?:\s|\uFEFF|<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->)*<svg(?:\s|>)/i.test(prefix);
  const type = svg ? 'image/svg+xml' : (response.headers.get('content-type') || '').split(';')[0].trim();
  if (!/^image\/[a-z0-9.+-]+$/i.test(type)) return missing();
  return new Response(method === 'HEAD' ? null : bytes, {headers:{
    'content-type':type,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'content-security-policy':"sandbox; default-src 'none'; style-src 'unsafe-inline'"
  }});
}

function error(message,status){return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sheet preview</title></head><body style="font:16px/1.6 system-ui;padding:24px;max-width:650px;margin:auto"><p>${message}</p></body></html>`,{status,headers});}

export async function onRequestGet({request}){
  const requestUrl = new URL(request.url);
  const dedicated = requestUrl.hostname === 'live.ends.at';
  const params=requestUrl.searchParams;
  const id=params.get('id')||params.get('ID')||'';
  if(!/^[a-zA-Z0-9_-]{20,}$/.test(id))return error('Use /a1?id=YOUR_SHEET_ID to preview the HTML or Markdown in cell A1.',400);
  const gid=params.get('gid');
  if(gid!==null&&!/^\d+$/.test(gid))return error('The worksheet ID must be a number.',400);
  try {
    if (dedicated && params.get('slug') === '_assets/logo') {
      const settings = siteSettings(await sheetRows(id, endsSettingsGid, 'A:D'));
      return await previewLogo(settings.logo, request.method);
    }
    const tabs = await sheetTabs(id);
    const sourceGid = gid ?? (dedicated ? tabs.find(tab => tab.name === 'Pages')?.gid : tabs[0]?.gid);
    const rows = await sheetRows(id, sourceGid ?? null, 'A:B').catch(() => null);
    if (!rows) return error('Could not read A1. Share the Google Sheet as “Anyone with the link can view,” then refresh.',502);
    const [themeRows, settingsRows, sharedRows] = await Promise.all([
      optionalTabRows(id, tabs, 'theme', 'A1'),
      dedicated ? sheetRows(id, endsSettingsGid, 'A:D') : optionalTabRows(id, tabs, 'settings', 'A1:B1'),
      optionalTabRows(id, tabs, 'shared', 'A:B')
    ]);
    const shared = sharedRows.filter(([code = '', name = ''], index) =>
      code.trim() && name.trim() && !(index === 0 && /^(?:code|content)$/i.test(code.trim()) && /^name$/i.test(name.trim())));
    const isCss = ([, name]) => name.trim().toLowerCase() === 'css';
    const css = [themeRows[0]?.[0] ?? '', ...shared.filter(isCss).map(([code]) => code)].filter(Boolean).join('\n');
    const components = shared.filter(row => !isCss(row)).map(([code]) => code);
    const [menuLabel = '', menuValue = ''] = settingsRows[0] ?? [];
    const hideMenu = menuLabel.trim().toLowerCase() === 'show default menu'
      && /^(?:false|off|no|0)$/i.test(menuValue.trim());
    const settings = dedicated ? siteSettings(settingsRows) : null;
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([rows, css, hideMenu, components, settings])));
    const revision=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    if(params.get('live')==='check')return Response.json({revision},{headers:{'cache-control':'no-store','access-control-allow-origin':'*'}});
    const slug=params.has('slug')?normalizeSlug(params.get('slug')):null;
    let pages=new Map();try{pages=pagesFromTable({rows:rows.map(row=>({c:row.slice(0,2).map(v=>({v}))}))});}catch{if(!dedicated&&slug!==null)return error('Page slugs must be valid and unique in column B.',400);}
    if(!dedicated&&slug!==null&&!pages.has(slug))return error('This page slug was not found in column B.',404);
    const pathSlug = params.get('slug');
    const hasPageHeader = dedicated && /^page$/i.test(rows[0]?.[1]?.trim() ?? '');
    const pageRows = hasPageHeader ? rows.slice(1) : rows;
    const pageSlug = name => name.trim().replace(/^\/+|\/+$/g, '');
    const selectedHome = dedicated ? pageSlug(settings.homepage) : '';
    const homeIndex = selectedHome
      ? pageRows.findIndex(([, name = '']) => pageSlug(name) === selectedHome)
      : -1;
    const pageIndex = requestUrl.pathname === '/' && selectedHome
      ? homeIndex
      : pageRows.findIndex(([, name = '']) => pageSlug(name) === pathSlug || (!selectedHome && pathSlug === 'home' && /^\/+$/g.test(name.trim())));
    const sourceIndex = dedicated
      ? (pageIndex < 0 ? -1 : pageIndex + Number(hasPageHeader))
      : slug === null ? 0 : rows.findIndex(row => normalizeSlug(row[1]) === slug);
    const content = dedicated ? (rows[sourceIndex]?.[0] ?? '') : slug === null ? rows[0]?.[0] || '' : pages.get(slug).content;
    if(!content.trim())return error('A1 is empty. Put HTML or Markdown in A1, then refresh this page.',404);
    const redirect=getRedirectUrl(content);
    if(redirect)return new Response(null,{status:302,headers:{...headers,location:redirect}});
    const pageLinks=[...pages.values()].filter(page=>page.content.trim()).map(page=>{
      const href=new URL('/a1',request.url);href.searchParams.set('id',id);href.searchParams.set('slug',page.slug);if(gid!==null)href.searchParams.set('gid',gid);
      return {label:page.slug==='home'?'Home':page.slug.replace(/[-_]/g,' '),href:href.pathname+href.search,current:slug===page.slug||(slug===null&&page.content===content)};
    });
    const configured=hideMenu||['0','none'].includes(params.get('menu'))?[]:undefined;
    const items=utilityItems(params.get('pages')==='0'?[]:pageLinks,configured);
    let editUrl;
    if (sourceGid != null && sourceIndex >= 0) {
      const url=new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`);
      url.searchParams.set('gid', sourceGid);
      url.hash = new URLSearchParams({gid:sourceGid, range:`A${sourceIndex + 1}`}).toString();
      editUrl = url.href;
    }
    if (items.length && editUrl) {
      const copyIndex=items.findIndex(item=>item.action==='copy');
      items.splice(copyIndex<0?0:copyIndex+1,0,{label:'Edit Sheet',href:editUrl});
    }
    const utilityScriptUrl=new URL('/utility-client.js',request.url);utilityScriptUrl.searchParams.set('v','20261105-1000ms');
    let html=addSharedComponents(addTheme(getRenderableHtml(content),css),components);
    if (dedicated) {
      html = addSiteSettings(html, settings, revision);
    }
    if (dedicated || components.some(component => component.includes('ends-nav-data'))) {
      const entries = pageRows.flatMap(([code = '', name = ''], index) => {
        const slug = name.trim().replace(/^\/+|\/+$/g, '');
        if (!code.trim() || !name.trim() || (code.trim().toLowerCase() === 'content' && slug.toLowerCase() === 'slug')) return [];
        const isHome = selectedHome ? index === homeIndex : !slug || slug === 'home';
        return [{label: !slug || slug === 'home' ? 'Home' : slug.replace(/[-_]/g, ' '), href: isHome ? '/' : '/' + slug}];
      });
      const homePosition = entries.findIndex(page => page.href === '/');
      if (homePosition > 0) entries.unshift(entries.splice(homePosition, 1)[0]);
      const data = JSON.stringify({pages: entries, source: content, editUrl}).replace(/</g, '\\u003c');
      html = addSharedComponents(html, [`<script type="application/json" id="ends-nav-data">${data}</script>`]);
    }
    if (!dedicated) html=injectUtilityMenu(html,{source:content,items,scriptUrl:utilityScriptUrl.href});
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

