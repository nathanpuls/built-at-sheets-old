const headers = {'content-type':'application/json; charset=utf-8','cache-control':'no-store, max-age=0','cdn-cache-control':'no-store','cloudflare-cdn-cache-control':'no-store','x-content-type-options':'nosniff'};
export function parseCsv(text) {
  const rows=[];let row=[],cell='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw new Error('Incomplete CSV response.');
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows;
}
export async function onRequestGet({request}) {
  const query = new URL(request.url).searchParams;
  const id = query.get('id') || '';
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(id)) return Response.json({error:'Enter a valid Google Sheet ID.'},{status:400,headers});
  const url = new URL(`https://docs.google.com/spreadsheets/d/${id}/export`);
  url.searchParams.set('format','csv');url.searchParams.set('range','A:B');url.searchParams.set('_',crypto.randomUUID());
  if(query.has('gid')) {if(!/^\d+$/.test(query.get('gid'))) return Response.json({error:'Invalid worksheet ID.'},{status:400,headers});url.searchParams.set('gid',query.get('gid'));}
  try {
    const response = await fetch(url, {cache:'no-store',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)});
    if(!response.ok) return Response.json({error:'Could not read this Sheet. Check that it is shared as “Anyone with the link can view.”'},{status:response.status===404?404:502,headers});
    const text = await response.text();
    if(/text\/html/i.test(response.headers.get('content-type')||''))throw new Error('Google did not return Sheet data.');
    const rows=parseCsv(text).map(row=>({c:row.slice(0,2).map(v=>({v}))}));
    return Response.json({table:{rows}},{headers});
  } catch {return Response.json({error:'Could not load the Sheet. Check sharing permissions and try refreshing.'},{status:502,headers});}
}
