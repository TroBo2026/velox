/* VELOX sensor adapter — browser GPS plus optional native iOS altimeter bridge */
(() => {
  "use strict";
  const MAX_AGE_MS=15000;
  let latestNative=null;
  const listeners=new Set();
  const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
  function acceptNativeSample(detail){
    if(!detail||!finite(detail.altitudeM,-1000,10000)||!finite(detail.accuracyM,0.5,100)||!finite(detail.pressureKPa,30,120))return false;
    if(!Number.isFinite(detail.timestamp))return false;
    const timestamp=detail.timestamp,age=Date.now()-timestamp;
    if(age<0||age>MAX_AGE_MS)return false;
    latestNative={altitudeM:detail.altitudeM,accuracyM:detail.accuracyM,pressureKPa:detail.pressureKPa,timestamp,source:"native-barometer"};
    listeners.forEach(listener=>{try{listener(latestNative);}catch(error){console.error(error);}});
    return true;
  }
  window.addEventListener("velox:native-altimeter",event=>acceptNativeSample(event.detail));
  function getFreshNativeSample(now=Date.now()){
    return latestNative&&now-latestNative.timestamp>=0&&now-latestNative.timestamp<=MAX_AGE_MS?latestNative:null;
  }
  function fuseAltitude(gpsAltitude,gpsAccuracy,now=Date.now()){
    const gpsValid=finite(gpsAltitude,-1000,10000);
    const gpsSigma=finite(gpsAccuracy,0.5,100)?gpsAccuracy:null;
    const native=getFreshNativeSample(now);
    if(!native)return {altitudeM:gpsValid?gpsAltitude:null,accuracyM:gpsSigma,source:gpsValid?"gps":"unavailable",pressureKPa:null};
    if(!gpsValid||gpsSigma===null)return {altitudeM:native.altitudeM,accuracyM:native.accuracyM,source:"barometer",pressureKPa:native.pressureKPa};
    const gpsWeight=1/(gpsSigma*gpsSigma),barometerWeight=1/(native.accuracyM*native.accuracyM);
    const altitudeM=(gpsAltitude*gpsWeight+native.altitudeM*barometerWeight)/(gpsWeight+barometerWeight);
    return {altitudeM,accuracyM:Math.sqrt(1/(gpsWeight+barometerWeight)),source:"gps+barometer",pressureKPa:native.pressureKPa};
  }
  function getCapabilities(){
    return {
      geolocation:!!navigator.geolocation,
      secureContext:!!window.isSecureContext,
      genericPressureAPI:typeof window.PressureSensor==="function",
      nativeAltimeterBridge:!!(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.veloxSensors)||!!window.VELOXNativeSensors,
      nativeSampleAvailable:!!getFreshNativeSample()
    };
  }
  window.VELOXSensors={
    getCapabilities,
    getFreshNativeSample,
    fuseAltitude,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    acceptNativeSample
  };
})();
