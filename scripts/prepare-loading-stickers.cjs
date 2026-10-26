const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const sharp=createRequire('C:/Users/wenhu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js')('sharp');
const root='wechat-miniprogram/miniprogram';
const source='C:/Users/wenhu/.mgmcp/resources/screenshots/200425698503069/170-8160';
const stickers=[['tree','组-51270_170-07572.png',76,86],['mountain','组-51269_170-07570.png',96,104],['camera','组-51271_170-07594.png',72,78],['liberty','组-51272_170-07989.png',104,108],['tower','组-51273_170-08008.png',70,78]];
(async()=>{
 let total=0;
 for(const [name,file,width,height] of stickers){
  const out=path.join(root,'assets/loading-welcome/sticker-'+name+'.webp');
  const data=await sharp(path.join(source,file)).resize(width,height,{fit:'fill'}).webp({quality:90,alphaQuality:100,effort:6}).toBuffer();
  fs.writeFileSync(out,data);total+=data.length;
 }
 // Repack an existing large PNG without changing any decoded RGBA pixel.
 // This makes room for the new stickers below the existing 512KiB raster budget.
 const weather=path.join(root,'assets/mastergo/weather-cloud');
 if(fs.existsSync(weather+'.png')){
  const data=await sharp(weather+'.png').webp({lossless:true,effort:6}).toBuffer();
  const before=await sharp(weather+'.png').ensureAlpha().raw().toBuffer();
  const after=await sharp(data).ensureAlpha().raw().toBuffer();
  if(before.length!==after.length)throw Error('Weather repack changed dimensions');
  for(let i=0;i<before.length;i+=4){
   if(before[i+3]!==after[i+3]||(before[i+3]&&[0,1,2].some(c=>before[i+c]!==after[i+c])))throw Error('Lossless weather repack changed visible pixels');
  }
  fs.writeFileSync(weather+'.webp',data);
  const view=path.join(root,'pages/index/views/today.wxml');
  fs.writeFileSync(view,fs.readFileSync(view,'utf8').replace('/assets/mastergo/weather-cloud.png','/assets/mastergo/weather-cloud.webp'));
  fs.unlinkSync(weather+'.png');
 }
 console.log({stickers:stickers.length,bytes:total});
})();
