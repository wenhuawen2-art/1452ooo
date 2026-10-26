async page => {
  const results = [];
  for (const [width, height] of [[360,740],[390,852],[430,932]]) {
    for (const mode of ['onboarding-guest', 'empty']) {
      await page.setViewportSize({ width, height });
      await page.goto(`http://127.0.0.1:4193/app?mode=${mode}&device=iphone`);
      const button = page.locator('.onboarding-primary');
      await button.waitFor();
      const layout = await page.evaluate(() => {
        const rect = s => document.querySelector(s).getBoundingClientRect();
        const summary = document.querySelector('.onboarding-login-summary');
        const title = document.querySelector('.onboarding-title');
        return { pageWidth: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight, buttonBottom: rect('.onboarding-primary').bottom, navTop: rect('.bottom-nav').top, panelTop: rect('.onboarding-panel').top, summaryTop: summary?.getBoundingClientRect().top, titleColor: title ? getComputedStyle(title).color : null, introCount: document.querySelectorAll('.onboarding-intro').length, scrollY: scrollY };
      });
      if (layout.pageWidth > width + 1) throw new Error(`horizontal overflow ${mode} ${width}: ${layout.pageWidth}`);
      if (layout.pageHeight > height + 1) throw new Error(`page scrolls ${mode} ${width}: ${JSON.stringify(layout)}`);
      if (Math.abs(layout.navTop - layout.buttonBottom - 40) > 1) throw new Error(`wrong tabbar gap ${mode} ${width}: ${JSON.stringify(layout)}`);
      if (layout.summaryTop !== undefined && layout.summaryTop < layout.panelTop - 1) throw new Error(`summary overflows panel ${mode} ${width}: ${JSON.stringify(layout)}`);
      if (mode === 'empty' && layout.titleColor !== 'rgb(0, 17, 38)') throw new Error(`wrong title color: ${layout.titleColor}`);
      if (mode === 'onboarding-guest' && layout.introCount !== 0) throw new Error('signed-out page still renders hero content');
      await page.screenshot({ path: `output/playwright/onboarding-${mode}-${width}-iphone.png` });
      results.push({ width, height, mode, ...layout });
    }
  }
  return results;
}
