const { installFormSheet, disposeFormSheet, formSheetMethods } = require('../../utils/form-sheet');
const { installMotion, disposeMotion } = require('../../utils/interaction-motion');
const { buildProfileView } = require('../../utils/profile-presentation');
const FORM_COMMANDS = ["bindInput","chooseProfileWechatAvatar","chooseAvatar","bindType","bindDate","bindTime","bindEventTransport","bindCategory","bindSwitch","openTemplateDetail","importTemplate","openTemplates","startLogin","bindOutfitItemType","bindOutfitItemName","chooseOutfitItemPhoto","removeOutfitItemPhoto","bindOutfitScene","removeOutfitItem","addOutfitItem","saveOutfitType","cancelOutfitTypeEdit","mutateOutfitType","editOutfitType","returnToOutfit","bindExpenseCategory","bindExpenseCurrency","bindExpensePayer","bindSplitMode","toggleExpenseMember","bindCustomShare","chooseExpenseReceipt","removeExpenseReceipt","bindSettingsCurrency","submitModal","closeModal"];
const pageDefinition={
 ...formSheetMethods,
 data:{modal:null,keyboardHeight:0,editorActive:false,account:{},trip:null,trips:[],profileTrips:[],expandedTripId:'',expandedTripIds:[],profileTripDetails:{},systemContentTop:16,reducedMotion:false,isOwner:false,settingsOpen:false},
 onLoad(){installFormSheet(this,wx);installMotion(this,wx);this.keyboardListener=event=>this.setData({keyboardHeight:event.height||0});wx.onKeyboardHeightChange?.(this.keyboardListener);const info=wx.getSystemInfoSync(),capsule=wx.getMenuButtonBoundingClientRect?.();this.setData({systemContentTop:Math.max((info.statusBarHeight||24)+44,(capsule?.bottom||((capsule?.top||28)+(capsule?.height||32)))+16)});this.channel=this.getOpenerEventChannel();this.channel.on('profileData',data=>{this.setData({...data,expandedTripId:this.data.expandedTripId||data.trip?.id||'',expandedTripIds:this.profileInitialized?this.data.expandedTripIds:(data.trip?.id?[data.trip.id]:[])});this.profileInitialized=true;this.project();});this.channel.on('profileDraft',data=>{this.setData({...data,editorActive:false});if(data.dirty)wx.enableAlertBeforeUnload?.({message:'表单有未保存的修改'});else wx.disableAlertBeforeUnload?.();});this.channel.on('profileTrip',trip=>{this.setData({profileTripDetails:{...this.data.profileTripDetails,[trip.id]:trip}});this.project();});},
 project(){this.setData({profileTrips:buildProfileView(this.data,this.loadedTrip)});},
 onPageScroll(event){const progress=Math.round(Math.min(1,Math.max(0,event.scrollTop||0)/64)*100)/100;if(progress!==(this.data.profileHeaderProgress||0))this.setData({profileHeaderProgress:progress});},
 stopBubble(){},
 onUnload(){disposeMotion(this);disposeFormSheet(this);wx.offKeyboardHeightChange?.(this.keyboardListener);this.channel.emit("profileClosed");},
 back(){if(this.data.modal){this.closeModal();return;}wx.navigateBack();},
 toggleTrip(event){const id=event.currentTarget.dataset.id,ids=this.data.expandedTripIds,opening=!ids.includes(id);this.setData({expandedTripId:id,expandedTripIds:opening?[...ids,id]:ids.filter(value=>value!==id)});this.project();if(opening&&id!==this.data.trip?.id&&!this.data.profileTripDetails[id])this.channel.emit('profileCommand',{method:'readProfileTrip',id});},
 toggleSettings(){this.setData({settingsOpen:!this.data.settingsOpen});},
 command(event){this.channel.emit('profileCommand',{method:event.currentTarget.dataset.method,id:event.currentTarget.dataset.id,memberId:event.currentTarget.dataset.member});},
 toggleMotion(event){const reducedMotion=!!event.detail.value;this.setData({reducedMotion});this.channel.emit('profileCommand',{method:'toggleMotion',value:reducedMotion});}
};
FORM_COMMANDS.forEach(method=>{pageDefinition[method]=function(event){this.channel.emit("profileCommand",{method:"profileFormCommand",value:{method,event:{currentTarget:{dataset:event?.currentTarget?.dataset||{}},detail:event?.detail||{}}}});};});
Page(pageDefinition);
