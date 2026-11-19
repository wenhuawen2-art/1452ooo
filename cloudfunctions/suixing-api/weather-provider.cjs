const { sign } = require('node:crypto');
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const uvLevel = value => value == null ? '' : value <= 2 ? '低' : value <= 5 ? '中等' : value <= 7 ? '较高' : value <= 10 ? '很高' : '极高';
const dailyCache=new Map();

// Tencent/native mini-program map coordinates are GCJ-02. Weather grids use GPS coordinates.
function weatherCoordinates(location) {
  let latitude=Number(location.latitude),longitude=Number(location.longitude);
  if(location.coordinateSystem!=='gcj02'||longitude<72.004||longitude>137.8347||latitude<0.8293||latitude>55.8271)return {latitude,longitude};
  const x=longitude-105,y=latitude-35,pi=Math.PI;
  let lat=-100+2*x+3*y+0.2*y*y+0.1*x*y+0.2*Math.sqrt(Math.abs(x));
  lat+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;
  lat+=(20*Math.sin(y*pi)+40*Math.sin(y/3*pi))*2/3;
  lat+=(160*Math.sin(y/12*pi)+320*Math.sin(y*pi/30))*2/3;
  let lon=300+x+2*y+0.1*x*x+0.1*x*y+0.1*Math.sqrt(Math.abs(x));
  lon+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;
  lon+=(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3;
  lon+=(150*Math.sin(x/12*pi)+300*Math.sin(x/30*pi))*2/3;
  const rad=latitude*pi/180,magic=1-0.00669342162296594323*Math.sin(rad)**2;
  return {latitude:latitude-lat*180/((6378245*(1-0.00669342162296594323))/(magic*Math.sqrt(magic))*pi),longitude:longitude-lon*180/(6378245/Math.sqrt(magic)*Math.cos(rad)*pi)};
}
function qweatherHeaders(env) {
  if(env.QWEATHER_PRIVATE_KEY&&env.QWEATHER_KEY_ID&&env.QWEATHER_PROJECT_ID){
    if(!env.QWEATHER_DEVELOPER_ID)throw new Error('和风天气开发者ID待配置');
    const now=Math.floor(Date.now()/1000);
    const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
    const data=b64({alg:'EdDSA',kid:env.QWEATHER_KEY_ID})+'.'+b64({iss:env.QWEATHER_DEVELOPER_ID,sub:env.QWEATHER_PROJECT_ID,iat:now-30,exp:now+900});
    return {Authorization:'Bearer '+data+'.'+sign(null,Buffer.from(data),String(env.QWEATHER_PRIVATE_KEY).replace(/\\n/g,'\n')).toString('base64url')};
  }
  if(env.QWEATHER_API_KEY)return {'X-QW-Api-Key':env.QWEATHER_API_KEY};
  throw new Error('和风天气凭据待配置');
}
function normalizeQweather(payload,date) {
  const day=(payload.days||[]).find(entry=>String(entry.forecastStartTime||'').slice(0,10)===date);
  if(!day)return {available:false,reason:'out_of_range',date,source:'和风天气 QWeather',sourceUrl:'https://www.qweather.com'};
  const daytime=day.daytime||{},condition=daytime.condition||{};
  return {available:true,date,source:'和风天气 QWeather',sourceUrl:'https://www.qweather.com',condition:condition.text||'—',code:Number(condition.code),
    high:finite(day.temperatureMax?.value),low:finite(day.temperatureMin?.value),current:null,
    humidity:daytime.humidity==null?null:Math.round(daytime.humidity*100),
    rainProbability:daytime.precipitation?.probability==null?null:Math.round(daytime.precipitation.probability*100),
    uvIndex:finite(day.uvIndexMax),uvLevel:uvLevel(finite(day.uvIndexMax)),wind:finite(daytime.wind?.speed?.value),
    attributions:payload.metadata?.attributions||['https://developer.qweather.com/attribution.html']};
}
async function fetchQweather(location,date,{env=process.env,fetcher=fetch}={}) {
  const host=String(env.QWEATHER_API_HOST||'').replace(/^https:\/\//,'').replace(/\/$/,'');
  if(!/^[a-z0-9-]+\.(?:re\.)?qweatherapi\.com$/i.test(host))throw new Error('和风天气 API Host 待配置');
  const point=weatherCoordinates(location),headers=qweatherHeaders(env);
  const path=point.latitude.toFixed(2)+'/'+point.longitude.toFixed(2);
  const cacheKey=host+'|'+path,old=dailyCache.get(cacheKey);
  let daily;
  if(old&&old.until>Date.now())daily=await old.value;
  else {
    const value=(async()=>{const response=await fetcher('https://'+host+'/weather/v1/daily/'+path+'?days=10&localTime=true&lang=zh',{headers,signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('和风天气暂不可用（'+response.status+'）');return response.json();})();
    dailyCache.set(cacheKey,{value,until:Date.now()+1800000});
    try{daily=await value;}catch(error){dailyCache.delete(cacheKey);throw error;}
    if(dailyCache.size>200)dailyCache.delete(dailyCache.keys().next().value);
  }
  const weather=normalizeQweather(daily,date);
  const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  if(weather.available&&date===today){
    try{
      const currentResponse=await fetcher('https://'+host+'/weather/v1/current/'+path+'?localTime=true&lang=zh',{headers,signal:AbortSignal.timeout(8000)});
      if(currentResponse.ok){const now=await currentResponse.json();weather.current=finite(now.temperature?.value);weather.currentCondition=now.condition?.text||'';weather.observedAt=now.observationTime||null;}
    }catch{} // The dated forecast remains useful when the current endpoint fails.
  }
  return {...weather,updatedAt:new Date().toISOString()};
}
module.exports={weatherCoordinates,qweatherHeaders,normalizeQweather,fetchQweather};
