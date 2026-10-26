const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const sharp = createRequire('C:/Users/wenhu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js')('sharp');
const root = path.join(__dirname, '..', 'wechat-miniprogram', 'miniprogram', 'assets');
const files = [
  'mastergo-profile/cloud-left.png',
  'mastergo-profile/cloud-right.png',
  'mastergo-profile/cloud-bottom.png',
  'mastergo/route-fallback.jpg',
  'mastergo-route/ticket-demo.png',
  'mastergo-route/create-background.png',
  'mastergo-profile/avatar.png',
  'mastergo-list/outfit/demo-look.jpg',
  'mastergo/weather-cloud.webp'
];
(async () => {
  for (const file of files) {
    const input = path.join(root, file);
    const image = sharp(input);
    const before = fs.statSync(input).size;
    const lossless = (await image.clone().webp({ lossless: true, effort: 6 }).toBuffer()).length;
    const quality = (await image.clone().webp({ quality: 88, effort: 6 }).toBuffer()).length;
    console.log(JSON.stringify({ file, before, lossless, quality }));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
