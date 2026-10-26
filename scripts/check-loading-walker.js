async page => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('http://127.0.0.1:4193/app?mode=loading');
  await page.locator('.welcome-walker').waitFor();
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
  const info = await page.evaluate(() => ({
    oldHidden: getComputedStyle(document.querySelector('.welcome-runner-legacy')).display === 'none',
    stickerSizes: [...document.querySelectorAll('.welcome-sticker')].map(image => image.naturalWidth),
    walkerVisible: getComputedStyle(document.querySelector('.welcome-walker')).display !== 'none'
  }));
  if (!info.oldHidden || !info.walkerVisible || info.stickerSizes.some(size => size < 170)) {
    throw Error(`Loading assets failed: ${JSON.stringify(info)}`);
  }

  const poses = [];
  for (const ms of [0, 220, 440, 660, 880]) {
    await page.evaluate(time => {
      const animation = document.getAnimations().find(item => item.animationName === 'welcome-walk-cycle');
      if (!animation) throw Error('New walker animation is missing');
      animation.pause();
      animation.currentTime = time;
    }, ms);
    poses.push(await page.locator('.welcome-walker-strip').evaluate(element => getComputedStyle(element).transform));
    if (ms < 880) await page.locator('.welcome-walker').screenshot({ path: `output/walker/preview-${ms}.png` });
  }
  if (new Set(poses.slice(0, 4)).size !== 4) {
    throw Error('Walking poses do not change across the cycle');
  }
  if (poses[0] !== poses[4]) throw Error(`Walking loop does not close: ${poses[0]} / ${poses[4]}`);

  await page.goto('http://127.0.0.1:4193/app?mode=profile-design');
  await page.locator('.pp-sticker').first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.pp-sticker')].every(image => image.complete && image.naturalWidth >= 170));
  const profileStickers = await page.locator('.pp-sticker').count();
  return { ...info, poses: 4, loop: 'seamless', profileStickers };
}
