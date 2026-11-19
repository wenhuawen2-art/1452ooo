const MODES = [
  { id: 'driving', label: '自驾' }, { id: 'rail', label: '铁路' },
  { id: 'flight', label: '飞机' }, { id: 'transit', label: '公交' },
  { id: 'walking', label: '步行' }, { id: 'bicycling', label: '骑行' },
  { id: 'ferry', label: '轮渡' }, { id: 'other', label: '其他' },
];
const tripTypes = ['自驾游', '旅游', '露营', '房车旅行', '徒步', '骑行', '亲子游', '摄影旅行', '商务出行', '探亲', '其他'];
function entryRows(draft) {
  const applied = new Set(draft.appliedEntryIds || []);
  return [
    ...(draft.events || []).map(entry => ({ ...entry, kind: 'event', kindLabel: '行程', modeIndex: Math.max(0, MODES.findIndex(mode => mode.id === entry.transportMode)) })),
    ...(draft.items || []).map(entry => ({ ...entry, kind: 'item', kindLabel: '清单' })),
  ].map(entry => ({ ...entry, applied: applied.has(entry.id), selected: !applied.has(entry.id), editing: false }));
}
function messageRows(messages) {
  return (messages || []).map(message => ({ ...message, blocks: textBlocks(message.text), eventCount: message.draft?.events?.length || 0, itemCount: message.draft?.items?.length || 0, hasDraft: !!message.draft && !!((message.draft.events || []).length + (message.draft.items || []).length) }));
}
// Render model text as native text nodes only. Markdown never becomes executable HTML.
function textBlocks(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  const sections = /^(行程概览|旅行概览|每日安排|每日行程|推荐理由|准备清单|行前清单|物品清单|注意事项|交通建议|住宿建议|费用参考|预算建议|雨天备选|待确认信息|下一步|如何应用|方案调整|出行建议|行程与清单应用)[：:]?$/;
  const runs = text => text.split(/(\*\*[^*\n]+\*\*)/g).filter(Boolean).map(part => ({ text: part.startsWith('**') && part.endsWith('**') ? part.slice(2, -2) : part, bold: part.startsWith('**') && part.endsWith('**') }));
  let code = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^```/.test(line)) { code = !code; continue; }
    if (/^(?:[-*_]\s*){3,}$/.test(line) || /^\|?\s*:?-{3,}/.test(line)) continue;
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const plain = line.replace(/^\*\*(.+)\*\*[：:]?$/, '$1');
    const list = line.match(/^(?:[-*+]\s+|\d+[.、)]\s*|[□☐✓]\s*)(.+)$/);
    const dayHeading = /^(?:第\s*[一二三四五六七八九十\d]+\s*天|D(?:ay)?\s*\d+|\d{4}-\d{2}-\d{2})(?:\s|[·｜|：:])/.test(plain);
    let kind = 'paragraph', text = line, marker = '', level = 0;
    if (!code && (heading || sections.test(plain) || dayHeading)) { kind = 'heading'; text = heading ? heading[2] : plain; level = heading ? Math.min(3, heading[1].length) : dayHeading ? 3 : 2; }
    else if (!code && list) { kind = 'list'; text = list[1]; marker = /^\d/.test(line) ? line.match(/^\d+/)[0] : '·'; }
    else if (!code && /^>\s?/.test(line)) { kind = 'note'; text = line.replace(/^>\s?/, ''); }
    else if (!code && /^【本地模拟/.test(line)) { kind = 'note'; }
    else if (!code && /^\|.*\|$/.test(line)) { text = line.slice(1, -1).split('|').map(cell => cell.trim()).join(' · '); }
    blocks.push({ id: 'text-' + blocks.length, kind, text, marker, level, runs: runs(text) });
  }
  return blocks;
}
function selectionSummary(rows) {
  const chosen = rows.filter(row => row.selected && !row.applied);
  return { selectedCount: chosen.length, selectedEvents: chosen.filter(row => row.kind === 'event').length, selectedItems: chosen.filter(row => row.kind === 'item').length };
}
function buildEdits(rows) {
  return rows.filter(row => row.selected && !row.applied).map(row => {
    const keys = row.kind === 'event'
      ? ['date', 'startTime', 'endTime', 'title', 'address', 'startPlace', 'endPlace', 'transportMode', 'note']
      : ['title', 'category', 'key', 'linkedDate', 'remind'];
    return keys.reduce((result, key) => { if (row[key] != null) result[key] = row[key]; return result; }, { id: row.id });
  });
}
function validatePreview(rows, target, newTrip) {
  const selected = rows.filter(row => row.selected && !row.applied);
  if (!selected.length) return '请至少选择一项未应用的内容';
  for (const row of selected) {
    if (!String(row.title || '').trim()) return `${row.kindLabel}名称不能为空`;
    if (row.kind === 'item' && !String(row.category || '').trim()) return '请填写清单分类';
    if (row.kind === 'event' && (!row.date || !row.startTime || !row.endTime || row.startTime >= row.endTime)) return '请检查行程日期和起止时间';
  }
  if (target === 'new') {
    if (!String(newTrip.name || '').trim()) return '请填写旅行名称';
    if (!newTrip.start || !newTrip.end || newTrip.end <= newTrip.start) return '归来时间须晚于出发时间';
  }
  return '';
}
module.exports = { MODES, tripTypes, entryRows, messageRows, textBlocks, selectionSummary, buildEdits, validatePreview };
