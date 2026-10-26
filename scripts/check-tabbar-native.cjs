const automator=require('miniprogram-automator');
(async()=>{
 const app=await automator.connect({wsEndpoint:'ws://127.0.0.1:9420'});
 const page=await app.currentPage();
 if(page.path!=='pages/index/index')throw Error('Expected index page');
 const initialTab=await page.data('tab');
 try{
  let nav=await page.$$('.master-nav .nav-item');await nav[0].tap();await page.waitFor(400);
  nav=await page.$$('.master-nav .nav-item');
  const before={button:await nav[3].size(),image:await(await nav[3].$('image')).size()};
  await app.screenshot({path:'output/wechat-tabbar-list-before.png'});
  await nav[3].tap();await page.waitFor(500);
  nav=await page.$$('.master-nav .nav-item');
  const after={button:await nav[3].size(),image:await(await nav[3].$('image')).size(),src:await(await nav[3].$('image')).attribute('src')};
  if(JSON.stringify(before.button)!==JSON.stringify(after.button)||JSON.stringify(before.image)!==JSON.stringify(after.image))throw Error(JSON.stringify({before,after}));
  await app.screenshot({path:'output/wechat-tabbar-list-fixed.png'});
  console.log(JSON.stringify({before,after},null,2));
 }finally{await page.setData({tab:initialTab});app.disconnect()}
})().catch(e=>{console.error(e);process.exitCode=1});
