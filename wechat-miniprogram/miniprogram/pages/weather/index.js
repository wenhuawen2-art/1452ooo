const { cachedWeather, cityWeathers } = require('../../utils/weather-cities');
Page({
  data:{cities:[],loading:false,stops:[],tripId:'',systemContentTop:16,safeBottomInset:0,reducedMotion:false,guestMode:false},
  onLoad(){this.channel=this.getOpenerEventChannel();this.channel.on('weatherData',data=>{this.setData(data);this.loadCities();});},
  async loadCities(){
    const token=this.token=(this.token||0)+1;this.setData({loading:true});
    const cities=await cityWeathers(this.data.stops,stop=>this.fetchCity(stop),rows=>{if(this.token===token)this.setData({cities:rows});},()=>this.token===token);
    if(this.token===token){this.setData({cities,loading:false});this.channel.emit('weatherLoaded',{tripId:this.data.tripId,first:cities[0]});}
  },
  async fetchCity(stop){
    if(this.data.guestMode){const { demoCityWeather }=require('../../utils/weather-cities');return demoCityWeather(stop.place,this.data.demoWeather);}
    return cachedWeather(async(operation,data)=>{const response=await wx.cloud.callFunction({name:'suixing-api',data:{operation,data}});if(!response.result?.ok)throw new Error(response.result?.error||'天气获取失败');return response.result.data;},this.data.tripId,stop,true);
  },
  retryCity(event){if(!this.data.loading&&this.data.cities[Number(event.currentTarget.dataset.index)]?.available===false)this.loadCities();},
  back(){wx.navigateBack();},
  onUnload(){this.token=(this.token||0)+1;}
});
