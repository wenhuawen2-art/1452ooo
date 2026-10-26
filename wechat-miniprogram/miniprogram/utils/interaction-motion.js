// Presentation-only presence: data commits immediately; a noninteractive copy
// stays mounted during exit. New content always cancels an older exit timer.
const NAV = ['today', 'route', 'list', 'expenses'];
const SECTION_KEYS = ['routeSection', 'listSection', 'expenseSegment', 'selectedDate'];
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function installMotion(page, wx) {
  if (page._motionInstalled || wx.__localPreview) return;
  page._motionInstalled = true;
  const write = page.setData.bind(page);
  page._motionWrite = write;
  page._motionTimers = {};
  let nav = 0, section = 0, panel = 0;
  page.setData = (incoming, done) => {
    const patch = { ...incoming }, before = page.data;
    const reduced = has(patch, 'reducedMotion') ? patch.reducedMotion : before.reducedMotion;
    const enabled = !reduced && !before.pageHidden;
    if (has(patch, 'tab') && patch.tab !== before.tab && enabled) {
      const direction = NAV.indexOf(patch.tab) >= NAV.indexOf(before.tab) ? 'next' : 'previous';
      patch.motionNav = `${direction}-${++nav % 2 ? 'a' : 'b'}`;
      patch.motionSection = '';
    } else if (SECTION_KEYS.some(key => has(patch, key) && patch[key] !== before[key]) && enabled) {
      patch.motionSection = ++section % 2 ? 'a' : 'b';
    }
    for (const key of ['modal', 'detail', 'loginPrompt']) {
      const exit = 'motionExit' + key[0].toUpperCase() + key.slice(1);
      if (!has(patch, key)) continue;
      clearTimeout(page._motionTimers[key]);
      if (before[key] && !patch[key] && enabled) {
        patch[exit] = before[key];
        if (key === 'modal') { patch.motionExitHeight = before.formPanelHeight; patch.motionExitBodyHeight = before.formBodyHeight; }
        page._motionTimers[key] = setTimeout(() => {
          if (!page._motionDisposed) write({ [exit]: null });
        }, 200);
      } else patch[exit] = null;
      if (key === 'modal' && patch[key] && before[key] && patch[key].type !== before[key].type) {
        patch.motionPanel = ++panel % 2 ? 'a' : 'b';
      }
    }
    if (reduced || patch.pageHidden) {
      for (const timer of Object.values(page._motionTimers)) clearTimeout(timer);
      Object.assign(patch, { motionExitModal: null, motionExitDetail: null, motionExitLoginPrompt: null });
    }
    write(patch, done);
  };
}
function disposeMotion(page) {
  page._motionDisposed = true;
  for (const timer of Object.values(page._motionTimers || {})) clearTimeout(timer);
}
module.exports = { installMotion, disposeMotion };
