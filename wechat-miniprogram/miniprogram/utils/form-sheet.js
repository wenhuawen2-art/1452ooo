// Shared sizing and snap rules for native pages and the browser preview.
function sheetLayout({viewport=800,top=16,keyboard=0,content=0,chrome=0,expanded=false,target}) {
  const full=Math.max(0,viewport-Math.max(16,top)-Math.max(0,keyboard));
  const cap=Math.min(full,Math.max(0,viewport*.78-keyboard));
  const natural=content+chrome,collapsed=Math.min(natural,cap);
  const height=target!=null?Math.max(collapsed,Math.min(full,target)):expanded?full:collapsed;
  return {height:Math.round(height),body:Math.max(0,Math.round(height-chrome)),collapsed,full,canExpand:natural>cap+1};
}
function snapSheet({dy=0,height,collapsed,full,expanded=false}) {
  if(dy<=-32)return true;if(dy>=32)return false;
  if(Math.abs(dy)<5)return expanded;
  return height>collapsed+(full-collapsed)/2;
}
function installFormSheet(page,wx) {
  if(page._sheetInstalled)return;page._sheetInstalled=true;page._sheetDisposed=false;page._sheetWx=wx;
  const info=wx.getWindowInfo?.()||wx.getSystemInfoSync?.()||{};
  page._sheetViewport=info.windowHeight||info.screenHeight||800;
  page._sheetResize=e=>{clearTimeout(page._sheetResizeTimer);page._sheetResizeTimer=setTimeout(()=>{if(!page.data.keyboardHeight&&e?.size?.windowHeight)page._sheetViewport=e.size.windowHeight;if(page.data.modal)page.scheduleFormSheet();},80);};wx.onWindowResize?.(page._sheetResize);
  const raw=page.setData.bind(page);page._sheetWrite=raw;
  raw({keyboardHeight:page.data.keyboardHeight||0,formExpanded:false,formPanelHeight:null,formBodyHeight:null,formMaxHeight:null,formDragging:false});
  page.setData=(patch,done)=>{
    const old=page.data.modal;const modal=Object.prototype.hasOwnProperty.call(patch,'modal')?patch.modal:old;
    if(modal!==old&&(!modal||!old||modal.type!==old.type||modal.id!==old.id)){
      Object.assign(patch,{formExpanded:false,formPanelHeight:null,formBodyHeight:null,formMaxHeight:null,formDragging:false});page._sheetGesture=null;page._sheetMetrics=null;
    }
    raw(patch,()=>{done?.();if(modal&&wx.createSelectorQuery)page.scheduleFormSheet();});
  };
}
function disposeFormSheet(page){clearTimeout(page._sheetTimer);clearTimeout(page._sheetResizeTimer);page._sheetGesture=null;page._sheetDisposed=true;page._sheetWx?.offWindowResize?.(page._sheetResize);}
const formSheetMethods={
  scheduleFormSheet(){clearTimeout(this._sheetTimer);this._sheetTimer=setTimeout(()=>this.measureFormSheet(),20);},
  measureFormSheet(){
    const wx=this._sheetWx;if(!wx?.createSelectorQuery||!this.data.modal)return;
    const key=this.data.modal;let q=wx.createSelectorQuery().in(this);
    for(const selector of ['.form-fields','.form-drag-handle','.form-sheet .modal-head','.form-footer'])q.select(selector).boundingClientRect();
    q.exec(rects=>{if(this._sheetDisposed||this.data.modal!==key||!rects?.[0])return;const content=rects[0].height,chrome=rects.slice(1).reduce((n,r)=>n+(r?.height||0),0);
      this._sheetMetrics={viewport:this._sheetViewport,top:this.data.systemContentTop||16,keyboard:this.data.keyboardHeight||0,content,chrome};
      this.applyFormSheetLayout();
    });
  },
  applyFormSheetLayout(target){if(!this._sheetMetrics)return;const l=sheetLayout({...this._sheetMetrics,keyboard:this.data.keyboardHeight||0,expanded:!!this.data.formExpanded,target});
    if(l.height!==this.data.formPanelHeight||l.body!==this.data.formBodyHeight||l.full!==this.data.formMaxHeight)this._sheetWrite({formPanelHeight:l.height,formBodyHeight:l.body,formMaxHeight:l.full});return l;
  },
  toggleFormSheet(){if(Date.now()<(this._sheetSkipTapUntil||0))return;this._sheetWrite({formExpanded:!this.data.formExpanded,formDragging:false});this.applyFormSheetLayout();},
  startFormSheetDrag(e){const y=e.touches?.[0]?.clientY??e.touches?.[0]?.pageY;if(y==null||!this._sheetMetrics)return;this._sheetGesture={y,last:y,height:this.data.formPanelHeight,expanded:this.data.formExpanded};},
  moveFormSheetDrag(e){const g=this._sheetGesture,y=e.touches?.[0]?.clientY??e.touches?.[0]?.pageY;if(!g||y==null)return;g.last=y;this._sheetWrite({formDragging:true});this.applyFormSheetLayout(g.height+g.y-y);},
  endFormSheetDrag(){const g=this._sheetGesture;if(!g)return;const dy=g.last-g.y,l=this.applyFormSheetLayout(g.height-dy);this._sheetGesture=null;if(Math.abs(dy)<5){this._sheetWrite({formDragging:false});return;}this._sheetSkipTapUntil=Date.now()+350;this._sheetWrite({formExpanded:snapSheet({dy,height:l.height,...l,expanded:g.expanded}),formDragging:false});this.applyFormSheetLayout();},
  cancelFormSheetDrag(){this._sheetGesture=null;this._sheetWrite({formDragging:false});this.applyFormSheetLayout();}
};
module.exports={sheetLayout,snapSheet,installFormSheet,disposeFormSheet,formSheetMethods};
