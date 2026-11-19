const text = value => String(value || '').trim();
const cityBase = value => text(value).replace(/\s+/g, '').replace(/(?:市|县|区)$/u, '');
function cityIdentity(place, location = {}) {
  const a = location.addressComponents || {}, city = text(a.city), district = text(a.district);
  const query = cityBase(place);
  const explicitCity = city && query.includes(cityBase(city));
  const explicitCounty = /县$/.test(district) && query.includes(cityBase(district));
  const name = explicitCounty ? district : explicitCity ? city : /市$/.test(city) ? city : district || city || text(location.name) || text(place);
  return { cityName: name, cityKey: [a.province || '', cityBase(name)].join('|') };
}
function explicitCity(value) {
  const s = text(value).replace(/^.*?(?:省|自治区)/u, '');
  const match = s.match(/^([^市县区，,\s]{1,18}(?:市|县))/u);
  return match ? match[1] : text(value);
}
function weatherStops(trip, overview = {}) {
  if (!trip) return [];
  const resolved = overview?.rawPoints || overview?.points || [];
  const events = [...(trip.events || [])].sort((a,b) => text(a.date).localeCompare(text(b.date)) || text(a.startTime).localeCompare(text(b.startTime)));
  const source = [], seen = new Set();
  const add = (place,date,eventId,role) => {
    place=text(place);if(!place)return;
    const point=resolved.find(p=>p.sourceEventId===eventId&&(p.sourceRole===role||(role==='end'&&p.sourceRole==='title')));
    const named=explicitCity(place),identity=point?.addressComponents ? cityIdentity(named,point) : {cityName:named};
    const start=text(trip.start).slice(0,10),end=text(trip.end).slice(0,10),day=date||start;
    const forecastDay=day<start?start:day>end?end:day;
    const key=[cityBase(place),forecastDay].join('|');if(!cityBase(identity.cityName)||seen.has(key))return;seen.add(key);
    source.push({place,cityName:identity.cityName,date:forecastDay,pointId:point?.id||'',contextCity:point?.addressComponents?.city||'',locationKey:JSON.stringify([point?.latitude,point?.longitude,trip.routeConfig?.updatedAt||''])});
  };
  for(const e of events){
    if(e.date<text(trip.start).slice(0,10)||e.date>text(trip.end).slice(0,10))continue;
    add(e.startPlace,e.date,e.id,'start');
    add(e.address||e.endPlace||(!/^(?:午饭|晚饭|早餐|午餐|晚餐|吃饭|休息|自由活动|出发|返程|归程|开车|入住|退房)$/.test(text(e.title))?e.title:''),e.date,e.id,'end');
  }
  // A lodging-only trip still has usable cities; itinerary locations take priority.
  for(const h of [...(trip.hotels||[])].filter(h=>h.checkout>text(trip.start).slice(0,10)&&h.checkin<=text(trip.end).slice(0,10)).sort((a,b)=>text(a.checkin).localeCompare(text(b.checkin)))){
    for(let date=h.checkin,i=0;date<h.checkout&&date<=text(trip.end).slice(0,10)&&i<60;i++){
      add(h.address||h.city,date,h.id,'hotel');
      date=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);
    }
  }
  return source.sort((a,b)=>a.date.localeCompare(b.date));
}
const cache = new Map();
async function cachedWeather(call,tripId,stop,current=false,force=false) {
  const key=JSON.stringify([tripId,stop.place,stop.date,stop.pointId||'',stop.locationKey||'',current]);
  if(force)cache.delete(key);
  const old=cache.get(key);if(old&&old.until>Date.now())return old.value;
  const value=Promise.resolve().then(()=>call('getWeather',{tripId,date:stop.date,place:stop.place,pointId:stop.pointId||'',contextCity:stop.contextCity||'',current}));
  cache.set(key,{value,until:Date.now()+15000});
  try{const weather=await value;cache.set(key,{value:weather,until:Date.now()+(weather.available?3600000:300000)});return weather;}
  catch(error){cache.delete(key);throw error;}
}
function weatherCard(stop,weather={}) {
  const number=value=>typeof value==='number'&&Number.isFinite(value)?String(Math.round(value)):'—';
  const code=Number(weather.code);
  const theme=!weather.available?'unavailable':weather.theme||(code>=400&&code<500?'snow':code>=300&&code<400?'rain':code>=100&&code<200?(code===100||code===150?'sunny':'cloudy'):(code>=71&&code<=77)||(code>=85&&code<=86)?'snow':code>=51?'rain':code>=3?'cloudy':'sunny');
  return {...stop,...weather,date:stop.date,forecastDate:weather.date,cityName:weather.cityName||stop.cityName||stop.place,theme,
    temperature:number(weather.current??weather.high),highLabel:number(weather.high),lowLabel:number(weather.low),
    placeLabel:stop.place&&stop.place!==(weather.cityName||stop.cityName)?stop.place:'',
    dateLabel:text(stop.date).replace(/-/g,'.'),updatedLabel:weather.updatedAt&&Number.isFinite(Date.parse(weather.updatedAt))?new Date(Date.parse(weather.updatedAt)+8*3600000).toISOString().replace('T',' ').slice(5,16):'',
    conditionLabel:weather.available?weather.condition||'—':weather.reason==='out_of_range'?'该日期暂无预报':weather.reason==='place_not_found'?'地点未识别':weather.reason==='missing_place'?'地点待完善':weather.reason==='not_configured'?'天气服务待配置':'获取失败，点击重试'};
}
async function cityWeathers(stops,fetcher,onUpdate=()=>{},isActive=()=>true) {
  const cities=[],keys=new Map();
  for(let i=0;i<stops.length&&cities.length<60&&isActive();i+=3){
    const batch=stops.slice(i,i+3);
    const results=await Promise.all(batch.map(s=>Promise.resolve().then(()=>fetcher(s)).catch(()=>({available:false,reason:'error'}))));
    if(!isActive())return cities;
    for(let j=0;j<batch.length&&cities.length<60;j++){
      const card=weatherCard(batch[j],results[j]),key=[typeof results[j].latitude==='number'&&typeof results[j].longitude==='number'?[results[j].latitude.toFixed(2),results[j].longitude.toFixed(2)].join(','):results[j].cityKey||cityBase(card.cityName),batch[j].date].join('|');
      if(keys.has(key)){const index=keys.get(key);if(!cities[index].available&&card.available)cities[index]={...card,date:cities[index].date};continue;}
      keys.set(key,cities.length);cities.push({...card,id:String(cities.length)});
    }
    onUpdate([...cities]);
  }
  return cities;
}
function demoCityWeather(place) {
  const city=/成都/.test(place)?'成都市':/小金|四姑娘山|双桥沟|猫鼻梁/.test(place)?'小金县':'';
  if(!city)return {available:false,reason:'place_not_found'};
  return {available:true,cityName:city,cityKey:city,location:city,source:'游客示例',code:city==='成都市'?3:0,condition:city==='成都市'?'阴':'晴',current:city==='成都市'?22:13,high:city==='成都市'?26:17,low:city==='成都市'?18:6,humidity:62,uvIndex:4,uvLevel:'中等'};
}
module.exports={cityIdentity,weatherStops,cachedWeather,weatherCard,cityWeathers,demoCityWeather};
