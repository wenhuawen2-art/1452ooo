async page => {
 await page.setViewportSize({width:1100,height:650});
 await page.goto('http://127.0.0.1:4193/?mode=list-design');
 const frame=page.frameLocator('#phone');await frame.locator('.system-header').waitFor();
 const child=page.frames().find(f=>f.url().includes('/app?'));
 const results=[];
 for(const tab of ['行程','清单','记账','首页','行程']){
  await child.evaluate(()=>scrollTo(0,260));
  await frame.getByRole('button',{name:tab,exact:true}).click();
  await child.waitForFunction(tab=>document.querySelector('.nav-item.active')?.getAttribute('aria-label')===tab,tab);
  await child.waitForFunction(()=>Math.abs(Number(getComputedStyle(document.querySelector('.system-header-blur')).opacity)-Math.min(1,scrollY/64))<.01);
  results.push(await child.evaluate(()=>({tab:document.querySelector('.nav-item.active').getAttribute('aria-label'),scroll:scrollY,opacity:Number(getComputedStyle(document.querySelector('.system-header-blur')).opacity),blurTop:document.querySelector('.system-header-blur').getBoundingClientRect().top})));
 }
 await child.evaluate(()=>scrollTo(0,260));
 await frame.locator('.rg-date').nth(2).click();
 await child.waitForFunction(()=>document.querySelector('.rg-date.selected')?.textContent.includes('12'));
 await child.waitForFunction(()=>Math.abs(Number(getComputedStyle(document.querySelector('.system-header-blur')).opacity)-Math.min(1,scrollY/64))<.01);
 results.push(await child.evaluate(()=>({state:'date-change',scroll:scrollY,opacity:Number(getComputedStyle(document.querySelector('.system-header-blur')).opacity),blurTop:document.querySelector('.system-header-blur').getBoundingClientRect().top})));
 await page.screenshot({path:'output/playwright/header-shell-switch-fixed.png'});
 return results;
}
