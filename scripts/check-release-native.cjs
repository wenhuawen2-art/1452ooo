const automator = require('miniprogram-automator');
const fs = require('node:fs');
(async () => {
 const app = await automator.connect({wsEndpoint:'ws://127.0.0.1:9420'});
 const errors=[];app.on('exception',e=>errors.push(e.message||String(e)));
 const page=await app.currentPage();
 if(page.path!=='pages/index/index')throw Error('Expected index page');
 const initial=await page.data(),checks=[];
 try {
  await page.callMethod('loadGuestLanding');
  for(const tab of ['today','route','list','expenses']){
   await page.callMethod('setTab',{currentTarget:{dataset:{tab}}});await page.waitFor(200);
   if((await page.$$('.onboarding-intro')).length)throw Error('Guest hero remains: '+tab);
   const button=await page.$('.onboarding-primary'),nav=await page.$('.bottom-nav');
   const a=await button.offset(),b=await button.size(),n=await nav.offset();
   const gap=n.top-a.top-b.height;
   if(Math.abs(gap-40)>1)throw Error('Unexpected bottom gap: '+gap);
   checks.push({state:'guest-'+tab,gap});
   await app.screenshot({path:'output/wechat-release-guest-'+tab+'.png'});
  }
  await page.callMethod('confirmWechatLogin');await page.waitFor('.wechat-login');
  if(await (await page.$('.login-brand image')).attribute('src')!=='/assets/loading-welcome/brand.svg')throw Error('Old login logo');
  await page.callMethod('dismissLogin');
  await page.callMethod('loadGuestExperience');
  for(const tab of ['today','route','list','expenses']){
   await page.callMethod('setTab',{currentTarget:{dataset:{tab}}});await page.waitFor(250);
   if((await page.$$('.master-nav .nav-item')).length!==5)throw Error('Missing navigation: '+tab);
   checks.push({state:'demo-'+tab});
   await app.screenshot({path:'output/wechat-release-'+tab+'.png'});
  }
 } finally {
  await page.setData(initial);app.disconnect();
  fs.writeFileSync('output/wechat-release-verification.json',JSON.stringify({checks,errors},null,2));
 }
 if(errors.length)throw Error(JSON.stringify(errors));
 console.log(JSON.stringify({checks,errors}));
})().catch(e=>{console.error(e);process.exitCode=1});
