async page => {
  await page.goto('http://127.0.0.1:4193/app?mode=list-design&tab=list');
  const star=page.locator('button.xy-item-star').first();await star.waitFor();
  const before=await star.getAttribute('aria-label');
  const checked=await page.locator('.xy-item-check.done').count();
  await star.click();
  await page.waitForFunction(label=>document.querySelector('button.xy-item-star')?.getAttribute('aria-label')!==label,before);
  const after=await star.getAttribute('aria-label');
  if(await page.locator('.form-sheet').count())throw Error('Star opened an editor');
  if(await page.locator('.xy-item-check.done').count()!==checked)throw Error('Star changed completion');
  await star.click();
  await page.waitForFunction(label=>document.querySelector('button.xy-item-star')?.getAttribute('aria-label')===label,before);
  await page.evaluate(()=>{const el=document.querySelector('button.xy-item-star');request({fail:true,type:'tap',binding:JSON.parse(el.dataset.binding)});});
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('模拟网络失败'));
  if(await star.getAttribute('aria-label')!==before)throw Error('Failed change did not roll back');
  await page.goto('http://127.0.0.1:4193/app?mode=archived&tab=list');
  await page.locator('.xy-list-page').waitFor();
  if(await page.locator('button.xy-item-star').count())throw Error('Archived stars still interactive');
  return {before,after,toggleBack:true,noEditor:true,completionPreserved:true,errorRollback:true,archivedReadOnly:true};
}
