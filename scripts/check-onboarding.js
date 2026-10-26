async page=>{
 const results=[];await page.emulateMedia({reducedMotion:'reduce'});
 for(const mode of ['onboarding-guest','empty'])for(const tab of ['today','route','list','expenses']){
  await page.setViewportSize({width:393,height:852});await page.goto(`http://127.0.0.1:4193/app?mode=${mode}&tab=${tab}`);await page.locator('.onboarding-primary').waitFor();
  if(mode==='onboarding-guest' && await page.locator('.onboarding-intro').count())throw Error(`signed-out hero remains in ${tab}`);
  await page.screenshot({path:`output/playwright/onboarding-${mode}-${tab}.png`});
  const broken=await page.locator('img').evaluateAll(images=>images.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));if(broken.length)throw Error(JSON.stringify(broken));
  results.push({mode,tab});
 }
 await page.goto('http://127.0.0.1:4193/app?mode=onboarding-guest');await page.locator('.onboarding-primary').click();await page.locator('.wechat-login').waitFor();await page.screenshot({path:'output/playwright/onboarding-login-confirm.png'});await page.locator('.wechat-login').click();await page.waitForSelector('.is-empty-account');
 await page.locator('.onboarding-primary').click();await page.locator('.form-sheet').waitFor();
 return {screens:results,loginAndCreate:true};
}
