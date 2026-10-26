async (page) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  const results=[];
  for(const width of [360,393,430]) {
    await page.setViewportSize({width,height:932});
    for(const mode of ['member','guest','empty','archived'])for(const tab of ['today','route','list','expenses']){
      await page.goto('http://127.0.0.1:4191/app?mode='+mode+'&tab='+tab+'&device='+(width===360?'android':'iphone'));
      await page.waitForSelector('.page');
      const value=await page.evaluate(()=>{const root=document.querySelector('.page');const top=parseFloat(getComputedStyle(root).getPropertyValue('--content-top'));const header=document.querySelector('.mg-brand,.rg-header,.custom-brand');return {top,headerTop:header.getBoundingClientRect().top,width:innerWidth,documentWidth:document.documentElement.scrollWidth};});
      if(value.headerTop<value.top-.5||value.width!==value.documentWidth)throw Error(JSON.stringify({mode,tab,...value}));
      results.push({mode,tab,...value});
    }
  }
  await page.setViewportSize({width:1440,height:1100});
  for(const tab of ['today','route','list','expenses']){
    await page.goto('http://127.0.0.1:4191/?tab='+tab);const frame=page.frameLocator('#phone');await frame.locator('.page').waitFor();await frame.locator('.page').evaluate(()=>document.fonts.ready);await page.screenshot({path:'output/playwright/system-safe-'+tab+'.png'});
  }
  return {scenarios:results.length,results};
}
