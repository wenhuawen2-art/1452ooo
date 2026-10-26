async(page)=>{
 const results=[];await page.emulateMedia({reducedMotion:'reduce'});
 for(const [w,h] of [[393,1785],[360,800],[390,844],[430,932]])for(const [mode,height] of [['expense-design',1785],['expense-design-split',1184],['expense-design-stats',2633]]){
 await page.setViewportSize({width:w,height:w===393?height:h});await page.goto('http://127.0.0.1:4192/app?mode='+mode+(w===393?'':'&device='+(w===360?'android':'iphone')));await page.waitForSelector('.ee-tabs');await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
 const r=await page.evaluate(()=>{const rect=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {y:r.y,height:r.height}};const a=rect('.ee-add'),n=rect('.master-nav');return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,gap:n.y-a.y-a.height,broken:[...document.images].filter(i=>!i.naturalWidth).length,positions:Object.fromEntries(['.ee-total-label','.ee-total-line','.ee-tabs','.ee-category-chart','.ee-daily-chart','.ee-ranking'].map(s=>[s,rect(s)]))}});
 if(r.width!==r.scrollWidth||Math.abs(r.gap-28)>1||r.broken)throw Error(JSON.stringify({mode,w,...r}));results.push({mode,w,...r});await page.screenshot({path:'output/playwright/'+mode+'-'+w+'.png'});
 }
 await page.setViewportSize({width:1440,height:1100});await page.goto('http://127.0.0.1:4192/?mode=expense-design&tab=expenses');await page.frameLocator('#phone').locator('.ee-tabs').waitFor();await page.screenshot({path:'output/playwright/expense-iphone.png'});return results;
}
