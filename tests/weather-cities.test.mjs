import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import weather from '../shared/weather-cities.cjs';
const {weatherStops,cityIdentity,cityWeathers,cachedWeather,weatherCard}=weather;
const trip={id:'weather-trip',start:'2026-10-01T08:00',end:'2026-10-07T18:00'};
test('weather stops follow itinerary time, deduplicate city aliases and ignore generic activities',()=>{
  const stops=weatherStops({...trip,events:[
    {id:'3',date:'2026-10-03',startTime:'09:00',address:'西安市'},
    {id:'1',date:'2026-10-01',startTime:'09:00',startPlace:'咸阳',endPlace:'西安'},
    {id:'2',date:'2026-10-02',startTime:'09:00',address:'陕西省丹凤县中心广场'},
    {id:'4',date:'2026-10-04',startTime:'12:00',title:'午饭'}]});
  assert.deepEqual(stops.map(s=>s.cityName),['咸阳','西安','丹凤县']);
  assert.equal(stops[0].date,'2026-10-01');
});
test('county destinations stay counties while urban landmarks resolve to their city',()=>{
  const location={name:'景点',addressComponents:{province:'陕西省',city:'西安市',district:'雁塔区'}};
  assert.equal(cityIdentity('大雁塔',location).cityName,'西安市');
  assert.equal(cityIdentity('蒲城县',{addressComponents:{province:'陕西省',city:'渭南市',district:'蒲城县'}}).cityName,'蒲城县');
  assert.equal(cityIdentity('四姑娘山',{addressComponents:{province:'四川省',city:'阿坝藏族羌族自治州',district:'小金县'}}).cityName,'小金县');
});
test('lodging-only cities use a valid trip date and ignore lodging outside the trip',()=>{
  const stops=weatherStops({...trip,events:[],hotels:[{city:'西安市',checkin:'2026-09-30',checkout:'2026-10-02'},{city:'成都市',checkin:'2026-10-20',checkout:'2026-10-21'}]});
  assert.equal(stops.length,1);assert.equal(stops[0].cityName,'西安市');assert.equal(stops[0].date,'2026-10-01');
});
test('multiple landmarks use their resolved city once, preserve first appearance, and cap at seven',async()=>{
  const stops=Array.from({length:12},(_,i)=>({place:'place-'+i,date:'2026-10-01'}));
  const cities=await cityWeathers(stops,async stop=>{const i=Number(stop.place.split('-')[1]),city=i<3?'西安市':'city-'+i;return {available:true,cityName:city,cityKey:city,current:12,high:14,low:8};});
  assert.equal(cities.length,7);assert.equal(cities[0].cityName,'西安市');assert.equal(cities[1].place,'place-3');
  assert.deepEqual((await cityWeathers(stops.slice(0,2),async()=>({available:true,cityName:'西安市',cityKey:'西安'}))).map(c=>c.cityName),['西安市']);
});
test('zero and failed weather remain distinct and an empty trip invents no cards',async()=>{
  assert.deepEqual(weatherStops({...trip,events:[],hotels:[]}),[]);
  assert.deepEqual(await cityWeathers([],()=>{throw Error('must not query');}),[]);
  assert.equal(weatherCard({place:'西安市'},{available:true,current:0,high:2,low:-3}).temperature,'0');
  const [failed]=await cityWeathers([{place:'西安市',date:'2026-10-01'}],async()=>{throw Error('network');});
  assert.equal(failed.temperature,'—');assert.equal(failed.available,false);
  const result=weatherCard({place:'西安',date:'2026-10-01'},{available:true,date:'2026-10-26'});
  assert.equal(result.date,'2026-10-01');assert.equal(result.forecastDate,'2026-10-26');
});
test('home and city pages share cached requests, and failed requests remain retryable',async()=>{
  let calls=0;const stop={place:'天气缓存测试城市',date:'2026-10-01'};
  const call=async()=>{calls++;return {available:true,current:12};};
  await Promise.all([cachedWeather(call,'t',stop),cachedWeather(call,'t',stop)]);assert.equal(calls,1);
  let failures=0;const failing=async()=>{if(!failures++)throw Error('temporary');return {available:true};};
  await assert.rejects(cachedWeather(failing,'retry',stop),/temporary/);
  assert.equal((await cachedWeather(failing,'retry',stop)).available,true);
});

const source=readFileSync('cloudfunctions/suixing-api/index.js','utf8');
function weatherService(){
  const code=source.slice(source.indexOf('async function getWeather('),source.indexOf('\nconst first =',source.indexOf('async function getWeather(')));
  let memberships=0;const module={exports:{}};
  const fixed=Date.parse('2026-10-26T04:00:00Z');class Clock extends Date{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}}
  vm.runInNewContext(code+'\nmodule.exports=getWeather;',{
    module,Date:Clock,AbortSignal,encodeURIComponent,cityIdentity,
    fail:(status,message)=>{throw Object.assign(new Error(message),{status});},
    membership:async()=>{memberships++;return {};},db:{},loadTrip:async()=>trip,weatherKey:(p,d)=>p+d,
    collections:{weather:{doc:()=>({set:async()=>{}})}},first:async()=>null,
    geocodePlace:async()=>({name:'西安',latitude:34,longitude:108,addressComponents:{province:'陕西省',city:'西安市',district:'雁塔区'}}),
    fetch:async()=>({ok:true,json:async()=>({daily:{time:['2026-10-26'],weather_code:[0],temperature_2m_max:[20],temperature_2m_min:[8],uv_index_max:[3]},current:{temperature_2m:12,relative_humidity_2m:60}})}),
    weatherCodeText:()=> '晴',uvLevelText:()=> '中等'
  });
  return {get:module.exports,memberships:()=>memberships};
}
test('current city weather can be queried for a past itinerary while travel-date weather keeps its semantics',async()=>{
  const service=weatherService(),input={tripId:'t',date:'2026-10-01',place:'西安市'};
  const current=await service.get('member',{...input,current:true});
  assert.equal(current.available,true);assert.equal(current.date,'2026-10-26');assert.equal(current.cityName,'西安市');
  const dated=await service.get('member',input);assert.equal(dated.available,false);assert.equal(dated.reason,'out_of_range');
  await assert.rejects(service.get('member',{...input,date:'2026-11-01',current:true}),/天气日期不在旅行范围内/);
  assert.equal(service.memberships(),3);
});
