/* VELOX 0.9.3 — local-first cycling tracker */
(() => {
  "use strict";
  const DB_NAME = "velox-local";
  const DB_VERSION = 1;
  const STORE = "rides";
  const $ = (id) => document.getElementById(id);
  let db;
  let currentPage = "home";
  let activeRide = null;
  let watchId = null;
  let timerId = null;
  let liveMetricsCache = null;
  let liveMetricsRideId = null;
  let liveMap = null;
  let liveLines = [];
  let liveMarker = null;
  let detailMap = null;
  let lastDetailRide = null;
  let leafletLoadPromise = null;
  let personalMap = null;
  let personalLines = new Map();
  let personalRidesCache = [];
  let personalHeatLayer = null;
  let personalHeatVisible = false;
  const personalVisibility = new Map();
  const mapColors = ["#5bd6c5","#e7bd75","#8ca8ff","#d98ce8","#ff8e80","#8fd18b","#f0a75b","#7bd1e8"];
  let toastTimer = null;
  let saveQueue = Promise.resolve();

  const fmt = (n, digits=1) => Number(n || 0).toLocaleString("de-DE",{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const fmtTime = (seconds) => {
    const s=Math.max(0,Math.floor(seconds||0)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),r=s%60;
    return [h,m,r].map(v=>String(v).padStart(2,"0")).join(":");
  };
  const haversine = (a,b) => {
    const R=6371000,rad=v=>v*Math.PI/180,dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon);
    const x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
    return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
  };
  const showToast = (msg) => {
    const el=$("toast");el.textContent=msg;el.classList.add("show");
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2800);
  };
  function openDB(){
    return new Promise((resolve,reject)=>{
      if(!("indexedDB" in window)){reject(new Error("Dieser Browser unterstützt keine lokale Datenbank."));return;}
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:"id"});};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }
  function dbRequest(mode,action,value){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
      let req,result,settled=false;
      if(action==="all")req=store.getAll();
      if(action==="put")req=store.put(value);
      if(action==="delete")req=store.delete(value);
      if(action==="clear")req=store.clear();
      const fail=error=>{if(!settled){settled=true;reject(error||new Error("IndexedDB-Transaktion fehlgeschlagen."));}};
      req.onsuccess=()=>{result=req.result;};
      req.onerror=()=>fail(req.error);
      tx.oncomplete=()=>{if(!settled){settled=true;resolve(result);}};
      tx.onerror=()=>fail(tx.error);
      tx.onabort=()=>fail(tx.error||new Error("IndexedDB-Transaktion abgebrochen."));
    });
  }

  function dbAddMany(records){
    return new Promise((resolve,reject)=>{
      if(!records.length){resolve();return;}
      const tx=db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE);
      records.forEach(record=>store.add(record));
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error("Import-Transaktion fehlgeschlagen."));
      tx.onabort=()=>reject(tx.error||new Error("Import-Transaktion abgebrochen."));
    });
  }
  function persistActiveRide(){
    if(!db||!activeRide)return Promise.resolve();
    const snapshot=JSON.parse(JSON.stringify(activeRide));
    saveQueue=saveQueue.catch(()=>{}).then(()=>dbRequest("readwrite","put",snapshot));
    return saveQueue;
  }
  const allRides=async()=>((await dbRequest("readonly","all"))||[]).sort((a,b)=>b.startedAt-a.startedAt);
  const activeSeconds=(ride)=>Math.max(0,((ride.endedAt||Date.now())-ride.startedAt-(ride.pausedMs||0)-(ride.status==="paused"?Date.now()-(ride.pauseStarted||Date.now()):0))/1000);
  function median(values){
    const sorted=values.slice().sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
    return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
  }
  function buildElevationProfile(points){
    const raw=[];let distance=0,segment=0,previous=null;
    for(const point of points){
      if(!validRidePoint(point)){previous=null;segment++;continue;}
      if(previous){
        const d=haversine(previous,point),dt=(point.t-previous.t)/1000;
        const horizontal=[previous.accuracy,point.accuracy].filter(Number.isFinite);
        const validInterval=Number.isFinite(d)&&d>=0.8&&d<150&&Number.isFinite(dt)&&dt>0&&dt<=30&&
          !horizontal.some(value=>value<0||value>80)&&d/dt*3.6<=100;
        if(validInterval)distance+=d;else segment++;
      }
      const accuracy=Number.isFinite(point.altAccuracy)?point.altAccuracy:null;
      const hasAccuracy=point.altAccuracy!==undefined&&point.altAccuracy!==null;
      const altitudeValid=Number.isFinite(point.alt)&&point.alt>=-1000&&point.alt<=10000&&
        (!hasAccuracy||(accuracy!==null&&accuracy>=0&&accuracy<=35));
      if(altitudeValid)raw.push({distanceM:distance,altitude:point.alt,time:point.t,segment,accuracy,source:point.altSource||"gps"});
      else segment++;
      previous=point;
    }
    const result=window.VELOXElevation?window.VELOXElevation.process(raw):{samples:raw.map(s=>({...s,elevationM:s.altitude})),gain:0,loss:0,min:null,max:null,medianAccuracy:null,validCount:raw.length,quality:"unrated"};
    return {samples:result.samples,gain:result.gain,loss:result.loss,distanceM:distance,
      validCount:result.validCount,totalCount:points.length,minimum:result.min,maximum:result.max,
      medianAccuracy:result.medianAccuracy,quality:result.quality,spikesRejected:result.spikesRejected||0,
      climbThresholdM:result.climbThresholdM||3,barometerCount:result.barometerCount||0};
  }
  const RIDE_INTERVAL_FILTERS=Object.freeze({
    minDistanceM:0.8,maxDistanceM:150,maxGapSeconds:30,
    minMovingSpeedKmh:1.5,maxSpeedKmh:100,maxHorizontalAccuracyM:80
  });
  function validRidePoint(point){
    return !!point&&Number.isFinite(point.lat)&&point.lat>=-90&&point.lat<=90&&
      Number.isFinite(point.lon)&&point.lon>=-180&&point.lon<=180&&Number.isFinite(point.t);
  }
  function getMovingIntervals(ride){
    const points=Array.isArray(ride.points)?ride.points:[],intervals=[];
    for(let i=1;i<points.length;i++){
      const previous=points[i-1],current=points[i];
      if(!validRidePoint(previous)||!validRidePoint(current))continue;
      const durationS=(current.t-previous.t)/1000;
      if(!Number.isFinite(durationS)||durationS<=0||durationS>RIDE_INTERVAL_FILTERS.maxGapSeconds)continue;
      const accuracy=[previous.accuracy,current.accuracy].filter(Number.isFinite);
      if(accuracy.some(value=>value<0||value>RIDE_INTERVAL_FILTERS.maxHorizontalAccuracyM))continue;
      const distanceM=haversine(previous,current);
      if(!Number.isFinite(distanceM)||distanceM<RIDE_INTERVAL_FILTERS.minDistanceM||
        distanceM>RIDE_INTERVAL_FILTERS.maxDistanceM)continue;
      const speedKmh=distanceM/durationS*3.6;
      if(!Number.isFinite(speedKmh)||speedKmh<RIDE_INTERVAL_FILTERS.minMovingSpeedKmh||
        speedKmh>RIDE_INTERVAL_FILTERS.maxSpeedKmh)continue;
      intervals.push({distanceM,durationS,speedKmh,from:previous,to:current});
    }
    return intervals;
  }
  function gradeStats(profile){
    const samples=profile.samples,grades=[],terrain={uphill:0,flat:0,downhill:0};
    let weightedSum=0,weightedDistance=0,activeClimb=null,longestClimb=null;
    const finishClimb=()=>{
      if(activeClimb&&(!longestClimb||activeClimb.distanceM>longestClimb.distanceM))longestClimb=activeClimb;
      activeClimb=null;
    };
    for(let i=1;i<samples.length;i++){
      const a=samples[i-1],b=samples[i],distance=b.distanceM-a.distanceM,elapsed=(b.time-a.time)/1000;
      if(a.segment!==b.segment||distance<8||distance>100||elapsed<=0||elapsed>60){finishClimb();continue;}
      const elevationDelta=b.elevationM-a.elevationM,grade=elevationDelta/distance*100;
      if(!Number.isFinite(grade)||Math.abs(grade)>35){finishClimb();continue;}
      grades.push({grade,distance});weightedSum+=grade*distance;weightedDistance+=distance;
      if(grade>=1.5){
        terrain.uphill+=distance;
        if(!activeClimb)activeClimb={distanceM:0,gainM:0,maxGrade:0,startDistanceM:a.distanceM,endDistanceM:b.distanceM};
        activeClimb.distanceM+=distance;activeClimb.gainM+=Math.max(0,elevationDelta);
        activeClimb.maxGrade=Math.max(activeClimb.maxGrade,grade);activeClimb.endDistanceM=b.distanceM;
      }else{
        finishClimb();
        if(grade<=-1.5)terrain.downhill+=distance;else terrain.flat+=distance;
      }
    }
    finishClimb();
    const distribution=[
      {key:"uphill",label:"Anstieg",distanceM:terrain.uphill},
      {key:"flat",label:"Flach",distanceM:terrain.flat},
      {key:"downhill",label:"Gefälle",distanceM:terrain.downhill}
    ].map(item=>({...item,percent:weightedDistance?item.distanceM/weightedDistance*100:0}));
    if(longestClimb)longestClimb.averageGrade=longestClimb.distanceM?longestClimb.gainM/longestClimb.distanceM*100:0;
    return {average:weightedDistance?weightedSum/weightedDistance:0,
      maximum:grades.reduce((max,x)=>Math.max(max,x.grade),0),
      minimum:grades.reduce((min,x)=>Math.min(min,x.grade),0),
      samples:grades.length,distribution,longestClimb};
  }
  function currentGrade(profile){
    const samples=profile.samples;
    if(samples.length<2)return null;
    const last=samples[samples.length-1];
    if(Date.now()-last.time>90000)return null;
    for(let i=samples.length-2;i>=0;i--){
      const first=samples[i];
      if(first.segment!==last.segment)break;
      const distance=last.distanceM-first.distanceM,elapsed=(last.time-first.time)/1000;
      if(elapsed>90)break;
      if(elapsed<=0||distance<20)continue;
      if(distance>80)break;
      const grade=(last.elevationM-first.elevationM)/distance*100;
      return Number.isFinite(grade)&&Math.abs(grade)<=35?grade:null;
    }
    return null;
  }
  function speedZoneStats(intervals){
    const zones=[{key:"slow",label:"Unter 15 km/h",seconds:0},{key:"medium",label:"15–25 km/h",seconds:0},{key:"fast",label:"Über 25 km/h",seconds:0}];
    intervals.forEach(item=>{const zone=item.speedKmh<15?zones[0]:item.speedKmh<=25?zones[1]:zones[2];zone.seconds+=item.durationS;});
    const total=zones.reduce((sum,zone)=>sum+zone.seconds,0);
    zones.forEach(zone=>zone.percent=total?zone.seconds/total*100:0);return zones;
  }
  function routeStats(intervals,totalDistance){
    if(!intervals.length)return {maxFromStartM:null,straightDistanceM:null,routeStraightness:null};
    const start=intervals[0].from;let maxFromStartM=0,last=intervals[0].from;
    for(const item of intervals){maxFromStartM=Math.max(maxFromStartM,haversine(start,item.from),haversine(start,item.to));last=item.to;}
    const connected=intervals.every((item,index)=>index===0||intervals[index-1].to===item.from);
    const straightDistanceM=connected?haversine(start,last):null;
    return {maxFromStartM,straightDistanceM,routeStraightness:connected&&totalDistance>0?Math.min(100,straightDistanceM/totalDistance*100):null};
  }
  function fastestFullKilometer(intervals){
    let splitDistance=0,splitSeconds=0,best=null,lastEnd=null;
    for(const item of intervals){
      if(lastEnd&&item.from!==lastEnd){splitDistance=0;splitSeconds=0;}
      let remainingDistance=item.distanceM;
      while(remainingDistance>0){
        const taken=Math.min(remainingDistance,1000-splitDistance);
        splitSeconds+=item.durationS*(taken/item.distanceM);splitDistance+=taken;remainingDistance-=taken;
        if(splitDistance>=999.999){best=best===null?splitSeconds:Math.min(best,splitSeconds);splitDistance=0;splitSeconds=0;}
      }
      lastEnd=item.to;
    }
    return best;
  }
  function getRideStopStats(ride){
    const points=Array.isArray(ride.points)?ride.points:[];
    const qualifiedStops=[];
    let activeStop=null,validIntervals=0;
    const finishStop=()=>{
      if(activeStop&&activeStop.seconds>=10)qualifiedStops.push(activeStop.seconds);
      activeStop=null;
    };
    for(let i=1;i<points.length;i++){
      const previous=points[i-1],current=points[i];
      if(!validRidePoint(previous)||!validRidePoint(current)){finishStop();continue;}
      const durationS=(current.t-previous.t)/1000;
      if(!Number.isFinite(durationS)||durationS<=0||durationS>RIDE_INTERVAL_FILTERS.maxGapSeconds){finishStop();continue;}
      const pauseOverlap=(Array.isArray(ride.pauseIntervals)?ride.pauseIntervals:[]).some(pause=>{
        const start=pause&&pause.startedAt,end=pause&&Number.isFinite(pause.endedAt)?pause.endedAt:Infinity;
        return Number.isFinite(start)&&end>previous.t&&start<current.t;
      });
      if(pauseOverlap){finishStop();continue;}
      const accuracy=[previous.accuracy,current.accuracy].filter(Number.isFinite);
      if(accuracy.some(value=>value<0||value>RIDE_INTERVAL_FILTERS.maxHorizontalAccuracyM)){finishStop();continue;}
      const distanceM=haversine(previous,current);
      if(!Number.isFinite(distanceM)||distanceM>RIDE_INTERVAL_FILTERS.maxDistanceM){finishStop();continue;}
      const speedKmh=distanceM/durationS*3.6;
      if(!Number.isFinite(speedKmh)||speedKmh>RIDE_INTERVAL_FILTERS.maxSpeedKmh){finishStop();continue;}
      validIntervals++;
      if(speedKmh<RIDE_INTERVAL_FILTERS.minMovingSpeedKmh){
        if(!activeStop)activeStop={end:current.t,seconds:durationS};
        else if(current.t-activeStop.end<=RIDE_INTERVAL_FILTERS.maxGapSeconds*1000){
          activeStop.end=current.t;
          activeStop.seconds+=durationS;
        }else{
          finishStop();
          activeStop={end:current.t,seconds:durationS};
        }
      }else finishStop();
    }
    finishStop();
    if(!validIntervals)return {count:null,longestSeconds:null,totalSeconds:null};
    const totalSeconds=qualifiedStops.reduce((sum,value)=>sum+value,0);
    return {
      count:qualifiedStops.length,
      longestSeconds:qualifiedStops.length?Math.max(...qualifiedStops):null,
      totalSeconds
    };
  }
  function calcRide(ride){
    const p=Array.isArray(ride.points)?ride.points:[],intervals=getMovingIntervals(ride);
    const distance=intervals.reduce((sum,item)=>sum+item.distanceM,0),moving=intervals.reduce((sum,item)=>sum+item.durationS,0);
    const elevation=buildElevationProfile(p),grades=gradeStats(elevation),elapsed=activeSeconds(ride);
    const avg=moving>0?distance/moving*3.6:0,speeds=intervals.map(item=>item.speedKmh),stopped=Math.max(0,elapsed-moving);
    const route=routeStats(intervals,distance);
    return {
      distanceM:distance,elevationProfile:elevation,elevationGain:elevation.gain,elevationLoss:elevation.loss,
      elevationMin:elevation.minimum,elevationMax:elevation.maximum,elevationRange:elevation.minimum!==null&&elevation.maximum!==null?elevation.maximum-elevation.minimum:null,netElevationChange:elevation.samples.length>1?elevation.samples[elevation.samples.length-1].elevationM-elevation.samples[0].elevationM:null,elevationQuality:elevation.quality,
      elevationAccuracy:elevation.medianAccuracy,gradeAverage:grades.average,gradeMax:grades.maximum,
      gradeMin:grades.minimum,gradeSamples:grades.samples,gradeDistribution:grades.distribution,longestClimb:grades.longestClimb,
      elapsedSeconds:elapsed,movingSeconds:moving,stoppedSeconds:stopped,movingRatio:elapsed?moving/elapsed*100:0,
      averageSpeed:avg,maxSpeed:speeds.reduce((maximum,speed)=>Math.max(maximum,speed),0),
      medianSpeed:speeds.length?median(speeds):0,speedZones:speedZoneStats(intervals),
      fastestKilometerSeconds:fastestFullKilometer(intervals),vam:moving>0?elevation.gain/(moving/3600):0,...route
    };
  }
  function wrappedDate(ride){return new Date(ride.startedAt).toLocaleDateString("de-DE",{day:"2-digit",month:"long",year:"numeric"});}
  function wrappedRecord(label,entry,value){
    if(!entry)return "";
    return '<article class="wrapped-record"><span>'+label+'</span><strong>'+value+'</strong><small>'+escapeHtml(entry.ride.name||"Fahrradtour")+'</small><small>'+wrappedDate(entry.ride)+'</small></article>';
  }
  function wrappedBar(label,percent,value,key){
    const width=Math.max(0,Math.min(100,Number(percent)||0));
    return '<div class="wrapped-bar-row"><div><span>'+label+'</span><strong>'+value+'</strong></div><div class="wrapped-bar-track"><i class="wrapped-bar-'+key+'" style="width:'+width.toFixed(2)+'%"></i></div></div>';
  }
  function renderRideBreakdowns(c){
    const terrain=c.gradeSamples?(c.gradeDistribution||[]).map(x=>wrappedBar(x.label,x.percent,fmt(x.distanceM/1000,2)+" km",x.key)).join(""):"";
    const speed=c.movingSeconds?(c.speedZones||[]).map(x=>wrappedBar(x.label,x.percent,fmtTime(x.seconds),x.key)).join(""):"";
    return '<div class="panel wrapped-breakdown"><span class="eyebrow">GELÄNDE</span><h3>Steigungsverteilung</h3>'+
      (terrain||'<p class="small-note">Keine auswertbaren GPS-Höhenabschnitte.</p>')+
      '<p class="small-note">Anstieg ab +1,5 %, Gefälle unter −1,5 %; nur auswertbare geglättete Höhenabschnitte.</p>'+
      '<span class="eyebrow">TEMPO & PACE</span><h3>Geschwindigkeitszonen</h3>'+
      (speed||'<p class="small-note">Keine gültigen Bewegungsintervalle.</p>')+
      '<p class="small-note">Zeitanteile aus den gleichen GPS-Intervallen wie Distanz und Bewegungszeit.</p></div>';
  }
  function renderWrapped(rides){
    const host=$("wrappedContent");if(!host)return;
    if(!rides.length){host.innerHTML='<div class="empty-state">Noch keine gespeicherten Fahrten. Nach deiner ersten Tour erstellt VELOX hier automatisch deinen persönlichen Wrapped-Rückblick.</div>';return;}
    const entries=rides.map(ride=>({ride,calc:calcRide(ride)}));
    const totals=entries.reduce((sum,item)=>({distanceM:sum.distanceM+item.calc.distanceM,movingSeconds:sum.movingSeconds+item.calc.movingSeconds,gain:sum.gain+item.calc.elevationGain,loss:sum.loss+item.calc.elevationLoss}),{distanceM:0,movingSeconds:0,gain:0,loss:0});
    const terrain={uphill:0,flat:0,downhill:0},speed=[0,0,0];
    entries.forEach(({calc})=>{(calc.gradeDistribution||[]).forEach(x=>terrain[x.key]+=x.distanceM);(calc.speedZones||[]).forEach((x,i)=>speed[i]+=x.seconds);});
    const terrainTotal=terrain.uphill+terrain.flat+terrain.downhill,movingHours=totals.movingSeconds/3600;
    const avgSpeed=movingHours?totals.distanceM/totals.movingSeconds*3.6:0,speedTotal=speed.reduce((sum,x)=>sum+x,0);
    const avgSpeedLabel=movingHours?fmt(avgSpeed)+" km/h":"–";
    const vamEntries=entries.filter(x=>x.calc.gradeSamples>0&&x.calc.movingSeconds>0);
    const vamMovingSeconds=vamEntries.reduce((sum,x)=>sum+x.calc.movingSeconds,0);
    const vamGain=vamEntries.reduce((sum,x)=>sum+x.calc.elevationGain,0);
    const pick=(get,valid=()=>true)=>entries.filter(x=>valid(x.calc)).reduce((best,x)=>!best||get(x.calc)>get(best.calc)?x:best,null);
    const longest=pick(c=>c.distanceM,c=>c.distanceM>0),mostClimb=pick(c=>c.elevationGain,c=>c.elevationProfile.validCount>=2);
    const fastestAvg=pick(c=>c.averageSpeed,c=>c.movingSeconds>0),topSpeed=pick(c=>c.maxSpeed,c=>c.maxSpeed>0);
    const longestTime=pick(c=>c.movingSeconds,c=>c.movingSeconds>0),highPoint=pick(c=>c.elevationMax,c=>c.elevationMax!==null);
    const bestVam=pick(c=>c.vam,c=>c.movingSeconds>0&&c.elevationGain>0);
    const climb=entries.filter(x=>x.calc.longestClimb).reduce((best,x)=>!best||x.calc.longestClimb.distanceM>best.calc.longestClimb.distanceM?x:best,null);
    const fastestKm=entries.filter(x=>x.calc.fastestKilometerSeconds!==null).reduce((best,x)=>!best||x.calc.fastestKilometerSeconds<best.calc.fastestKilometerSeconds?x:best,null);
    const records=[
      wrappedRecord("Längste Fahrt",longest,fmt((longest?.calc.distanceM||0)/1000,2)+" km"),
      wrappedRecord("Meiste Höhenmeter auf einer Tour",mostClimb,"+"+Math.round(mostClimb?.calc.elevationGain||0)+" m"),
      wrappedRecord("Längster zusammenhängender Anstieg",climb,climb?fmt(climb.calc.longestClimb.distanceM/1000,2)+" km · +"+Math.round(climb.calc.longestClimb.gainM)+" m · "+fmt(climb.calc.longestClimb.averageGrade)+" %":""),
      wrappedRecord("Höchstes Durchschnittstempo",fastestAvg,fmt(fastestAvg?.calc.averageSpeed||0)+" km/h"),
      wrappedRecord("Höchstes GPS-Tempo",topSpeed,fmt(topSpeed?.calc.maxSpeed||0)+" km/h"),
      wrappedRecord("Längste Zeit im Sattel",longestTime,fmtTime(longestTime?.calc.movingSeconds||0)),
      wrappedRecord("Höchster aufgezeichneter Punkt",highPoint,highPoint?Math.round(highPoint.calc.elevationMax)+" m":""),
      wrappedRecord("Schnellster voller Kilometer",fastestKm,fastestKm?fmtTime(fastestKm.calc.fastestKilometerSeconds):""),
      wrappedRecord("Höchste Steigrate (VAM)",bestVam,Math.round(bestVam?.calc.vam||0)+" m/h")
    ].filter(Boolean).join("");
    const terrainBars=terrainTotal?[
      wrappedBar("Anstieg",terrain.uphill/terrainTotal*100,fmt(terrain.uphill/1000,1)+" km","uphill"),
      wrappedBar("Flach",terrain.flat/terrainTotal*100,fmt(terrain.flat/1000,1)+" km","flat"),
      wrappedBar("Gefälle",terrain.downhill/terrainTotal*100,fmt(terrain.downhill/1000,1)+" km","downhill")
    ].join(""):'<p class="small-note">Keine auswertbaren GPS-Höhenabschnitte.</p>';
    const speedBars=speedTotal?[
      wrappedBar("Unter 15 km/h",speed[0]/speedTotal*100,fmtTime(speed[0]),"slow"),
      wrappedBar("15–25 km/h",speed[1]/speedTotal*100,fmtTime(speed[1]),"medium"),
      wrappedBar("Über 25 km/h",speed[2]/speedTotal*100,fmtTime(speed[2]),"fast")
    ].join(""):'<p class="small-note">Keine gültigen Bewegungsintervalle.</p>';
    host.innerHTML='<section class="wrapped-hero"><span class="eyebrow">DEIN VELOX WRAPPED</span><h2>Deine Kilometer. Deine Höhenmeter. Deine Geschichte.</h2>'+
      '<p>Aus <strong>'+entries.length+' gespeicherten Touren</strong> ergibt sich dein persönlicher VELOX-Rückblick: <strong>'+fmt(totals.distanceM/1000,2)+' km</strong> ausgewertete Strecke, <strong>'+fmtTime(totals.movingSeconds)+'</strong> erkannte Bewegungszeit und <strong>'+Math.round(totals.gain).toLocaleString("de-DE")+' m</strong> kumulierter GPS-Höhengewinn. Dein durchschnittliches Tempo während gültiger Bewegungsintervalle lag bei <strong>'+avgSpeedLabel+'</strong>.</p>'+
      '<div class="wrapped-story-grid"><div><span>Deine längste Tour</span><strong>'+(longest?fmt(longest.calc.distanceM/1000,2)+" km":"Noch keine auswertbare Strecke")+'</strong></div><div><span>Dein schnellster voller Kilometer</span><strong>'+(fastestKm?fmtTime(fastestKm.calc.fastestKilometerSeconds):"Noch nicht ermittelt")+'</strong></div><div><span>Dein längster Anstieg</span><strong>'+(climb?fmt(climb.calc.longestClimb.distanceM/1000,2)+" km · +"+Math.round(climb.calc.longestClimb.gainM)+" m":"Noch kein zusammenhängender Anstieg")+'</strong></div></div>'+
      '<p class="wrapped-hero-note">Jede Zahl entsteht neu aus deinem lokalen Tourenarchiv. Tempo und Distanz nutzen akzeptierte GPS-Abschnitte; fehlende oder unplausible Messpunkte werden nicht künstlich ergänzt.</p></section>'+
      '<div class="metric-grid wrapped-kpis">'+metric("Gesamtdistanz",fmt(totals.distanceM/1000,2)+" km")+metric("Zeit im Sattel",fmtTime(totals.movingSeconds))+metric("Aufstieg gesamt","+"+Math.round(totals.gain)+" m")+metric("Abstieg gesamt","−"+Math.round(totals.loss)+" m")+metric("Touren",String(entries.length))+metric("Ø Tourdistanz",fmt(totals.distanceM/1000/entries.length)+" km")+metric("VAM · Höhengewinn je Bewegungsstunde",vamMovingSeconds?Math.round(vamGain/(vamMovingSeconds/3600))+" m/h":"–")+metric("Ø Geschwindigkeit",avgSpeedLabel)+'</div>'+
      '<section class="panel wrapped-panel"><span class="eyebrow">DEINE BESTLEISTUNGEN</span><h3>Persönliche Rekorde</h3><div class="wrapped-record-grid">'+(records||'<p class="small-note">Noch keine Rekorde berechenbar.</p>')+'</div></section>'+
      '<section class="panel wrapped-panel"><span class="eyebrow">DEIN FAHRPROFIL</span><h3>Gelände-Verteilung</h3>'+terrainBars+'<p class="wrapped-context">'+(terrainTotal?fmt(terrainTotal/1000,2)+' km auswertbare Steigungsabschnitte bilden die Grundlage dieser Verteilung.':'Für diese Verteilung liegen keine ausreichend verlässlichen Höhenabschnitte vor.')+'</p><h3>Tempo-Zonen</h3>'+speedBars+'<p class="wrapped-context">'+(speedTotal?fmtTime(speedTotal)+' erkannte Bewegungszeit bilden die Grundlage der Tempoanteile.':'Für die Tempoverteilung liegen keine gültigen Bewegungsintervalle vor.')+'</p><p class="wrapped-context">Die VAM beschreibt den Höhengewinn pro Bewegungsstunde und wird nur aus Touren mit auswertbaren Steigungsdaten berechnet.</p></section>'+
      '<p class="wrapped-refresh-note">Dein Rückblick wird beim Öffnen und nach jeder gespeicherten oder importierten Tour frisch aus dem lokalen Archiv berechnet.</p>';
  }
  function setPage(page){
    currentPage=page;
    document.querySelectorAll(".page").forEach(el=>el.classList.toggle("active",el.id==="page-"+page));
    const navPage=page==="wrapped"?"settings":page;
    document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("selected",el.dataset.page===navPage));
    if(page==="home"||page==="rides"||page==="stats"||page==="wrapped")refresh();
    if(page==="track")setTimeout(()=>{if(liveMap)liveMap.invalidateSize();},100);
    if(page==="stats")setTimeout(()=>renderPersonalMap(),180);
    window.scrollTo({top:0,behavior:"instant"});
  }
  document.addEventListener("click",e=>{
    const nav=e.target.closest("[data-page]");
    if(nav){e.preventDefault();setPage(nav.dataset.page);}
  });
  function renderOfflineRoute(elementId,points){
    const host=$(elementId);if(!host)return;
    const segments=validRouteSegments(points),all=segments.flat();
    if(!all.length){
      host.innerHTML='<div class="offline-map-empty">GPS wird gesucht. Die Aufzeichnung kann auch ohne Internet starten.</div>';
      return;
    }
    const lats=all.map(p=>p.lat),lons=all.map(p=>p.lon);
    const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons);
    const latSpan=Math.max(0.00005,maxLat-minLat),lonSpan=Math.max(0.00005,maxLon-minLon);
    const pad=24,width=640,height=320,innerW=width-pad*2,innerH=height-pad*2;
    const cos=Math.max(.15,Math.cos(((minLat+maxLat)/2)*Math.PI/180));
    const ratio=lonSpan*cos/latSpan;
    let plotW=innerW,plotH=innerH;
    if(ratio>innerW/innerH)plotH=innerW/ratio;else plotW=innerH*ratio;
    const offsetX=pad+(innerW-plotW)/2,offsetY=pad+(innerH-plotH)/2;
    const project=p=>[offsetX+((p.lon-minLon)/lonSpan)*plotW,offsetY+(1-(p.lat-minLat)/latSpan)*plotH];
    const grid=[];
    for(let i=1;i<5;i++){
      const x=pad+innerW*i/5,y=pad+innerH*i/5;
      grid.push('<line x1="'+x+'" y1="'+pad+'" x2="'+x+'" y2="'+(height-pad)+'"/><line x1="'+pad+'" y1="'+y+'" x2="'+(width-pad)+'" y2="'+y+'"/>');
    }
    const paths=segments.map(segment=>segment.length>1?'<polyline points="'+segment.map(p=>project(p).join(",")).join(" ")+'"/>':"").join("");
    const first=all[0],last=all[all.length-1],a=project(first),b=project(last);
    host.innerHTML='<div class="offline-map-wrap"><svg class="offline-route-svg" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Offline-Streckenansicht der aufgezeichneten GPS-Route">'+
      '<g class="offline-map-grid">'+grid.join("")+'</g><g class="offline-route-lines">'+paths+'</g>'+
      '<circle class="offline-route-start" cx="'+a[0]+'" cy="'+a[1]+'" r="7"/><circle class="offline-route-end" cx="'+b[0]+'" cy="'+b[1]+'" r="7"/></svg>'+
      '<span class="offline-map-caption">Offline-Streckenansicht · '+all.length+' GPS-Punkte</span></div>';
  }
  function initMap(elementId,center=[51.05,13.74],options={}){
    if(!window.L)return null;
    const host=$(elementId);if(!host)return null;
    host.innerHTML="";
    const map=L.map(host,{zoomControl:true,attributionControl:true,...options}).setView(center,13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
    return map;
  }
  function drawLive(points){
    if(!navigator.onLine&&liveMap){liveMap.remove();liveMap=null;liveLines=[];liveMarker=null;}
    if(!liveMap){renderOfflineRoute("liveMap",points);return;}
    liveLines.forEach(line=>liveMap.removeLayer(line));
    liveLines=[];
    const segments=validRouteSegments(points);
    segments.forEach(segment=>{
      const coords=segment.map(point=>[point.lat,point.lon]);
      if(coords.length>1)liveLines.push(L.polyline(coords,{color:"#5bd6c5",weight:5,opacity:.95,lineCap:"round",lineJoin:"round"}).addTo(liveMap));
    });
    const last=points.slice().reverse().find(validRidePoint);
    if(last){
      const coordinate=[last.lat,last.lon];
      if(liveMarker)liveMarker.setLatLng(coordinate);
      else liveMarker=L.circleMarker(coordinate,{radius:7,color:"#07131f",weight:3,fillColor:"#5bd6c5",fillOpacity:1}).addTo(liveMap);
      liveMap.setView(coordinate,Math.max(liveMap.getZoom(),15));
    }
  }
  function ensureLeaflet(){
    if(window.L)return Promise.resolve(true);
    if(leafletLoadPromise)return leafletLoadPromise;
    leafletLoadPromise=new Promise(resolve=>{
      let css=document.querySelector('link[data-velox-leaflet]');
      if(!css){css=document.createElement("link");css.rel="stylesheet";css.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";css.dataset.veloxLeaflet="true";document.head.appendChild(css);}
      const script=document.createElement("script");
      script.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload=()=>resolve(!!window.L);
      script.onerror=()=>resolve(false);
      document.head.appendChild(script);
    }).finally(()=>{if(!window.L)leafletLoadPromise=null;});
    return leafletLoadPromise;
  }
  async function restoreOnlineMaps(){
    if(!navigator.onLine||!await ensureLeaflet())return;
    if(currentPage==="track"&&activeRide){
      liveMap=liveMap||initMap("liveMap",activeRide.points.length?[activeRide.points.at(-1).lat,activeRide.points.at(-1).lon]:[51.05,13.74]);
      if(liveMap){liveLines=[];liveMarker=null;drawLive(activeRide.points);setTimeout(()=>liveMap&&liveMap.invalidateSize(),80);}
    }
    if(currentPage==="detail"&&lastDetailRide){
      const routeSegments=validRouteSegments(lastDetailRide.points);
      const first=routeSegments[0]?.[0]||lastDetailRide.points.find(validRidePoint);
      detailMap=initMap("detailMap",first?[first.lat,first.lon]:[51.05,13.74]);
      if(detailMap&&routeSegments.length){
        const bounds=[];
        routeSegments.forEach((segment,index)=>{
          const line=L.polyline(segment.map(p=>[p.lat,p.lon]),{color:"#5bd6c5",weight:5,opacity:.95,lineCap:"round",lineJoin:"round"}).addTo(detailMap);
          line.getLatLngs().forEach(point=>bounds.push(point));
          if(index===0)L.circleMarker([segment[0].lat,segment[0].lon],{radius:6,color:"#07131f",weight:2,fillColor:"#5bd6c5",fillOpacity:1}).addTo(detailMap);
        });
        const last=routeSegments[routeSegments.length-1].at(-1);
        L.circleMarker([last.lat,last.lon],{radius:6,color:"#07131f",weight:2,fillColor:"#d9b879",fillOpacity:1}).addTo(detailMap);
        if(bounds.length)detailMap.fitBounds(bounds,{padding:[20,20]});
        setTimeout(()=>detailMap&&detailMap.invalidateSize(),80);
      }
    }
  }
  async function refresh(){
    const rides=await allRides();let distance=0,time=0,elev=0;
    rides.forEach(r=>{const c=calcRide(r);distance+=c.distanceM;time+=c.movingSeconds;elev+=c.elevationGain;});
    $("totalDistance").innerHTML=fmt(distance/1000)+" <small>km</small>";
    $("totalTime").innerHTML=fmt(time/3600,1)+" <small>h</small>";
    $("totalElevation").innerHTML=Math.round(elev)+" <small>m</small>";
    $("totalRides").textContent=rides.length;
    $("statsDistance").innerHTML=fmt(distance/1000)+" <small>km</small>";
    $("statsTime").innerHTML=fmt(time/3600)+" <small>h</small>";
    $("statsElevation").innerHTML=Math.round(elev)+" <small>m</small>";
    $("statsAverageDistance").innerHTML=fmt(rides.length?distance/1000/rides.length:0)+" <small>km</small>";
    renderRideList($("recentRides"),rides.slice(0,3));renderRideList($("allRides"),rides);
    renderRideComparison(rides.slice(0,3));
    if(currentPage==="wrapped")renderWrapped(rides);
  }
  function renderRideComparison(rides){
    const host=$("rideComparison");if(!host)return;
    if(rides.length<2){host.innerHTML='<p class="small-note">Mindestens zwei gespeicherte Touren erforderlich. Deine Fahrten bleiben lokal auf diesem Gerät.</p>';return;}
    const columns=rides.map(ride=>({ride,calc:calcRide(ride)}));
    const rows=[
      ["Distanz",c=>fmt(c.distanceM/1000)+" km"],
      ["Fahrzeit",c=>fmtTime(c.movingSeconds)],
      ["Ø Geschwindigkeit",c=>fmt(c.averageSpeed)+" km/h"],
      ["Max. Geschwindigkeit",c=>fmt(c.maxSpeed)+" km/h"],
      ["Aufstieg",c=>Math.round(c.elevationGain)+" m"],
      ["Abstieg",c=>Math.round(c.elevationLoss)+" m"],
      ["Höchster Punkt",c=>c.elevationMax===null?"–":Math.round(c.elevationMax)+" m"],
      ["Ø Steigung",c=>c.gradeSamples?fmt(c.gradeAverage)+" %":"–"]
    ];
    const header='<div class="comparison-scroll"><table class="comparison-table"><thead><tr><th>Messwert</th>'+columns.map(({ride})=>'<th>'+escapeHtml(new Date(ride.startedAt).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"}))+'</th>').join("")+'</tr></thead><tbody>';
    const body=rows.map(([label,format])=>'<tr><th>'+label+'</th>'+columns.map(({calc})=>'<td>'+format(calc)+'</td>').join("")+'</tr>').join("");
    host.innerHTML=header+body+'</tbody></table></div><p class="small-note">Verglichen werden die letzten '+columns.length+' gespeicherten Touren. Nur tatsächlich vorhandene GPS-Daten werden berücksichtigt.</p>';
  }
  function selectedMapRides(){
    const filter=$("mapDateFilter")?.value||"all",now=Date.now();
    const cutoff=filter==="30"?now-30*86400000:filter==="90"?now-90*86400000:filter==="year"?now-365*86400000:0;
    return personalRidesCache.filter(ride=>!cutoff||ride.startedAt>=cutoff);
  }
  function renderMapRideFilters(rides){
    const host=$("personalRideFilters");if(!host)return;
    if(!rides.length){host.innerHTML='<p class="map-filter-empty">Keine Touren im gewählten Zeitraum.</p>';return;}
    host.innerHTML=rides.map((ride,index)=>{
      const id=String(ride.id),checked=personalVisibility.get(id)!==false,color=mapColors[personalRidesCache.indexOf(ride)%mapColors.length];
      const date=new Date(ride.startedAt).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"2-digit"});
      return '<label class="map-ride-toggle"><input type="checkbox" data-map-ride="'+escapeHtml(id)+'" '+(checked?'checked':'')+'><span class="map-ride-swatch" style="--ride-color:'+color+'"></span><span class="map-ride-name">'+escapeHtml(ride.name||"Fahrradtour")+'</span><small>'+date+'</small></label>';
    }).join("");
    host.querySelectorAll("[data-map-ride]").forEach(input=>input.addEventListener("change",()=>{
      personalVisibility.set(input.dataset.mapRide,input.checked);
      updatePersonalMapLayers();
    }));
  }
  function updatePersonalMapLayers(){
    if(!personalMap)return;
    personalLines.forEach(layers=>layers.forEach(layer=>personalMap.removeLayer(layer)));
    personalLines.clear();
    if(personalHeatLayer){personalMap.removeLayer(personalHeatLayer);personalHeatLayer=null;}
    const rides=selectedMapRides().filter(ride=>personalVisibility.get(String(ride.id))!==false);
    const bounds=[];
    rides.forEach(ride=>{
      const segments=validRouteSegments(Array.isArray(ride.points)?ride.points:[]);
      const color=mapColors[personalRidesCache.indexOf(ride)%mapColors.length];
      const layers=[];
      segments.forEach(segment=>{
        if(segment.length<2)return;
        const line=L.polyline(segment.map(point=>[point.lat,point.lon]),{color,weight:4,opacity:.82,lineCap:"round",lineJoin:"round"}).addTo(personalMap);
        layers.push(line);
        line.getLatLngs().forEach(point=>bounds.push(point));
      });
      personalLines.set(String(ride.id),layers);
    });
    if(personalHeatVisible&&rides.length){
      const cells=new Map();
      rides.forEach(ride=>{
        const touched=new Set();
        validRouteSegments(Array.isArray(ride.points)?ride.points:[]).flat().forEach(point=>{
          const key=Math.round(point.lat/0.0005)+":"+Math.round(point.lon/0.0005);
          if(touched.has(key))return;
          touched.add(key);
          let cell=cells.get(key);
          if(!cell){cell={lat:0,lon:0,count:0};cells.set(key,cell);}
          cell.lat+=point.lat;cell.lon+=point.lon;cell.count++;
        });
      });
      personalHeatLayer=L.layerGroup();
      cells.forEach(cell=>{
        if(cell.count<2)return;
        const strength=Math.min(1,cell.count/8),color=cell.count>=8?"#ff775f":cell.count>=4?"#f4bd65":"#5bd6c5";
        L.circleMarker([cell.lat/cell.count,cell.lon/cell.count],{radius:5+strength*10,stroke:false,fillColor:color,fillOpacity:.12+strength*.38,interactive:false}).addTo(personalHeatLayer);
      });
      personalHeatLayer.addTo(personalMap);
    }
    if(bounds.length)personalMap.fitBounds(L.latLngBounds(bounds),{padding:[24,24],maxZoom:15});
    const heatButton=$("mapHeatToggle");
    if(heatButton){heatButton.classList.toggle("active",personalHeatVisible);heatButton.setAttribute("aria-pressed",String(personalHeatVisible));}
  }
  async function renderPersonalMap(){
    personalRidesCache=await allRides();
    const points=personalRidesCache.flatMap(ride=>validRouteSegments(Array.isArray(ride.points)?ride.points:[]).flat());
    const box=$("personalMap");
    if(!points.length){
      if(personalMap){personalMap.remove();personalMap=null;}
      personalLines.clear();personalHeatLayer=null;
      box.innerHTML='<div class="empty-state">Noch keine GPS-Strecken vorhanden.</div>';
      return;
    }
    if(!window.L){box.innerHTML='<div class="empty-state">Kartenbibliothek nicht geladen. Bitte Internetverbindung prüfen.</div>';return;}
    if(!personalMap){box.innerHTML="";personalMap=initMap("personalMap",[points[0].lat,points[0].lon],{preferCanvas:true});}
    if(!personalMap)return;
    renderMapRideFilters(selectedMapRides());
    updatePersonalMapLayers();
    setTimeout(()=>personalMap.invalidateSize(),80);
  }
  function fitPersonalMap(){
    if(!personalMap)return;
    const points=[];
    personalLines.forEach(layers=>layers.forEach(line=>line.getLatLngs().forEach(point=>points.push(point))));
    if(points.length)personalMap.fitBounds(L.latLngBounds(points),{padding:[24,24],maxZoom:15});
  }
  function renderRideList(container,rides){
    if(!rides.length){container.innerHTML='<div class="empty-state">Noch keine Touren gespeichert.</div>';return;}
    container.innerHTML=rides.map(r=>{
      const c=calcRide(r),date=new Date(r.startedAt).toLocaleDateString("de-DE",{dateStyle:"medium"}),start=new Date(r.startedAt).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}),end=Number.isFinite(r.endedAt)?new Date(r.endedAt).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}):"–";
      return '<button class="ride-card" data-ride="'+escapeHtml(r.id)+'"><div><h3>'+escapeHtml(r.name||"Fahrradtour")+'</h3><p>'+date+' · '+start+'–'+end+' Uhr · '+fmt(c.movingSeconds/60,0)+' min · '+fmt(c.averageSpeed)+' km/h Ø</p></div><div class="ride-distance">'+fmt(c.distanceM/1000)+' <small>km</small></div></button>';
    }).join("");
    container.querySelectorAll("[data-ride]").forEach(el=>el.addEventListener("click",()=>openDetail(el.dataset.ride)));
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  async function startRide(){
    if(!navigator.geolocation){showToast("GPS wird von diesem Browser nicht unterstützt.");return;}
    if(!window.isSecureContext){showToast("GPS benötigt eine sichere HTTPS-Verbindung.");return;}
    activeRide={id:"ride-"+Date.now(),name:"Fahrradtour",startedAt:Date.now(),endedAt:null,pausedMs:0,pauseIntervals:[],points:[],status:"recording"};
    liveMetricsCache=null;liveMetricsRideId=null;
    syncTrackStartButton();
    try{await dbRequest("readwrite","put",activeRide);}catch(e){activeRide=null;syncTrackStartButton();showToast("Lokale Speicherung nicht verfügbar.");return;}
    $("pauseRide").disabled=false;$("stopRide").disabled=false;$("pauseRide").textContent="Pause";
    $("trackingStatus").textContent="GPS wird gesucht …";$("trackingDot").style.background="#d9b879";
    liveMap=liveMap||initMap("liveMap");liveLine=null;liveMarker=null;
    setPage("track");
    watchId=navigator.geolocation.watchPosition(onPosition,onGeoError,{enableHighAccuracy:true,maximumAge:1000,timeout:20000});
    updateLive(true);
    scheduleLiveClock();
    if(navigator.onLine&&!window.L)ensureLeaflet().then(restoreOnlineMaps);
  }
  async function onPosition(pos){
    if(!activeRide||activeRide.status!=="recording")return;
    const c=pos.coords,timestamp=Number.isFinite(pos.timestamp)&&pos.timestamp>0?pos.timestamp:Date.now();
    if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||c.latitude < -90||c.latitude > 90||c.longitude < -180||c.longitude > 180)return;
    const prev=activeRide.points[activeRide.points.length-1];
    // Recording preserves genuine fixes; quality and speed filters belong to analysis.
    if(prev&&timestamp<=prev.t)return;
    const sensor=window.VELOXSensors?window.VELOXSensors.fuseAltitude(c.altitude,c.altitudeAccuracy,timestamp):{altitudeM:Number.isFinite(c.altitude)?c.altitude:null,accuracyM:Number.isFinite(c.altitudeAccuracy)?c.altitudeAccuracy:null,source:"gps"};
    const point={lat:c.latitude,lon:c.longitude,t:timestamp,alt:sensor.altitudeM,altAccuracy:sensor.accuracyM,altSource:sensor.source,pressureKPa:sensor.pressureKPa,accuracy:Number.isFinite(c.accuracy)?c.accuracy:null};
    activeRide.points.push(point);
    try{await persistActiveRide();}catch(error){console.error("GPS-Punkt konnte nicht dauerhaft gespeichert werden:",error);$("trackingStatus").textContent="Speicherfehler – Tourdaten prüfen";showToast("Lokales Speichern fehlgeschlagen.");return;}
    $("trackingStatus").textContent="Aufzeichnung läuft";$("trackingDot").style.background="var(--teal)";
    $("gpsAccuracy").textContent=Number.isFinite(c.accuracy)?"GPS ±"+Math.round(c.accuracy)+" m":"GPS-Genauigkeit nicht gemeldet";
    updateSensorStatus(point);drawLive(activeRide.points);updateLive(true);
  }
  function updateSensorStatus(point){
    const source=point&&point.altSource||"gps";
    const gps=$("sensorGpsStatus"),barometer=$("sensorBarometerStatus"),sourceLabel=$("sensorAltitudeSource");
    if(gps)gps.textContent=Number.isFinite(point&&point.alt)?"GPS-Höhe verfügbar":"GPS-Höhe nicht verfügbar";
    if(barometer)barometer.textContent=source.includes("barometer")?"Barometer verbunden":"In dieser Web-App nicht verfügbar";
    if(sourceLabel)sourceLabel.textContent=source==="gps+barometer"?"GPS + Barometer":source==="barometer"?"Barometer":"GPS";
  }
  function onGeoError(err){
    const messages={1:"Standortzugriff verweigert. Bitte in den iOS-Einstellungen erlauben.",2:"GPS-Position nicht verfügbar.",3:"GPS-Zeitüberschreitung. Suche läuft weiter."};
    $("trackingStatus").textContent=messages[err.code]||"GPS-Fehler";
    showToast(messages[err.code]||"GPS-Fehler");
  }
  function currentSpeed(points){
    if(points.length<2)return 0;
    const a=points[points.length-2],b=points[points.length-1],dt=(b.t-a.t)/1000,d=haversine(a,b);
    if(dt<=0||dt>30||d<=0.8||d>=150)return 0;
    const speed=d/dt*3.6;
    return Number.isFinite(speed)&&speed<=100?speed:0;
  }
  function updateLive(refreshMetrics=false){
    if(!activeRide)return;
    if(refreshMetrics||!liveMetricsCache||liveMetricsRideId!==activeRide.id){
      liveMetricsCache=calcRide(activeRide);
      liveMetricsRideId=activeRide.id;
    }
    const c=liveMetricsCache,elapsed=activeSeconds(activeRide);
    $("liveDistance").textContent=fmt(c.distanceM/1000,2);
    $("liveSpeed").innerHTML=fmt(currentSpeed(activeRide.points))+" <small>km/h</small>";
    $("liveDuration").textContent=fmtTime(elapsed);
    $("liveElevation").innerHTML=Math.round(c.elevationGain)+' <small>m</small>';
    $("liveAverage").innerHTML=fmt(c.averageSpeed)+' <small>km/h</small>';
    const last=activeRide.points[activeRide.points.length-1],elevation=c.elevationProfile;
    $("liveAltitude").innerHTML=last&&Number.isFinite(last.alt)?Math.round(last.alt)+' <small>m</small>':'– <small>m</small>';
    const liveGrade=currentGrade(elevation);
    $("liveGrade").innerHTML=liveGrade===null?'– <small>%</small>':fmt(liveGrade)+' <small>%</small>';
    $("liveMovingRatio").innerHTML=fmt(elapsed?c.movingSeconds/elapsed*100:0,0)+' <small>%</small>';
    $("liveAltitudeQuality").textContent=elevation.quality==="high"?"Gut":elevation.quality==="medium"?"Mittel":elevation.quality==="unrated"?"Nicht bewertet":"Begrenzt";
    const latest=activeRide.points[activeRide.points.length-1];updateSensorStatus(latest);
  }
  function scheduleLiveClock(){
    if(timerId!==null)clearTimeout(timerId);
    const tick=()=>{
      if(!activeRide){timerId=null;return;}
      updateLive(false);
      timerId=setTimeout(tick,Math.max(25,1000-(Date.now()%1000)));
    };
    timerId=setTimeout(tick,Math.max(25,1000-(Date.now()%1000)));
  }
  function syncTrackStartButton(){
    const button=$("trackStartRide");
    if(button)button.hidden=!!activeRide;
  }
  async function pauseRide(){
    if(!activeRide)return;
    if(activeRide.status==="recording"){
      const pauseAt=Date.now();
      if(!Array.isArray(activeRide.pauseIntervals))activeRide.pauseIntervals=[];
      activeRide.pauseIntervals.push({startedAt:pauseAt,endedAt:null});
      activeRide.status="paused";activeRide.pauseStarted=pauseAt;
      if(watchId!==null)navigator.geolocation.clearWatch(watchId);watchId=null;
      $("pauseRide").textContent="Fortsetzen";$("trackingStatus").textContent="Pausiert";
    }else{
      const resumedAt=Date.now(),lastPause=Array.isArray(activeRide.pauseIntervals)?activeRide.pauseIntervals[activeRide.pauseIntervals.length-1]:null;
      if(lastPause&&lastPause.endedAt===null)lastPause.endedAt=resumedAt;
      activeRide.pausedMs=(activeRide.pausedMs||0)+(resumedAt-(activeRide.pauseStarted||resumedAt));
      delete activeRide.pauseStarted;activeRide.status="recording";
      watchId=navigator.geolocation.watchPosition(onPosition,onGeoError,{enableHighAccuracy:true,maximumAge:1000,timeout:20000});
      $("pauseRide").textContent="Pause";$("trackingStatus").textContent="Aufzeichnung läuft";
    }
    await dbRequest("readwrite","put",activeRide);updateLive(true);
  }
  function weatherDescription(code){
    if([0].includes(code))return "Sonnig / klar";
    if([1,2].includes(code))return "Leicht bewölkt";
    if([3].includes(code))return "Bewölkt";
    if([45,48].includes(code))return "Nebel";
    if([51,53,55,56,57].includes(code))return "Nieselregen";
    if([61,63,65,66,67,80,81,82].includes(code))return "Regen";
    if([71,73,75,77,85,86].includes(code))return "Schnee";
    if([95,96,99].includes(code))return "Gewitter";
    return "Wetterlage nicht eindeutig";
  }
  function localDateTimeParts(timestamp){
    const d=new Date(timestamp),pad=n=>String(n).padStart(2,"0");
    return {date:d.toISOString().slice(0,10),hour:pad(d.getUTCHours())+":00"};
  }
  async function fetchRideWeather(ride){
    const points=Array.isArray(ride.points)?ride.points.filter(validRidePoint):[];
    if(!points.length||!navigator.onLine||!window.fetch)return null;
    const middle=ride.startedAt+((ride.endedAt||Date.now())-ride.startedAt)/2;
    const target=points.reduce((best,p)=>Math.abs(p.t-middle)<Math.abs(best.t-middle)?p:best,points[0]);
    const parts=localDateTimeParts(middle),params=new URLSearchParams({
      latitude:String(target.lat),longitude:String(target.lon),start_date:parts.date,end_date:parts.date,
      hourly:"temperature_2m,precipitation,weather_code,cloud_cover",timezone:"UTC"
    });
    const response=await fetch("https://archive-api.open-meteo.com/v1/archive?"+params.toString(),{signal:AbortSignal.timeout(6500)});
    if(!response.ok)throw new Error("Wetterdienst antwortet nicht");
    const data=await response.json(),times=data.hourly&&data.hourly.time;
    if(!Array.isArray(times)||!times.length)return null;
    const targetTime=new Date(middle).getTime();
    let index=0,bestDelta=Infinity;
    times.forEach((time,i)=>{const delta=Math.abs(new Date(time+"Z").getTime()-targetTime);if(delta<bestDelta){bestDelta=delta;index=i;}});
    const temp=data.hourly.temperature_2m?.[index],code=data.hourly.weather_code?.[index];
    if(!Number.isFinite(temp)||!Number.isFinite(code))return null;
    return {condition:weatherDescription(code),weatherCode:code,temperatureC:temp,precipitationMm:Number.isFinite(data.hourly.precipitation?.[index])?data.hourly.precipitation[index]:null,cloudCoverPct:Number.isFinite(data.hourly.cloud_cover?.[index])?data.hourly.cloud_cover[index]:null,source:"open-meteo-archive",sourceLabel:"Open-Meteo (historische Wetterdaten)",sampledAt:times[index],fetchedAt:Date.now()};
  }
  async function collectManualWeather(){
    const condition=prompt("Wetter während dieser Fahrt? Bitte eingeben: sonnig, leicht bewölkt, bewölkt, Regen, Schnee, Nebel oder Gewitter. Bei wechselndem Wetter kannst du mehrere Begriffe nennen.");
    if(condition===null)return {condition:"Nicht angegeben",source:"user-skipped",sourceLabel:"Keine Wetterangabe"};
    let temperature=null;
    for(let attempt=0;attempt<2;attempt++){
      const raw=prompt("Welche Temperatur herrschte ungefähr während der Fahrt? Bitte °C eingeben (z. B. 18).");
      if(raw===null)break;
      const value=Number(raw.replace(",","."));
      if(Number.isFinite(value)&&value>=-30&&value<=55){temperature=value;break;}
      alert("Bitte eine Temperatur zwischen −30 und 55 °C eingeben.");
    }
    return {condition:condition.trim().slice(0,100)||"Nicht angegeben",temperatureC:temperature,source:"user-estimate",sourceLabel:"Manuell vom Fahrer angegeben",fetchedAt:Date.now()};
  }
  async function collectRideWeather(ride){
    const consent=confirm("Wetter automatisch ermitteln? VELOX sendet dafür das Fahrtdatum und eine ungefähre GPS-Position dieser Fahrt an Open-Meteo. Der kostenlose Wetterdienst benötigt diese Angaben. Mit „Abbrechen“ kannst du Wetter und Temperatur selbst eintragen.");
    if(consent){
      try{const weather=await fetchRideWeather(ride);if(weather)return weather;}catch(error){console.warn("Wetterabfrage nicht verfügbar:",error);}
    }
    return await collectManualWeather();
  }
  async function stopRide(){
    if(!activeRide)return;
    if(activeRide.status==="paused"){
      const resumedAt=Date.now(),lastPause=Array.isArray(activeRide.pauseIntervals)?activeRide.pauseIntervals[activeRide.pauseIntervals.length-1]:null;
      if(lastPause&&lastPause.endedAt===null)lastPause.endedAt=resumedAt;
      activeRide.pausedMs=(activeRide.pausedMs||0)+(resumedAt-(activeRide.pauseStarted||resumedAt));
      delete activeRide.pauseStarted;
    }
    if(watchId!==null)navigator.geolocation.clearWatch(watchId);watchId=null;
    if(timerId!==null)clearTimeout(timerId);timerId=null;
    activeRide.status="completed";activeRide.endedAt=Date.now();
    const c=calcRide(activeRide);
    $( "stopRide" ).disabled=true;$( "pauseRide" ).disabled=true;
    $( "trackingStatus" ).textContent="Tour wird lokal gesichert …";
    try{
      await persistActiveRide();
      $("trackingStatus").textContent="Wetterdaten werden ergänzt …";
      activeRide.weather=await collectRideWeather(activeRide);
      await persistActiveRide();
    }catch(error){
      console.error(error);
      activeRide.status="completed";
      try{await dbRequest("readwrite","put",activeRide);}catch(saveError){showToast("Speichern fehlgeschlagen. Bitte VELOX geöffnet lassen und erneut versuchen.");console.error(saveError);return;}
    }
    activeRide=null;
    liveMetricsCache=null;liveMetricsRideId=null;syncTrackStartButton();
    $("trackingStatus").textContent="Tour gespeichert";$("trackingDot").style.background="var(--teal)";
    showToast(c.distanceM>0?"Tour lokal gespeichert.":"Tour ohne ausreichende GPS-Daten gespeichert.");
    await refresh();setPage("rides");
  }
  function validRouteSegments(points,includeSingletons=false){
    const segments=[];let current=[];
    for(let i=0;i<points.length;i++){
      const point=points[i];
      if(!validRidePoint(point)){if(current.length>(includeSingletons?0:1))segments.push(current);current=[];continue;}
      if(!current.length){current=[point];continue;}
      const previous=points[i-1],dt=(point.t-previous.t)/1000,d=haversine(previous,point);
      const accuracy=[previous.accuracy,point.accuracy].filter(Number.isFinite);
      // Map display is more permissive than metric analysis; long outages remain split.
      const valid=validRidePoint(previous)&&Number.isFinite(dt)&&dt>0&&dt<=180&&
        Number.isFinite(d)&&d>=0.1&&d<=300&&d/dt*3.6<=180;
      if(valid)current.push(point);
      else{if(current.length>(includeSingletons?0:1))segments.push(current);current=[point];}
    }
    if(current.length>(includeSingletons?0:1))segments.push(current);
    return segments;
  }
  async function openDetail(id){
    const r=(await allRides()).find(x=>x.id===id);if(!r)return;
    lastDetailRide=r;
    const c=calcRide(r),stops=getRideStopStats(r),date=new Date(r.startedAt).toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long",year:"numeric"}),startTime=new Date(r.startedAt).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit",second:"2-digit"}),endTime=Number.isFinite(r.endedAt)?new Date(r.endedAt).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"–",weather=r.weather||null;
    const elevationCards=
      metric("Aufstieg",Math.round(c.elevationGain)+" m")+metric("Abstieg",Math.round(c.elevationLoss)+" m")+
      metric("Höchster Punkt",c.elevationMax===null?"–":Math.round(c.elevationMax)+" m")+
      metric("Tiefster Punkt",c.elevationMin===null?"–":Math.round(c.elevationMin)+" m")+
      metric("Höhenbereich",c.elevationRange===null?"–":Math.round(c.elevationRange)+" m")+
      metric("Netto-Höhenänderung",c.netElevationChange===null?"–":(c.netElevationChange>=0?"+":"")+Math.round(c.netElevationChange)+" m")+
      metric("Ø Steigung",c.gradeSamples?fmt(c.gradeAverage)+" %":"–")+
      metric("Max. Steigung",c.gradeSamples?fmt(c.gradeMax)+" %":"–")+
      metric("Steilste Abfahrt",c.gradeSamples?fmt(Math.abs(c.gradeMin))+" %":"–")+
      metric("Längster Anstieg",c.longestClimb?fmt(c.longestClimb.distanceM/1000,2)+" km / +"+Math.round(c.longestClimb.gainM)+" m":"–")+
      metric("VAM",c.gradeSamples>0&&c.movingSeconds?Math.round(c.vam)+" m/h":"–");
    const routeCards=
      metric("Max. vom Start",c.maxFromStartM===null?"–":fmt(c.maxFromStartM/1000,2)+" km")+
      metric("Luftlinie Start–Ziel",c.straightDistanceM===null?"–":fmt(c.straightDistanceM/1000,2)+" km")+
      metric("Strecken-Geradlinigkeit",c.routeStraightness===null?"–":fmt(c.routeStraightness,0)+" %");
    const timeCards=
      metric("Bewegungszeit",fmtTime(c.movingSeconds))+
      metric("Aufzeichnungsdauer",fmtTime(c.elapsedSeconds))+
      metric("Standzeit",fmtTime(c.stoppedSeconds))+
      metric("Fahrzeitanteil",fmt(c.movingRatio,0)+" %")+
      metric("Schnellster voller km",c.fastestKilometerSeconds===null?"–":fmtTime(c.fastestKilometerSeconds))+
      metric("Erkannte Stopps",stops.count===null?"–":String(stops.count))+
      metric("Längster Stopp",stops.longestSeconds===null?"–":fmtTime(stops.longestSeconds));
    const speedCards=
      metric("Ø Geschwindigkeit",c.movingSeconds?fmt(c.averageSpeed)+" km/h":"–")+
      metric("Max. GPS-Tempo",c.movingSeconds?fmt(c.maxSpeed)+" km/h":"–")+
      metric("Tempo-Median",c.movingSeconds?fmt(c.medianSpeed)+" km/h":"–");
    const gpsQuality=c.elevationQuality==="high"?"Gut":c.elevationQuality==="medium"?"Mittel":"Eingeschränkt";
    $("rideDetail").innerHTML=
      '<div class="detail-header"><span class="eyebrow">TOURENDETAIL</span><h1>'+escapeHtml(r.name||"Fahrradtour")+'</h1><p class="muted">'+date+'</p><div class="ride-time-strip"><div><span>START</span><strong>'+startTime+' Uhr</strong></div><div><span>ENDE</span><strong>'+endTime+' Uhr</strong></div></div></div>'+
      '<section class="detail-route-section"><div class="detail-section-heading"><span class="eyebrow">DEINE STRECKE</span><span class="detail-map-distance">'+fmt(c.distanceM/1000,2)+' km</span></div><div class="detail-map detail-map-primary" id="detailMap" role="img" aria-label="Karte der aufgezeichneten Fahrradroute"></div><div class="detail-route-legend"><span>● Start</span><span>● Ziel</span><span>'+validRouteSegments(r.points).length+' GPS-Abschnitte</span></div></section>'+
      '<section class="detail-section"><div class="panel detail-panel weather-panel"><span class="eyebrow">WETTER WÄHREND DIESER FAHRT</span><h3>'+ (weather?escapeHtml(weather.condition||"Wetter erfasst"):"Keine Wetterangabe") +'</h3><div class="metric-grid detail-metrics">'+metric("Temperatur",weather&&Number.isFinite(weather.temperatureC)?fmt(weather.temperatureC,1)+" °C":"–")+metric("Niederschlag",weather&&Number.isFinite(weather.precipitationMm)?fmt(weather.precipitationMm,1)+" mm":"Nicht verfügbar")+metric("Bewölkung",weather&&Number.isFinite(weather.cloudCoverPct)?fmt(weather.cloudCoverPct,0)+" %":"Nicht verfügbar")+metric("Quelle",weather?escapeHtml(weather.sourceLabel||"Fahrerangabe"):"Keine Angabe")+'</div><p>'+ (weather&&weather.source==="open-meteo-archive"?"Historische Wetterdaten am nächstgelegenen Stundenwert und an einer repräsentativen GPS-Position der Fahrt.":"Wetterangabe für diese einzelne Fahrt; Temperatur ist eine ungefähre Fahrerangabe.") +'</p></div></section>'+'<section class="detail-section"><span class="eyebrow">AUF EINEN BLICK</span><div class="metric-grid detail-metrics">'+
      metric("Distanz",fmt(c.distanceM/1000,2)+" km")+metric("Zeit im Sattel",fmtTime(c.movingSeconds))+
      metric("Ø Tempo",c.movingSeconds?fmt(c.averageSpeed)+" km/h":"–")+metric("Max. Tempo",c.movingSeconds?fmt(c.maxSpeed)+" km/h":"–")+
      '</div></section>'+
      '<section class="detail-section"><div class="panel detail-panel"><span class="eyebrow">HÖHENPROFIL</span><h3>Höhenverlauf</h3><div class="chart-box" id="elevationChart"></div><p>GPS-Höhenqualität: '+gpsQuality+(Number.isFinite(c.elevationAccuracy)?' · Median der gemeldeten GPS-Höhengenauigkeit: '+fmt(c.elevationAccuracy)+' m':' · Keine durchgängige Genauigkeitsangabe')+'. Höhenmeter werden gefiltert und nicht als Barometer-Messung ausgegeben.</p></div></section>'+
      '<section class="detail-section"><div class="panel detail-panel"><span class="eyebrow">TEMPO & PACE</span><h3>Geschwindigkeit über die Strecke</h3><div class="chart-box" id="speedChart"></div><div class="metric-grid detail-metrics">'+speedCards+'</div></div></section>'+
      '<section class="detail-section"><div class="panel detail-panel"><span class="eyebrow">GELÄNDE</span><h3>Steigung und Gefälle</h3><div class="metric-grid detail-metrics">'+elevationCards+'</div>'+renderRideBreakdowns(c)+'</div></section>'+
      '<section class="detail-section"><div class="panel detail-panel"><span class="eyebrow">ROUTE</span><h3>Entfernung und Streckenform</h3><div class="metric-grid detail-metrics">'+routeCards+'</div><p>Geradlinigkeit wird nur angezeigt, wenn die Route ausreichend zusammenhängend aufgezeichnet wurde.</p></div></section>'+
      '<section class="detail-section"><div class="panel detail-panel"><span class="eyebrow">ZEIT & AUFZEICHNUNG</span><h3>Fahr- und Standzeiten</h3><div class="metric-grid detail-metrics">'+timeCards+'</div><p>Bewegungszeit wird aus akzeptierten GPS-Intervallen berechnet. Ein Stopp zählt ab 10 Sekunden erkannter Bewegung unter 1,5 km/h; GPS-Lücken werden nicht als Stopp gewertet. Die Erkennung ist eine GPS-Näherung.</p></div></section>'+
      '<section class="detail-section"><div class="panel detail-panel"><span class="eyebrow">DATENQUELLEN & SENSORSTATUS</span><h3>Was wurde tatsächlich gemessen?</h3><div class="detail-source-list"><div><span>GPS-Positionen</span><strong>'+r.points.length+' gespeicherte Punkte</strong></div><div><span>GPS-Höhe</span><strong>'+c.elevationProfile.validCount+' verwertbare Höhenpunkte</strong></div><div><span>Barometer</span><strong>Keine nativen Barometerdaten in dieser Tour</strong></div><div><span>Kompass / Magnetometer</span><strong>Nicht in dieser PWA-Aufzeichnung gespeichert</strong></div><div><span>Gyroskop / Beschleunigung</span><strong>Nicht in dieser PWA-Aufzeichnung gespeichert</strong></div><div><span>Herzfrequenz / Leistung / Kadenz</span><strong>Keine Datenquelle vorhanden</strong></div></div><p>Das iPhone XR besitzt zusätzliche Sensorhardware. Safari/PWA kann sie jedoch nicht wie eine native iOS-App vollständig über Core Motion auslesen. VELOX zeigt daher nur Daten, die wirklich in dieser Tour gespeichert wurden.</p></div></section>'+
      '<div class="tracking-actions"><button class="secondary-button" id="exportGpx">GPX exportieren</button><button class="danger-outline" id="deleteRide">Tour löschen</button></div>';
    setPage("detail");
    setTimeout(()=>{
      const routeSegments=validRouteSegments(r.points);
      const first=routeSegments[0]?.[0]||r.points.find(validRidePoint);
      if(detailMap){detailMap.remove();detailMap=null;}
      detailMap=navigator.onLine&&window.L?initMap("detailMap",first?[first.lat,first.lon]:[51.05,13.74]):null;
      if(detailMap&&routeSegments.length){
        const bounds=[];
        routeSegments.forEach((segment,index)=>{
          const line=L.polyline(segment.map(p=>[p.lat,p.lon]),{color:"#5bd6c5",weight:5,opacity:.95,lineCap:"round",lineJoin:"round"}).addTo(detailMap);
          line.getLatLngs().forEach(point=>bounds.push(point));
          if(index===0)L.circleMarker([segment[0].lat,segment[0].lon],{radius:6,color:"#07131f",weight:2,fillColor:"#5bd6c5",fillOpacity:1}).addTo(detailMap).bindPopup("Start des aufgezeichneten Abschnitts");
        });
        const last=routeSegments[routeSegments.length-1].at(-1);
        L.circleMarker([last.lat,last.lon],{radius:6,color:"#07131f",weight:2,fillColor:"#d9b879",fillOpacity:1}).addTo(detailMap).bindPopup("Ende des aufgezeichneten Abschnitts");
        if(bounds.length)detailMap.fitBounds(bounds,{padding:[20,20]});
      }else if(!detailMap){
        renderOfflineRoute("detailMap",r.points);
      }else{
        $("detailMap").innerHTML='<div class="empty-state">Für diese Fahrt liegen keine ausreichend zusammenhängenden GPS-Abschnitte vor.</div>';
      }
      renderElevation(r.points);
      renderSpeedProfile(r.points);
      if(navigator.onLine&&!window.L)ensureLeaflet().then(restoreOnlineMaps);
    },180);
    $("exportGpx").onclick=()=>exportGPX(r);
    $("deleteRide").onclick=async()=>{if(confirm("Diese Tour dauerhaft löschen?")){await dbRequest("readwrite","delete",r.id);showToast("Tour gelöscht.");setPage("rides");}};
  }
  function metric(label,value){return '<article class="metric-card"><span>'+label+'</span><strong>'+value+'</strong></article>';}
  function renderElevation(points){
    const box=$("elevationChart"),profile=buildElevationProfile(points);
    const samples=profile.samples;
    if(samples.length<2){
      box.innerHTML='<div class="empty-state">Nicht genügend verlässliche GPS-Höhenpunkte für ein Profil vorhanden.</div>';
      return;
    }
    const elevationRange=samples.reduce((range,p)=>({min:Math.min(range.min,p.elevationM),max:Math.max(range.max,p.elevationM)}),{min:Infinity,max:-Infinity}),min=elevationRange.min,max=elevationRange.max;
    const padding=Math.max(4,(max-min)*0.08);
    const yMin=Math.floor((min-padding)/5)*5,yMax=Math.ceil((max+padding)/5)*5,yRange=Math.max(10,yMax-yMin);
    const xMax=Math.max(1,profile.distanceM,samples[samples.length-1].distanceM);
    const left=54,top=12,width=570,height=132,bottom=top+height;
    const xFor=value=>left+(value/xMax)*width;
    const yFor=value=>top+((yMax-value)/yRange)*height;
    const stride=Math.max(1,Math.ceil(samples.length/280)),chartSamples=[];
    for(let i=0;i<samples.length;i++){
      if(i===0||i===samples.length-1||i%stride===0||samples[i].segment!==samples[i-1]?.segment)chartSamples.push(samples[i]);
    }
    const groups=[];let group=[],lastSegment=null;
    chartSamples.forEach(sample=>{
      if(sample.segment!==lastSegment){if(group.length)groups.push(group);group=[sample];lastSegment=sample.segment;}
      else group.push(sample);
    });
    if(group.length)groups.push(group);
    const grid=[];
    for(let i=0;i<=4;i++){
      const value=yMax-(yRange*i/4),y=top+(height*i/4);
      grid.push('<line class="grid-line" x1="'+left+'" y1="'+y+'" x2="'+(left+width)+'" y2="'+y+'"/><text class="axis-label" x="'+(left-9)+'" y="'+(y+4)+'" text-anchor="end">'+Math.round(value)+'</text>');
    }
    const paths=groups.map(group=>{
      if(group.length<2)return '';
      const coords=group.map(p=>xFor(p.distanceM)+','+yFor(p.elevationM)).join(' ');
      return '<polyline class="profile-line" points="'+coords+'"/>';
    }).join('');
    const first=samples[0],last=samples[samples.length-1];
    const firstX=xFor(first.distanceM),firstY=yFor(first.elevationM),lastX=xFor(last.distanceM),lastY=yFor(last.elevationM);
    const xLabels='<text class="axis-label" x="'+left+'" y="166" text-anchor="start">0 km</text><text class="axis-label" x="'+(left+width/2)+'" y="166" text-anchor="middle">'+fmt(xMax/2000,1)+' km</text><text class="axis-label" x="'+(left+width)+'" y="166" text-anchor="end">'+fmt(xMax/1000,1)+' km</text>';
    const endpoints='<line class="route-endpoint" x1="'+left+'" y1="'+top+'" x2="'+left+'" y2="'+bottom+'"/><line class="route-endpoint" x1="'+(left+width)+'" y1="'+top+'" x2="'+(left+width)+'" y2="'+bottom+'"/><text class="endpoint-label" x="'+(left+5)+'" y="'+(top+11)+'" text-anchor="start">Start</text><text class="endpoint-label" x="'+(left+width-5)+'" y="'+(top+11)+'" text-anchor="end">Ziel</text>';
    const sampleMarkers='<circle class="profile-marker" cx="'+firstX+'" cy="'+firstY+'" r="4"/><circle class="profile-marker" cx="'+lastX+'" cy="'+lastY+'" r="4"/>';
    box.innerHTML='<div class="elevation-summary"><span class="elevation-stat">Aufstieg <strong>+'+Math.round(profile.gain)+' m</strong></span><span class="elevation-stat">Abstieg <strong>−'+Math.round(profile.loss)+' m</strong></span></div><svg class="elevation-chart" viewBox="0 0 640 184" role="img" aria-label="Höhenprofil mit '+samples.length+' gültigen GPS-Höhenpunkten"><text class="axis-title" x="8" y="12">Höhe (m)</text>'+grid.join('')+'<line class="axis-line" x1="'+left+'" y1="'+bottom+'" x2="'+(left+width)+'" y2="'+bottom+'"/>'+endpoints+paths+sampleMarkers+xLabels+'</svg><p class="elevation-footnote">GPS-Höhenpunkte: '+profile.validCount+' von '+profile.totalCount+'. Die gestrichelten Linien markieren Tourstart und -ende; die Höhenlinie beginnt bzw. endet erst am ersten bzw. letzten verlässlichen Höhenmesspunkt. Ein Medianfilter über bis zu fünf benachbarte Messungen dämpft Ausreißer; Änderungen unter 4 m werden nicht zur Summe addiert.</p>';
  }
  function renderSpeedProfile(points){
    const box=$("speedChart"),intervals=getMovingIntervals({points}),groups=[];
    let distance=0,current=[],previousTo=null,gapCount=0;
    intervals.forEach(item=>{
      const startDistance=distance;
      distance+=item.distanceM;
      const sample={distance:startDistance+item.distanceM,speed:item.speedKmh};
      if(previousTo!==item.from){
        if(current.length)groups.push(current);
        if(previousTo)gapCount++;
        current=[];
      }
      current.push(sample);
      previousTo=item.to;
    });
    if(current.length)groups.push(current);
    const count=groups.reduce((sum,group)=>sum+group.length,0);
    if(count<3){
      box.innerHTML='<div class="empty-state">Nicht genügend verlässliche GPS-Punkte für ein Geschwindigkeitsprofil vorhanden.</div>';
      return;
    }
    const filteredGroups=groups.map(group=>group.map((sample,index)=>{
      const values=group.slice(Math.max(0,index-2),Math.min(group.length,index+3)).map(x=>x.speed).sort((a,b)=>a-b);
      return {...sample,speed:values[Math.floor(values.length/2)]};
    }));
    const all=filteredGroups.flat(),maxSpeed=Math.max(10,Math.ceil(Math.max(...all.map(x=>x.speed))/5)*5);
    const left=48,top=14,width=576,height=132,bottom=top+height,xMax=Math.max(1,distance);
    const x=v=>left+v/xMax*width,y=v=>top+(maxSpeed-v)/maxSpeed*height;
    const grid=[];
    for(let i=0;i<=4;i++){
      const value=maxSpeed*(1-i/4),yy=top+height*i/4;
      grid.push('<line class="grid-line" x1="'+left+'" y1="'+yy+'" x2="'+(left+width)+'" y2="'+yy+'"/><text class="axis-label" x="'+(left-8)+'" y="'+(yy+4)+'" text-anchor="end">'+Math.round(value)+'</text>');
    }
    const paths=filteredGroups.filter(group=>group.length>1).map(group=>{
      const stride=Math.max(1,Math.ceil(group.length/280)),plot=group.filter((sample,index)=>index===0||index===group.length-1||index%stride===0);
      return '<polyline class="profile-line" points="'+plot.map(p=>x(p.distance)+','+y(p.speed)).join(' ')+'"/>';
    }).join('');
    const avg=intervals.reduce((sum,item)=>sum+item.speedKmh*item.durationS,0)/Math.max(1,intervals.reduce((sum,item)=>sum+item.durationS,0));
    const peak=Math.max(...all.map(p=>p.speed));
    box.innerHTML='<div class="elevation-summary"><span class="elevation-stat">Ø GPS-Tempo <strong>'+fmt(avg)+' km/h</strong></span><span class="elevation-stat">Spitze <strong>'+fmt(peak)+' km/h</strong></span></div><svg class="elevation-chart" viewBox="0 0 640 184" role="img" aria-label="Geschwindigkeitsprofil über die Strecke, GPS-Lücken getrennt dargestellt"><text class="axis-title" x="8" y="12">km/h</text>'+grid.join('')+'<line class="axis-line" x1="'+left+'" y1="'+bottom+'" x2="'+(left+width)+'" y2="'+bottom+'"/>'+paths+'<text class="axis-label" x="'+left+'" y="166" text-anchor="start">0 km</text><text class="axis-label" x="'+(left+width/2)+'" y="166" text-anchor="middle">'+fmt(xMax/2000,1)+' km</text><text class="axis-label" x="'+(left+width)+'" y="166" text-anchor="end">'+fmt(xMax/1000,1)+' km</text></svg><p class="elevation-footnote">'+count+' gültige GPS-Bewegungsintervalle in '+groups.length+' zusammenhängenden Abschnitt(en). '+gapCount+' GPS-Lücke(n) werden nicht mit Linien überbrückt.</p>';
  }
  function exportGPX(r){
    const pts=Array.isArray(r.points)?r.points:[],segments=validRouteSegments(pts,true);
    if(!segments.length){showToast("Keine gültigen GPS-Punkte zum Export vorhanden.");return;}
    const esc=s=>String(s).replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]));
    const trk=segments.map(segment=>'<trkseg>'+segment.map(p=>'<trkpt lat="'+p.lat+'" lon="'+p.lon+'">'+(Number.isFinite(p.alt)?'<ele>'+p.alt+'</ele>':'')+'<time>'+new Date(p.t).toISOString()+'</time></trkpt>').join("")+'</trkseg>').join("");
    downloadFile("velox-"+r.id+".gpx",'<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="VELOX" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>'+esc(r.name||"VELOX Tour")+'</name>'+trk+'</trk></gpx>',"application/gpx+xml");
  }
  function downloadFile(name,content,type){
    const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function exportBackup(){
    const rides=await allRides();downloadFile("velox-backup-"+new Date().toISOString().slice(0,10)+".json",JSON.stringify({app:"VELOX",version:1,exportedAt:new Date().toISOString(),rides},null,2),"application/json");showToast("Sicherung erstellt.");
  }
  function validImportedRide(ride){
    const optionalFinite=value=>value===undefined||value===null||Number.isFinite(value);
    return ride&&typeof ride==="object"&&ride.id!==undefined&&ride.id!==null&&String(ride.id).trim()!==""&&
      Number.isFinite(ride.startedAt)&&optionalFinite(ride.endedAt)&&optionalFinite(ride.pausedMs)&&optionalFinite(ride.pauseStarted)&&
      Array.isArray(ride.points)&&ride.points.every(point=>point&&Number.isFinite(point.lat)&&point.lat>=-90&&point.lat<=90&&
        Number.isFinite(point.lon)&&point.lon>=-180&&point.lon<=180&&Number.isFinite(point.t)&&
        ["alt","altAccuracy","pressureKPa","accuracy"].every(key=>optionalFinite(point[key])));
  }
  async function importBackup(file){
    try{
      const data=JSON.parse(await file.text());
      if(data.app!=="VELOX"||!Array.isArray(data.rides))throw new Error("Ungültige VELOX-Sicherung");
      if(data.version!==1)throw new Error("Nicht unterstützte VELOX-Sicherungsversion");
      const existing=await allRides(),usedIds=new Set(existing.map(ride=>String(ride.id)));
      const imported=[];let remapped=0,skipped=0;
      data.rides.forEach((source,index)=>{
        if(!validImportedRide(source)){skipped++;return;}
        const originalId=String(source.id);let id=originalId;
        if(usedIds.has(id)){
          const base=originalId+"-import-"+Date.now()+"-"+index;
          id=base;let suffix=1;
          while(usedIds.has(id))id=base+"-"+suffix++;
          remapped++;
        }
        usedIds.add(id);
        const ride={...source,id,points:source.points.map(point=>({...point}))};
        if(id!==originalId)ride.importedFromId=originalId;
        imported.push(ride);
      });
      await dbAddMany(imported);
      await refresh();
      const parts=[imported.length+" Tour(en) hinzugefügt."];
      if(remapped)parts.push(remapped+" doppelte ID(s) angepasst");
      if(skipped)parts.push(skipped+" ungültige Tour(en) übersprungen");
      showToast(parts.join(" "));
    }catch(e){
      console.error(e);showToast("Import fehlgeschlagen. Vorhandene Touren wurden nicht überschrieben.");
    }
  }
  $("mapDateFilter")?.addEventListener("change",()=>{
    renderMapRideFilters(selectedMapRides());updatePersonalMapLayers();
  });
  $("mapFit")?.addEventListener("click",fitPersonalMap);
  $("mapHeatToggle")?.addEventListener("click",()=>{
    personalHeatVisible=!personalHeatVisible;updatePersonalMapLayers();
  });
  $("startRide").addEventListener("click",startRide);
  $("trackStartRide")?.addEventListener("click",startRide);
  document.addEventListener("visibilitychange",()=>{
    if(activeRide){
      if(document.visibilityState==="hidden")persistActiveRide().catch(error=>console.error("Checkpoint fehlgeschlagen:",error));
      else{updateLive(false);scheduleLiveClock();}
    }
  });
  window.addEventListener("pagehide",()=>{
    if(activeRide)persistActiveRide().catch(error=>console.error("Letzter Checkpoint fehlgeschlagen:",error));
  });
  $("pauseRide").addEventListener("click",pauseRide);
  $("stopRide").addEventListener("click",stopRide);
  $("exportBackup").addEventListener("click",exportBackup);
  $("importBackup").addEventListener("click",()=>$("backupFile").click());
  $("backupFile").addEventListener("change",e=>{if(e.target.files[0])importBackup(e.target.files[0]);e.target.value="";});
  $("deleteAll").addEventListener("click",async()=>{if(confirm("Wirklich alle VELOX-Touren auf diesem Gerät löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.")){await dbRequest("readwrite","clear");await refresh();showToast("Alle lokalen Tourdaten gelöscht.");}});
  $("installHint").addEventListener("click",()=>showToast('Safari: Teilen → „Zum Home-Bildschirm“ hinzufügen.'));
  async function recoverUnfinishedRide(){
    const rides=await allRides();
    const unfinished=rides.find(ride=>!ride.endedAt&&(ride.status==="recording"||ride.status==="paused"));
    if(!unfinished)return;
    const now=Date.now(),lastPoint=unfinished.points?.length?unfinished.points[unfinished.points.length-1].t:unfinished.startedAt;
    if(!Array.isArray(unfinished.pauseIntervals))unfinished.pauseIntervals=[];
    if(unfinished.status==="recording"){
      const gapStart=Number.isFinite(lastPoint)?lastPoint:now;
      if(now>gapStart){unfinished.pausedMs=(unfinished.pausedMs||0)+(now-gapStart);unfinished.pauseIntervals.push({startedAt:gapStart,endedAt:now});}
    }else if(unfinished.pauseStarted&&now>unfinished.pauseStarted){
      unfinished.pausedMs=(unfinished.pausedMs||0)+(now-unfinished.pauseStarted);
      const openPause=unfinished.pauseIntervals[unfinished.pauseIntervals.length-1];
      if(openPause&&openPause.endedAt===null)openPause.endedAt=now;
    }
    unfinished.status="paused";unfinished.pauseStarted=now;activeRide=unfinished;
    await persistActiveRide();syncTrackStartButton();
    $("pauseRide").disabled=false;$("stopRide").disabled=false;$("pauseRide").textContent="Fortsetzen";
    $("trackingStatus").textContent="Unterbrochene Tour wiederhergestellt · pausiert";$("trackingDot").style.background="#d9b879";
    setPage("track");drawLive(activeRide.points);updateLive(true);
    showToast("Eine nicht abgeschlossene Tour wurde wiederhergestellt.");
  }
  async function init(){
    try{db=await openDB();await recoverUnfinishedRide();await refresh();}
    catch(e){showToast("Lokale Datenbank konnte nicht geöffnet werden.");console.error(e);}
    if("serviceWorker" in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
    if(window.L)liveMap=initMap("liveMap");
    else if(!navigator.onLine)renderOfflineRoute("liveMap",[]);
    window.addEventListener("online",()=>{
      if(activeRide&&$("trackingStatus"))$("trackingStatus").textContent="Verbindung wieder da · GPS-Aufzeichnung läuft lokal weiter";
      restoreOnlineMaps();
    });
    window.addEventListener("offline",()=>{
      if(activeRide&&$("trackingStatus"))$("trackingStatus").textContent="Offline · GPS-Aufzeichnung wird lokal gespeichert";
    });
    updateSensorStatus(null);
    syncTrackStartButton();
    if(window.VELOXSensors)window.VELOXSensors.subscribe(sample=>{if(activeRide&&activeRide.status==="recording")$("trackingStatus").textContent="Barometerdaten empfangen";});
  }
  init();
})();