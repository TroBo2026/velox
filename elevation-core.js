/* VELOX Elevation Core 1.0 — robust shared elevation processing */
(() => {
  "use strict";
  const median = values => {
    if (!values.length) return null;
    const sorted = values.slice().sort((a,b)=>a-b), m=Math.floor(sorted.length/2);
    return sorted.length%2 ? sorted[m] : (sorted[m-1]+sorted[m])/2;
  };
  const finite = Number.isFinite;
  function process(input, options={}) {
    const maxAccuracy = finite(options.maxAccuracyM) ? options.maxAccuracyM : 35;
    const valid = input.filter(s => s && finite(s.distanceM) && finite(s.altitude) &&
      finite(s.time) && finite(s.segment) && s.altitude >= -1000 && s.altitude <= 10000 &&
      (s.accuracy === null || s.accuracy === undefined ||
        (finite(s.accuracy) && s.accuracy >= 0 && s.accuracy <= maxAccuracy)));
    const screened = [];
    let spikesRejected = 0;
    for (let i=0;i<valid.length;i++) {
      const s=valid[i], neighborhood=[];
      for(let j=Math.max(0,i-2);j<=Math.min(valid.length-1,i+2);j++){
        const n=valid[j];
        if(n.segment===s.segment && Math.abs(n.distanceM-s.distanceM)<=90 &&
          Math.abs(n.time-s.time)<=45000) neighborhood.push(n.altitude);
      }
      const center=median(neighborhood);
      // Cap the rejection window: a poor accuracy estimate must not make a
      // very large isolated altitude spike automatically acceptable.
      const tolerance=finite(s.accuracy)?Math.max(8,Math.min(20,s.accuracy*1.5)):8;
      if(neighborhood.length>=3 && Math.abs(s.altitude-center)>tolerance){
        spikesRejected++;
        continue;
      }
      screened.push(s);
    }
    const smoothed=screened.map((s,i)=>{
      const nearby=[];
      for(let j=Math.max(0,i-2);j<=Math.min(screened.length-1,i+2);j++){
        const n=screened[j];
        if(n.segment===s.segment && Math.abs(n.distanceM-s.distanceM)<=90 &&
          Math.abs(n.time-s.time)<=45000) nearby.push(n.altitude);
      }
      const values=nearby.length>=3?nearby:[s.altitude];
      return {...s,elevationM:median(values),smoothingSamples:values.length};
    });
    const accuracies=smoothed.filter(s=>finite(s.accuracy)).map(s=>s.accuracy);
    const medianAccuracy=median(accuracies);
    const barometerCount=smoothed.filter(s=>String(s.source||"").includes("barometer")).length;
    const quality=smoothed.length<5?"low":
      medianAccuracy===null?(barometerCount>0?"medium":"unrated"):
      medianAccuracy<=8?"high":medianAccuracy<=18?"medium":"low";
    let gain=0,loss=0,anchor=null,lastSegment=null,lastTime=null,lastDistance=null,climbThreshold=3;
    if(medianAccuracy!==null)climbThreshold=Math.max(2.5,Math.min(6,medianAccuracy*0.35));
    for(const s of smoothed){
      const elapsed=lastTime===null?0:s.time-lastTime;
      const travelled=lastDistance===null?0:s.distanceM-lastDistance;
      if(s.segment!==lastSegment||anchor===null||elapsed>45||elapsed<=0||travelled>150||travelled<0){
        lastSegment=s.segment;anchor=s.elevationM;
        lastTime=s.time;lastDistance=s.distanceM;
        continue;
      }
      const delta=s.elevationM-anchor;
      if(delta>=climbThreshold){gain+=delta;anchor=s.elevationM;}
      else if(delta<=-climbThreshold){loss-=delta;anchor=s.elevationM;}
      // Keep the continuity clock moving even while small vertical changes
      // accumulate against the last accepted altitude anchor.
      lastTime=s.time;lastDistance=s.distanceM;
    }
    const elevations=smoothed.map(s=>s.elevationM);
    return {
      samples:smoothed,gain,loss,
      min:elevations.length?elevations.reduce((value,current)=>Math.min(value,current),Infinity):null,
      max:elevations.length?elevations.reduce((value,current)=>Math.max(value,current),-Infinity):null,
      medianAccuracy,validCount:smoothed.length,totalCount:input.length,
      spikesRejected,barometerCount,quality,climbThresholdM:climbThreshold
    };
  }
  window.VELOXElevation={process};
})();
