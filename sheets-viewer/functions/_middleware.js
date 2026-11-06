import {onRequestGet} from './A1.js';

const sheetId = '1gLz_ysFKbUUSq6TciH6YEFqQAOEJICjI31E7mCnnWvY';

export function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname !== 'live.ends.at' || url.pathname === '/live-client.js') {
    return context.next();
  }
  if (!['GET', 'HEAD'].includes(context.request.method)) {
    return new Response(null, {status: 405, headers: {allow: 'GET, HEAD'}});
  }
  const path = url.pathname.replace(/^\/+|\/+$/g, '');
  if (path && !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path)) {
    return new Response('Page not found', {status: 404});
  }
  const check = url.searchParams.get('live') === 'check';
  url.search = '';
  url.searchParams.set('id', sheetId);
  url.searchParams.set('slug', path);
  if (check) url.searchParams.set('live', 'check');
  return onRequestGet({...context, request: new Request(url, context.request)});
}
