const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const sharp = createRequire('C:/Users/wenhu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js')('sharp');
const root = path.join(__dirname, '..', 'wechat-miniprogram', 'miniprogram', 'assets');
const names = [
  'mastergo-profile/cloud-left.png',
  'mastergo-profile/cloud-right.png',
  'mastergo-profile/cloud-bottom.png',
  'mastergo-profile/avatar.png',
  'mastergo-route/ticket-demo.png'
];

(async () => {
  let saved = 0;
  for (const name of names) {
    const input = path.join(root, name);
    const output = input.replace(/\.png$/, '.webp');
    const original = await sharp(input).ensureAlpha().raw().toBuffer();
    const data = await sharp(input).webp({ lossless: true, effort: 6 }).toBuffer();
    const decoded = await sharp(data).ensureAlpha().raw().toBuffer();
    if (original.length !== decoded.length) throw Error(`Dimensions changed: ${name}`);
    for (let offset = 0; offset < original.length; offset += 4) {
      if (original[offset + 3] !== decoded[offset + 3] ||
        (original[offset + 3] && [0, 1, 2].some(channel => original[offset + channel] !== decoded[offset + channel]))) {
        throw Error(`Visible pixels changed: ${name}`);
      }
    }
    fs.writeFileSync(output, data);
    saved += fs.statSync(input).size - data.length;
  }
  console.log(JSON.stringify({ count: names.length, saved }));
})().catch(error => { console.error(error); process.exitCode = 1; });
