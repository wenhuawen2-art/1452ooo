async (page) => {
  const results = [];
  await page.emulateMedia({reducedMotion:'reduce'});
  const settled = async () => {
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForFunction(()=>[...document.images].every(image=>image.complete));
    await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
  };
  const scenes = [['list-design','public'],['list-design-personal','personal'],['outfit-design','outfit'],['outfit-design-empty','outfit-empty']];
  for (const [width,height] of [[393,1573],[360,800],[390,844],[430,932]]) {
    await page.setViewportSize({width,height});
    for (const [mode,name] of scenes) {
      await page.goto('http://127.0.0.1:4191/app?mode='+mode+(width===393?'':'&device='+(width===360?'android':'iphone')));
      await page.waitForSelector('.xy-list-mode'); await settled();
      const result = await page.evaluate(()=>{
        const rect=selector=>{const e=document.querySelector(selector);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
        const add=rect('.xy-list-fixed-add'),nav=rect('.master-nav');
        return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,gap:nav.y-(add.y+add.height),fontLoaded:[...document.fonts].every(f=>f.status==='loaded'),brokenImages:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src),positions:Object.fromEntries(['.xy-list-mode','.xy-list-segment','.xy-list-title','.xy-progress-label','.xy-progress-numbers','.xy-progress-fraction','.xy-progress-track','.xy-list-groups','.xy-item-row','.xy-outfit-dates','.xy-outfit-date-title','.xy-outfit-weather','.xy-outfit-group','.xy-piece-media','.xy-outfit-empty'].map(s=>[s,rect(s)]))};
      });
      if(result.width!==result.documentWidth||Math.abs(result.gap-28)>.5||!result.fontLoaded||result.brokenImages.length) throw Error(JSON.stringify({mode,...result}));
      if(width===393){
        const expected = name==='public'||name==='personal'?{'.xy-list-mode':81,'.xy-list-segment':189,'.xy-list-title':277,'.xy-progress-label':347,'.xy-progress-numbers':380,'.xy-progress-fraction':393,'.xy-progress-track':460,'.xy-list-groups':508,'.xy-item-row':580}:{'.xy-list-mode':81,'.xy-outfit-dates':189,'.xy-outfit-date-title':323,'.xy-outfit-weather':371,[name==='outfit'?'.xy-outfit-group':'.xy-outfit-empty']:459,...(name==='outfit'?{'.xy-piece-media':543}:{})};
        for(const [selector,y] of Object.entries(expected))if(Math.abs(result.positions[selector].y-y)>1)throw Error(mode+' '+selector+' expected '+y+', got '+result.positions[selector].y);
      }
      results.push({mode,...result});
      await page.screenshot({path:'output/playwright/list-corrected-'+name+'-'+width+'.png'});
      if(width===393&&name==='public'){
        await page.getByRole('button',{name:'墨镜更多操作',exact:true}).first().click();await page.getByRole('button',{name:'编辑',exact:true}).waitFor();await settled();await page.screenshot({path:'output/playwright/list-corrected-menu-393.png'});
      }
    }
  }
  await page.setViewportSize({width:1440,height:1100});
  await page.goto('http://127.0.0.1:4191/?mode=list-design&tab=list');
  const phone=page.frameLocator('#phone');
  await phone.getByText('团队行囊准备',{exact:true}).waitFor();
  await phone.locator('.xy-list-page').evaluate(()=>document.fonts.ready);
  await page.screenshot({path:'output/playwright/list-corrected-iphone-public.png'});
  await phone.getByRole('button',{name:'每日穿搭',exact:true}).click();
  await phone.locator('.xy-piece-media').first().waitFor();
  await page.screenshot({path:'output/playwright/list-corrected-iphone-outfit.png'});
  await phone.locator('.xy-piece-media').first().click();
  await phone.getByRole('dialog',{name:'衣物图片预览'}).waitFor();
  await phone.getByRole('button',{name:'关闭图片预览'}).click();
  return results;
}
