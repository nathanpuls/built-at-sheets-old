import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/A1.js';
import {onRequest} from '../functions/[cell].js';
test('A1 serves the exact full HTML with no viewer chrome and no cache',async()=>{
  const original=global.fetch;let requested;
  const html='<!doctype html><html><body><h1>Hello, world</h1><script>document.title="Works"</script></body></html>';
  global.fetch=async(url,options)=>{if(new URL(url).pathname.endsWith("/htmlview"))return new Response("");requested={url:new URL(url),options};return new Response('"'+html.replaceAll('"','""')+'",index\r\nOther page,about',{headers:{'content-type':'text/csv'}});};
  try{const r=await onRequestGet({request:new Request('https://sheets.built.at/A1?ID=abcdefghijklmnopqrst&menu=0&live=0')});assert.equal(r.status,200);assert.equal(await r.text(),html);assert.equal(requested.url.searchParams.get('range'),'A:B');assert.equal(requested.options.cache,'no-store');assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('content-security-policy'),/sandbox allow-scripts/);assert.doesNotMatch(r.headers.get('content-security-policy'),/allow-same-origin/);}finally{global.fetch=original;}
});
test('A1 supports fragments and explicit worksheet IDs',async()=>{
  const original=global.fetch;global.fetch=async url=>{assert.equal(new URL(url).searchParams.get('gid'),'123');return new Response('<h1>Fragment</h1>');};
  try{const r=await onRequestGet({request:new Request('https://sheets.built.at/A1?id=abcdefghijklmnopqrst&gid=123&menu=0&live=0')});assert.match(await r.text(),/<body><h1>Fragment<\/h1><\/body>/);}finally{global.fetch=original;}
});
test('A1 rejects invalid IDs and Google login responses',async()=>{
  const original=global.fetch;global.fetch=async()=>new Response('<html>Login</html>',{headers:{'content-type':'text/html'}});
  try{assert.equal((await onRequestGet({request:new Request('https://sheets.built.at/A1?id=bad')})).status,400);const r=await onRequestGet({request:new Request('https://sheets.built.at/A1?id=abcdefghijklmnopqrst')});assert.equal(r.status,502);assert.doesNotMatch(await r.text(),/<html>Login/);}finally{global.fetch=original;}
});
test('A1 formats Markdown as a readable document with headings, lists and tables',async()=>{
  const original=global.fetch;const md='# A pretty page\n\nSome **bold** text.\n\n- First\n- Second\n\n| Name | Value |\n| --- | --- |\n| Test | 42 |\n\n```html\n<h1>An HTML example</h1>\n```\n\nMarkdown continues.';
  global.fetch=async()=>new Response('"'+md+'"');
  try{const r=await onRequestGet({request:new Request('https://sheets.built.at/a1?id=abcdefghijklmnopqrst')});const html=await r.text();assert.match(html,/<h1>A pretty page<\/h1>/);assert.match(html,/<strong>bold<\/strong>/);assert.match(html,/<li>First<\/li>/);assert.match(html,/<table>/);assert.match(html,/max-width: 720px/);assert.match(html,/&lt;h1&gt;An HTML example&lt;\/h1&gt;/);assert.match(html,/<p>Markdown continues\.<\/p>/);}finally{global.fetch=original;}
});
test('cell route accepts lowercase and uppercase A1',async()=>{
  const original=global.fetch;global.fetch=async()=>new Response('# Hello');
  try{for(const cell of ['a1','A1']){const r=await onRequest({params:{cell},request:new Request('https://sheets.built.at/'+cell+'?id=abcdefghijklmnopqrst'),next:()=>{throw Error('Should render A1');}});assert.match(await r.text(),/<h1>Hello<\/h1>/);}}finally{global.fetch=original;}
});

test('shared CSS and menu settings apply across pages and trigger live updates', async () => {
  const original = global.fetch;
  let css = 'body { background: pink; }';
  let showMenu = 'FALSE';
  global.fetch = async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/htmlview')) {
      return new Response(['Pages', 'Theme', 'Settings'].map((name, index) =>
        `items.push({name: "${name}", pageUrl: "/htmlview", gid: "${index + 100}"});`
      ).join('\n'));
    }
    switch (url.searchParams.get('gid')) {
      case '101':
        assert.equal(url.searchParams.get('range'), 'A1');
        return new Response(`"${css.replaceAll('"', '""')}"`);
      case '102':
        assert.equal(url.searchParams.get('range'), 'A1:B1');
        return new Response(`Show default menu,${showMenu}`);
      default:
        return new Response('# Home,home\n<h1>About</h1>,about');
    }
  };
  const view = params => onRequestGet({request: new Request(
    `https://sheets.built.at/a1?id=abcdefghijklmnopqrst&${params}`
  )});
  const revision = async () => (await (await view('live=check')).json()).revision;
  try {
    for (const slug of ['home', 'about']) {
      const html = await (await view(`gid=100&slug=${slug}`)).text();
      assert.ok(html.includes(`<style data-built-at-theme>${css}</style></head>`));
      assert.doesNotMatch(html, /utility-client\.js/);
      assert.match(html, /live-client\.js/);
    }
    const initial = await revision();
    css = 'body { background: gold; }';
    const afterCss = await revision();
    assert.notEqual(afterCss, initial);
    showMenu = 'TRUE';
    assert.notEqual(await revision(), afterCss);
    assert.match(await (await view('slug=home')).text(), /utility-client\.js/);
    assert.doesNotMatch(await (await view('slug=home&menu=0')).text(), /utility-client\.js/);
  } finally {
    global.fetch = original;
  }
});

test('ends.at collections create stable post routes, optional templates and hidden indexes', async () => {
  const original = global.fetch;
  const csv = rows => rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  let postsPage = '<section><h1>Posts</h1><collection source="Posts"><template><a class="post-card" href="{{url}}">{{title}}</a></template></collection></section>';
  let secondPost = '# Another post\n\nChanged independently.';
  global.fetch = async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/htmlview')) return new Response([
      ['Pages', '100'], ['Posts', '200'], ['Settings', '990299918'], ['Shared', '300']
    ].map(([name, gid]) => `items.push({name: "${name}", pageUrl: "/htmlview", gid: "${gid}"});`).join('\n'));
    switch (url.searchParams.get('gid')) {
      case '100': return new Response(csv([
        ['Content', 'Page'],
        ['<h1>Old home slug</h1>', 'home'],
        [postsPage, 'posts']
      ]));
      case '200': return new Response(csv([
        ['Post Content', 'Post Title'],
        ['This is a post', 'post1'],
        [secondPost, 'another post'],
        ['<article><h2>A Third Post</h2></article>', 'a third post']
      ]));
      case '990299918': return new Response(csv([
        ['Setting', 'Value', 'Purpose', 'ID'],
        ['Homepage', 'posts', '', 'homepage']
      ]));
      case '300': return new Response('');
      default: throw new Error('Unexpected Sheet request: ' + url.href);
    }
  };
  const view = path => onRequestGet({request:new Request(`https://live.ends.at${path}?id=abcdefghijklmnopqrst&slug=${path.replace(/^\/+/, '') || 'home'}&live=0`)});
  try {
    const root = await (await view('/')).text();
    assert.match(root, /class="post-card" href="\/posts\/post1">post1<\/a>/);
    assert.match(root, /href="\/posts\/another-post">another post<\/a>/);
    assert.doesNotMatch(root, /Old home slug/);
    assert.match(await (await view('/home')).text(), /Old home slug/);

    const detail = await (await view('/posts/another-post')).text();
    assert.match(detail, /<h1>Another post<\/h1>/);
    assert.match(detail, /Changed independently/);

    postsPage = '<section><h1>Posts without an index</h1></section>';
    const hidden = await (await view('/posts')).text();
    assert.match(hidden, /Posts without an index/);
    assert.doesNotMatch(hidden, /another-post/);
    assert.match(await (await view('/posts/a-third-post')).text(), /A Third Post/);

    const before = await (await onRequestGet({request:new Request('https://live.ends.at/posts/another-post?id=abcdefghijklmnopqrst&slug=posts/another-post&live=check')})).json();
    secondPost = '# Another post\n\nA newer revision.';
    const after = await (await onRequestGet({request:new Request('https://live.ends.at/posts/another-post?id=abcdefghijklmnopqrst&slug=posts/another-post&live=check')})).json();
    assert.notEqual(after.revision, before.revision);
  } finally {
    global.fetch = original;
  }
});

test('ends.at requires Settings to choose the root page; the home slug has no special fallback', async () => {
  const original = global.fetch;
  global.fetch = async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/htmlview')) return new Response([
      'items.push({name: "Pages", pageUrl: "/htmlview", gid: "100"});',
      'items.push({name: "Settings", pageUrl: "/htmlview", gid: "990299918"});'
    ].join('\n'));
    if (url.searchParams.get('gid') === '100') return new Response('"Content","Page"\r\n"<h1>Old default</h1>","home"');
    if (url.searchParams.get('gid') === '990299918') return new Response('"Setting","Value","Purpose","ID"\r\n"Homepage","","","homepage"');
    return new Response('');
  };
  try {
    const root = await onRequestGet({request:new Request('https://live.ends.at/?id=abcdefghijklmnopqrst&slug=home&live=0')});
    assert.equal(root.status, 400);
    assert.match(await root.text(), /Select a homepage in Settings/);
    const named = await onRequestGet({request:new Request('https://live.ends.at/home?id=abcdefghijklmnopqrst&slug=home&live=0')});
    assert.equal(named.status, 200);
    assert.match(await named.text(), /Old default/);
  } finally {
    global.fetch = original;
  }
});
