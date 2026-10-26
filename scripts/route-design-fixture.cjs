// Local screenshot fixtures only; never sent to the cloud.
module.exports = function applyRouteDesign(page, empty = false) {
  const date = '2026-10-11';
  Object.assign(page.data.trip, { start: '2026-10-10T08:00', end: '2026-10-15T18:00', events: [
    ['09:00','10:00','狮子沟牧场游玩'], ['10:00','12:00','牛奶湖'], ['12:00','12:30','午饭'],
    ['13:00','15:00','情人谷','出发前5天，需要确认情人谷是否开放，从狮子沟过来开车30分钟路程。'],
    ['15:00','16:00','吃饭','具体地点待定'], ['16:30','20:30','广元','开车3个半小时','情人谷','广元'], ['20:00','21:00','晚饭']
  ].map(([startTime,endTime,title,note='',startPlace='',endPlace=''],index) => ({ id:'design-event-'+index,date,startTime,endTime,title,note,startPlace,endPlace,transportMode:'driving',period:index < 3 ? '上午' : index < 6 ? '下午' : '晚上' })), hotels: empty ? [] : [{id:'design-hotel',name:'月白屋上民宿',city:'广元',address:'广元市花蕊街11号附4号',checkin:'2026-10-11',checkout:'2026-10-13'}], tickets: empty ? [] : [{id:'design-ticket',type:'住宿',date,startTime:date+'T05:53',previewSrc:'/assets/mastergo-route/ticket-demo.webp'}] });
  if (page.data.trip.tickets[0]) page.data.trip.tickets[0].imageUrl = '/assets/mastergo-route/ticket-demo.webp';
  page.data.account.nickname = 'Zero'; page.data.selectedDate = date;
  page.data.routeOverview = { points:[3,5].flatMap(index => [{id:`design-event-${index}:start`,sourceEventId:`design-event-${index}`,sourceRole:'start'},{id:`design-event-${index}:end`,sourceEventId:`design-event-${index}`,sourceRole:'end'}]), segments:[3,5].map(index => ({fromId:`design-event-${index}:start`,toId:`design-event-${index}:end`,distance:139500,duration:113,dottedLine:false})) };
  page.data.tab = 'route'; page.data.routeSection = empty ? 'lodging' : 'planning';
  page.data.headerHeight = 64; page.data.statusBarHeight = 24; page.derive(); page.data.routeGreeting = '早上好';
};
