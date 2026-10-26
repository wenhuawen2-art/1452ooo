// Visual acceptance data only. Never used by the mini program or sent to the cloud.
module.exports = function applyListDesign(page, mode = 'list-design') {
  const personal = mode === 'list-design-personal';
  const outfit = mode.startsWith('outfit-design');
  const empty = mode === 'outfit-design-empty';
  const date = '2026-10-11';
  const owner = page.data.trip.me;
  const groups = [
    ['携带物品', ['墨镜', '墨镜', '软用水与纸巾', '湿巾']],
    ['常用药品与急救', ['个人处方药', '创可贴', '布洛芬', '晕车药', '感冒药']],
    ['车辆出发检查', ['轮胎胎压', '蓄电池与充电', '雨刷']],
  ];
  const categories = [], items = [];
  for (const scope of ['public', 'personal']) {
    groups.forEach(([name, titles], index) => {
      const categoryId = `design-${scope}-${index}`;
      const itemOwner = scope === 'personal' ? owner : null;
      categories.push({ id: categoryId, name, owner: itemOwner });
      titles.forEach((title, i) => items.push({ id: `${categoryId}-${i}`, categoryId, title, owner: itemOwner, key: i > 1, done: i === 1, byMemberId: i === 1 ? owner : null }));
    });
  }
  Object.assign(page.data.trip, {
    start: '2026-10-10T08:00', end: '2026-10-15T18:00', categories, items,
    outfits: empty ? [] : [4, 2].map((count, n) => ({ id: `design-outfit-${n}`, date, owner, title: '逛街', scene: '逛街', items: Array.from({ length: count }, (_, i) => ({ id: `design-piece-${n}-${i}`, typeName: '上装', name: '白色衬衫', photoUrl: '/assets/mastergo-list/outfit/demo-look.jpg', photoSrc: '/assets/mastergo-list/outfit/demo-look.jpg', garmentIcon: 'top' })) })),
  });
  page.data.trip.members.find(member => member.id === owner).avatarData = '/assets/mastergo-list/design-avatar.png';
  Object.assign(page.data, { selectedDate: date, tab: 'list', listSection: outfit ? 'outfit' : personal ? 'personal' : 'public', scope: personal ? '我的' : '公共', weather: { available: true, location: '四姑娘山', condition: '晴', high: 26, low: 6, code: 0 }, weatherLoading: false });
  page.data.account.nickname = 'Zero';
  page.derive();
  page.data.routeGreeting = '早上好';
  page.data.dates = page.data.dates.map((entry,index)=>({...entry,weekday:'周日',hasContent:index<2}));
  // Literal numbers in the artwork are inconsistent (75% vs 31/60).
  // Keep them only in this visual fixture; normal data still derives its progress.
  page.data.publicProgress = page.data.mineProgress = { percent: 75, done: 31, total: 60 };
  page.lastChecklistSection = personal ? 'personal' : 'public';
};
