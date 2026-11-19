const automator = require('miniprogram-automator');

(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  try {
    const page = await mini.currentPage();
    if (page.path !== 'pages/index/index') throw new Error(`Unexpected page: ${page.path}`);
    const original = await page.data();
    await page.setData({ loading: true, loadingVersion: 'v4' });
    await page.waitFor('.new-loading-surface');
    await page.waitFor(500);
    const surface = await page.$('.new-loading-surface');
    const background = await page.$('.new-loading-reference');
    const landscape = await page.$('.new-loading-landscape');
    console.log(JSON.stringify({
      surface: await surface.size(),
      background: await background.attribute('src'),
      landscape: await landscape.attribute('src'),
    }));
    await mini.screenshot({ path: 'output/wechat-loading-v4-native.png' });
    await page.setData({ loading: original.loading, loadingVersion: original.loadingVersion });
  } finally {
    mini.disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
