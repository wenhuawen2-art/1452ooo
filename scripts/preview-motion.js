// Browser counterpart of the native motion layer. The preview replaces its DOM
// after each request, so compare semantic state instead of replaying every mount.
const motionEase = 'cubic-bezier(.22,1,.36,1)';
let motionAnimations = [];
const motionQuery = selector => document.querySelector(selector);
const progressSelector = '.xy-progress-track > div,.ee-budget-track > div,.mg-progress > div';
const checkSelector = '.xy-item-check[data-binding]';
function motionSnapshot() {
  const form = motionQuery('.form-mask'), detail = motionQuery('.modal-mask:not(.form-mask)');
  return {
    ready: !!motionQuery('.page,.pp-page'),
    profile: !!motionQuery('.pp-page'),
    map: !!motionQuery('.route-map-page'),
    tab: motionQuery('.nav-item.active')?.getAttribute('aria-label'),
    section: [...document.querySelectorAll('.rg-segment .selected,.xy-list-mode .selected,.xy-list-segment .selected,.ee-tabs .selected,.rg-date.selected')].map(e => e.textContent.trim()).join('|'),
    form: form?.cloneNode(true),
    formKey: form?.querySelector('.modal-head > span')?.textContent,
    detail: detail?.cloneNode(true),
    menu: [...document.querySelectorAll('.rg-menu,.xy-pop-menu')].map(element => ({ clone: element.cloneNode(true), box: element.getBoundingClientRect(), text: element.textContent, key: element.closest('[data-binding]')?.dataset.binding })),
    trips: [...document.querySelectorAll('.pp-trip')].map(e => e.getBoundingClientRect().height),
    checks: new Map([...document.querySelectorAll(checkSelector)].map(e => [e.dataset.binding, e.classList.contains('done')])),
    progress: [...document.querySelectorAll(progressSelector)].map(e => e.style.width)
  };
}
function motionAnimate(element, frames, duration = 240, delay = 0, easing = motionEase) {
  if (!element?.animate) return;
  const animation = element.animate(frames, { duration, delay, easing, fill: 'backwards' });
  motionAnimations.push(animation);
  animation.finished.catch(() => {});
  return animation;
}
function motionExit(clone, menuBox) {
  if (!clone) return;
  clone.classList.add('motion-ghost');
  clone.inert = true;
  clone.setAttribute('aria-hidden', 'true');
  clone.style.pointerEvents = 'none';
  clone.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  if (menuBox) Object.assign(clone.style, { position: 'fixed', left: menuBox.left+'px', top: menuBox.top+'px', width: menuBox.width+'px', height: menuBox.height+'px', margin: '0', zIndex: '100', animation: 'none' });
  document.body.append(clone);
  const panel = clone.querySelector('.modal');
  if (panel) { panel.style.animation = 'none'; motionAnimate(panel, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(44px)', opacity: 0 }], 200, 0, 'cubic-bezier(.4,0,1,1)'); }
  clone.style.animation = 'none';
  const animation = motionAnimate(clone, [{ opacity: 1 }, { opacity: 0 }], 200);
  if (animation) animation.finished.then(() => clone.remove(), () => clone.remove()); else clone.remove();
}
function motionPlay(before) {
  motionAnimations.forEach(a => a.cancel()); motionAnimations = [];
  document.querySelectorAll('.motion-ghost').forEach(e => e.remove());
  const app = document.getElementById('app'); app.classList.add('motion-stable');
  if (document.hidden || matchMedia('(prefers-reduced-motion:reduce)').matches || motionQuery('.reduced-motion')) return;
  const after = motionSnapshot();
  const entering = (selector, dx = 0, dy = 10, duration = 240, stagger = false) => {
    [...document.querySelectorAll(selector)].filter(e => { const b=e.getBoundingClientRect();return b.bottom>0&&b.top<innerHeight; }).slice(0, 5).forEach((e,i) => motionAnimate(e, [{ opacity: .35, transform: `translate(${dx}px,${dy}px)` }, { opacity: 1, transform: 'none' }], duration, stagger?Math.min(i,2)*28:0));
  };
  if (!before.ready || before.profile !== after.profile || before.tab !== after.tab) {
    const order=['首页','行程','清单','穿搭','记账'];
    const dx = before.profile !== after.profile ? (after.profile?22:-22) : order.indexOf(after.tab)>=order.indexOf(before.tab)?20:-20;
    entering('.page > .content,.page > .welcome,.pp-hero,.pp-trips', dx, 0, 300, true);
    motionAnimate(motionQuery('.nav-item.active > img'), [
      {transform:'translateY(2px) scale(.88)'},
      {transform:'translateY(-2px) scale(1.07)', offset:.65},
      {transform:'none'}
    ], 300);
  } else if (before.section !== after.section) {
    entering('.rg-main,.xy-list-summary,.xy-list-groups,.xy-outfit-group,.xy-outfit-empty,.ee-segment-content',0,10,240);
    const cards = document.querySelectorAll('.rg-period:nth-child(-n+3),.xy-list-group:nth-child(-n+3),.xy-outfit-piece:nth-child(-n+3),.ee-entry:nth-child(-n+3)');
    [...cards].filter(card => {
      const box = card.getBoundingClientRect();
      return box.bottom > 0 && box.top < innerHeight;
    }).slice(0, 3).forEach((card, i) => {
      motionAnimate(card, [{opacity:.62, transform:'translateY(8px)'}, {opacity:1, transform:'none'}], 280, i * 34);
    });
  }
  if (before.tab === after.tab) {
    document.querySelectorAll(progressSelector).forEach((fill, i) => {
      const oldWidth = before.progress[i];
      const newWidth = after.progress[i];
      if (oldWidth && newWidth && oldWidth !== newWidth) motionAnimate(fill, [{width:oldWidth}, {width:newWidth}], 400);
    });
  }
  if (after.formKey && after.formKey !== before.formKey) {
    if (!before.form) {
      motionAnimate(motionQuery('.form-mask'),[{opacity:0},{opacity:1}],220);
      motionAnimate(motionQuery('.form-sheet'),[{transform:'translateY(64px)',opacity:.65},{transform:'none',opacity:1}],340,0,'cubic-bezier(.32,.72,0,1)');
    } else entering('.form-fields',14,0,240);
  } else if(before.form&&!after.form) motionExit(before.form);
  if(after.detail&&!before.detail){motionAnimate(motionQuery('.modal-mask:not(.form-mask)'),[{opacity:0},{opacity:1}],220);entering('.modal-mask:not(.form-mask) .modal',0,44,320);}
  if(before.detail&&!after.detail)motionExit(before.detail);
  if(!before.map&&after.map)entering('.route-map-page',20,0,280);
  if(before.profile&&after.profile){
    document.querySelectorAll('.pp-trip').forEach((e,i)=>{const old=before.trips[i],height=e.getBoundingClientRect().height;if(old&&Math.abs(old-height)>1){e.style.overflow='hidden';const a=motionAnimate(e,[{height:old+'px'},{height:height+'px'}],280);a?.finished.finally(()=>e.style.overflow='').catch(()=>{});}});
    if(before.trips.some((height,i)=>Math.abs(height-after.trips[i])>1))entering('.pp-members,.pp-actions',0,6,220);
  }
  if(!before.menu.length)entering('.rg-menu,.xy-pop-menu',0,-5,180);
  if(before.menu.length&&!after.menu.length)before.menu.forEach(m=>motionExit(m.clone,m.box));
  document.querySelectorAll(checkSelector).forEach(e => {
    if (before.checks.has(e.dataset.binding) && before.checks.get(e.dataset.binding) !== e.classList.contains('done')) {
      motionAnimate(e, [{scale:'.82'}, {scale:'1.08', offset:.65}, {scale:'1'}], 180);
    }
  });
}
