let sid, queue = Promise.resolve();
let pressedControl, pressStart, pressRelease;
const clearPress = () => { pressedControl?.classList.remove('motion-pressed'); pressedControl=null; pressStart=null; };
document.addEventListener('pointerdown', event => {
  clearPress();pressRelease=null;const control=event.target.closest('[data-press]');
  if(!control||control.disabled||event.button>0)return;
  pressedControl=control;pressStart={x:event.clientX,y:event.clientY};control.classList.add('motion-pressed');
});
document.addEventListener('pointermove',event=>{if(pressStart&&Math.hypot(event.clientX-pressStart.x,event.clientY-pressStart.y)>9)clearPress();},{passive:true});
document.addEventListener('pointerup',()=>{if(pressedControl)pressRelease=pressedControl.dataset.binding;clearPress();});
document.addEventListener('pointercancel',clearPress);addEventListener('blur',clearPress);
document.addEventListener('keydown',event=>{if(event.key===' '||event.key==='Enter'){const control=event.target.closest('[data-press]');if(control&&!control.disabled)control.classList.add('motion-pressed');}});
document.addEventListener('keyup',()=>document.querySelectorAll('.motion-pressed').forEach(e=>e.classList.remove('motion-pressed')));
const positions = {};
let headerScrollFrame;
function updateProfileHeader(){document.querySelectorAll('.pp-header,.system-header').forEach(header=>header.style.setProperty('--header-progress',Math.min(1,Math.max(0,scrollY)/64)));}
addEventListener('scroll',()=>{if(!headerScrollFrame)headerScrollFrame=requestAnimationFrame(()=>{headerScrollFrame=null;updateProfileHeader();});},{passive:true});
// Refresh the open preview after returning from editing without resetting its tab or scroll.
addEventListener('focus',()=>{if(sid&&!document.querySelector('.modal-mask'))request({});});
addEventListener('pageshow',()=>requestAnimationFrame(updateProfileHeader));
let sheetState, sheetObserver, sheetGesture, sheetSkipClick=0;
function fitFormSheet(target){
  const sheet=document.querySelector('.form-sheet');if(!sheet||!sheetState)return;
  const fields=sheet.querySelector('.form-fields'),mask=sheet.closest('.form-mask');
  const keyboard=Math.max(0,innerHeight-(visualViewport?.height||innerHeight)-(visualViewport?.offsetTop||0));
  mask.style.bottom=keyboard+'px';mask.style.setProperty('--sheet-safe-bottom',keyboard?'0px':sheetState.safe);
  const chrome=['.form-drag-handle','.modal-head','.form-footer'].reduce((n,s)=>n+(sheet.querySelector(s)?.getBoundingClientRect().height||0),0);
  const metrics={viewport:innerHeight,top:sheetState.top,keyboard,content:fields.getBoundingClientRect().height,chrome,expanded:sheetState.expanded,target};
  const l=sheetRules.sheetLayout(metrics);sheetState.layout=l;
  sheet.style.maxHeight=l.full+'px';sheet.style.height=l.height+'px';sheet.querySelector('.modal-body').style.height=l.body+'px';
  sheet.classList.toggle('is-expanded',sheetState.expanded);sheet.dataset.expanded=String(sheetState.expanded);
  sheet.querySelector('.form-drag-handle').setAttribute('aria-label',sheetState.expanded?'收起表单':'展开为全屏');
  return l;
}
function setupFormSheet(){
  sheetObserver?.disconnect();const sheet=document.querySelector('.form-sheet');if(!sheet){sheetState=null;return;}
  const key=sheet.querySelector('.modal-head').textContent.trim();
  if(!sheetState||sheetState.key!==key)sheetState={key,expanded:false};
  sheetState.top=parseFloat(getComputedStyle(sheet).getPropertyValue('--sheet-top'))||16;
  sheetState.safe=getComputedStyle(sheet.closest('.form-mask')).getPropertyValue('--sheet-safe-bottom')||'0px';
  sheetObserver=new ResizeObserver(()=>fitFormSheet());sheetObserver.observe(sheet.querySelector('.form-fields'));sheetObserver.observe(sheet.querySelector('.form-footer'));
  fitFormSheet();requestAnimationFrame(()=>fitFormSheet());
}
addEventListener('resize',()=>fitFormSheet());visualViewport?.addEventListener('resize',()=>fitFormSheet());
document.addEventListener('pointerdown',e=>{const handle=e.target.closest('.form-drag-handle');if(!handle||!sheetState||e.button>0)return;fitFormSheet();sheetGesture={id:e.pointerId,y:e.clientY,last:e.clientY,height:sheetState.layout.height,expanded:sheetState.expanded};handle.setPointerCapture?.(e.pointerId);e.preventDefault();});
document.addEventListener('pointermove',e=>{if(!sheetGesture||e.pointerId!==sheetGesture.id)return;sheetGesture.last=e.clientY;document.querySelector('.form-sheet')?.classList.add('is-dragging');fitFormSheet(sheetGesture.height+sheetGesture.y-e.clientY);e.preventDefault();});
document.addEventListener('pointerup',e=>{if(!sheetGesture||e.pointerId!==sheetGesture.id)return;const g=sheetGesture,dy=e.clientY-g.y;sheetGesture=null;document.querySelector('.form-sheet')?.classList.remove('is-dragging');if(Math.abs(dy)>=5){sheetState.expanded=sheetRules.snapSheet({dy,...sheetState.layout,expanded:g.expanded});sheetSkipClick=Date.now()+350;}fitFormSheet();});
document.addEventListener('pointercancel',()=>{if(!sheetGesture)return;sheetGesture=null;document.querySelector('.form-sheet')?.classList.remove('is-dragging');fitFormSheet();});
function unit() { document.documentElement.style.setProperty('--unit', document.documentElement.clientWidth / 750 + 'px'); }
unit(); addEventListener('resize', unit);
function binding(element) { return JSON.parse(element.dataset.binding || '{}'); }
// Mirror native onHide/onShow without rerendering or restarting the loading loop.
document.addEventListener('visibilitychange',()=>document.querySelector('.page')?.classList.toggle('motion-paused',document.hidden));
function request(data) {
  queue = queue.then(async () => {
    if(data.mode||data.preset||data.reset)sheetState=null;
    const tab = document.querySelector('.nav-item.active')?.getAttribute('aria-label');
    const section = document.querySelector('.xy-list-page,.ee-page')?.id || tab;
    positions[section] = scrollY;
    const response = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid, scrollTop:scrollY, device: new URLSearchParams(location.search).get("device"), ...data }) }).then(r => r.json());
    if (response.error) throw Error(response.error);
    sid = response.sid;
    if (data.type !== 'input') {
      const scrolls = [...document.querySelectorAll('[data-scroll]')].map(e => [e.scrollLeft, e.scrollTop]);
      const motionBefore = motionSnapshot();
      document.getElementById('app').innerHTML = response.html;
      document.querySelector('.page')?.classList.toggle('motion-paused',document.hidden);
      document.getElementById('theme').textContent = response.css;
      document.querySelectorAll('[data-scroll]').forEach((e, i) => { if (scrolls[i]) { e.scrollLeft = scrolls[i][0]; e.scrollTop = scrolls[i][1]; } });
      const next = document.querySelector('.nav-item.active')?.getAttribute('aria-label');
      const nextSection = document.querySelector('.xy-list-page,.ee-page')?.id || next;
      scrollTo(0, data.reset ? 0 : response.scrollTop ?? positions[nextSection] ?? 0);
      document.body.classList.toggle('overlay-open', !!document.querySelector('.modal-mask'));
      setupFormSheet();
      updateProfileHeader();
      requestAnimationFrame(updateProfileHeader);
      motionPlay(motionBefore);
      if(pressRelease&&!matchMedia('(prefers-reduced-motion:reduce)').matches&&!document.querySelector('.reduced-motion')){
        const control=[...document.querySelectorAll('[data-press][data-binding]')].find(e=>e.dataset.binding===pressRelease);
        motionAnimate(control,[{scale:'.97'},{scale:'1.006',offset:.7},{scale:'1'}],240);
      }
      pressRelease=null;
    }
    if (response.toast) { const el = document.createElement('div'); el.id = 'toast'; el.textContent = response.toast; document.body.append(el); setTimeout(() => el.remove(), 2400); }
    if (response.previewImage) {
      const overlay = document.createElement('div'); overlay.className = 'browser-image-preview'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-label','衣物图片预览');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:1001;background:#08111cf2;display:grid;place-items:center;padding:24px';
      const image = document.createElement('img'); image.src = response.previewImage.current; image.style.cssText = 'max-width:100%;max-height:90vh;object-fit:contain';
      const close = document.createElement('button'); close.textContent = '关闭图片预览'; close.style.cssText = 'position:absolute;right:16px;top:16px;padding:12px;border-radius:20px;background:white';
      const dismiss = () => { overlay.remove(); document.removeEventListener('keydown',onKey); };
      const onKey = event => { if(event.key === 'Escape') dismiss(); };
      overlay.addEventListener('click',event=>{event.stopPropagation();dismiss();}); document.addEventListener('keydown',onKey);overlay.append(image,close);document.body.append(overlay);close.focus();
    }
    if (response.confirm) {
      const el = document.createElement('div'); el.className = 'browser-confirm';
      const box = document.createElement('div'), title = document.createElement('h3'), copy = document.createElement('p');
      title.textContent = response.confirm.title; copy.textContent = response.confirm.content; box.append(title, copy);
      for (const yes of [false, true]) { const b = document.createElement('button'); b.textContent = yes ? response.confirm.confirmText || '确认' : response.confirm.cancelText || '取消'; b.onclick = () => { el.remove(); if (yes) request({ ...data, confirm: true }); }; box.append(b); }
      el.append(box); document.body.append(el);
    }
  }).catch(error => { console.error(error); });
}
document.addEventListener('click', event => {
  if(event.target.closest('.form-drag-handle')){if(sheetState&&Date.now()>sheetSkipClick){sheetState.expanded=!sheetState.expanded;fitFormSheet();}return;}
  if (event.target.closest('input,textarea,select')) return;
  const el = event.target.closest('[data-binding]');
  if (el) request({ binding: binding(el), type: 'tap' });
});
document.addEventListener('input', event => {
  const el = event.target;
  if (el.matches('input:not([data-picker]):not([type=checkbox]),textarea')) request({ binding: binding(el), type: 'input', value: el.value });
});
document.addEventListener('change', event => {
  const el = event.target;
  if (el.matches('select,[data-picker],[type=checkbox]')) request({ binding: binding(el.closest('[data-binding]')), type: 'change', value: el.type === 'checkbox' ? el.checked : el.value });
});
addEventListener('message', event => { if (event.origin === location.origin) request({ mode: event.data.mode, fail: event.data.fail, reset: !!event.data.mode }); });
const initial = new URLSearchParams(location.search);
request({ mode: initial.get('mode') || 'member', tab: initial.get('tab') || (initial.get('mode')?.startsWith('route-design') ? 'route' : /^(list|outfit|expense)-design/.test(initial.get('mode') || '') ? (initial.get('mode')?.startsWith('expense-design') ? 'expenses' : 'list') : 'today'), preset: initial.get('preset') || '' });
