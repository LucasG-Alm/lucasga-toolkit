import test from 'node:test';
import assert from 'node:assert/strict';
import { LocationService, locationURL, validateInput, validatePoints, validateExportRequest, locationRequirements, resolveLocationRuntime, exportPointsWithDialog } from '../electron/location.mjs';

const exportPoint = {id:'p1',name:'Ponto',latitude:-23,longitude:-45,elevation:123,elevationSource:'Google',elevationResolution:30};
const exportCrs = {zone:23,hemisphere:'S',datum:'SIRGAS2000'};
test('exportação elimina dados não exportáveis e valida metadados e CRS antes do diálogo', async () => {
  const clean = validatePoints([{...exportPoint,secret:'never',source:'user',easting:1}])[0];
  assert.deepEqual(clean,exportPoint);
  for (const override of [{address:1},{description:null},{elevation:NaN},{elevationResolution:-1},{elevationSource:'x'.repeat(161)}]) {
    assert.throws(()=>validatePoints([{...exportPoint,...override}]));
  }
  let dialogs = 0;
  for (const request of [
    {format:'exe'}, {format:'xlsx'}, {format:'xlsx',crs:{...exportCrs,zone:0}},
    {format:'dxf',crs:{...exportCrs,hemisphere:'X'}}, {format:'dxf',crs:exportCrs,base:'old.kml'},
    {format:'xlsx',crs:{...exportCrs,secret:'no'}}, {format:'kmz',points:[]},
  ]) {
    await assert.rejects(exportPointsWithDialog({points:[exportPoint],...request}, {
      showSaveDialog:async()=>{dialogs++;return {canceled:true};}}));
  }
  assert.equal(dialogs,0);
  assert.equal(validateExportRequest([exportPoint],'kmz').format,'kmz');
});

test('caracteres XML ilegais falham antes do diálogo sem rejeitar espaços e Unicode válidos', async () => {
  let dialogs = 0;
  for (const field of ['id','name','description','address','elevationSource']) {
    for (const text of ['Ponto\u0001A', 'Ponto\ud800A', 'Ponto\uffffA']) {
      await assert.rejects(exportPointsWithDialog({points:[{...exportPoint,[field]:text}],format:'kml'}, {
        showSaveDialog:async()=>{dialogs++;return {canceled:true};}}), /inválid/);
    }
  }
  assert.equal(dialogs,0);
  const name = '<Ponto> & A\tB\nC\rD 🌎';
  assert.equal(validatePoints([{...exportPoint,name}])[0].name,name);
});

test('diálogo cancelado, extensão diferente e execução com pontos limpos', async () => {
  const calls = [], registered = [];
  const dependencies = {showSaveDialog:async options=>{calls.push(options);return {canceled:true};},
    execute:async request=>{calls.push(request);return {outputs:['new.xlsx']};},register:async output=>registered.push(output)};
  const request = {points:[{...exportPoint,apiKey:'secret'}],format:'xlsx',crs:exportCrs};
  assert.deepEqual(await exportPointsWithDialog(request,dependencies),[]);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].filters,[{name:'XLSX',extensions:['xlsx']}]);
  await assert.rejects(exportPointsWithDialog(request,{...dependencies,showSaveDialog:async()=>({filePath:'wrong.dxf'})}),/extensão/);
  assert.equal(calls.length,1);
  assert.deepEqual(await exportPointsWithDialog(request,{...dependencies,showSaveDialog:async()=>({filePath:'new.xlsx'})}),['new.xlsx']);
  assert.deepEqual(calls[1].points,[exportPoint]);
  assert.deepEqual(calls[1].crs,exportCrs);
  assert.deepEqual(registered,['new.xlsx']);
});

test('dependências de exportação são específicas ao formato sem exigir CAD para DXF', () => {
  for (const [format,requirements] of [['kml',['pyproj']],['kmz',['pyproj']],['xlsx',['pyproj','openpyxl']],['dxf',['pyproj','ezdxf']]]) {
    assert.deepEqual(locationRequirements({action:'export-points',format}),requirements);
  }
});
test('biblioteca ausente impede execução e identifica dependência específica', async () => {
  for (const [format,missing] of [['xlsx','openpyxl'],['dxf','ezdxf']]) {
    let executed = false;
    await assert.rejects(async()=>{
      await resolveLocationRuntime(async(_settings,required)=>{
        assert.ok(required.includes(missing));
        return {python:{command:'python'},missing:[missing]};
      },{}, {action:'export-points',format});
      executed = true;
    }, new RegExp(missing));
    assert.equal(executed,false);
  }
});

const input = {mode:'latlon',latitude:'-23,5',longitude:'-46.5'};
const services = {address:false,elevation:false,acknowledged:false};
test('alvo UTM exige par completo e inteiro sem aceitar campos arbitrários', () => {
  assert.equal(validateInput({...input,targetZone:22,targetHemisphere:'S'}).targetZone,22);
  for (const target of [{targetZone:22},{targetHemisphere:'S'},{targetZone:0,targetHemisphere:'S'},
    {targetZone:22.5,targetHemisphere:'S'},{targetZone:NaN,targetHemisphere:'S'},
    {targetZone:22,targetHemisphere:'x'},{targetZone:null,targetHemisphere:'S'}]) {
    assert.throws(()=>validateInput({...input,...target}));
  }
});

test('trocar fuso recalcula localmente e reutiliza endereço e altitude Google', async () => {
  const calls = [];
  const service = new LocationService({execute:async request=>{
    calls.push(request);
    return {point:{latitude:-23.5,longitude:-46.5,zone:request.input.targetZone,hemisphere:'S'},
      ...(request.services.address ? {address:'Rua teste'} : {}),
      ...(request.services.elevation ? {elevation:{meters:123,source:'Google',resolution:30}} : {}),
      requests:{geocode:Number(request.services.address),elevation:Number(request.services.elevation)}};
  }});
  const all = {address:true,elevation:true,acknowledged:true};
  await service.query({...input,targetZone:23,targetHemisphere:'S'},all);
  const result = await service.query({...input,targetZone:22,targetHemisphere:'S'},all);
  assert.equal(calls.length,2);
  assert.deepEqual(calls[1].services,{address:false,elevation:false,acknowledged:true});
  assert.equal(result.point.zone,22);
  assert.equal(result.address,'Rua teste');
  assert.equal(result.point.elevationSource,'Google');
  assert.equal(result.point.elevationResolution,30);
  assert.deepEqual(result.requests,{geocode:0,elevation:0});
});

test('fusos concorrentes recebem projeções próprias sem repetir Google', async () => {
  let release;
  const calls = [];
  const service = new LocationService({execute:async request=>{
    calls.push(request);
    if (calls.length === 1) await new Promise(resolve=>{release=resolve;});
    return {point:{latitude:-23,longitude:-46,zone:request.input.targetZone},
      ...(request.services.address ? {address:'Rua teste'} : {}),
      requests:{geocode:Number(request.services.address),elevation:0}};
  }});
  const selected = {address:true,elevation:false,acknowledged:true};
  const first = service.query({...input,targetZone:23,targetHemisphere:'S'},selected);
  const second = service.query({...input,targetZone:22,targetHemisphere:'S'},selected);
  await new Promise(resolve=>setImmediate(resolve)); release();
  assert.equal((await first).point.zone,23);
  assert.equal((await second).point.zone,22);
  assert.equal(calls.length,2);
  assert.equal(calls[1].services.address,false);
});

test('endereço resolvido mantém CRS escolhido após reprojeção sem geocodificar novamente', async () => {
  const calls = [];
  const service = new LocationService({execute:async request=>{
    calls.push(request);
    return {point:{latitude:-23,longitude:-46,zone:request.input.targetZone,source:'google'},
      ...(request.input.mode === 'address' ? {address:'Rua teste',candidates:[{address:'Rua teste',latitude:-23,longitude:-46}]} : {}),
      requests:{geocode:Number(request.input.mode === 'address'),elevation:0}};
  }});
  const selected = {address:true,elevation:false,acknowledged:true};
  await service.query({mode:'address',address:'Rua teste',targetZone:23,targetHemisphere:'S'},selected);
  const result = await service.query({mode:'address',address:'Rua teste',targetZone:22,targetHemisphere:'S'},selected);
  assert.equal(calls[1].input.mode,'latlon');
  assert.equal(calls[1].input.targetZone,22);
  assert.equal(result.point.zone,22);
  assert.equal(result.address,'Rua teste');
  assert.equal(result.requests.geocode,0);
});
test('valida entradas limitadas e links externos fixos', () => {
  assert.throws(()=>validateInput({...input,latitude:'x'.repeat(1000)}));
  assert.throws(()=>locationURL('evil',0,0));
  assert.throws(()=>locationURL('maps',91,0));
  assert.match(locationURL('maps',-23,-46), /^https:\/\/www.google.com\/maps\/search\/\?api=1&query=/);
});

test('campos opcionais apagados não impedem consulta em outro modo', () => {
  const value = validateInput({ ...input, zone: undefined, targetCrs: undefined });
  assert.equal(Object.hasOwn(value, 'zone'), false);
  assert.equal(Object.hasOwn(value, 'targetCrs'), false);
  assert.throws(() => validateInput({mode:'utm',easting:'500000',northing:'10000000',zone:undefined,hemisphere:'S',datum:'SIRGAS2000'}), /fuso/i);
});
test('deduplica sessão, fresh refaz e falhas parciais não entram no cache', async () => {
  let calls = 0;
  const service = new LocationService({ execute: async () => ({point:{latitude:-23.5,longitude:-46.5},requests:{geocode:0,elevation:0}, ...(++calls === 3 ? {errors:{elevation:'timeout'}} : {})}) });
  await service.query(input, services);
  await service.query(input, services);
  assert.equal(calls,1);
  await service.query(input,services,true);
  assert.equal(calls,2);
  await service.query(input,services,true);
  await service.query(input,services);
  assert.equal(calls,4);
});
test('lote em execução bloqueia Google mas permite conversão local', async () => {
  const service = new LocationService({busy:()=>true,execute:async()=>({requests:{geocode:0,elevation:0}})});
  await service.query(input, services);
  await assert.rejects(service.query(input,{...services,address:true,acknowledged:true}), /fila/i);
  await assert.rejects(service.query(input,{...services,address:'sim'}), /inválid/i);
});
test('consultas concorrentes idênticas compartilham subprocesso e contagem', async () => {
  let calls = 0, release;
  const service = new LocationService({execute:async()=>{calls++; await new Promise(resolve=>{release=resolve;}); return {requests:{geocode:1,elevation:0}};}});
  const a = service.query(input,services), b = service.query(input,services);
  await new Promise(resolve=>setImmediate(resolve)); release();
  const [first,second] = await Promise.all([a,b]);
  assert.equal(calls,1); assert.equal(first.requests.geocode,1); assert.equal(second.requests.geocode,0);
});
test('exportação valida intervalo, nome e limite de pontos', () => {
  assert.throws(()=>validatePoints([]),/Selecione/);
  assert.throws(()=>validatePoints([{name:'Ponto',latitude:0,longitude:181}]),/inválido/);
  assert.throws(()=>validatePoints([{name:'',latitude:0,longitude:0}]),/inválido/);
  assert.equal(validatePoints([{name:'Ponto',latitude:0,longitude:0}]).length,1);
});

test('desligar altitude reutiliza endereço já consultado sem nova chamada', async () => {
  const calls = [];
  const service = new LocationService({execute:async request=>{
    calls.push(request.services);
    return {point:{latitude:-23.5,longitude:-46.5,source:'user'},address:'Rua teste',elevation:{meters:123,source:'Google'},requests:{geocode:1,elevation:1}};
  }});
  await service.query(input,{address:true,elevation:true,acknowledged:true});
  const result = await service.query(input,{address:true,elevation:false,acknowledged:true});
  assert.equal(calls.length,1);
  assert.equal(result.address,'Rua teste');
  assert.equal(result.elevation,undefined);
  assert.deepEqual(result.requests,{geocode:0,elevation:0});
});

test('falha de altitude conserva sucesso do endereço e repete apenas serviço faltante', async () => {
  const calls = [];
  const service = new LocationService({execute:async request=>{
    calls.push(request);
    return calls.length === 1
      ? {point:{latitude:-23.5,longitude:-46.5,source:'user'},address:'Rua teste',errors:{elevation:'timeout'},requests:{geocode:1,elevation:1}}
      : {point:{latitude:-23.5,longitude:-46.5,source:'user'},elevation:{meters:125,source:'Google'},requests:{geocode:0,elevation:1}};
  }});
  const selected = {address:true,elevation:true,acknowledged:true};
  await service.query(input,selected);
  const result = await service.query(input,selected);
  assert.deepEqual(calls[1].services,{address:false,elevation:true,acknowledged:true});
  assert.equal(result.address,'Rua teste');
  assert.equal(result.elevation.meters,125);
  assert.deepEqual(result.requests,{geocode:0,elevation:1});
  await service.query(input,{address:true,elevation:false,acknowledged:true},true);
  assert.equal(calls[2].services.address,true);
  assert.equal(calls[2].services.elevation,false);
});

test('endereço já resolvido acrescenta altitude sem repetir geocodificação', async () => {
  const calls = [];
  const point = {latitude:-23.5,longitude:-46.5,source:'google'};
  const service = new LocationService({execute:async request=>{
    calls.push(request);
    return request.input.mode === 'address'
      ? {point,address:'Rua localizada',candidates:[{address:'Rua localizada',...point}],requests:{geocode:1,elevation:0}}
      : {point,elevation:{meters:122,source:'Google'},requests:{geocode:0,elevation:1}};
  }});
  const address = {mode:'address',address:'Rua teste'};
  await service.query(address,{address:true,elevation:false,acknowledged:true});
  const result = await service.query(address,{address:true,elevation:true,acknowledged:true});
  assert.equal(calls[1].input.mode,'latlon');
  assert.equal(calls[1].input.origin,'google');
  assert.equal(calls[1].services.address,false);
  assert.equal(result.address,'Rua localizada');
  assert.equal(result.point.source,'google');
  assert.deepEqual(result.requests,{geocode:0,elevation:1});
});

test('endereço ambíguo cacheia candidatos e aguarda seleção antes de altitude', async () => {
  let calls = 0;
  const service = new LocationService({execute:async()=>{calls++; return {candidates:[{address:'A',latitude:-23,longitude:-45},{address:'B',latitude:-24,longitude:-46}],requests:{geocode:1,elevation:0}};}});
  const address = {mode:'address',address:'Rua teste'};
  await service.query(address,{address:true,elevation:false,acknowledged:true});
  const result = await service.query(address,{address:true,elevation:true,acknowledged:true});
  assert.equal(calls,1);
  assert.equal(result.candidates.length,2);
  assert.equal(result.point,undefined);
  assert.deepEqual(result.requests,{geocode:0,elevation:0});
});

test('fresh refaz somente serviços selecionados e falha não substitui sucesso alheio', async () => {
  const calls = [];
  const point = {latitude:-23.5,longitude:-46.5,source:'user'};
  const service = new LocationService({execute:async request=>{
    calls.push(request.services);
    if (calls.length === 1) return {point,address:'Rua anterior',elevation:{meters:130,source:'Google'},requests:{geocode:1,elevation:1}};
    return {point,address:'Rua atualizada',requests:{geocode:1,elevation:0}};
  }});
  const all = {address:true,elevation:true,acknowledged:true};
  await service.query(input,all);
  await service.query(input,{...all,elevation:false},true);
  const result = await service.query(input,all);
  assert.equal(calls.length,2);
  assert.deepEqual(calls[1],{address:true,elevation:false,acknowledged:true});
  assert.equal(result.address,'Rua atualizada');
  assert.equal(result.elevation.meters,130);
  assert.equal(result.point.latitude,-23.5);
  assert.deepEqual(result.requests,{geocode:0,elevation:0});
});

test('cache por serviço respeita contexto e limite de 200 entradas', async () => {
  let context = 'A', calls = 0;
  const service = new LocationService({cacheContext:async()=>context,execute:async()=>{calls++; return {point:{latitude:-23.5,longitude:-46.5},requests:{geocode:0,elevation:0}};}});
  await service.query(input,services); context = 'B';
  await service.query(input,services);
  assert.equal(calls,2);
  for (let i=0;i<200;i++) await service.query({...input,latitude:String(i / 10)},services);
  await service.query(input,services);
  assert.equal(calls,203);
});

test('troca de serviços durante consulta aguarda conclusão e envia apenas a diferença', async () => {
  let release;
  const calls = [];
  const point = {latitude:-23.5,longitude:-46.5,source:'user'};
  const service = new LocationService({execute:async request=>{
    calls.push(request.services);
    if (calls.length === 1) {
      await new Promise(resolve=>{release=resolve;});
      return {point,address:'Rua teste',requests:{geocode:1,elevation:0}};
    }
    return {point,elevation:{meters:110,source:'Google'},requests:{geocode:0,elevation:1}};
  }});
  const first = service.query(input,{address:true,elevation:false,acknowledged:true});
  const second = service.query(input,{address:true,elevation:true,acknowledged:true});
  await new Promise(resolve=>setImmediate(resolve)); release();
  await first;
  const result = await second;
  assert.deepEqual(calls[1],{address:false,elevation:true,acknowledged:true});
  assert.equal(result.address,'Rua teste');
  assert.equal(result.elevation.meters,110);
  assert.deepEqual(result.requests,{geocode:0,elevation:1});
});
