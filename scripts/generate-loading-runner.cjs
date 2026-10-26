// Code-native white contour animation. Each frame is drawn deterministically;
// the mini-program moves one vector sprite with a CSS steps animation (no timer).
const fs=require('node:fs');
const N=20,W=104,H=112;
const f=n=>Number(n.toFixed(1));
const p=a=>a.map(f).join(' ');
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
function outline(points,r){
 const normals=points.slice(0,-1).map((q,i)=>{const d=[points[i+1][0]-q[0],points[i+1][1]-q[1]],l=Math.hypot(...d);return[-d[1]/l,d[0]/l]});
 const edge=points.map((q,i)=>{const n=normals[Math.min(i,normals.length-1)];return add(q,[n[0]*r,n[1]*r])});
 const other=points.map((q,i)=>{const n=normals[Math.min(i,normals.length-1)];return add(q,[-n[0]*r,-n[1]*r])}).reverse();
 const a=edge.concat(other);let d='M'+p([(a.at(-1)[0]+a[0][0])/2,(a.at(-1)[1]+a[0][1])/2]);
 for(let i=0;i<a.length;i++){const q=a[i],next=a[(i+1)%a.length];d+='Q'+p(q)+' '+p([(q[0]+next[0])/2,(q[1]+next[1])/2])}
 return d+'Z';
}
function leg(t,bob,opacity){
 const hip=[54,65+bob],foot=[57+23*Math.cos(t),98-22*Math.max(0,-Math.sin(t))];
 const dx=foot[0]-hip[0],dy=foot[1]-hip[1],dist=Math.hypot(dx,dy),bend=Math.sqrt(Math.max(0,23*23-dist*dist/4));
 const knee=[(hip[0]+foot[0])/2+dy/dist*bend,(hip[1]+foot[1])/2-dx/dist*bend];
 return `<g opacity="${opacity}"><path d="${outline([hip,knee,[foot[0],foot[1]-3]],2.8)}"/><path d="M${p([foot[0]-3,foot[1]-4])}q-2 1-2 4q0 2 3 2h10q4-1 2-3l-7-3"/></g>`;
}
function arm(t,bob,opacity){
 const a=.85*Math.sin(t),shoulder=[57,38+bob],elbow=add(shoulder,[Math.sin(a)*14,Math.cos(a)*14]),hand=add(elbow,[Math.sin(a+1.85)*12,Math.cos(a+1.85)*12]);
 return `<g opacity="${opacity}"><path d="${outline([shoulder,elbow,hand],2.1)}"/><path d="M${p([hand[0]-1,hand[1]-2])}q4-3 5 0q1 3-3 4"/></g>`;
}
function pose(i){
 const t=(i%N)/N*Math.PI*2,bob=-1.5*Math.cos(2*t);
 const head=`<g transform="translate(0 ${f(bob)})"><path d="M53 21q-5-1-4-4q1-3 6-3q2-5 7-3q6-1 7 5l-1 4l3 3l-4 1q0 7-5 7l-5-2l-2-6Z"/><path d="M51 16q5-4 12-1M65 20l1 .3M59 31l-1 4"/><path d="M55 34q-6 3-8 13l-2 12q-1 6 6 8q7 2 13-2l-1-18q0-9-4-12M50 43l-1 13q-1 5 4 6"/></g>`;
 let ground='';for(let j=0;j<3;j++){const phase=(i/N+j/3)%1,x=16+(1-phase)*70,y=105+j*2;ground+=`<path opacity="${f(Math.sin(phase*Math.PI)*.75)}" d="M${f(x)} ${y}q5-1 12-1"/>`}
 return `<g fill="none" stroke="white" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${leg(t+Math.PI,bob,.58)}${arm(t+Math.PI,bob,.58)}${leg(t,bob,.98)}${head}${arm(t,bob,1)}${ground}</g>`;
}
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W*(N+1)}" height="${H}" viewBox="0 0 ${W*(N+1)} ${H}">${Array.from({length:N+1},(_,i)=>`<g transform="translate(${i*W} 0)">${pose(i)}</g>`).join('')}</svg>`;
svg = svg.replaceAll('<g fill="none" stroke="white" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">', '<g>').replace('<svg ', '<svg fill="none" stroke="white" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" ');
fs.writeFileSync('wechat-miniprogram/miniprogram/assets/loading-welcome/runner-sprite.svg',svg);
fs.mkdirSync('output/runner',{recursive:true});
for(const i of [0,5,10,15])fs.writeFileSync(`output/runner/pose-${i}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${pose(i)}</svg>`);
console.log({frames:N,width:W,height:H,bytes:Buffer.byteLength(svg)});
