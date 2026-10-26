async page => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:393,height:852});
 await page.goto('http://127.0.0.1:4193/app?mode=weather-design&device=iphone');
 await page.locator('.mg-location').waitFor();
 if(await page.locator('.mg-location').innerText()!=='咸阳市')throw Error('Home is not the first city');
 await page.getByRole('button',{name:'天气详情',exact:true}).scrollIntoViewIfNeeded();
 const homeScroll=await page.evaluate(()=>scrollY);
 await page.getByRole('button',{name:'天气详情',exact:true}).click();await page.locator('.wc-card').first().waitFor();
 const names=await page.locator('.wc-city > span:first-child').allTextContents();
 if(names.join(',')!=='咸阳市,西安市,丹凤县,蒲城县,汉中市,九寨沟县,广元市')throw Error('Wrong itinerary order: '+names);
 if(await page.locator('.master-nav').count())throw Error('Secondary page has a tabbar');
 await page.getByRole('button',{name:'返回上一页',exact:true}).click();await page.locator('.mg-weather').waitFor();await page.waitForTimeout(320);
 if(Math.abs(await page.evaluate(()=>scrollY)-homeScroll)>1)throw Error('Return lost home scroll');
 // One forecast fails without replacing it with invented numbers; tapping retries.
 await page.evaluate(()=>{const b=document.querySelector('.mg-weather-more');request({type:'tap',binding:JSON.parse(b.dataset.binding),fail:true});});
 await page.locator('.wc-card.unavailable').waitFor();
 if(!(await page.locator('.wc-card.unavailable .wc-current').innerText()).includes('—'))throw Error('Failure fabricated a temperature');
 await page.locator('.wc-card.unavailable').click();await page.waitForFunction(()=>document.querySelectorAll('.wc-card.unavailable').length===0);
 for(const [mode,count] of [['weather-design-few',2],['weather-design-many',7],['weather-design-empty',0]]){
  await page.goto(`http://127.0.0.1:4193/app?mode=${mode}&preset=weather-cities`);await page.locator('.wc-page').waitFor();
  if(await page.locator('.wc-card').count()!==count)throw Error('Wrong card count for '+mode);
 }
 const widths=[];
 for(const width of [360,390,393,430]){
  await page.setViewportSize({width,height:852});
  await page.goto('http://127.0.0.1:4193/app?mode=weather-design&preset=weather-cities&device=iphone');await page.locator('.wc-card').first().waitFor();await page.waitForTimeout(320);
  const box=await page.locator('.wc-card').first().boundingBox(),head=await page.locator('.wc-header').boundingBox();
  if(Math.abs(box.height-96)>1||box.y<head.y+head.height)throw Error('Card layout or safe area wrong at '+width);
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Horizontal overflow');
  await page.screenshot({path:`output/playwright/weather-cities-${width}.png`,fullPage:true});widths.push(width);
 }
 await page.goto('http://127.0.0.1:4193/?mode=weather-design');
 await page.frameLocator('iframe').locator('.mg-weather-more').waitFor();
 await page.frameLocator('iframe').getByRole('button',{name:'天气详情',exact:true}).click();
 await page.frameLocator('iframe').locator('.wc-card').first().waitFor();
 await page.screenshot({path:'output/playwright/weather-cities-iphone.png'});
 if(errors.length)throw Error(errors.join('\n'));
 return {firstCity:'咸阳市',cityCount:7,names,shortList:2,max:7,empty:0,errorRetry:true,returnScroll:true,widths,phonePreview:true,pageErrors:errors};
}
