const headers = {'content-type':'application/json; charset=utf-8','cache-control':'no-store, max-age=0','cdn-cache-control':'no-store','cloudflare-cdn-cache-control':'no-store','x-content-type-options':'nosniff'};
export async function onRequestGet({request}) {
  const query = new URL(request.url).searchParams;
  const id = query.get('id') || '';
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(id)) return Response.json({error:'Enter a valid Google Sheet ID.'},{status:400,headers});
  const url = new URL(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq`);
  url.searchParams.set('tqx','out:json');url.searchParams.set('range','A:B');url.searchParams.set('headers','0');url.searchParams.set('_',String(Date.now()));
  if(query.has('gid')) {if(!/^\d+$/.test(query.get('gid'))) return Response.json({error:'Invalid worksheet ID.'},{status:400,headers});url.searchParams.set('gid',query.get('gid'));}
  try {
    const response = await fetch(url, {cache:'no-store',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)});
    if(!response.ok) return Response.json({error:'Could not read this Sheet. Check that it is shared as “Anyone with the link can view.”'},{status:response.status===404?404:502,headers});
    const text = await response.text();
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
    if(!match) throw new Error('Google did not return Sheet data.');
    const data=JSON.parse(match[1]);
    if(data.status==='error'||!data.table) throw new Error('Google could not read the worksheet.');
    return Response.json({table:data.table},{headers});
  } catch {return Response.json({error:'Could not load the Sheet. Check sharing permissions and try refreshing.'},{status:502,headers});}
}
