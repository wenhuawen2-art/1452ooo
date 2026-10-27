const automator=require('miniprogram-automator');
(async()=>{
  const app=await automator.connect({wsEndpoint:'ws://127.0.0.1:9420'});
  const errors=[];app.on('exception',e=>errors.push(e.message||String(e)));
  const page=await app.currentPage();
  if(page.path!=='pages/index/index')throw Error('Expected index page');
  const initial=await page.data(),results=[];
  try{
    await page.callMethod('loadGuestExperience');
    for(const [tab,section,button] of [
      ['route',null,'.rg-add-event'],
      ['list','public','.xy-list-fixed-add'],
      ['list','outfit','.xy-outfit-fixed-add'],
      ['expenses',null,'.ee-add']
    ]){
      await page.callMethod('setTab',{currentTarget:{dataset:{tab}}});
      if(section)await page.setData({listSection:section});
      if(tab==='expenses')await page.setData({expenseSegment:'details'});
      await page.waitFor(180);
      const target=await page.$(button),ring=await page.$(`${button} .xy-add-flow-ring`);
      if(!target||!ring)throw Error('Missing animated outline: '+tab+' '+section);
      const size=await target.size();
      if(Math.abs(size.width-52)>1||Math.abs(size.height-52)>1)throw Error('Button dimensions changed: '+JSON.stringify(size));
      results.push({tab,section,size});
      await app.screenshot({path:`output/wechat-add-outline-${tab}-${section||'main'}.png`});
      if(tab==='route'){
        await page.waitFor(850);
        await app.screenshot({path:'output/wechat-add-outline-route-next-frame.png'});
      }
    }
  }finally{await page.setData(initial);app.disconnect();}
  if(errors.length)throw Error(JSON.stringify(errors));
  console.log(JSON.stringify({results,errors}));
})().catch(e=>{console.error(e);process.exitCode=1});
