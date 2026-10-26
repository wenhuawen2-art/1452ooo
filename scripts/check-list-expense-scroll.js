async page => {
 await page.emulateMedia({reducedMotion:'reduce'});const report=[];
 for(const [mode,tab,end] of [['member','list','.xy-list-groups'],['list-design-personal','list','.xy-list-groups'],['stress','list','.xy-list-groups'],['outfit-design','list','.xy-outfit-group:last-child'],['outfit-design-empty','list','.xy-outfit-empty'],['member','expenses','.ee-detail-days'],['expense-design','expenses','.ee-detail-days'],['stress','expenses','.ee-detail-days']]){
  for(const width of [360,393,430]){
   await page.setViewportSize({width,height:852});await page.goto(`http://127.0.0.1:4193/app?mode=${mode}&tab=${tab}&device=iphone`);
   await page.locator(end).waitFor();await page.evaluate(()=>scrollTo(0,100000));await page.waitForTimeout(80);
   const geometry=await page.evaluate(selector=>{
    const content=document.querySelector(selector).getBoundingClientRect(),action=document.querySelector('.xy-list-fixed-add').getBoundingClientRect();
    return {scroll:scrollY,height:document.documentElement.scrollHeight,viewport:innerHeight,gap:action.top-content.bottom,contentBottom:content.bottom,actionTop:action.top};
   },end);
   if(geometry.scroll>0&&Math.abs(geometry.gap-28)>1.5)throw Error(JSON.stringify({mode,tab,width,...geometry}));
   if(geometry.scroll===0&&geometry.gap<27)throw Error('Short content obstructed by action');
   if(width===393)await page.screenshot({path:`output/playwright/scroll-${mode}-${tab}-bottom.png`});
   report.push({mode,tab,width,...geometry});
  }
 }
 await page.emulateMedia({reducedMotion:'no-preference'});return report;
}
