async page=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.setViewportSize({width:393,height:852});
 await page.goto('http://127.0.0.1:4193/app?mode=loading');
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
 await page.evaluate(()=>{document.getAnimations().forEach(a=>{a.pause();a.currentTime=0})});
 const frames=[];
 for(const t of [0,220,440,660,880]){
  const state=await page.evaluate(t=>{const a=document.getAnimations().find(a=>a.animationName==='welcome-run-cycle');a.currentTime=t;return {transform:getComputedStyle(document.querySelector('.welcome-runner-strip')).transform,rect:document.querySelector('.welcome-runner').getBoundingClientRect().toJSON()}},t);
  const shot=await page.locator('.welcome-runner').screenshot({path:'output/runner/frame-'+t+'.png'});
  frames.push({t,state,pixels:shot.toString('base64')});
 }
 if(frames[0].pixels!==frames[4].pixels)throw Error('Runner loop does not close');
 if(new Set(frames.slice(0,4).map(f=>f.pixels)).size!==4)throw Error('Runner does not change pose');
 await page.evaluate(()=>document.querySelector('.page').classList.add('motion-paused'));
 const paused=await page.locator('.welcome-runner-strip').evaluate(e=>getComputedStyle(e).animationPlayState);
 if(paused!=='paused')throw Error('Runner does not pause on hide');
 await page.setViewportSize({width:360,height:600});
 await page.goto('http://127.0.0.1:4193/app?mode=loading');
 const short=await page.locator('.welcome-runner').boundingBox();
 if(short.y<0||short.y+short.height>600)throw Error('Short screen runner clipped');
 await page.goto('http://127.0.0.1:4193/?mode=loading');
 await page.frameLocator('#phone').locator('.welcome-runner').waitFor();
 return {loop:'0ms equals 880ms',poses:4,paused,short,frames:frames.map(({t,state})=>({t,...state}))};
}
