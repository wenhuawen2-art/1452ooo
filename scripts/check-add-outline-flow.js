async page => {
  const states=[];
  await page.setViewportSize({width:393,height:852});
  for (const [mode,label] of [['route-design','添加安排'],['list-design','添加类目'],['outfit-design','添加穿搭'],['expense-design','记一笔']]) {
    await page.goto(`http://127.0.0.1:4193/app?mode=${mode}&device=iphone`);
    const button=page.getByRole('button',{name:label});
    await button.waitFor();
    const first=await button.evaluate(e=>{
      const ring=e.querySelector('.xy-add-flow-ring');
      const box=e.getBoundingClientRect();
      return {width:box.width,height:box.height,animation:getComputedStyle(ring).animationName,transform:getComputedStyle(ring).transform};
    });
    await page.waitForTimeout(500);
    const second=await button.locator('.xy-add-flow-ring').evaluate(e=>getComputedStyle(e).transform);
    if (Math.abs(first.width-52)>1||Math.abs(first.height-52)>1||first.animation!=='xy-add-outline-flow'||first.transform===second) throw Error(`${mode}: ${JSON.stringify({first,second})}`);
    await page.screenshot({path:`output/playwright/add-outline-${mode}.png`});
    await page.locator('.page').evaluate(e=>e.classList.add('reduced-motion'));
    const reduced=await button.locator('.xy-add-flow-ring').evaluate(e=>getComputedStyle(e).animationName);
    if(reduced!=='none')throw Error(`${mode}: reduced motion still animates`);
    states.push({mode,size:`${first.width}×${first.height}`,animated:true,reducedMotionStopped:true});
  }
  return states;
}
