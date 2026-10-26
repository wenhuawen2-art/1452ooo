// Display-only projection. Currency conversion and settlement accounting remain in the page/domain.
const COLORS = ['#FFAD57','#0072FF','#FF5AA6','#00B58B','#8B70ED','#55BED8'];
const number = value => (Number(value || 0) / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
const signed = (value, symbol) => `${symbol}${(Math.abs(Number(value || 0))/100).toFixed(2)}`;
function buildExpensePresentation({summary={}, expenses=[], groups=[], dates=[], members=[], settings={}, selectedDate, filters={}}) {
  const symbol = ({CNY:'￥',USD:'$',EUR:'€',JPY:'¥',HKD:'HK$',GBP:'£'}[settings.baseCurrency || 'CNY']) || (settings.baseCurrency || 'CNY');
  const people = new Map(members.map(member=>[member.id,member]));
  const decorate = entry => ({...entry,payerAvatar:people.get(entry.payerMemberId)?.avatarSrc || '',participantAvatars:(entry.participants || []).filter(p=>p.memberId!==entry.payerMemberId).slice(0,4).map(p=>({memberId:p.memberId,src:people.get(p.memberId)?.avatarSrc || ''}))});
  const filtered = !!((filters.category && filters.category !== 'all') || (filters.payer && filters.payer !== 'all'));
  const displayGroups=groups.filter(group=>filtered || (filters.date && filters.date!=='all') || group.date===selectedDate).map(group=>({...group,totalNumber:number((expenses.filter(e=>e.date===group.date)).reduce((s,e)=>s+e.baseAmountMinor,0)),entries:group.categoryGroups.flatMap(g=>g.entries).map(decorate)}));
  const counts = new Map(); expenses.forEach(e=>counts.set(e.date,(counts.get(e.date)||0)+1));
  const categories=(summary.categoryStats || []).map((c,i)=>({...c,color:COLORS[i%COLORS.length]}));
  let angle=0;const stops=[], caps=[];
  const total = categories.reduce((s,c)=>s+c.amountMinor,0);
  categories.forEach(c=>{
    const span=total?c.amountMinor/total*360:0,gap=Math.min(4,span/4),start=angle+gap,end=angle+span-gap;
    if(span>0){stops.push(`transparent ${angle}deg ${start}deg`,`${c.color} ${start}deg ${end}deg`,`transparent ${end}deg ${angle+span}deg`);
      for(const a of [start,end]){const rad=(a-180)*Math.PI/180;caps.push({id:c.category+'-'+a,color:c.color,left:(125.5+81.5*Math.cos(rad)-7)/251*100,top:(125+81.5*Math.sin(rad)-7)/250*100});}}
    angle+=span;
  });
  return {
    symbol,totalNumber:number(summary.totalMinor),statsTotalNumber:number(summary.totalMinor),budgetNumber:summary.budgetMinor == null?'未设置预算':number(summary.budgetMinor),groups:displayGroups,
    categoryRows:categories,dates:dates.map(d=>({...d,hasContent:!!counts.get(d.value)})),categories,ringBackground:total?`conic-gradient(from -90deg,${stops.join(',')})`:'conic-gradient(#dce5ef 0deg 360deg)',caps,
    rankings:[...expenses].sort((a,b)=>b.baseAmountMinor-a.baseAmountMinor).slice(0,5).map((e,i)=>({...e,rank:i+1})),
    daily:(summary.dailyStats || []).map(d=>({...d,shortDate:d.date.slice(5).replace('-','.')})),
    paidNumber:number(summary.memberStats?.find(m=>m.memberId===settings.me)?.paidMinor),
    owedNumber:number(summary.memberStats?.find(m=>m.memberId===settings.me)?.owedMinor),
    members:(summary.memberStats || []).map(m=>({...m,paidNumber:number(m.paidMinor),owedNumber:number(m.owedMinor),netLabel:m.netMinor>0?'应收':m.netMinor<0?'应付':'已结清',netAmount:signed(m.netMinor,symbol)})),
    balanceNumber:number(summary.budgetMinor == null ? 0 : summary.budgetMinor-summary.totalMinor),
    activeFilters:filtered,
  };
}
module.exports={buildExpensePresentation};
