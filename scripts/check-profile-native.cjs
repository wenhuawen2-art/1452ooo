const automator=require('miniprogram-automator');
(async()=>{
 const app=await automator.connect({wsEndpoint:'ws://127.0.0.1:9420'});
 const page=await app.currentPage();
 try{
  if(page.path==='pages/index/index')await page.callMethod('openProfilePage');
  let profile;
  for(let i=0;i<10;i++){profile=await app.currentPage();if(profile.path==='pages/profile/index')break;await page.waitFor(400)}
  if(profile.path!=='pages/profile/index')throw Error('Profile navigation failed');
  await profile.waitFor('.pp-name');
  await app.screenshot({path:'output/wechat-profile-latest.png'});
  await (await profile.$('.pp-name button')).tap();
  await profile.waitFor('.form-sheet');
  await app.screenshot({path:'output/wechat-profile-form-latest.png'});
  await profile.callMethod('closeModal');
  await app.navigateBack();
  console.log('Native profile navigation, unsaved form opening and cancellation passed.');
 }finally{app.disconnect()}
})().catch(e=>{console.error(e);process.exitCode=1});
