import test from 'node:test';
import assert from 'node:assert/strict';
import { MapService } from '../electron/maps.mjs';

test('proxy rejeita URLs livres e coordenadas inválidas antes da rede', async () => {
  let calls = 0;
  const service = new MapService({ fetch: async () => { calls++; }, getKey: async () => '' });
  for (const url of ['https://evil.test/a', 'toolkit-map://tile/osm/3/8/0', 'toolkit-map://tile/osm/1/0/0?url=https://evil.test', 'toolkit-map://evil/osm/1/0/0']) {
    assert.equal((await service.tile(url)).status, 400);
  }
  assert.equal(calls, 0);
});
test('OSM usa host fixo, identificação e contagem independente', async () => {
  const calls = [];
  const service = new MapService({ fetch: async (url, options) => { calls.push([url, options]); return new Response(new Uint8Array([1]), {headers:{'content-type':'image/png'}}); } });
  assert.equal((await service.tile('toolkit-map://tile/osm/2/1/1')).status, 200);
  assert.equal(calls[0][0], 'https://tile.openstreetmap.org/2/1/1.png');
  assert.match(calls[0][1].headers['User-Agent'], /LucasGA/);
  assert.equal((await service.info('osm')).tiles, 1);
});
test('Google requer chave e não revela segredo na mensagem de falha', async () => {
  const missing = new MapService({getKey: async () => ''});
  assert.equal((await missing.info('google-road')).available, false);
  const denied = new MapService({getKey: async () => 'SECRET', fetch: async () => new Response('SECRET session=PRIVATE', {status:403})});
  const info = await denied.info('google-road');
  assert.match(info.message, /permissão|habilitada/i);
  assert.doesNotMatch(JSON.stringify(info), /SECRET|PRIVATE/);
});
test('sessões e atribuição Google, renovação por expiração e quota simuladas', async () => {
  let now = 100000, creates = 0;
  const urls = [];
  const service = new MapService({now: () => now, getKey: async () => 'SECRET', fetch: async (url) => {
    urls.push(url);
    if (url.includes('createSession')) return Response.json({session:`PRIVATE${++creates}`, expiry:String(now / 1000 + 100)});
    if (url.includes('viewport')) return Response.json({copyright:'© Fictional imagery',maxZoomRects:[{maxZoom:19}]});
    return new Response('', {status:429});
  }});
  const bounds = {north:-23,south:-24,east:-46,west:-47,zoom:12};
  const info = await service.info('google-road', bounds);
  assert.equal(info.available, true);
  assert.equal(info.maxZoom, 19);
  assert.match(info.attribution, /Fictional/);
  assert.doesNotMatch(JSON.stringify(info), /SECRET|PRIVATE/);
  await service.info('google-road', bounds);
  assert.equal(creates, 1);
  now += 200000;
  await service.info('google-road', bounds);
  assert.equal(creates, 2);
  assert.equal((await service.tile('toolkit-map://tile/google-road/12/1500/2300')).status, 429);
  assert.match((await service.info('google-road', bounds)).message, /quota/i);
  assert.ok(urls.some(url=>url.includes('/tile/v1/viewport?')));
});
test('JSON malformado não vaza corpo nem URLs autenticadas', async () => {
  const service = new MapService({getKey:async ()=>'SECRET',fetch:async ()=>new Response('SECRET is not JSON')});
  const info = await service.info('google-road');
  assert.equal(info.available,false);
  assert.doesNotMatch(JSON.stringify(info),/SECRET/);
  assert.match(info.message,/inválida/);
});
test('validação de viewport e renovação quando a chave muda', async () => {
  let key = 'first', creates = 0;
  const service = new MapService({getKey:async()=>key,fetch:async url=>{
    if (url.includes('createSession')) {creates++; return Response.json({session:'PRIVATE',expiry:String(Date.now()/1000+3600)});}
    return Response.json({copyright:'<img src=x onerror=evil()>',maxZoomRects:[]});
  }});
  await assert.rejects(service.info('osm',{north:91,south:0,east:0,west:0,zoom:1}),/inválidos/);
  await service.info('google-road'); key = 'second';
  const info = await service.info('google-road',{north:1,south:0,east:1,west:0,zoom:1});
  assert.equal(creates,2);
  assert.equal(info.attribution,'Google Maps · <img src=x onerror=evil()>');
});
test('redirect, timeout e imagem não confiável falham sem propagar rede', async () => {
  const service = new MapService({fetch:async()=>{throw Error('https://private.test?key=SECRET');}});
  assert.equal((await service.tile('toolkit-map://tile/esri/1/0/0')).status,503);
  const info = await service.info('esri');
  assert.equal(info.available,false);
  assert.doesNotMatch(info.message,/SECRET|private/);
  const html = new MapService({fetch:async()=>new Response('<script>evil()</script>',{headers:{'content-type':'text/html'}})});
  assert.equal((await html.tile('toolkit-map://tile/osm/1/0/0')).status,503);
});
