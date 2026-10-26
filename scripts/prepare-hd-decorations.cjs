const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const sharp = createRequire('C:/Users/wenhu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js')('sharp');

const root = path.join(__dirname, '..', 'wechat-miniprogram', 'miniprogram', 'assets');
const source = 'C:/Users/wenhu/Desktop/装饰图标';
const names = [
  ['loading-welcome', 'sticker-tree', '组 51270@3x.png'],
  ['loading-welcome', 'sticker-mountain', '组 51269@3x.png'],
  ['loading-welcome', 'sticker-camera', '组 51271@3x.png'],
  ['loading-welcome', 'sticker-liberty', '组 51272@3x.png'],
  ['loading-welcome', 'sticker-tower', '组 51273@3x.png'],
  ['mastergo-profile', 'fire', '容器@3x.png'],
  ['mastergo-profile', 'camp', '组 51048@3x.png'],
  ['mastergo-profile', 'bike', '组 51049@3x.png'],
  ['mastergo-profile', 'car', '组 51051@3x.png']
];

(async () => {
  let sourceBytes = 0;
  let outputBytes = 0;
  for (const [folder, item, filename] of names) {
      const input = path.join(source, filename);
      const destination = path.join(root, folder, `${item}-hd.webp`);
      const before = await sharp(input).metadata();
      const data = await sharp(input).resize({ width: 192, height: 192, fit: 'inside' }).webp({ quality: 88, alphaQuality: 95, effort: 6 }).toBuffer();
      const after = await sharp(data).metadata();
      if (Math.min(after.width, after.height) < 170 || Math.abs(before.width / before.height - after.width / after.height) > .01 || !after.hasAlpha) {
        throw Error(`Decoration conversion changed dimensions or transparency: ${item}`);
      }
      fs.writeFileSync(destination, data);
      sourceBytes += fs.statSync(input).size;
      outputBytes += data.length;
  }
  console.log(JSON.stringify({ count: names.length, sourceBytes, outputBytes }));
})().catch(error => { console.error(error); process.exitCode = 1; });
