// Read-only simulator verification: temporary presentation state is restored in finally.
const automator = require('miniprogram-automator');
const fs = require('node:fs');
(async () => {
  const app = await automator.connect({wsEndpoint:'ws://127.0.0.1:9420'});
  const errors=[];
  app.on('exception',e=>errors.push(e.message || e.text || String(e)));
  const page=await app.currentPage();
  if(page.path!=='pages/index/index') throw new Error('Expected native index page');
  const initial=await page.data();
  const report={page:page.path,checks:[],errors};
  try {
    await page.setData({loading:true,loadingVersion:'v3',reducedMotion:true});
    await page.waitFor('.welcome-loading-logo');
    await page.waitFor(600);
    const logo=await page.$('.welcome-loading-logo');
    const dots=await page.$$('.welcome-dots');
    const stickers=await page.$$('.welcome-sticker');
    const runner=await page.$('.welcome-walker');
    report.checks.push({state:'loading-static',logo:await logo.size(),dots:dots.length,stickers:stickers.length,runner:await runner.size(),source:await dots[0].attribute('src')});
    await app.screenshot({path:'output/wechat-loading-static.png'});
    await page.setData({reducedMotion:false});
    await page.waitFor(1800);
    await app.screenshot({path:'output/wechat-loading-flow.png'});
    const stream=await page.$('.welcome-loading-streams');
    const strip=await page.$('.welcome-walker-strip');
    const firstTransform=await strip.style('transform');
    await page.waitFor(150);
    const nextTransform=await strip.style('transform');
    if(firstTransform===nextTransform)throw Error('Native runner animation did not advance');
    report.checks.push({state:'loading-flow',opacity:await stream.style('opacity'),runnerTransform:[firstTransform,nextTransform]});
    await page.setData({loading:false,reducedMotion:initial.reducedMotion});
    for(const tab of ['today','route','list','expenses']){
      await page.setData({tab});await page.waitFor(300);
      const nav=await page.$$('.master-nav .nav-item');
      if(nav.length!==5) throw new Error(tab+' navigation count '+nav.length);
      await app.screenshot({path:'output/wechat-'+tab+'-latest.png'});
      report.checks.push({state:tab,navigation:nav.length});
    }
  } finally {
    await page.setData({loading:initial.loading,loadingVersion:initial.loadingVersion,reducedMotion:initial.reducedMotion,tab:initial.tab});
    fs.writeFileSync('output/wechat-loading-verification.json',JSON.stringify(report,null,2));
    app.disconnect();
  }
  console.log(JSON.stringify(report,null,2));
  if(errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
