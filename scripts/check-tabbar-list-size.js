async page=>{
 const rows=[];
 for(const width of [360,390,393,430]){
  await page.setViewportSize({width,height:852});
  await page.goto('http://127.0.0.1:4193/app?mode=member&tab=today');
  const target=page.locator('.master-nav .nav-item').nth(3);
  await target.waitFor();
  const sample=()=>target.evaluate(e=>{const b=e.getBoundingClientRect(),i=e.querySelector('img').getBoundingClientRect();return {button:[b.width,b.height],image:[i.width,i.height],src:e.querySelector('img').getAttribute('src')}});
  const before=await sample();
  await target.click();
  await page.waitForFunction(()=>document.querySelectorAll('.master-nav .nav-item')[3]?.classList.contains('active'));
  const after=await sample();
  if(JSON.stringify(before.button)!==JSON.stringify(after.button)||JSON.stringify(before.image)!==JSON.stringify(after.image))throw Error(JSON.stringify({width,before,after}));
  rows.push({width,before,after});
  if(width===393)await page.screenshot({path:'output/playwright/tabbar-list-size-fixed.png'});
 }
 await page.goto('http://127.0.0.1:4193/?mode=member&tab=list');
 return rows;
}
