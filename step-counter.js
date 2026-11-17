/* VELOX Step Counter 1.0 — foreground DeviceMotion step detector.
   The output is a sensor-derived estimate, not a medical or certified pedometer. */
(function(root){
  "use strict";
  class Detector{
    constructor(){
      this.gravity=9.81;
      this.initialized=false;
      this.above=false;
      this.lastStepAt=-Infinity;
      this.count=0;
    }
    process(event){
      if(!event)return 0;
      const direct=event.acceleration;
      const gravity=event.accelerationIncludingGravity;
      const source=direct&&[direct.x,direct.y,direct.z].every(Number.isFinite)?direct:gravity;
      if(!source||![source.x,source.y,source.z].every(Number.isFinite))return 0;
      const magnitude=Math.sqrt(source.x*source.x+source.y*source.y+source.z*source.z);
      if(!Number.isFinite(magnitude)||magnitude<0.1||magnitude>40)return 0;
      let signal;
      if(source===direct)signal=magnitude;
      else{
        if(!this.initialized){this.gravity=magnitude;this.initialized=true;}
        this.gravity=this.gravity*0.92+magnitude*0.08;
        signal=Math.abs(magnitude-this.gravity);
      }
      const now=Number.isFinite(event.timeStamp)&&event.timeStamp>0?event.timeStamp:Date.now();
      const rising=signal>=1.15&&!this.above;
      this.above=signal>=0.45;
      if(!rising||now-this.lastStepAt<280)return 0;
      this.lastStepAt=now;
      this.count++;
      return 1;
    }
  }
  function estimateStepLengthM(heightCm){
    const height=Number(heightCm);
    return Number.isFinite(height)&&height>=100&&height<=230?height*0.00415:null;
  }
  root.VELOXSteps=Object.freeze({Detector,estimateStepLengthM,version:"1.0.0"});
  if(typeof module==="object"&&module.exports)module.exports=root.VELOXSteps;
})(typeof self!=="undefined"?self:globalThis);
