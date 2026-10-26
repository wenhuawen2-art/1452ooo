async (page) => {
  const results = [];
  await page.emulateMedia({reducedMotion:'reduce'});
  const settled = async () => { await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(()=>{})))); };
  for (const width of [393,360,390,430]) {
    await page.setViewportSize({width,height:1785});
    await page.goto('http://127.0.0.1:4191/app?mode=route-design');
    await page.getByRole('button',{name:'行程规划',exact:true}).waitFor();
    await settled();
    await page.screenshot({path:`output/playwright/route-planning-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'行程更多操作'}).first().click();
    await page.getByRole('button',{name:'编辑',exact:true}).waitFor();
    await settled();
    if(width===393)await page.screenshot({path:'output/playwright/route-menu-393.png',fullPage:true});
    await page.getByRole('button',{name:'住宿与票据',exact:true}).click();
    await page.getByText('月白屋上民宿',{exact:true}).waitFor();
    await page.setViewportSize({width,height:1220});
    await settled();
    await page.screenshot({path:`output/playwright/route-lodging-${width}.png`,fullPage:true});
    results.push(await page.evaluate(()=>({view:'lodging',width:innerWidth,document:document.documentElement.scrollWidth,menu:document.querySelectorAll('.rg-menu').length})));
    await page.goto('http://127.0.0.1:4191/app?mode=route-design-empty');
    await page.getByRole('button',{name:'添加住宿',exact:true}).waitFor();
    await settled();
    await page.screenshot({path:`output/playwright/route-empty-${width}.png`,fullPage:true});
    results.push(await page.evaluate(()=>({view:'empty',width:innerWidth,document:document.documentElement.scrollWidth})));
  }
  if(results.some(result=>result.document!==result.width))throw new Error('Horizontal overflow: '+JSON.stringify(results));
  return results;
}
