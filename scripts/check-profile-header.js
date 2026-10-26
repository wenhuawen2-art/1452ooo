async page => {
  const results=[];
  for(const width of [360,390,393,430]){
    await page.setViewportSize({width,height:852});
    await page.goto('http://127.0.0.1:4193/app?mode=profile-design&device=iphone');
    await page.locator('.pp-header').waitFor();await page.waitForTimeout(350);
    const state=()=>page.locator('.pp-header').evaluate(e=>({top:e.getBoundingClientRect().top,navTop:e.querySelector('.pp-nav').getBoundingClientRect().top,opacity:Number(getComputedStyle(e.querySelector('.pp-header-blur')).opacity),z:Number(getComputedStyle(e).zIndex)}));
    const top=await state();if(top.opacity!==0)throw Error('Header blurred at rest');
    await page.evaluate(()=>scrollTo(0,16));await page.waitForTimeout(80);const partial=await state();
    await page.evaluate(()=>scrollTo(0,120));await page.waitForTimeout(80);const scrolled=await state();
    if(Math.abs(top.navTop-scrolled.navTop)>1||scrolled.top!==0)throw Error('Header moved while scrolling');
    if(!(partial.opacity>0&&partial.opacity<scrolled.opacity&&scrolled.opacity===1))throw Error('Blur is not progressive');
    if(scrolled.z>=80)throw Error('Header obscures forms');
    if(width===393)await page.screenshot({path:'output/playwright/profile-header-scrolled-393.png'});
    await page.locator('.pp-trip-head').first().click();await page.waitForTimeout(350);
    const afterRender=await state();if(afterRender.opacity!==1)throw Error('Rerender reset scroll blur');
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(80);const returned=await state();
    if(returned.opacity!==0)throw Error('Blur remained at top');
    if(width===393)await page.screenshot({path:'output/playwright/profile-header-top-393.png'});
    results.push({width,topOpacity:top.opacity,partialOpacity:partial.opacity,scrolledOpacity:scrolled.opacity,returnedOpacity:returned.opacity,navTop:top.navTop,fixed:true});
  }
  return results;
}
