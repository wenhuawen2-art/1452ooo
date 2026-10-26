async page => {
 const report=[];await page.setViewportSize({width:393,height:852});
 for(const mode of ['home-design','route-design','list-design','outfit-design','expense-design']){
  await page.goto(`http://127.0.0.1:4193/app?mode=${mode}&device=iphone`);await page.locator('.system-header').waitFor();await page.waitForTimeout(320);
  const read=()=>page.locator('.system-header').evaluate(e=>({y:e.getBoundingClientRect().top,row:e.querySelector('.mg-top,.rg-header').getBoundingClientRect().top,opacity:Number(getComputedStyle(e.querySelector('.system-header-blur')).opacity),insideContent:!!e.closest('.content')}));
  const top=await read();if(top.opacity!==0||top.insideContent)throw Error('Incorrect header initial state '+mode);
  await page.evaluate(()=>scrollTo(0,16));await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.system-header-blur')).opacity)>0);const partial=await read();
  await page.evaluate(()=>scrollTo(0,160));await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.system-header-blur')).opacity)===1);const scrolled=await read();
  if(scrolled.y!==0||Math.abs(scrolled.row-top.row)>1||scrolled.opacity!==1||partial.opacity<=0||partial.opacity>=1)throw Error(JSON.stringify({mode,top,partial,scrolled}));
  await page.screenshot({path:`output/playwright/header-${mode}-scrolled.png`});
  await page.evaluate(()=>scrollTo(0,0));await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.system-header-blur')).opacity)===0);if((await read()).opacity!==0)throw Error('Blur stuck at top '+mode);
  const avatar=await page.locator('.system-header .profile-entry').boundingBox();if(Math.abs(avatar.width-avatar.height)>1)throw Error('Avatar distorted');
  report.push({mode,fixed:true,safeTop:top.row,partialOpacity:partial.opacity,scrolledOpacity:scrolled.opacity});
 }
 return report;
}
