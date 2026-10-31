const automator = require('miniprogram-automator');
const fs = require('node:fs');
const path = require('node:path');

const output = path.resolve(__dirname, '../output');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const app = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  const exceptions = [];
  const checks = [];
  app.on('exception', (error) => exceptions.push(error.message || String(error)));
  try {
    const page = await app.currentPage();
    if (page.path !== 'pages/index/index') throw new Error(`Unexpected page: ${page.path}`);
    const initial = await page.data();
    try {
      for (const tab of ['today', 'route', 'list', 'outfit', 'expenses']) {
        await page.callMethod('setTab', { currentTarget: { dataset: { tab } } });
        await page.waitFor(250);
        const data = await page.data();
        const navCount = (await page.$$('.master-nav .nav-item')).length;
        if (data.tab !== tab || navCount !== 5) throw new Error(`Navigation failed: ${tab} / ${data.tab} / ${navCount}`);
        if (tab === 'expenses' && (!data.expenseView?.totalNumber || !data.expenseView?.dates?.length)) {
          throw new Error('Expense summary or date strip is empty while loading');
        }
        await app.screenshot({ path: path.join(output, `xiangye-2.1-native-${tab}.png`) });
        checks.push({ tab, navCount });
      }
      await page.callMethod('setTab', { currentTarget: { dataset: { tab: 'route' } } });
      await page.callMethod('setRouteSection', { currentTarget: { dataset: { section: 'lodging' } } });
      await page.waitFor(250);
      const data = await page.data();
      const addCount = (await page.$$('.rg-add-event')).length;
      if (data.routeSection !== 'lodging' || addCount !== 0) throw new Error('Lodging has an unwanted floating add button');
      await app.screenshot({ path: path.join(output, 'xiangye-2.1-native-lodging.png') });
      checks.push({ tab: 'lodging', addCount });
    } finally {
      await page.setData(initial);
    }
  } finally {
    app.disconnect();
    fs.writeFileSync(path.join(output, 'xiangye-2.1-native-check.json'), JSON.stringify({ checks, exceptions }, null, 2));
  }
  if (exceptions.length) throw new Error(`Mini program exceptions: ${exceptions.join('; ')}`);
  console.log(JSON.stringify({ checks, exceptions }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
