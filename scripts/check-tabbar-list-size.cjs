// Measure opaque artwork, excluding the SVG's decorative shadow.
const fs=require('node:fs');
const {createRequire}=require('node:module');
const sharp=createRequire('C:/Users/wenhu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js')('sharp');
const base='wechat-miniprogram/miniprogram/';
async function bounds(source){
 const {data,info}=await sharp(Buffer.from(source),{density:1152}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let l=info.width,t=info.height,r=-1,b=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>128){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y)}
 return {x:l/16,y:t/16,width:(r-l+1)/16,height:(b-t+1)/16};
}
(async()=>{
 const active=fs.readFileSync(base+'assets/mastergo-route/nav-list-active.svg','utf8');
 const inactive=fs.readFileSync(base+'assets/mastergo/svg_988bdf11.svg','utf8');
 const result={inactive:await bounds(inactive),oldActive:await bounds(active.replace('viewBox="4 3 32 32"','viewBox="0 0 40 42"')),active:await bounds(active)};
 for(const key of ['x','y','width','height'])if(Math.abs(result.inactive[key]-result.active[key])>.25)throw Error(JSON.stringify(result));
 console.log(JSON.stringify(result,null,2));
})();
