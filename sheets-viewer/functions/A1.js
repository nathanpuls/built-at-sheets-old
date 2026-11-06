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
  if (range) url.searchParams.set('range', range);
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

function contentTable(rows) {
  const headers = (rows[0] || []).map(value => value.trim().toLowerCase());
  const content = headers.findIndex(value => /^(?:code|(?:post )?content)$/.test(value));
  const name = headers.findIndex(value => /^(?:name|page|slug|(?:post )?title)$/.test(value));
  if (content < 0 || name < 0) return {rows, column: 'A'};
  const hidden = headers.indexOf('hidden');
  const visibility = headers.indexOf('visibility');
  const scope = headers.indexOf('scope');
  let column = '';
  for (let index = content + 1; index > 0; index = Math.floor((index - 1) / 26)) {
    column = String.fromCharCode(65 + (index - 1) % 26) + column;
  }
  return {
    column,
    rows: rows.map((row, index) => index === 0 || (hidden >= 0
        ? /^true$/i.test(row[hidden]?.trim() || '')
        : /^(?:false|hide)$/i.test(row[visibility]?.trim() || ''))
      ? []
      : [row[content] || '', row[name] || '', row[scope]?.trim().toLowerCase()])
  };
}

function expandSharedComponents(html, components, stack = []) {
  return html.replace(/<component\s+name\s*=\s*(?:"([^"]+)"|'([^']+)')\s*>\s*<\/component\s*>/gi, (_, double, single) => {
    const name = (double || single).trim().toLowerCase();
    if (stack.includes(name)) throw new Error('Circular Shared component: ' + [...stack, name].join(' → '));
    if (!components.has(name)) throw new Error('Unknown Shared component: ' + name);
    return expandSharedComponents(components.get(name), components, [...stack, name]);
  });
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

function escapeCollectionValue(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[character]);
}

function collectionSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function collectionSourceNames(content) {
  const names = [];
  const tags = String(content).matchAll(/<collection\b([^>]*)>[\s\S]*?<\/collection\s*>/gi);
  for (const [, attributes] of tags) {
    const match = /\bsource\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(attributes);
    const name = (match?.[1] || match?.[2] || match?.[3] || '').trim();
    if (name && !names.some(existing => existing.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
}

function collectionItems(rows, source, parentSlug) {
  const items = [];
  const slugs = new Set();
  rows.forEach(([content = '', title = ''], index) => {
    if (index === 0 && /content/i.test(content.trim()) && /(?:title|name)/i.test(title.trim())) return;
    if (!content.trim() && !title.trim()) return;
    if (!title.trim()) throw Object.assign(new Error(`${source} row ${index + 1} needs a title.`), {status:400});
    const slug = collectionSlug(title);
    if (!slug) throw Object.assign(new Error(`${source} row ${index + 1} needs a title that can form a URL.`), {status:400});
    if (slugs.has(slug)) throw Object.assign(new Error(`${source} has more than one post using the URL slug “${slug}”.`), {status:400});
    slugs.add(slug);
    items.push({content, title:title.trim(), slug, url:'/' + [parentSlug, slug].filter(Boolean).join('/'), rowIndex:index});
  });
  return items;
}

function expandCollectionTags(content, collections) {
  return String(content).replace(/<collection\b([^>]*)>([\s\S]*?)<\/collection\s*>/gi, (tag, attributes, body) => {
    const match = /\bsource\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(attributes);
    const source = (match?.[1] || match?.[2] || match?.[3] || '').trim();
    const collection = collections.get(source.toLowerCase());
    if (!collection) throw Object.assign(new Error(`Collection source “${source || '(missing)'}” was not found.`), {status:400});
    const authored = /<template\b[^>]*>([\s\S]*?)<\/template\s*>/i.exec(body)?.[1];
    const template = authored || '<div><a href="{{url}}">{{title}}</a></div>';
    const items = collection.items.map(item => template.replace(/{{\s*(title|slug|url)\s*}}/gi, (_, field) => escapeCollectionValue(item[field.toLowerCase()]))).join('\n');
    return `<div data-collection="${escapeCollectionValue(collection.source)}">${items}</div>`;
  });
}


const endsSettingsGid = '990299918';

function siteSettings(rows) {
  const values = new Map();
  const headers = (rows[0] || []).map(value => value.trim().toLowerCase());
  const labelColumn = headers.findIndex(value => value === 'name' || value === 'setting');
  const valueColumn = headers.findIndex(value => value === 'content' || value === 'value');
  const idColumn = headers.indexOf('id');
  const hasHeaders = labelColumn >= 0 && valueColumn >= 0;
  for (const row of hasHeaders ? rows.slice(1) : rows) {
    const label = row[hasHeaders ? labelColumn : 0] || '';
    const raw = row[hasHeaders ? valueColumn : 1] || '';
    const id = row[hasHeaders ? idColumn : 3] || '';
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
      const settings = siteSettings(await sheetRows(id, endsSettingsGid, null));
      return await previewLogo(settings.logo, request.method);
    }
    const tabs = await sheetTabs(id);
    const sourceGid = gid ?? (dedicated ? tabs.find(tab => tab.name === 'Pages')?.gid : tabs[0]?.gid);
    const rows = await sheetRows(id, sourceGid ?? null, dedicated ? null : 'A:B').catch(() => null);
    if (!rows) return error('Could not read A1. Share the Google Sheet as “Anyone with the link can view,” then refresh.',502);
    const [themeRows, settingsRows, sharedRows] = await Promise.all([
      optionalTabRows(id, tabs, 'theme', 'A1'),
      dedicated ? sheetRows(id, endsSettingsGid, null) : optionalTabRows(id, tabs, 'settings', 'A1:B1'),
      optionalTabRows(id, tabs, 'shared', dedicated ? null : 'A:B')
    ]);
    const shared = (dedicated ? contentTable(sharedRows).rows : sharedRows).filter(([code = '', name = ''], index) =>
      code.trim() && name.trim() && !(index === 0 && /^(?:code|content)$/i.test(code.trim()) && /^name$/i.test(name.trim())));
    const isCss = ([, name]) => name.trim().toLowerCase() === 'css';
    const css = [themeRows[0]?.[0] ?? '', ...shared.filter(isCss).map(([code]) => code)].filter(Boolean).join('\n');
    const named = new Map(shared.filter(([, , scope]) => scope === 'component').map(([code, name]) => [name.trim().toLowerCase(), code]));
    const components = shared.filter(row => !isCss(row) && row[2] !== 'component').map(([code]) => expandSharedComponents(code, named));
    const [menuLabel = '', menuValue = ''] = settingsRows[0] ?? [];
    const hideMenu = menuLabel.trim().toLowerCase() === 'show default menu'
      && /^(?:false|off|no|0)$/i.test(menuValue.trim());
    const settings = dedicated ? siteSettings(settingsRows) : null;
    const slug=params.has('slug')?normalizeSlug(params.get('slug')):null;
    let pages=new Map();try{pages=pagesFromTable({rows:rows.map(row=>({c:row.slice(0,2).map(v=>({v}))}))});}catch{if(!dedicated&&slug!==null)return error('Page slugs must be valid and unique in column B.',400);}
    if(!dedicated&&slug!==null&&!pages.has(slug))return error('This page slug was not found in column B.',404);
    const pathSlug = normalizeSlug(params.get('slug'));
    const pageTable = dedicated ? contentTable(rows) : {rows, column: 'A'};
    const pageRows = pageTable.rows;
    const pageSlug = name => String(name).trim().replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).map(collectionSlug).join('/');
    const selectedHome = dedicated ? pageSlug(settings.homepage) : '';
    if (dedicated && requestUrl.pathname === '/' && !selectedHome) return error('Select a homepage in Settings before previewing the site.', 400);
    const homeIndex = selectedHome
      ? pageRows.findIndex(([, name = '']) => pageSlug(name) === selectedHome)
      : -1;
    if (dedicated && requestUrl.pathname === '/' && homeIndex < 0) return error('The selected homepage was not found in Pages.', 400);
    let pageIndex = requestUrl.pathname === '/'
      ? homeIndex
      : pageRows.findIndex(([, name = '']) => pageSlug(name) === pathSlug);
    let detailSlug = '';
    if (dedicated && pageIndex < 0 && pathSlug.includes('/')) {
      const parts = pathSlug.split('/');
      detailSlug = parts.pop();
      const parent = parts.join('/');
      pageIndex = pageRows.findIndex(([, name = '']) => pageSlug(name) === parent);
    }
    const sourceIndex = dedicated
      ? pageIndex
      : slug === null ? 0 : rows.findIndex(row => normalizeSlug(row[1]) === slug);
    let status = dedicated && (pageIndex < 0 || pathSlug === '404') ? 404 : 200;
    let content = dedicated ? (pageRows[sourceIndex]?.[0] ?? '') : slug === null ? rows[0]?.[0] || '' : pages.get(slug).content;
    let sourceContent = content;
    let activeGid = sourceGid;
    let activeIndex = sourceIndex;
    let activeColumn = pageTable.column;
    const collections = new Map();
    const collectionRevision = [];
    if (dedicated && pageIndex >= 0) {
      const parent = pageSlug(pageRows[pageIndex]?.[1] || '');
      content = expandSharedComponents(content, named);
      const sourceNames = collectionSourceNames(content);
      const conventional = tabs.find(tab => tab.name.toLowerCase() === parent.split('/').at(-1)?.toLowerCase());
      if (conventional && !sourceNames.some(name => name.toLowerCase() === conventional.name.toLowerCase())) sourceNames.push(conventional.name);
      for (const source of sourceNames) {
        const tab = tabs.find(candidate => candidate.name.toLowerCase() === source.toLowerCase());
        if (!tab) return error(`Collection source “${source}” was not found.`, 400);
        const collectionRows = await sheetRows(id, tab.gid, null);
        const table = contentTable(collectionRows);
        const collection = {source:tab.name, gid:tab.gid, column:table.column, items:collectionItems(table.rows, tab.name, parent)};
        collections.set(tab.name.toLowerCase(), collection);
        collectionRevision.push([tab.name, collectionRows]);
      }
      if (detailSlug) {
        const matches = [...collections.values()].flatMap(collection => collection.items
          .filter(item => item.slug === detailSlug)
          .map(item => ({collection, item})));
        if (!matches.length) status = 404;
        else {
          if (matches.length > 1) return error(`More than one collection item uses the URL slug “${detailSlug}”.`, 400);
          sourceContent = matches[0].item.content;
          content = expandCollectionTags(expandSharedComponents(sourceContent, named), collections);
          activeGid = matches[0].collection.gid;
          activeIndex = matches[0].item.rowIndex;
          activeColumn = matches[0].collection.column;
        }
      } else {
        content = expandCollectionTags(content, collections);
      }
    }
    if (status === 404) {
      activeIndex = pageRows.findIndex(([body = '', name = '']) => pageSlug(name) === '404' && body.trim());
      if (activeIndex < 0) return error('This page was not found.', 404);
      sourceContent = pageRows[activeIndex][0];
      content = expandSharedComponents(sourceContent, named);
      activeGid = sourceGid;
      activeColumn = pageTable.column;
    }
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([rows, css, hideMenu, components, settings, collectionRevision, content])));
    const revision=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    if(params.get('live')==='check')return Response.json({revision},{headers:{'cache-control':'no-store','access-control-allow-origin':'*'}});
    if(!content.trim())return error('A1 is empty. Put HTML or Markdown in A1, then refresh this page.',404);
    const redirect=getRedirectUrl(content);
    if(redirect && status !== 404)return new Response(null,{status:302,headers:{...headers,location:redirect}});
    const pageLinks=[...pages.values()].filter(page=>page.content.trim()).map(page=>{
      const href=new URL('/a1',request.url);href.searchParams.set('id',id);href.searchParams.set('slug',page.slug);if(gid!==null)href.searchParams.set('gid',gid);
      return {label:page.slug==='home'?'Home':page.slug.replace(/[-_]/g,' '),href:href.pathname+href.search,current:slug===page.slug||(slug===null&&page.content===content)};
    });
    const configured=hideMenu||['0','none'].includes(params.get('menu'))?[]:undefined;
    const items=utilityItems(params.get('pages')==='0'?[]:pageLinks,configured);
    let editUrl;
    if (activeGid != null && activeIndex >= 0) {
      const url=new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`);
      url.searchParams.set('gid', activeGid);
      url.hash = new URLSearchParams({gid:activeGid, range:`${activeColumn}${activeIndex + 1}`}).toString();
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
        const slug = dedicated ? pageSlug(name) : name.trim().replace(/^\/+|\/+$/g, '');
        if (dedicated && slug === '404') return [];
        if (!code.trim() || !name.trim() || (code.trim().toLowerCase() === 'content' && slug.toLowerCase() === 'slug')) return [];
        const isHome = Boolean(selectedHome) && index === homeIndex;
        return [{label: name.trim().replace(/[-_]/g, ' '), href: isHome ? '/' : '/' + slug}];
      });
      const homePosition = entries.findIndex(page => page.href === '/');
      if (homePosition > 0) entries.unshift(entries.splice(homePosition, 1)[0]);
      const data = JSON.stringify({pages: entries, source: sourceContent, editUrl}).replace(/</g, '\\u003c');
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
    return new Response(html,{headers,status});
  }catch (failure) {
    return failure?.status ? error(escapeCollectionValue(failure.message), failure.status) : error('Google could not return A1. Refresh to try again.',502);
  }
}

