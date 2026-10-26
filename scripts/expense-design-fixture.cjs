// MasterGo literal visual fixtures; isolated from real travel data.
module.exports = function(page,mode) {
 const date='2026-10-11',owner=page.data.trip.me;
 page.data.trip.start='2026-10-10T08:00';page.data.trip.end='2026-10-16T18:00';
 page.data.trip.members=[{id:owner,name:'用户昵称',avatarData:'/assets/mastergo-expenses/avatar-dog.png'},{id:'design-other',name:'用户昵称',avatarData:'/assets/mastergo-expenses/avatar-animal.png'},{id:'design-third',name:'用户昵称',avatarData:'/assets/mastergo-expenses/avatar-orb.png'}];
 page.data.account.nickname='Zero';page.data.selectedDate=date;page.data.tab='expenses';page.data.expenseSegment=mode==='expense-design-split'?'split':mode==='expense-design-stats'?'stats':'details';page.data.expenseFilters={date:'all',category:'all',payer:'all'};
 page.data.expenseSettings={baseCurrency:'CNY',budgetMinor:192000};page.data.expenseMembers=page.data.trip.members;
 page.data.expenses=Array.from({length:12},(_,i)=>({id:'design-expense-'+i,date,title:'门票',category:'景点活动',amountMinor:1200,baseAmountMinor:1200,currency:'CNY',payerMemberId:owner,splitMode:'equal',note:'这是一段备注文本',participants:page.data.trip.members.map(m=>({memberId:m.id,amountMinor:400}))}));
 page.derive();page.deriveExpenseView();page.data.routeGreeting='早上好';
 const s=page.data.expenseSummary;s.totalMinor=68850;s.budgetProgress=57.34;s.memberStats=s.memberStats.slice(1).map(m=>({...m,paidMinor:46812,owedMinor:44423,netMinor:2400}));s.categoryStats=['住宿','景点活动','餐饮'].map((category,i)=>({category,amountMinor:[37500,37000,25500][i],amountDisplay:'¥668.12',percent:93.5,count:5}));s.dailyStats=page.data.dates.map((d,i)=>({date:d.value,dateLabel:d.day+'日',amountDisplay:'¥83.00',percent:[80,62,55,41,91,54,43][i]}));
 page.deriveExpensePresentation();const v=page.data.expenseView;v.statsTotalNumber='668.12';v.paidNumber='468.12';v.owedNumber='444.23';v.balanceNumber='444.23';v.categories.forEach(c=>c.amountDisplay='¥668.12');v.categoryRows=v.categories.map((c,i)=>({...c,category:['餐饮','交通','景点活动'][i],amountDisplay:'¥83.00',percent:93.5}));v.rankings=Array.from({length:5},(_,i)=>({...page.data.expenses[i],rank:i+1,category:'餐饮',displayAmount:'¥83.00',title:'牛肉火锅'}));v.dates=v.dates.map((d,i)=>({...d,weekday:'周日',hasContent:i<2}));v.groups[0].count=12;v.groups[0].totalNumber='429';
};
