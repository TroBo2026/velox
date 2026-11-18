/* VELOX 0.13.0 — separate local-first running and cycling profiles */
(() => {
  "use strict";
  if(!window.VELOXCore||!window.VELOXCharts){
    const toast=document.getElementById("toast");
    if(toast){toast.textContent="VELOX konnte nicht vollständig geladen werden. Bitte die Seite neu laden.";toast.classList.add("show");}
    return;
  }
  const DB_NAME = "velox-local";
  const DB_VERSION = 1;
  const STORE = "rides";
  const APP_VERSION = "0.13.0";
  const Core = window.VELOXCore;
  const Charts = window.VELOXCharts;
  const $ = (id) => document.getElementById(id);
  let db;
  let currentPage = "home";
  const PROFILE_STORAGE_KEY = "velox-active-profile";
  let activeProfile = null;
  let selectedActivityType = "cycling";
  let stepMotionListener = null;
  let stepDetector = null;
  let stepSaveAt = 0;
  const PROFILE_HEIGHT_KEY = "velox-profile-height-cm";
  const PROFILE_HEIGHT_SKIP_KEY = "velox-profile-height-skipped";
  let activeRide = null;
  let watchId = null;
  let timerId = null;
  let liveMetricsCache = null;
  let liveMetricsRideId = null;
  let liveCalcAt = 0;
  let liveDirty = false;
  let liveDrawAt = 0;
  let liveMap = null;
  let liveLines = [];
  let liveMarker = null;
  let followLive = true;
  let detailMap = null;
  let detailHoverMarker = null;
  let detailRows = [];
  let lastDetailRide = null;
  let leafletLoadPromise = null;
  let personalMap = null;
  let personalLines = new Map();
  let personalRidesCache = [];
  let personalHeatLayer = null;
  let personalHeatVisible = false;
  let personalMapLoadSequence = 0;
  let refreshSequence = 0;
  const personalVisibility = new Map();
  const mapColors = ["#5bd6c5","#e7bd75","#8ca8ff","#d98ce8","#ff8e80","#8fd18b","#f0a75b","#7bd1e8"];
  let toastTimer = null;
  let saveQueue = Promise.resolve();
  let wakeLock = null;
  let pointsSincePersist = 0;
  let lastPersistAt = 0;
  const calcCache = new Map();
  let dopplerSeen = false;

  const fmt = (n, digits=1) => Number(n || 0).toLocaleString("de-DE",{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const fmtTime = (seconds) => {
    const s=Math.max(0,Math.floor(seconds||0)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),r=s%60;
    return [h,m,r].map(v=>String(v).padStart(2,"0")).join(":");
  };
  const isRunning = ride => ride?.activityType === "running";
  function formatPaceSeconds(seconds){
    if(!Number.isFinite(seconds)||seconds<=0)return "–";
    const total=Math.max(1,Math.round(seconds));
    return Math.floor(total/60)+":"+String(total%60).padStart(2,"0");
  }
  function formatPace(speedKmh){
    return Number.isFinite(speedKmh)&&speedKmh>0?formatPaceSeconds(3600/speedKmh):"–";
  }
  function getProfileHeight(){
    try{const value=Number(localStorage.getItem(PROFILE_HEIGHT_KEY));return Number.isFinite(value)&&value>=100&&value<=230?value:null;}catch{return null;}
  }
  function updateProfileHeightLabel(){const el=$("profileHeightValue");if(el)el.textContent=getProfileHeight()===null?"Noch nicht hinterlegt":getProfileHeight()+" cm";}
  async function ensureRunningProfile(){
    const existing=getProfileHeight();if(existing!==null)return existing;
    try{if(localStorage.getItem(PROFILE_HEIGHT_SKIP_KEY)==="1")return null;}catch{}
    const result=await openSheet({title:"Dein Laufprofil",body:'<p>Deine Körpergröße hilft VELOX, die durchschnittliche Schrittlänge zu schätzen. Die Angabe bleibt lokal auf diesem Gerät und ist freiwillig.</p><label class="vx-field">Körpergröße in Zentimetern<input name="heightCm" type="number" inputmode="numeric" min="100" max="230" step="1" placeholder="z. B. 170"></label>',actions:[{id:"save",label:"Speichern",primary:true},{id:"skip",label:"Ohne Angabe fortfahren",skip:true}]});
    if(result.action!=="save"){try{localStorage.setItem(PROFILE_HEIGHT_SKIP_KEY,"1");}catch{}return null;}
    const value=Number(result.values.heightCm);
    if(!Number.isFinite(value)||value<100||value>230){showToast("Bitte eine Körpergröße zwischen 100 und 230 cm eingeben.");return null;}
    try{localStorage.setItem(PROFILE_HEIGHT_KEY,String(Math.round(value)));localStorage.removeItem(PROFILE_HEIGHT_SKIP_KEY);}catch{}
    updateProfileHeightLabel();return Math.round(value);
  }
  async function requestStepMotionPermission(){
    if(!window.DeviceMotionEvent)return false;
    const request=window.DeviceMotionEvent.requestPermission;
    if(typeof request==="function"){try{return await request.call(window.DeviceMotionEvent)==="granted";}catch{return false;}}
    return true;
  }
  function stopStepCounter(){
    if(stepMotionListener){window.removeEventListener("devicemotion",stepMotionListener,true);stepMotionListener=null;}
    stepDetector=null;
  }
  function startStepCounter(){
    if(!activeRide||!isRunning(activeRide)||activeRide.stepCountSource!=="device-motion"||!window.VELOXSteps||!window.DeviceMotionEvent)return false;
    stopStepCounter();stepDetector=new window.VELOXSteps.Detector();
    stepMotionListener=event=>{
      if(!activeRide||activeRide.status!=="recording"||!stepDetector)return;
      if(stepDetector.process(event)>0){
        activeRide.steps=(Number(activeRide.steps)||0)+1;
        updateLive(false);
        if(activeRide.steps%10===0&&Date.now()-stepSaveAt>1500){stepSaveAt=Date.now();persistActiveRide().catch(error=>console.warn("Schrittstand konnte nicht gespeichert werden:",error));}
      }
    };
    window.addEventListener("devicemotion",stepMotionListener,true);
    return true;
  }

  function normalizeProfile(value){return value==="running"||value==="cycling"?value:null;}
  function readSavedProfile(){
    try{return normalizeProfile(localStorage.getItem(PROFILE_STORAGE_KEY));}catch{return null;}
  }
  function profileRides(rides,profile=activeProfile){
    if(profile==="running")return rides.filter(isRunning);
    if(profile==="cycling")return rides.filter(ride=>!isRunning(ride)); // ältere Datensätze ohne activityType bleiben Fahrradtouren
    return rides;
  }
  function selectProfile(type){
    const profile=normalizeProfile(type);if(!profile)return;
    if(activeRide&&profile!==activeProfile){showToast("Während einer laufenden Aktivität kann das Profil nicht gewechselt werden.");return;}
    activeProfile=profile;selectedActivityType=profile;
    try{localStorage.setItem(PROFILE_STORAGE_KEY,profile);}catch{showToast("Profil gilt bis zum Schließen der App; lokales Speichern ist nicht verfügbar.");}
    window.dispatchEvent(new CustomEvent("velox:profilechange",{detail:{profile}}));
    syncTrackStartButton();
    setPage(profile+"-dashboard");
  }
  function updateProfileContext(){
    const running=activeProfile==="running";
    const label=running?"Laufprofil":"Fahrradprofil";
    [["ridesProfileEyebrow",running?"LAUFARCHIV":"FAHRRADARCHIV"],["ridesProfileTitle",running?"Deine Läufe":"Deine Fahrradtouren"],["statsProfileEyebrow",running?"LAUFANALYSE":"FAHRRADANALYSE"],["statsProfileTitle",running?"Laufstatistiken":"Fahrradstatistiken"],["wrappedProfileEyebrow",running?"DEIN LAUF-WRAPPED":"DEIN FAHRRAD-WRAPPED"],["wrappedProfileTitle",running?"Lauf-Wrapped":"Fahrrad-Wrapped"]].forEach(([id,value])=>{const el=$(id);if(el)el.textContent=value;});
    document.querySelectorAll("[data-profile-context]").forEach(el=>{el.textContent=label;});
  }
  const haversine = Core.haversine;
  const validRidePoint = Core.validPoint;
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  const showToast = (msg) => {
    const el=$("toast");el.textContent=msg;el.classList.add("show");
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),3200);
  };
  function lastValid(points){
    for(let i=points.length-1;i>=0;i--)if(validRidePoint(points[i]))return points[i];
    return null;
  }

  /* ---------- Dialoge (ersetzen prompt/confirm/alert) ---------- */
  function openSheet({title,body,actions}){
    return new Promise(resolve=>{
      const dlg=document.createElement("dialog");
      dlg.className="vx-sheet";
      dlg.innerHTML='<form method="dialog"><h3>'+escapeHtml(title)+'</h3><div class="vx-sheet-body">'+body+'</div><div class="vx-sheet-actions">'+
        actions.map(a=>'<button type="submit" value="'+a.id+'" class="'+(a.primary?"primary-button":"secondary-button")+'"'+(a.skip?" formnovalidate":"")+'>'+escapeHtml(a.label)+'</button>').join("")+'</div></form>';
      document.body.appendChild(dlg);
      dlg.addEventListener("close",()=>{
        const values={};
        try{new FormData(dlg.querySelector("form")).forEach((v,k)=>{values[k]=v;});}catch{}
        const action=dlg.returnValue||"cancel";
        dlg.remove();resolve({action,values});
      });
      if(typeof dlg.showModal==="function")dlg.showModal();else dlg.setAttribute("open","");
    });
  }

  /* ---------- Datenbank ---------- */
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

  /* ---------- Berechnung: dünner Wrapper um den gemeinsamen Kern (ride-core.js) ---------- */
  function speedZoneStats(intervals,activityType){
    const zones=activityType==="running"
      ?[{key:"slow",label:"Unter 8 km/h",seconds:0},{key:"medium",label:"8–12 km/h",seconds:0},{key:"fast",label:"Über 12 km/h",seconds:0}]
      :[{key:"slow",label:"Unter 15 km/h",seconds:0},{key:"medium",label:"15–25 km/h",seconds:0},{key:"fast",label:"Über 25 km/h",seconds:0}];
    intervals.forEach(item=>{
      const zone=activityType==="running"
        ?(item.speedKmh<8?zones[0]:item.speedKmh<=12?zones[1]:zones[2])
        :(item.speedKmh<15?zones[0]:item.speedKmh<=25?zones[1]:zones[2]);
      zone.seconds+=item.durationS;
    });
    const total=zones.reduce((sum,zone)=>sum+zone.seconds,0);
    zones.forEach(zone=>zone.percent=total?zone.seconds/total*100:0);return zones;
  }
  function computeRide(ride){
    const c=Core.calcRide(ride,{
      elapsedSeconds:activeSeconds(ride),
      pauses:(Array.isArray(ride.pauseIntervals)?ride.pauseIntervals:[]).map(p=>({start:p&&p.startedAt,end:p&&p.endedAt}))
    });
    c.speedZones=speedZoneStats(c.intervals,ride.activityType);
    c.movingRatio=c.movingRatio===null?0:c.movingRatio*100;
    c.medianSpeed=c.medianSpeed||0;
    const t=c.gradeTerrain,total=c.gradeDistanceM;
    c.gradeDistribution=[{key:"uphill",label:"Anstieg",distanceM:t.uphill},{key:"flat",label:"Flach",distanceM:t.flat},{key:"downhill",label:"Gefälle",distanceM:t.downhill}]
      .map(item=>({...item,percent:total?item.distanceM/total*100:0}));
    c.vam=c.climbPerHour||0;
    return c;
  }
  function calcRide(ride){
    if(ride===activeRide)return computeRide(ride);
    const key=[ride.points.length,ride.endedAt,ride.pausedMs,ride.status].join("|"),hit=calcCache.get(ride.id);
    if(hit&&hit.key===key)return hit.value;
    const value=computeRide(ride);
    if(calcCache.size>400)calcCache.clear();
    calcCache.set(ride.id,{key,value});
    return value;
  }
  function currentGrade(c){
    const items=c.gradeSeries;
    if(!items.length)return null;
    const last=items[items.length-1];
    return Date.now()-last.time>90000?null:last.grade;
  }

  /* ---------- Wrapped ---------- */
  function wrappedDate(ride){return new Date(ride.startedAt).toLocaleDateString("de-DE",{day:"2-digit",month:"long",year:"numeric"});}
  function wrappedRecord(label,entry,value){
    if(!entry)return "";
    return '<article class="wrapped-record"><span>'+label+'</span><strong>'+value+'</strong><small>'+escapeHtml(entry.ride.name||(isRunning(entry.ride)?"Laufrunde":"Fahrradtour"))+'</small><small>'+wrappedDate(entry.ride)+'</small></article>';
  }
  function wrappedBar(label,percent,value,key){
    const width=Math.max(0,Math.min(100,Number(percent)||0));
    return '<div class="wrapped-bar-row"><div><span>'+label+'</span><strong>'+value+'</strong></div><div class="wrapped-bar-track"><i class="wrapped-bar-'+key+'" style="width:'+width.toFixed(2)+'%"></i></div></div>';
  }
  function metric(label,value){return '<article class="metric-card"><span>'+label+'</span><strong>'+value+'</strong></article>';}
  function renderRideBreakdowns(c){
    const terrain=c.gradeSamples?(c.gradeDistribution||[]).map(x=>wrappedBar(x.label,x.percent,fmt(x.distanceM/1000,2)+" km",x.key)).join(""):"";
    const speed=c.movingSeconds?(c.speedZones||[]).map(x=>wrappedBar(x.label,x.percent,fmtTime(x.seconds),x.key)).join(""):"";
    return '<div class="panel wrapped-breakdown"><span class="eyebrow">GELÄNDE</span><h3>Steigungsverteilung</h3>'+
      (terrain||'<p class="small-note">Keine auswertbaren GPS-Höhenabschnitte.</p>')+
      '<p class="small-note">Anstieg ab +1,5 %, Gefälle unter −1,5 %; Steigung über mindestens 50 m Strecke aus geglätteten Höhenwerten.</p>'+
      '<span class="eyebrow">TEMPO & PACE</span><h3>Geschwindigkeitszonen</h3>'+
      (speed||'<p class="small-note">Keine gültigen Bewegungsintervalle.</p>')+
      '<p class="small-note">Zeitanteile aus den gleichen GPS-Intervallen wie Distanz und Bewegungszeit.</p></div>';
  }
  function renderWrapped(rides){
    const host=$("wrappedContent");if(!host)return;
    if(!rides.length){host.innerHTML='<div class="empty-state">Noch keine gespeicherten Aktivitäten. Nach deiner ersten Aktivität erstellt VELOX hier automatisch deinen persönlichen Wrapped-Rückblick.</div>';return;}
    const entries=rides.map(ride=>({ride,calc:calcRide(ride)}));
    const totals=entries.reduce((sum,item)=>({distanceM:sum.distanceM+item.calc.distanceM,movingSeconds:sum.movingSeconds+item.calc.movingSeconds,gain:sum.gain+item.calc.elevationGain,loss:sum.loss+item.calc.elevationLoss}),{distanceM:0,movingSeconds:0,gain:0,loss:0});
    const terrain={uphill:0,flat:0,downhill:0},speed=[0,0,0];
    entries.forEach(({calc})=>{(calc.gradeDistribution||[]).forEach(x=>terrain[x.key]+=x.distanceM);(calc.speedZones||[]).forEach((x,i)=>speed[i]+=x.seconds);});
    const terrainTotal=terrain.uphill+terrain.flat+terrain.downhill,movingHours=totals.movingSeconds/3600;
    const cyclingEntries=entries.filter(x=>!isRunning(x.ride)),runningEntries=entries.filter(x=>isRunning(x.ride));
    const avgFor=list=>{const seconds=list.reduce((sum,x)=>sum+x.calc.movingSeconds,0),distance=list.reduce((sum,x)=>sum+x.calc.distanceM,0);return seconds?distance/seconds*3.6:0;};
    const cyclingAvg=avgFor(cyclingEntries),runningAvg=avgFor(runningEntries),speedTotal=speed.reduce((sum,x)=>sum+x,0);
    const avgSpeedLabel=cyclingAvg?fmt(cyclingAvg)+" km/h":"–",avgPaceLabel=runningAvg?formatPace(runningAvg)+" min/km":"–";
    const avgLabels=[cyclingEntries.length?"Rad Ø "+avgSpeedLabel:null,runningEntries.length?"Lauf Ø "+avgPaceLabel:null].filter(Boolean).join(" · ")||"Noch keine Bewegungsdaten";
    const vamEntries=entries.filter(x=>x.calc.gradeSamples>0&&x.calc.movingSeconds>0);
    const vamMovingSeconds=vamEntries.reduce((sum,x)=>sum+x.calc.movingSeconds,0);
    const vamGain=vamEntries.reduce((sum,x)=>sum+x.calc.elevationGain,0);
    const pick=(get,valid=()=>true)=>entries.filter(x=>valid(x.calc)).reduce((best,x)=>!best||get(x.calc)>get(best.calc)?x:best,null);
    const longest=pick(c=>c.distanceM,c=>c.distanceM>0),mostClimb=pick(c=>c.elevationGain,c=>c.elevationProfile.validCount>=2);
    const fastestAvg=cyclingEntries.filter(x=>x.calc.movingSeconds>0).reduce((best,x)=>!best||x.calc.averageSpeed>best.calc.averageSpeed?x:best,null);
    const fastestRunAvg=runningEntries.filter(x=>x.calc.movingSeconds>0).reduce((best,x)=>!best||x.calc.averageSpeed>best.calc.averageSpeed?x:best,null);
    const topSpeedBike=cyclingEntries.filter(x=>x.calc.maxSpeed>0).reduce((best,x)=>!best||x.calc.maxSpeed>best.calc.maxSpeed?x:best,null);
    const topSpeedRun=runningEntries.filter(x=>x.calc.maxSpeed>0).reduce((best,x)=>!best||x.calc.maxSpeed>best.calc.maxSpeed?x:best,null);
    const longestTime=pick(c=>c.movingSeconds,c=>c.movingSeconds>0),highPoint=pick(c=>c.elevationMax,c=>c.elevationMax!==null);
    const bestVam=pick(c=>c.vam,c=>c.movingSeconds>0&&c.elevationGain>0);
    const climb=entries.filter(x=>x.calc.longestClimb).reduce((best,x)=>!best||x.calc.longestClimb.distanceM>best.calc.longestClimb.distanceM?x:best,null);
    const fastestKm=entries.filter(x=>x.calc.fastestKilometerSeconds!==null).reduce((best,x)=>!best||x.calc.fastestKilometerSeconds<best.calc.fastestKilometerSeconds?x:best,null);
    const onlyRunning=entries.every(x=>isRunning(x.ride));
    const records=[
      wrappedRecord(onlyRunning?"Längster Lauf":"Längste Fahrradtour",longest,fmt((longest?.calc.distanceM||0)/1000,2)+" km"),
      wrappedRecord("Meiste Höhenmeter bei einer Aktivität",mostClimb,"+"+Math.round(mostClimb?.calc.elevationGain||0)+" m"),
      wrappedRecord("Längster zusammenhängender Anstieg",climb,climb?fmt(climb.calc.longestClimb.distanceM/1000,2)+" km · +"+Math.round(climb.calc.longestClimb.gainM)+" m · "+fmt(climb.calc.longestClimb.averageGrade)+" %":""),
      ...(onlyRunning?[
        wrappedRecord("Schnellste Ø-Laufpace",fastestRunAvg,fastestRunAvg?formatPace(fastestRunAvg.calc.averageSpeed)+" min/km":""),
        wrappedRecord("Schnellste GPS-Pace",topSpeedRun,topSpeedRun?formatPace(topSpeedRun.calc.maxSpeed)+" min/km":"")
      ]:[
        wrappedRecord("Höchste Ø-Radfahrgeschwindigkeit",fastestAvg,fastestAvg?fmt(fastestAvg.calc.averageSpeed)+" km/h":""),
        wrappedRecord("Höchste GPS-Geschwindigkeit",topSpeedBike,topSpeedBike?fmt(topSpeedBike.calc.maxSpeed)+" km/h":"")
      ]),
      wrappedRecord("Längste Bewegungszeit",longestTime,fmtTime(longestTime?.calc.movingSeconds||0)),
      wrappedRecord("Höchster aufgezeichneter Punkt",highPoint,highPoint?Math.round(highPoint.calc.elevationMax)+" m":""),
      wrappedRecord("Schnellster voller Kilometer",fastestKm,fastestKm?fmtTime(fastestKm.calc.fastestKilometerSeconds):""),
      wrappedRecord("Höhengewinn je Bewegungsstunde",bestVam,Math.round(bestVam?.calc.vam||0)+" m/h")
    ].filter(Boolean).join("");
    const terrainBars=terrainTotal?[
      wrappedBar("Anstieg",terrain.uphill/terrainTotal*100,fmt(terrain.uphill/1000,1)+" km","uphill"),
      wrappedBar("Flach",terrain.flat/terrainTotal*100,fmt(terrain.flat/1000,1)+" km","flat"),
      wrappedBar("Gefälle",terrain.downhill/terrainTotal*100,fmt(terrain.downhill/1000,1)+" km","downhill")
    ].join(""):'<p class="small-note">Keine auswertbaren GPS-Höhenabschnitte.</p>';
    const speedBars='<p class="small-note">Tempozonen werden in den einzelnen Aktivitäten sportartspezifisch ausgewertet. Im gemischten Gesamtarchiv werden deshalb keine unterschiedlichen Pace- und Geschwindigkeitsgrenzen zusammengerechnet.</p>';
    host.innerHTML='<section class="wrapped-hero"><span class="eyebrow">DEIN VELOX WRAPPED</span><h2>Deine Kilometer. Deine Höhenmeter. Deine Geschichte.</h2>'+
      '<p>Aus <strong>'+entries.length+' gespeicherten Aktivitäten</strong> ergibt sich dein persönlicher VELOX-Rückblick: <strong>'+fmt(totals.distanceM/1000,2)+' km</strong> ausgewertete Strecke, <strong>'+fmtTime(totals.movingSeconds)+'</strong> erkannte Bewegungszeit und <strong>'+Math.round(totals.gain).toLocaleString("de-DE")+' m</strong> kumulierter GPS-Höhengewinn. Die sportartspezifischen Durchschnittswerte: <strong>'+avgLabels+'</strong>.</p>'+
      '<div class="wrapped-story-grid"><div><span>Deine längste Aktivität</span><strong>'+(longest?fmt(longest.calc.distanceM/1000,2)+" km":"Noch keine auswertbare Strecke")+'</strong></div><div><span>Dein schnellster voller Kilometer</span><strong>'+(fastestKm?fmtTime(fastestKm.calc.fastestKilometerSeconds):"Noch nicht ermittelt")+'</strong></div><div><span>Dein längster Anstieg</span><strong>'+(climb?fmt(climb.calc.longestClimb.distanceM/1000,2)+" km · +"+Math.round(climb.calc.longestClimb.gainM)+" m":"Noch kein zusammenhängender Anstieg")+'</strong></div></div>'+
      '<p class="wrapped-hero-note">Jede Zahl entsteht neu aus deinem lokalen Aktivitätenarchiv. Tempo und Distanz nutzen akzeptierte GPS-Abschnitte; fehlende oder unplausible Messpunkte werden nicht künstlich ergänzt.</p></section>'+
      '<div class="metric-grid wrapped-kpis">'+metric("Gesamtdistanz",fmt(totals.distanceM/1000,2)+" km")+metric("Bewegungszeit",fmtTime(totals.movingSeconds))+metric("Aufstieg gesamt","+"+Math.round(totals.gain)+" m")+metric("Abstieg gesamt","−"+Math.round(totals.loss)+" m")+metric("Aktivitäten",String(entries.length))+metric("Ø Streckenlänge",fmt(totals.distanceM/1000/entries.length)+" km")+metric("Höhengewinn je Bewegungsstunde",vamMovingSeconds?Math.round(vamGain/(vamMovingSeconds/3600))+" m/h":"–")+(onlyRunning?metric("Ø Laufpace",avgPaceLabel):metric("Ø Radfahrgeschwindigkeit",avgSpeedLabel))+'</div>'+
      '<section class="panel wrapped-panel"><span class="eyebrow">DEINE BESTLEISTUNGEN</span><h3>Persönliche Rekorde</h3><div class="wrapped-record-grid">'+(records||'<p class="small-note">Noch keine Rekorde berechenbar.</p>')+'</div></section>'+
      '<section class="panel wrapped-panel"><span class="eyebrow">DEIN BEWEGUNGSPROFIL</span><h3>Gelände-Verteilung</h3>'+terrainBars+'<p class="wrapped-context">'+(terrainTotal?fmt(terrainTotal/1000,2)+' km auswertbare Steigungsabschnitte bilden die Grundlage dieser Verteilung.':'Für diese Verteilung liegen keine ausreichend verlässlichen Höhenabschnitte vor.')+'</p><h3>Tempo-Zonen</h3>'+speedBars+'<p class="wrapped-context">'+(speedTotal?fmtTime(speedTotal)+' erkannte Bewegungszeit bilden die Grundlage der Tempoanteile.':'Für die Tempoverteilung liegen keine gültigen Bewegungsintervalle vor.')+'</p><p class="wrapped-context">„Höhengewinn je Bewegungsstunde“ teilt den gesamten Aufstieg durch die Bewegungszeit (kein klassisches VAM, das nur Anstiege zählt) und nutzt nur Aktivitäten mit auswertbaren Steigungsdaten.</p></section>'+
      '<p class="wrapped-refresh-note">Dein Rückblick wird beim Öffnen und nach jeder gespeicherten oder importierten Aktivität frisch aus dem lokalen Archiv berechnet.</p>';
  }

  /* ---------- Navigation, Karten ---------- */
  function setPage(page){
    if(activeRide&&page!=="track"){showToast("Beende oder pausiere zuerst deine aktuelle Aktivität.");page="track";}
    if(page==="track"&&!activeRide&&!activeProfile){showToast("Wähle zuerst dein Lauf- oder Fahrradprofil.");page="home";}
    if(["rides","stats","wrapped","running-dashboard","cycling-dashboard"].includes(page)&&!activeProfile){
      if(page==="running-dashboard"||page==="cycling-dashboard")activeProfile=page==="running-dashboard"?"running":"cycling";
      else{showToast("Wähle zuerst ein Sportprofil aus.");page="home";}
    }
    if(page==="running-dashboard"&&activeProfile!=="running")page="home";
    if(page==="cycling-dashboard"&&activeProfile!=="cycling")page="home";
    currentPage=page;
    document.querySelectorAll(".page").forEach(el=>el.classList.toggle("active",el.id==="page-"+page));
    const navPage=["wrapped","running-dashboard","cycling-dashboard"].includes(page)?"home":page;
    document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("selected",el.dataset.page===navPage));
    if(["home","running-dashboard","cycling-dashboard","rides","stats","wrapped"].includes(page))refresh();
    if(page==="track"){syncTrackStartButton();ensureTrackMap();setTimeout(()=>{if(liveMap)liveMap.invalidateSize();},180);}
    if(page==="stats")setTimeout(()=>renderPersonalMap(),180);
    updateProfileContext();
    window.scrollTo({top:0,behavior:"instant"});
  }
  document.addEventListener("click",e=>{
    const profile=e.target.closest("[data-profile]");
    if(profile){e.preventDefault();selectProfile(profile.dataset.profile);return;}
    const profileStart=e.target.closest("[data-profile-start]");
    if(profileStart){e.preventDefault();const type=profileStart.dataset.profileStart;if(type===activeProfile){setPage("track");}return;}
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
    let minLat=Infinity,maxLat=-Infinity,minLon=Infinity,maxLon=-Infinity;
    all.forEach(p=>{minLat=Math.min(minLat,p.lat);maxLat=Math.max(maxLat,p.lat);minLon=Math.min(minLon,p.lon);maxLon=Math.max(maxLon,p.lon);});
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
    const a=project(all[0]),b=project(all[all.length-1]);
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
  function setFollow(value){
    followLive=!!value;
    const button=$("mapFollow");
    if(button){button.classList.toggle("active",followLive);button.setAttribute("aria-pressed",String(followLive));button.textContent=followLive?"Folgen: an":"Folgen: aus";}
  }
  function attachLiveMap(){
    if(liveMap&&!liveMap.__veloxFollow){liveMap.__veloxFollow=true;liveMap.on("dragstart",()=>setFollow(false));}
  }
  function drawLive(points,force=false){
    if(!navigator.onLine&&liveMap){liveMap.remove();liveMap=null;liveLines=[];liveMarker=null;}
    const now=Date.now(),redraw=force||now-liveDrawAt>=3000;
    if(!liveMap){if(redraw){liveDrawAt=now;renderOfflineRoute("liveMap",points);}return;}
    if(redraw){
      liveDrawAt=now;
      liveLines.forEach(line=>liveMap.removeLayer(line));
      liveLines=[];
      validRouteSegments(points).forEach(segment=>{
        const coords=segment.map(point=>[point.lat,point.lon]);
        if(coords.length>1)liveLines.push(L.polyline(coords,{color:"#5bd6c5",weight:5,opacity:.95,lineCap:"round",lineJoin:"round"}).addTo(liveMap));
      });
    }
    const last=lastValid(points);
    if(last){
      const coordinate=[last.lat,last.lon];
      if(liveMarker)liveMarker.setLatLng(coordinate);
      else liveMarker=L.circleMarker(coordinate,{radius:7,color:"#07131f",weight:3,fillColor:"#5bd6c5",fillOpacity:1}).addTo(liveMap);
      if(followLive)liveMap.setView(coordinate,Math.max(liveMap.getZoom(),15),{animate:false});
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
  async function ensureTrackMap(){
    const points=activeRide&&Array.isArray(activeRide.points)?activeRide.points:[];
    if(!navigator.onLine){if(!liveMap)renderOfflineRoute("liveMap",points);return;}
    const loaded=await ensureLeaflet();
    if(!loaded){if(!liveMap)renderOfflineRoute("liveMap",points);return;}
    if(!liveMap){
      const last=lastValid(points);
      liveMap=initMap("liveMap",last?[last.lat,last.lon]:[51.05,13.74]);
    }
    if(liveMap){attachLiveMap();liveLines=[];liveMarker=null;drawLive(points,true);setTimeout(()=>liveMap&&liveMap.invalidateSize(),100);}
  }
  function drawDetailMap(r){
    if(detailMap){detailMap.remove();detailMap=null;detailHoverMarker=null;}
    const routeSegments=validRouteSegments(r.points);
    const first=routeSegments[0]?.[0]||r.points.find(validRidePoint);
    detailMap=navigator.onLine&&window.L?initMap("detailMap",first?[first.lat,first.lon]:[51.05,13.74]):null;
    if(!detailMap)return false;
    if(routeSegments.length){
      const bounds=[];
      routeSegments.forEach((segment,index)=>{
        const line=L.polyline(segment.map(p=>[p.lat,p.lon]),{color:"#5bd6c5",weight:5,opacity:.95,lineCap:"round",lineJoin:"round"}).addTo(detailMap);
        line.getLatLngs().forEach(point=>bounds.push(point));
        if(index===0)L.circleMarker([segment[0].lat,segment[0].lon],{radius:6,color:"#07131f",weight:2,fillColor:"#5bd6c5",fillOpacity:1}).addTo(detailMap).bindPopup("Start des aufgezeichneten Abschnitts");
      });
      const last=routeSegments[routeSegments.length-1].at(-1);
      L.circleMarker([last.lat,last.lon],{radius:6,color:"#07131f",weight:2,fillColor:"#d9b879",fillOpacity:1}).addTo(detailMap).bindPopup("Ende des aufgezeichneten Abschnitts");
      if(bounds.length)detailMap.fitBounds(bounds,{padding:[20,20]});
    }else{
      $("detailMap").innerHTML='<div class="empty-state">Für diese Aktivität liegen keine ausreichend zusammenhängenden GPS-Abschnitte vor.</div>';
    }
    setTimeout(()=>detailMap&&detailMap.invalidateSize(),80);
    return true;
  }
  async function restoreOnlineMaps(){
    if(!navigator.onLine)return;
    if(currentPage==="track")await ensureTrackMap();
    if(currentPage==="detail"&&lastDetailRide&&window.L)drawDetailMap(lastDetailRide);
  }
  function setDetailHover(x){
    if(!detailMap||!window.L)return;
    if(x===null||!detailRows.length){if(detailHoverMarker){detailMap.removeLayer(detailHoverMarker);detailHoverMarker=null;}return;}
    const row=detailRows[Charts.nearestIndex(detailRows,x)];
    if(!row||!Number.isFinite(row.lat)||!Number.isFinite(row.lon))return;
    if(detailHoverMarker)detailHoverMarker.setLatLng([row.lat,row.lon]);
    else detailHoverMarker=L.circleMarker([row.lat,row.lon],{radius:8,color:"#ffffff",weight:3,fillColor:"#e7bd75",fillOpacity:1}).addTo(detailMap);
  }

  /* ---------- Listen, Statistik ---------- */
  function lastBackupAt(){try{return Number(localStorage.getItem("velox-last-backup"))||0;}catch{return 0;}}
  function updateBackupHint(rideCount){
    const el=$("backupHint");if(!el)return;
    const last=lastBackupAt(),stale=!last||Date.now()-last>14*86400000;
    if(rideCount>0&&stale){
      el.hidden=false;
      el.innerHTML='<div><strong>'+(last?"Letzte Sicherung vor "+Math.floor((Date.now()-last)/86400000)+" Tagen.":"Noch keine Sicherung vorhanden.")+'</strong><span>Deine Aktivitäten liegen nur auf diesem Gerät. Eine Sicherung schützt sie vor Datenverlust.</span></div><button class="secondary-button compact" type="button" id="backupHintButton">Jetzt sichern</button>';
      $("backupHintButton").addEventListener("click",exportBackup);
    }else{el.hidden=true;el.innerHTML="";}
  }
  function updateProfileDashboard(rides,profile){
    const list=profileRides(rides,profile),running=profile==="running";
    let distance=0,time=0,elevation=0;
    list.forEach(ride=>{const c=calcRide(ride);distance+=c.distanceM;time+=c.movingSeconds;elevation+=c.elevationGain;});
    const prefix=running?"run":"bike",averageSpeed=time>0?distance/time*3.6:0;
    $(prefix+"Distance").innerHTML=fmt(distance/1000)+" <small>km</small>";
    $(prefix+"Time").innerHTML=fmt(time/3600,1)+" <small>h</small>";
    $(prefix+"Elevation").innerHTML=Math.round(elevation)+" <small>m</small>";
    $(prefix+"Count").textContent=String(list.length);
    $(prefix+(running?"Pace":"Speed")).innerHTML=running?(averageSpeed?formatPace(averageSpeed)+" <small>min/km</small>":"–"):(fmt(averageSpeed)+" <small>km/h</small>");
    $(prefix+"AverageDistance").innerHTML=fmt(list.length?distance/1000/list.length:0)+" <small>km</small>";
    renderRideList($(running?"runRecentRides":"bikeRecentRides"),list.slice(0,4));
  }
  async function refresh(){
    const sequence=++refreshSequence;
    const rides=await allRides();
    if(sequence!==refreshSequence)return;
    let distance=0,time=0,elev=0;
    rides.forEach(r=>{const c=calcRide(r);distance+=c.distanceM;time+=c.movingSeconds;elev+=c.elevationGain;});
    $("totalDistance").innerHTML=fmt(distance/1000)+" <small>km</small>";
    $("totalTime").innerHTML=fmt(time/3600,1)+" <small>h</small>";
    $("totalElevation").innerHTML=Math.round(elev)+" <small>m</small>";
    $("totalRides").textContent=rides.length;
    updateProfileDashboard(rides,"running");updateProfileDashboard(rides,"cycling");
    const selected=profileRides(rides,activeProfile);
    $("statsDistance").innerHTML=fmt(selected.reduce((sum,r)=>sum+calcRide(r).distanceM,0)/1000)+" <small>km</small>";
    const statsTime=selected.reduce((sum,r)=>sum+calcRide(r).movingSeconds,0);
    const statsElevation=selected.reduce((sum,r)=>sum+calcRide(r).elevationGain,0);
    $("statsTime").innerHTML=fmt(statsTime/3600,1)+" <small>h</small>";
    $("statsElevation").innerHTML=Math.round(statsElevation)+" <small>m</small>";
    $("statsAverageDistance").innerHTML=fmt(selected.length?selected.reduce((sum,r)=>sum+calcRide(r).distanceM,0)/1000/selected.length:0)+" <small>km</small>";
    renderRideList($("allRides"),selected);
    renderRideComparison(selected.slice(0,3));
    updateBackupHint(rides.length);
    if(currentPage==="wrapped")renderWrapped(selected);
  }
  function renderRideComparison(rides){
    const host=$("rideComparison");if(!host)return;
    if(rides.length<2){host.innerHTML='<p class="small-note">Mindestens zwei gespeicherte Aktivitäten erforderlich. Deine Aktivitäten bleiben lokal auf diesem Gerät.</p>';return;}
    const columns=rides.map(ride=>({ride,calc:calcRide(ride)}));
    const rows=[
      ["Distanz",c=>fmt(c.distanceM/1000)+" km"],
      ["Bewegungszeit",c=>fmtTime(c.movingSeconds)],
      ["Ø Tempo",(c,ride)=>isRunning(ride)?formatPace(c.averageSpeed)+" min/km":fmt(c.averageSpeed)+" km/h"],
      ["Max. Tempo",(c,ride)=>isRunning(ride)?formatPace(c.maxSpeed)+" min/km":fmt(c.maxSpeed)+" km/h"],
      ["Aufstieg",c=>Math.round(c.elevationGain)+" m"],
      ["Abstieg",c=>Math.round(c.elevationLoss)+" m"],
      ["Höchster Punkt",c=>c.elevationMax===null?"–":Math.round(c.elevationMax)+" m"],
      ["Ø Steigung",c=>c.gradeSamples?fmt(c.gradeAverage)+" %":"–"]
    ];
    const header='<div class="comparison-scroll"><table class="comparison-table"><thead><tr><th>Messwert</th>'+columns.map(({ride})=>'<th>'+escapeHtml(new Date(ride.startedAt).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"}))+'</th>').join("")+'</tr></thead><tbody>';
    const body=rows.map(([label,format])=>'<tr><th>'+label+'</th>'+columns.map(({ride,calc})=>'<td>'+format(calc,ride)+'</td>').join("")+'</tr>').join("");
    host.innerHTML=header+body+'</tbody></table></div><p class="small-note">Verglichen werden die letzten '+columns.length+' gespeicherten Aktivitäten. Nur tatsächlich vorhandene GPS-Daten werden berücksichtigt.</p>';
  }
  function selectedMapRides(){
    const filter=$("mapDateFilter")?.value||"all",now=Date.now();
    const cutoff=filter==="30"?now-30*86400000:filter==="90"?now-90*86400000:filter==="year"?now-365*86400000:0;
    return personalRidesCache.filter(ride=>!cutoff||ride.startedAt>=cutoff);
  }
  function renderMapRideFilters(rides){
    const host=$("personalRideFilters");if(!host)return;
    if(!rides.length){host.innerHTML='<p class="map-filter-empty">Keine Aktivitäten im gewählten Zeitraum.</p>';return;}
    host.innerHTML=rides.map(ride=>{
      const id=String(ride.id),checked=personalVisibility.get(id)!==false,color=mapColors[personalRidesCache.indexOf(ride)%mapColors.length];
      const date=new Date(ride.startedAt).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"2-digit"});
      return '<label class="map-ride-toggle"><input type="checkbox" data-map-ride="'+escapeHtml(id)+'" '+(checked?'checked':'')+'><span class="map-ride-swatch" style="--ride-color:'+color+'"></span><span class="map-ride-name">'+escapeHtml(ride.name||(isRunning(ride)?"Laufrunde":"Fahrradtour"))+'</span><small>'+date+'</small></label>';
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
    const sequence=++personalMapLoadSequence;
    const rides=await allRides();
    if(sequence!==personalMapLoadSequence||currentPage!=="stats")return;
    personalRidesCache=profileRides(rides,activeProfile);
    const points=personalRidesCache.flatMap(ride=>validRouteSegments(Array.isArray(ride.points)?ride.points:[]).flat());
    const box=$("personalMap");
    if(!points.length){
      if(personalMap){personalMap.remove();personalMap=null;}
      personalLines.clear();personalHeatLayer=null;
      box.innerHTML='<div class="empty-state">Noch keine GPS-Strecken vorhanden.</div>';
      return;
    }
    if(!window.L){
      box.innerHTML='<div class="empty-state">Kartenbibliothek nicht geladen. Bitte Internetverbindung prüfen.</div>';
      if(navigator.onLine)ensureLeaflet().then(ok=>{if(ok&&currentPage==="stats")renderPersonalMap();});
      return;
    }
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
    if(!rides.length){container.innerHTML='<div class="empty-state">Noch keine Aktivitäten gespeichert.</div>';return;}
    container.innerHTML=rides.map(r=>{
      const c=calcRide(r),date=new Date(r.startedAt).toLocaleDateString("de-DE",{dateStyle:"medium"}),start=new Date(r.startedAt).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}),end=Number.isFinite(r.endedAt)?new Date(r.endedAt).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}):"–";
      const running=isRunning(r),sport=running?"Laufen":"Radfahren";
      const average=running?formatPace(c.averageSpeed)+" min/km Ø":fmt(c.averageSpeed)+" km/h Ø";
      return '<button class="ride-card" data-ride="'+escapeHtml(r.id)+'"><div><h3>'+escapeHtml(r.name||(running?"Laufrunde":"Fahrradtour"))+'</h3><p><span class="activity-tag">'+sport+'</span> · '+date+' · '+start+'–'+end+' Uhr · '+fmt(c.movingSeconds/60,0)+' min · '+average+'</p></div><div class="ride-distance">'+fmt(c.distanceM/1000)+' <small>km</small></div></button>';
    }).join("");
    container.querySelectorAll("[data-ride]").forEach(el=>el.addEventListener("click",()=>openDetail(el.dataset.ride)));
  }
  function validRouteSegments(points,includeSingletons=false){
    const segments=[];let current=[];
    for(let i=0;i<points.length;i++){
      const point=points[i];
      if(!validRidePoint(point)){if(current.length>(includeSingletons?0:1))segments.push(current);current=[];continue;}
      if(!current.length){current=[point];continue;}
      const previous=points[i-1],dt=(point.t-previous.t)/1000,d=haversine(previous,point);
      // Kartenansicht ist toleranter als die Messwert-Analyse; lange Ausfälle bleiben getrennt.
      const valid=validRidePoint(previous)&&Number.isFinite(dt)&&dt>0&&dt<=180&&
        Number.isFinite(d)&&d>=0.1&&d<=300&&d/dt*3.6<=180;
      if(valid)current.push(point);
      else{if(current.length>(includeSingletons?0:1))segments.push(current);current=[point];}
    }
    if(current.length>(includeSingletons?0:1))segments.push(current);
    return segments;
  }

  /* ---------- Aufzeichnung ---------- */
  async function acquireWakeLock(){
    const status=$("sensorWakeStatus");
    try{
      if(!("wakeLock" in navigator)){if(status)status.textContent="Vom Browser nicht unterstützt";return;}
      if(wakeLock||document.visibilityState!=="visible")return;
      wakeLock=await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release",()=>{wakeLock=null;if(status&&activeRide&&activeRide.status==="recording")status.textContent="Freigegeben – wird erneut angefordert";});
      if(status)status.textContent="Bildschirm bleibt an";
    }catch(error){
      console.warn("Wake Lock nicht verfügbar:",error);
      if(status)status.textContent="Nicht verfügbar (Energiesparmodus?)";
    }
  }
  function releaseWakeLock(){
    if(wakeLock){wakeLock.release().catch(()=>{});wakeLock=null;}
    const status=$("sensorWakeStatus");if(status)status.textContent="Nicht aktiv";
  }
  function startWatching(){
    watchId=navigator.geolocation.watchPosition(onPosition,onGeoError,{enableHighAccuracy:true,maximumAge:1000,timeout:20000});
  }
  async function startRide(){
    if(!navigator.geolocation){showToast("GPS wird von diesem Browser nicht unterstützt.");return;}
    if(!window.isSecureContext){showToast("GPS benötigt eine sichere HTTPS-Verbindung.");return;}
    if(activeRide){setPage("track");return;}
    const activityType=activeProfile||selectedActivityType;
    if(!normalizeProfile(activityType)){showToast("Bitte wähle zuerst ein Sportprofil aus.");setPage("home");return;}
    // iOS verlangt die Bewegungsfreigabe direkt aus dem Start-Tap, bevor der optionale Größen-Dialog erscheint.
    const stepPermissionPromise=activityType==="running"?requestStepMotionPermission():Promise.resolve(false);
    const heightCm=activityType==="running"?await ensureRunningProfile():null;
    const stepPermission=await stepPermissionPromise;
    activeRide={id:"ride-"+Date.now(),activityType,name:activityType==="running"?"Laufrunde":"Fahrradtour",startedAt:Date.now(),endedAt:null,pausedMs:0,pauseIntervals:[],points:[],status:"recording",
      ...(activityType==="running"?{steps:0,heightCm,stepCountSource:stepPermission?"device-motion":"unavailable"}:{})};
    liveMetricsCache=null;liveMetricsRideId=null;liveDirty=false;pointsSincePersist=0;lastPersistAt=Date.now();dopplerSeen=false;
    syncTrackStartButton();
    try{await dbRequest("readwrite","put",activeRide);}catch(e){activeRide=null;syncTrackStartButton();showToast("Lokale Speicherung nicht verfügbar.");return;}
    $("pauseRide").disabled=false;$("stopRide").disabled=false;$("pauseRide").textContent="Pause";
    $("stopRide").textContent=activityType==="running"?"Lauf beenden":"Fahrt beenden";
    $("trackingStatus").textContent="GPS wird gesucht …";$("trackingDot").style.background="#d9b879";
    liveMap=liveMap||initMap("liveMap");liveLines=[];liveMarker=null;
    setFollow(true);attachLiveMap();
    setPage("track");
    startWatching();
    if(activityType==="running"&&stepPermission){if(!startStepCounter())showToast("Schrittzählung auf diesem Gerät nicht verfügbar.");}
    else if(activityType==="running")showToast("GPS läuft. Schrittzählung ist auf diesem Browser nicht verfügbar oder nicht freigegeben.");
    acquireWakeLock();
    updateLive(true);
    scheduleLiveClock();
    if(navigator.onLine&&!window.L)ensureLeaflet().then(restoreOnlineMaps);
  }
    async function onPosition(pos){
    if(!activeRide||activeRide.status!=="recording")return;
    const c=pos.coords,timestamp=Number.isFinite(pos.timestamp)&&pos.timestamp>0?pos.timestamp:Date.now();
    if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||c.latitude < -90||c.latitude > 90||c.longitude < -180||c.longitude > 180)return;
    const prev=activeRide.points[activeRide.points.length-1];
    // Aufzeichnung bewahrt echte Fixes; Qualitäts- und Tempofilter gehören in die Analyse.
    if(prev&&timestamp<=prev.t)return;
    const sensor=window.VELOXSensors?window.VELOXSensors.fuseAltitude(c.altitude,c.altitudeAccuracy,timestamp):{altitudeM:Number.isFinite(c.altitude)?c.altitude:null,accuracyM:Number.isFinite(c.altitudeAccuracy)?c.altitudeAccuracy:null,source:"gps"};
    const point={lat:c.latitude,lon:c.longitude,t:timestamp,alt:sensor.altitudeM,altAccuracy:sensor.accuracyM,altSource:sensor.source,pressureKPa:sensor.pressureKPa,accuracy:Number.isFinite(c.accuracy)?c.accuracy:null,speed:Number.isFinite(c.speed)&&c.speed>=0?c.speed:null};
    activeRide.points.push(point);
    if(point.speed!==null&&point.speed>=1)dopplerSeen=true;
    liveDirty=true;pointsSincePersist++;
    // Speichern gebündelt (alle 5 Punkte bzw. 5 s) statt bei jedem Fix – sonst wächst der Aufwand mit der Tourlänge quadratisch.
    if(activeRide.points.length===1||pointsSincePersist>=5||Date.now()-lastPersistAt>=5000){
      pointsSincePersist=0;lastPersistAt=Date.now();
      try{await persistActiveRide();}catch(error){console.error("GPS-Punkte konnten nicht dauerhaft gespeichert werden:",error);$("trackingStatus").textContent="Speicherfehler – Tourdaten prüfen";showToast("Lokales Speichern fehlgeschlagen.");return;}
    }
    $("trackingStatus").textContent="Aufzeichnung läuft";$("trackingDot").style.background="var(--teal)";
    $("gpsAccuracy").textContent=Number.isFinite(c.accuracy)?"GPS ±"+Math.round(c.accuracy)+" m":"GPS-Genauigkeit nicht gemeldet";
    updateSensorStatus(point);drawLive(activeRide.points);updateLive(false);
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
    if(!points.length)return 0;
    const b=points[points.length-1];
    if(dopplerSeen&&Number.isFinite(b.speed)&&Date.now()-b.t<10000)return b.speed*3.6;   // Doppler-Geschwindigkeit des iPhones ist genauer als Positionsdifferenzen
    if(points.length<2)return 0;
    const cls=Core.classify(points[points.length-2],b,dopplerSeen);
    return cls.kind==="moving"?cls.speedKmh:0;
  }
  function updateLive(force=false){
    if(!activeRide)return;
    const now=Date.now();
    if(force||!liveMetricsCache||liveMetricsRideId!==activeRide.id||(liveDirty&&now-liveCalcAt>=2500)){
      liveMetricsCache=calcRide(activeRide);liveMetricsRideId=activeRide.id;liveCalcAt=now;liveDirty=false;
    }
    const c=liveMetricsCache,elapsed=activeSeconds(activeRide);
    $("liveDistance").textContent=fmt(c.distanceM/1000,2);
    const running=isRunning(activeRide);
    const speed=currentSpeed(activeRide.points);
    $("liveSpeedLabel").textContent=running?"Aktuelle Pace":"Geschwindigkeit";
    $("liveAverageLabel").textContent=running?"Ø Pace":"Ø Geschwindigkeit";
    $("liveDurationLabel").textContent=running?"Laufzeit":"Fahrzeit";
    $("liveMovingRatioLabel").textContent=running?"Laufanteil":"Fahranteil";
    $("liveSpeed").innerHTML=running?formatPace(speed)+" <small>min/km</small>":fmt(speed)+" <small>km/h</small>";
    $("liveDuration").textContent=fmtTime(elapsed);
    $("liveElevation").innerHTML=Math.round(c.elevationGain)+' <small>m</small>';
    $("liveAverage").innerHTML=running?formatPace(c.averageSpeed)+" <small>min/km</small>":fmt(c.averageSpeed)+' <small>km/h</small>';
    const last=activeRide.points[activeRide.points.length-1],elevation=c.elevationProfile;
    $("liveAltitude").innerHTML=last&&Number.isFinite(last.alt)?Math.round(last.alt)+' <small>m</small>':'– <small>m</small>';
    const liveGrade=currentGrade(c);
    $("liveGrade").innerHTML=liveGrade===null?'– <small>%</small>':fmt(liveGrade)+' <small>%</small>';
    $("liveMovingRatio").innerHTML=fmt(elapsed?Math.min(100,c.movingSeconds/elapsed*100):0,0)+' <small>%</small>';
    $("liveAltitudeQuality").textContent=elevation.quality==="high"?"Gut":elevation.quality==="medium"?"Mittel":elevation.quality==="unrated"?"Nicht bewertet":"Begrenzt";
    updateSensorStatus(last);
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
    const running=activeRide?isRunning(activeRide):activeProfile==="running";
    if(button){
      button.hidden=!!activeRide;
      const label=button.querySelector("[data-start-label]");
      if(label)label.textContent=running?"Lauf starten":"Fahrt starten";
    }
    const title=$("trackPageTitle"),eyebrow=$("trackPageEyebrow"),intro=$("trackModeDescription");
    if(title)title.textContent=running?"Dein Lauf":"Deine Fahrt";
    if(eyebrow)eyebrow.textContent=running?"LAUF-AUFZEICHNUNG":"RAD-AUFZEICHNUNG";
    if(intro)intro.textContent=running?"GPS-Lauftracking mit Pace, Laufzeit und Höhenprofil.":"GPS-Aufzeichnung mit Geschwindigkeit, Fahrzeit und Höhenprofil.";
  }
  async function pauseRide(){
    if(!activeRide)return;
    if(activeRide.status==="recording"){
      const pauseAt=Date.now();
      if(!Array.isArray(activeRide.pauseIntervals))activeRide.pauseIntervals=[];
      activeRide.pauseIntervals.push({startedAt:pauseAt,endedAt:null});
      activeRide.status="paused";activeRide.pauseStarted=pauseAt;
      if(watchId!==null)navigator.geolocation.clearWatch(watchId);watchId=null;
      releaseWakeLock();
      $("pauseRide").textContent="Fortsetzen";$("trackingStatus").textContent="Pausiert";
    }else{
      const resumedAt=Date.now(),lastPause=Array.isArray(activeRide.pauseIntervals)?activeRide.pauseIntervals[activeRide.pauseIntervals.length-1]:null;
      if(lastPause&&lastPause.endedAt===null)lastPause.endedAt=resumedAt;
      activeRide.pausedMs=(activeRide.pausedMs||0)+(resumedAt-(activeRide.pauseStarted||resumedAt));
      delete activeRide.pauseStarted;activeRide.status="recording";
      startWatching();acquireWakeLock();
      $("pauseRide").textContent="Pause";$("trackingStatus").textContent="Aufzeichnung läuft";
    }
    try{await dbRequest("readwrite","put",activeRide);}catch(error){console.error(error);showToast("Speichern fehlgeschlagen.");}
    updateLive(true);
  }

  /* ---------- Wetter ---------- */
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
  async function fetchRideWeather(ride){
    const points=Array.isArray(ride.points)?ride.points.filter(validRidePoint):[];
    if(!points.length||!navigator.onLine||!window.fetch)return null;
    const middle=ride.startedAt+((ride.endedAt||Date.now())-ride.startedAt)/2;
    const target=points.reduce((best,p)=>Math.abs(p.t-middle)<Math.abs(best.t-middle)?p:best,points[0]);
    const ageDays=(Date.now()-middle)/86400000,recent=ageDays<=7;
    const params=new URLSearchParams({latitude:String(target.lat),longitude:String(target.lon),hourly:"temperature_2m,precipitation,weather_code,cloud_cover",timezone:"UTC"});
    let url;
    if(recent){params.set("past_days","7");params.set("forecast_days","1");url="https://api.open-meteo.com/v1/forecast?"+params;}
    else{const day=new Date(middle).toISOString().slice(0,10);params.set("start_date",day);params.set("end_date",day);url="https://archive-api.open-meteo.com/v1/archive?"+params;}
    const response=await fetch(url,{signal:AbortSignal.timeout(6500)});
    if(!response.ok)throw new Error("Wetterdienst antwortet nicht");
    const data=await response.json(),times=data.hourly&&data.hourly.time;
    if(!Array.isArray(times)||!times.length)return null;
    let index=0,bestDelta=Infinity;
    times.forEach((time,i)=>{const delta=Math.abs(new Date(time+"Z").getTime()-middle);if(delta<bestDelta){bestDelta=delta;index=i;}});
    if(bestDelta>2*3600000)return null;
    const temp=data.hourly.temperature_2m?.[index],code=data.hourly.weather_code?.[index];
    if(!Number.isFinite(temp)||!Number.isFinite(code))return null;
    return {condition:weatherDescription(code),weatherCode:code,temperatureC:temp,precipitationMm:Number.isFinite(data.hourly.precipitation?.[index])?data.hourly.precipitation[index]:null,cloudCoverPct:Number.isFinite(data.hourly.cloud_cover?.[index])?data.hourly.cloud_cover[index]:null,source:"open-meteo",sourceLabel:"Open-Meteo (Wetterdaten zur Aktivität)",sampledAt:times[index],fetchedAt:Date.now()};
  }
  async function collectManualWeather(){
    const options=["Sonnig","Leicht bewölkt","Bewölkt","Nebel","Nieselregen","Regen","Schnee","Gewitter","Wechselhaft"];
    const result=await openSheet({
      title:"Wetter eintragen",
      body:'<label class="vx-field">Wetter<select name="condition">'+options.map(o=>'<option>'+o+'</option>').join("")+'</select></label>'+
        '<label class="vx-field">Temperatur in °C (optional)<input name="temperature" type="number" inputmode="decimal" step="any" min="-30" max="55" placeholder="z. B. 18"></label>',
      actions:[{id:"save",label:"Speichern",primary:true},{id:"skip",label:"Überspringen",skip:true}]
    });
    if(result.action!=="save")return {condition:"Nicht angegeben",source:"user-skipped",sourceLabel:"Keine Wetterangabe"};
    const raw=String(result.values.temperature||"").replace(",","."),value=raw===""?NaN:Number(raw);
    return {condition:String(result.values.condition||"Nicht angegeben").slice(0,100),temperatureC:Number.isFinite(value)&&value>=-30&&value<=55?value:null,source:"user-estimate",sourceLabel:"Manuell angegeben",fetchedAt:Date.now()};
  }
  async function collectRideWeather(ride){
    const first=await openSheet({
      title:"Wetter zur Aktivität",
      body:'<p>Soll VELOX das Wetter automatisch ermitteln? Dafür sendet die App das Aktivitätsdatum und eine ungefähre GPS-Position an den kostenlosen Dienst Open-Meteo. Alternativ kannst du Wetter und Temperatur selbst eintragen.</p>',
      actions:[{id:"auto",label:"Automatisch ermitteln",primary:true},{id:"manual",label:"Selbst eintragen"},{id:"skip",label:"Überspringen",skip:true}]
    });
    if(first.action==="auto"){
      try{const weather=await fetchRideWeather(ride);if(weather)return weather;}catch(error){console.warn("Wetterabfrage nicht verfügbar:",error);}
      showToast("Automatisches Wetter nicht verfügbar – bitte selbst eintragen.");
    }else if(first.action!=="manual"){
      return {condition:"Nicht angegeben",source:"user-skipped",sourceLabel:"Keine Wetterangabe"};
    }
    return await collectManualWeather();
  }
  async function stopRide(){
    if(!activeRide)return;
    const running=isRunning(activeRide);
    const confirmStop=await openSheet({
      title:running?"Lauf beenden?":"Fahrt beenden?",
      body:'<p>Die Aufzeichnung wird beendet und lokal gespeichert.</p>',
      actions:[{id:"stop",label:"Beenden und speichern",primary:true},{id:"cancel",label:"Weiter fahren",skip:true}]
    });
    if(confirmStop.action!=="stop"||!activeRide)return;
    if(activeRide.status==="paused"){
      const resumedAt=Date.now(),lastPause=Array.isArray(activeRide.pauseIntervals)?activeRide.pauseIntervals[activeRide.pauseIntervals.length-1]:null;
      if(lastPause&&lastPause.endedAt===null)lastPause.endedAt=resumedAt;
      activeRide.pausedMs=(activeRide.pausedMs||0)+(resumedAt-(activeRide.pauseStarted||resumedAt));
      delete activeRide.pauseStarted;
    }
    if(watchId!==null)navigator.geolocation.clearWatch(watchId);watchId=null;
    if(timerId!==null)clearTimeout(timerId);timerId=null;
    releaseWakeLock();
    activeRide.status="completed";activeRide.endedAt=Date.now();
    const c=calcRide(activeRide);
    $("stopRide").disabled=true;$("pauseRide").disabled=true;
    $("trackingStatus").textContent="Aktivität wird lokal gesichert …";
    try{
      await persistActiveRide();
      $("trackingStatus").textContent="Wetter wird ergänzt …";
      activeRide.weather=await collectRideWeather(activeRide);
      await persistActiveRide();
    }catch(error){
      console.error(error);
      activeRide.status="completed";
      try{await dbRequest("readwrite","put",activeRide);}catch(saveError){showToast("Speichern fehlgeschlagen. Bitte VELOX geöffnet lassen und erneut versuchen.");console.error(saveError);$("stopRide").disabled=false;return;}
    }
    activeRide=null;calcCache.clear();
    liveMetricsCache=null;liveMetricsRideId=null;syncTrackStartButton();
    $("trackingStatus").textContent="Aktivität gespeichert";$("trackingDot").style.background="var(--teal)";
    showToast(c.distanceM>0?"Aktivität lokal gespeichert.":"Aktivität ohne ausreichende GPS-Daten gespeichert.");
    await refresh();setPage("rides");
  }

  /* ---------- Tourdetail & Grafiken ---------- */
  async function openDetail(id){
    const r=(await allRides()).find(x=>x.id===id);if(!r)return;
    lastDetailRide=r;
    const c=calcRide(r),stops=c.stops,date=new Date(r.startedAt).toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long",year:"numeric"}),startTime=new Date(r.startedAt).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit",second:"2-digit"}),endTime=Number.isFinite(r.endedAt)?new Date(r.endedAt).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"–",weather=r.weather||null;
    const running=isRunning(r);
    detailRows=c.elevationProfile.samples.map(s=>({x:s.distanceM,y:s.elevationM,segment:s.segment,lat:s.lat,lon:s.lon}));
    const elevationCards=
      metric("Aufstieg",Math.round(c.elevationGain)+" m")+metric("Abstieg",Math.round(c.elevationLoss)+" m")+
      metric("Höchster Punkt",c.elevationMax===null?"–":Math.round(c.elevationMax)+" m")+
      metric("Tiefster Punkt",c.elevationMin===null?"–":Math.round(c.elevationMin)+" m")+
      metric("Höhenbereich",c.elevationRange===null?"–":Math.round(c.elevationRange)+" m")+
      metric("Netto-Höhenänderung",c.netElevationChange===null?"–":(c.netElevationChange>=0?"+":"")+Math.round(c.netElevationChange)+" m")+
      metric("Ø Steigung",c.gradeSamples?fmt(c.gradeAverage)+" %":"–")+
      metric("Max. Steigung",c.gradeSamples?fmt(Math.max(0,c.gradeMax))+" %":"–")+
      metric("Steilste Abfahrt",c.gradeSamples?fmt(Math.abs(Math.min(0,c.gradeMin)))+" %":"–")+
      metric("Längster Anstieg",c.longestClimb?fmt(c.longestClimb.distanceM/1000,2)+" km / +"+Math.round(c.longestClimb.gainM)+" m":"–")+
      metric("Höhengewinn je Bewegungsstunde",c.gradeSamples>0&&c.movingSeconds?Math.round(c.vam)+" m/h":"–");
    const routeCards=
      metric("Max. vom Start",c.maxFromStartM===null?"–":fmt(c.maxFromStartM/1000,2)+" km")+
      metric("Luftlinie Start–Ziel",c.straightDistanceM===null?"–":fmt(c.straightDistanceM/1000,2)+" km")+
      metric("Strecken-Geradlinigkeit",c.routeStraightness===null?"–":fmt(c.routeStraightness,0)+" %");
    const timeCards=
      metric(running?"Laufzeit":"Fahrzeit",fmtTime(c.movingSeconds))+
      metric("Aufzeichnungsdauer",fmtTime(c.elapsedSeconds))+
      metric("Stand- und Lückenzeit",fmtTime(c.stoppedSeconds))+
      metric("Bewegungsanteil",fmt(c.movingRatio,0)+" %")+
      metric(running?"Schnellster Kilometer":"Schnellster voller Kilometer",c.fastestKilometerSeconds===null?"–":fmtTime(c.fastestKilometerSeconds))+
      metric("Erkannte Stopps",stops.count===null?"–":String(stops.count))+
      metric("Längster Stopp",stops.longestSeconds===null?"–":fmtTime(stops.longestSeconds));
    const speedCards=running
      ?metric("Ø Pace",c.movingSeconds?formatPace(c.averageSpeed)+" min/km":"–")+
       metric("Schnellste Pace",c.movingSeconds?formatPace(c.maxSpeed)+" min/km":"–")+
       metric("Pace-Median",c.movingSeconds?formatPace(c.medianSpeed)+" min/km":"–")
      :metric("Ø Geschwindigkeit",c.movingSeconds?fmt(c.averageSpeed)+" km/h":"–")+
       metric("Max. GPS-Tempo",c.movingSeconds?fmt(c.maxSpeed)+" km/h":"–")+
       metric("Tempo-Median",c.movingSeconds?fmt(c.medianSpeed)+" km/h":"–");
    const gpsQuality=c.elevationQuality==="high"?"Gut":c.elevationQuality==="medium"?"Mittel":"Eingeschränkt";
    const autoWeather=weather&&weather.source&&String(weather.source).startsWith("open-meteo");
    $("rideDetail").innerHTML=
      '<div class="detail-header"><span class="eyebrow">'+(running?"LAUFDETAIL":"FAHRDETAIL")+'</span><h1>'+escapeHtml(r.name||(running?"Laufrunde":"Fahrradtour"))+'</h1><p class="muted">'+date+'</p><div class="ride-time-strip"><div><span>START</span><strong>'+startTime+' Uhr</strong></div><div><span>ENDE</span><strong>'+endTime+' Uhr</strong></div></div></div>'+
      '<section class="detail-route-section"><div class="detail-section-heading"><span class="eyebrow">DEINE STRECKE</span><span class="detail-map-distance">'+fmt(c.distanceM/1000,2)+' km</span></div><div class="detail-map detail-map-primary" id="detailMap" role="img" aria-label="Karte der aufgezeichneten Strecke"></div><div class="detail-route-legend"><span>● Start</span><span>● Ziel</span><span>'+validRouteSegments(r.points).length+' GPS-Abschnitte</span></div></section>'+
      '<section class="detail-section"><div class="panel detail-panel weather-panel"><span class="eyebrow">WETTER WÄHREND DIESER AKTIVITÄT</span><h3>'+(weather?escapeHtml(weather.condition||"Wetter erfasst"):"Keine Wetterangabe")+'</h3><div class="metric-grid detail-metrics">'+metric("Temperatur",weather&&Number.isFinite(weather.temperatureC)?fmt(weather.temperatureC,1)+" °C":"–")+metric("Niederschlag",weather&&Number.isFinite(weather.precipitationMm)?fmt(weather.precipitationMm,1)+" mm":"Nicht verfügbar")+metric("Bewölkung",weather&&Number.isFinite(weather.cloudCoverPct)?fmt(weather.cloudCoverPct,0)+" %":"Nicht verfügbar")+metric("Quelle",weather?escapeHtml(weather.sourceLabel||"Fahrerangabe"):"Keine Angabe")+'</div><p>'+(autoWeather?"Wetterdaten am nächstgelegenen Stundenwert und an einer repräsentativen GPS-Position der Aktivität.":"Wetterangabe für diese Aktivität; Temperatur ist eine ungefähre Angabe.")+'</p></div></section>'+
      '<section class="detail-section"><span class="eyebrow">AUF EINEN BLICK</span><div class="metric-grid detail-metrics">'+
      metric("Distanz",fmt(c.distanceM/1000,2)+" km")+metric("Bewegungszeit",fmtTime(c.movingSeconds))+
      (running?metric("Ø Pace",c.movingSeconds?formatPace(c.averageSpeed)+" min/km":"–"):metric("Ø Geschwindigkeit",c.movingSeconds?fmt(c.averageSpeed)+" km/h":"–"))+
      (running?metric("Schnellste Pace",c.movingSeconds?formatPace(c.maxSpeed)+" min/km":"–"):metric("Max. Geschwindigkeit",c.movingSeconds?fmt(c.maxSpeed)+" km/h":"–"))+
      '</div></section>'+
      '<section class="detail-section"><div class="panel detail-panel"><span class="eyebrow">HÖHENPROFIL</span><h3>Höhenverlauf</h3><div class="chart-box" id="elevationChart"></div><p>GPS-Höhenqualität: '+gpsQuality+(Number.isFinite(c.elevationAccuracy)?' · Median der gemeldeten GPS-Höhengenauigkeit: '+fmt(c.elevationAccuracy)+' m':' · Keine durchgängige Genauigkeitsangabe')+'. Höhenmeter werden gefiltert und nicht als Barometer-Messung ausgegeben.</p></div></section>'+
      '<section class="detail-section"><div class="panel detail-panel"><span class="eyebrow">'+(running?"LAUFTEMPO":"FAHRTEMPO")+'</span><h3>'+(running?"Pace-Verlauf":"Geschwindigkeit über die Strecke")+'</h3><div class="chart-box" id="speedChart"></div><div class="metric-grid detail-metrics">'+speedCards+'</div></div></section>'+
      '<section class="detail-section"><div class="panel detail-panel"><span class="eyebrow">GELÄNDE</span><h3>Steigungsprofil</h3><div class="chart-box" id="gradeChart"></div><div class="metric-grid detail-metrics">'+elevationCards+'</div>'+renderRideBreakdowns(c)+'</div></section>'+
      '<section class="detail-section"><div class="panel detail-panel"><span class="eyebrow">ROUTE</span><h3>Entfernung und Streckenform</h3><div class="metric-grid detail-metrics">'+routeCards+'</div><p>Geradlinigkeit wird nur angezeigt, wenn die Route ohne GPS-Lücken aufgezeichnet wurde. Bei einer Rundtour liegt sie naturgemäß nahe 0 %.</p></div></section>'+
      '<section class="detail-section"><div class="panel detail-panel"><span class="eyebrow">ZEIT & AUFZEICHNUNG</span><h3>Bewegungs- und Standzeiten</h3><div class="metric-grid detail-metrics">'+timeCards+'</div><p>Bewegungszeit wird aus akzeptierten GPS-Intervallen berechnet. Ein Stopp zählt ab 10 Sekunden Stillstand (unter 1,5 km/h oder laut GPS-Geschwindigkeit stehend); GPS-Lücken werden nicht als Stopp gewertet, sind aber in der Stand- und Lückenzeit enthalten. Die Erkennung ist eine GPS-Näherung.</p></div></section>'+
      '<section class="detail-section"><div class="panel detail-panel"><span class="eyebrow">DATENQUELLEN & SENSORSTATUS</span><h3>Was wurde tatsächlich gemessen?</h3><div class="detail-source-list"><div><span>GPS-Positionen</span><strong>'+r.points.length+' gespeicherte Punkte</strong></div><div><span>GPS-Höhe</span><strong>'+c.elevationProfile.validCount+' verwertbare Höhenpunkte</strong></div><div><span>Barometer</span><strong>Keine nativen Barometerdaten in dieser Aktivität</strong></div><div><span>Kompass / Magnetometer</span><strong>Nicht in dieser PWA-Aufzeichnung gespeichert</strong></div><div><span>Gyroskop / Beschleunigung</span><strong>Nicht in dieser PWA-Aufzeichnung gespeichert</strong></div><div><span>Herzfrequenz / Leistung / Kadenz</span><strong>Keine Datenquelle vorhanden</strong></div></div><p>Das iPhone XR besitzt zusätzliche Sensorhardware. Safari/PWA kann sie jedoch nicht wie eine native iOS-App vollständig über Core Motion auslesen. VELOX zeigt daher nur Daten, die wirklich in dieser Tour gespeichert wurden.</p></div></section>'+
      '<div class="tracking-actions"><button class="secondary-button" id="renameRide">Umbenennen</button><button class="secondary-button" id="exportGpx">GPX exportieren</button><button class="danger-outline" id="deleteRide">Aktivität löschen</button></div>';
    setPage("detail");
    setTimeout(()=>{
      if(detailMap){detailMap.remove();detailMap=null;detailHoverMarker=null;}
      if(!drawDetailMap(r))renderOfflineRoute("detailMap",r.points);
      renderElevation(c);
      renderSpeedProfile(c);
      renderGradeProfile(c);
      if(navigator.onLine&&!window.L)ensureLeaflet().then(restoreOnlineMaps);
    },180);
    $("exportGpx").onclick=()=>exportGPX(r);
    $("renameRide").onclick=async()=>{
      const result=await openSheet({title:"Aktivität umbenennen",body:'<label class="vx-field">Name<input name="name" type="text" maxlength="80" required value="'+escapeHtml(r.name||(running?"Laufrunde":"Fahrradtour"))+'"></label>',actions:[{id:"save",label:"Speichern",primary:true},{id:"cancel",label:"Abbrechen",skip:true}]});
      const name=String(result.values.name||"").trim().slice(0,80);
      if(result.action!=="save"||!name)return;
      try{await dbRequest("readwrite","put",{...r,name});calcCache.clear();showToast("Name gespeichert.");await openDetail(id);}catch(error){console.error(error);showToast("Umbenennen fehlgeschlagen.");}
    };
    $("deleteRide").onclick=async()=>{
      const result=await openSheet({title:"Aktivität löschen?",body:'<p>Diese Aktivität wird dauerhaft von diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen.</p>',actions:[{id:"delete",label:"Endgültig löschen",primary:true},{id:"cancel",label:"Abbrechen",skip:true}]});
      if(result.action!=="delete")return;
      await dbRequest("readwrite","delete",r.id);calcCache.clear();showToast("Aktivität gelöscht.");setPage("rides");
    };
  }
  const nearRow=(rows,x,tolerance)=>{
    if(!rows.length)return null;
    const row=rows[Charts.nearestIndex(rows,x)];
    return Math.abs(row.x-x)<=tolerance?row:null;
  };
  const gradeRowsOf=(c)=>c.gradeSeries.map(g=>({x:g.distanceM,y:g.grade,segment:g.segment,elevationM:g.elevationM}));
  const gradeLabel=(g)=>(g>=0?"+":"−")+fmt(Math.abs(g),1)+" %";
  function renderElevation(c){
    const box=$("elevationChart");if(!box)return;
    const p=c.elevationProfile,gradeRows=gradeRowsOf(c);
    if(!Charts||detailRows.length<2){
      box.innerHTML='<div class="empty-state">Nicht genügend verlässliche GPS-Höhenpunkte für ein Profil vorhanden.</div>';
      return;
    }
    const climb=c.longestClimb;
    box.innerHTML='<div class="elevation-summary"><span class="elevation-stat">↗ Aufstieg <strong>+'+Math.round(p.gain)+' m</strong></span><span class="elevation-stat">↘ Abstieg <strong>−'+Math.round(p.loss)+' m</strong></span><span class="elevation-stat">Höhenbereich <strong>'+Math.round(p.minimum)+'–'+Math.round(p.maximum)+' m</strong></span></div>'+
      '<div class="vx-plot" id="elevationPlot"></div>'+
      '<div class="grade-profile-legend"><span><i class="grade-up"></i>Anstieg</span><span><i class="grade-flat"></i>Flach</span><span><i class="grade-down"></i>Gefälle</span><span class="legend-context">Farbe = Steigung</span></div>'+
      '<p class="elevation-footnote">Höhenprofil aus '+p.validCount+' von '+p.totalCount+' GPS-Punkten, über Strecke geglättet und alle '+p.stepM+' m abgetastet. Aufstieg und Abstieg zählen erst ab '+fmt(p.climbThresholdM,1)+' m echter Höhenänderung, damit GPS-Rauschen nicht als Höhenmeter zählt. Tippe oder ziehe über die Grafik, um Werte zu sehen; die Position erscheint auf der Karte.</p>';
    Charts.profileChart($("elevationPlot"),{
      rows:detailRows,xMax:Math.max(1,p.distanceM),yTitle:"Höhe (m)",unit:"m",height:210,extremes:true,minPad:4,
      bands:climb?[{from:climb.startM,to:climb.endM,label:"Längster Anstieg"}]:[],
      colorAt:(a,b)=>{const g=nearRow(gradeRows,(a.x+b.x)/2,60);return g?Charts.gradeColor(g.y):"#8fa6b8";},
      tooltip:(row)=>{const g=nearRow(gradeRows,row.x,60);return [["Distanz",fmt(row.x/1000,2)+" km"],["Höhe",Math.round(row.y)+" m"],["Steigung",g?gradeLabel(g.y):"–"]];},
      onHover:(row)=>setDetailHover(row?row.x:null),
      ariaLabel:"Höhenprofil über "+fmt(p.distanceM/1000,1)+" Kilometer, Höhenbereich "+Math.round(p.minimum)+" bis "+Math.round(p.maximum)+" Meter."
    });
  }
  function renderGradeProfile(c){
    const box=$("gradeChart");if(!box)return;
    const rows=gradeRowsOf(c);
    if(!Charts||rows.length<2){
      box.innerHTML='<div class="empty-state">Für die Steigungsanalyse liegen nicht genügend verlässliche Höhenabschnitte vor.</div>';
      return;
    }
    const limit=Math.max(4,Math.ceil(Math.max(...rows.map(x=>Math.abs(x.y)))/2)*2);
    box.innerHTML='<div class="elevation-summary"><span class="elevation-stat">Ø Steigung <strong>'+fmt(c.gradeAverage)+' %</strong></span><span class="elevation-stat">Max. Anstieg <strong>+'+fmt(Math.max(0,c.gradeMax))+' %</strong></span><span class="elevation-stat">Max. Gefälle <strong>'+fmt(Math.abs(Math.min(0,c.gradeMin)))+' %</strong></span></div>'+
      '<div class="vx-plot" id="gradePlot"></div>'+
      '<div class="grade-profile-legend"><span><i class="grade-up"></i>Anstieg</span><span><i class="grade-flat"></i>Flach</span><span><i class="grade-down"></i>Gefälle</span></div>'+
      '<p class="elevation-footnote">Steigung = Höhenunterschied über mindestens 50 m Strecke aus geglätteten GPS-Höhen. Kurze Spitzen sind GPS-Näherungen, keine vermessenen Straßensteigungen. GPS-Lücken bleiben getrennt.</p>';
    Charts.profileChart($("gradePlot"),{
      rows,xMax:Math.max(1,c.elevationProfile.distanceM),yTitle:"Steigung (%)",height:170,baseline:"zero",yMin:-limit,yMax:limit,
      yFormat:(v)=>fmt(v,0),
      colorAt:(a,b)=>Charts.gradeColor((a.y+b.y)/2),
      tooltip:(row)=>[["Distanz",fmt(row.x/1000,2)+" km"],["Steigung",gradeLabel(row.y)],["Höhe",Math.round(row.elevationM)+" m"]],
      onHover:(row)=>setDetailHover(row?row.x:null),
      ariaLabel:"Steigungsprofil, durchschnittlich "+fmt(c.gradeAverage)+" Prozent."
    });
  }
  function speedRowsOf(c){
    const runs=new Map();let distance=0;
    c.intervals.forEach(it=>{
      distance+=it.distanceM;
      if(!runs.has(it.run))runs.set(it.run,[]);
      runs.get(it.run).push({x:distance,speed:it.speedKmh,run:it.run});
    });
    const out=[];
    runs.forEach(list=>list.forEach((s,i)=>{
      const w=list.slice(Math.max(0,i-2),Math.min(list.length,i+3)).map(v=>v.speed).sort((a,b)=>a-b);
      out.push({x:s.x,y:w[Math.floor(w.length/2)],segment:s.run});
    }));
    return out.sort((a,b)=>a.x-b.x);
  }
  function renderSpeedProfile(c){
    const box=$("speedChart");if(!box)return;
    const running=isRunning(lastDetailRide);
    const speedRows=speedRowsOf(c);
    if(!Charts||speedRows.length<3){
      box.innerHTML='<div class="empty-state">Nicht genügend verlässliche GPS-Punkte für ein Tempo-Profil vorhanden.</div>';
      return;
    }
    const rows=running?speedRows.map(row=>({...row,y:3600/Math.max(.1,row.y)})):speedRows;
    const sorted=rows.map(r=>r.y).sort((a,b)=>a-b);
    const lo=sorted[Math.floor((sorted.length-1)*0.1)]||0,hi=sorted[Math.floor((sorted.length-1)*0.9)]||1;
    const color=(v)=>{
      const t=hi>lo?Math.max(0,Math.min(1,(v-lo)/(hi-lo))):0.5;
      const relative=running?1-t:t;
      return "hsl("+(8+214*relative).toFixed(0)+" 72% 62%)";
    };
    const gaps=new Set(rows.map(r=>r.segment)).size-1;
    const peak=running?Math.min(...rows.map(r=>r.y)):Math.max(...rows.map(r=>r.y));
    const avg=running?formatPace(c.averageSpeed)+" min/km":fmt(c.averageSpeed)+" km/h";
    const extreme=running?formatPace(3600/peak)+" min/km":fmt(peak)+" km/h";
    const median=running?formatPace(c.medianSpeed)+" min/km":fmt(c.medianSpeed)+" km/h";
    box.innerHTML='<div class="elevation-summary"><span class="elevation-stat">Ø '+(running?"Pace":"Geschwindigkeit")+' <strong>'+avg+'</strong></span><span class="elevation-stat">'+(running?"Schnellste":"Spitze (geglättet)")+' <strong>'+extreme+'</strong></span><span class="elevation-stat">Median <strong>'+median+'</strong></span></div>'+
      '<div class="vx-plot" id="speedPlot"></div>'+
      '<div class="elevation-legend"><span>'+(running?"Schneller":"Langsamer")+'</span><i aria-hidden="true"></i><span>'+(running?"Langsamer":"Schneller")+'</span><span class="legend-context">Farbe relativ zu dieser Aktivität</span></div>'+
      '<p class="elevation-footnote">'+c.intervals.length+' gültige GPS-Bewegungsintervalle'+(gaps>0?', '+gaps+' GPS-Lücke(n) werden nicht überbrückt':'')+'. Die Kurve zeigt den Median über 5 Intervalle; einzelne GPS-Ausreißer werden dadurch gedämpft.</p>';
    const yMin=running?Math.max(0,Math.floor((lo-30)/30)*30):0;
    const yMax=running?Math.max(yMin+60,Math.ceil((hi+30)/30)*30):undefined;
    Charts.profileChart($("speedPlot"),{
      rows,xMax:Math.max(1,c.elevationProfile.distanceM||rows[rows.length-1].x),yTitle:running?"min/km":"km/h",unit:running?"min/km":"km/h",height:180,
      ...(running?{yMin,yMax,yFormat:v=>formatPaceSeconds(v)}:{yMin:0,snapMin:true,minPad:2}),
      colorAt:(a,b)=>color((a.y+b.y)/2),
      tooltip:(row)=>{const e=nearRow(detailRows,row.x,60);return [["Distanz",fmt(row.x/1000,2)+" km"],[running?"Pace":"Tempo",running?formatPaceSeconds(row.y)+" min/km":fmt(row.y)+" km/h"]].concat(e?[["Höhe",Math.round(e.y)+" m"]]:[]);},
      onHover:(row)=>setDetailHover(row?row.x:null),
      ariaLabel:running?"Pace-Verlauf, durchschnittlich "+formatPace(c.averageSpeed)+" Minuten pro Kilometer.":"Geschwindigkeitsprofil, durchschnittlich "+fmt(c.averageSpeed)+" Kilometer pro Stunde."
    });
  }

  /* ---------- Export / Import ---------- */
  function exportGPX(r){
    const pts=Array.isArray(r.points)?r.points:[],segments=validRouteSegments(pts,true);
    if(!segments.length){showToast("Keine gültigen GPS-Punkte zum Export vorhanden.");return;}
    const esc=s=>String(s).replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]));
    const trk=segments.map(segment=>'<trkseg>'+segment.map(p=>'<trkpt lat="'+p.lat+'" lon="'+p.lon+'">'+(Number.isFinite(p.alt)?'<ele>'+p.alt+'</ele>':'')+'<time>'+new Date(p.t).toISOString()+'</time></trkpt>').join("")+'</trkseg>').join("");
    downloadFile("velox-"+r.id+".gpx",'<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="VELOX" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>'+esc(r.name||"VELOX Aktivität")+'</name>'+trk+'</trk></gpx>',"application/gpx+xml");
  }
  function downloadFile(name,content,type){
    const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function exportBackup(){
    const rides=await allRides();
    downloadFile("velox-backup-"+new Date().toISOString().slice(0,10)+".json",JSON.stringify({app:"VELOX",version:1,exportedAt:new Date().toISOString(),rides},null,2),"application/json");
    try{localStorage.setItem("velox-last-backup",String(Date.now()));}catch{}
    updateBackupHint(rides.length);
    showToast("Sicherung erstellt.");
  }
  function validImportedRide(ride){
    const optionalFinite=value=>value===undefined||value===null||Number.isFinite(value);
    return ride&&typeof ride==="object"&&ride.id!==undefined&&ride.id!==null&&String(ride.id).trim()!==""&&
      Number.isFinite(ride.startedAt)&&optionalFinite(ride.endedAt)&&optionalFinite(ride.pausedMs)&&optionalFinite(ride.pauseStarted)&&
      Array.isArray(ride.points)&&ride.points.every(point=>point&&Number.isFinite(point.lat)&&point.lat>=-90&&point.lat<=90&&
        Number.isFinite(point.lon)&&point.lon>=-180&&point.lon<=180&&Number.isFinite(point.t)&&
        ["alt","altAccuracy","pressureKPa","accuracy","speed"].every(key=>optionalFinite(point[key])));
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
      calcCache.clear();
      await refresh();
      const parts=[imported.length+" Aktivität(en) hinzugefügt."];
      if(remapped)parts.push(remapped+" doppelte ID(s) angepasst");
      if(skipped)parts.push(skipped+" ungültige Aktivitäten übersprungen");
      showToast(parts.join(" "));
    }catch(e){
      console.error(e);showToast("Import fehlgeschlagen. Vorhandene Touren wurden nicht überschrieben.");
    }
  }

  /* ---------- Start & Ereignisse ---------- */
  $("mapDateFilter")?.addEventListener("change",()=>{renderMapRideFilters(selectedMapRides());updatePersonalMapLayers();});
  $("mapFit")?.addEventListener("click",fitPersonalMap);
  $("mapHeatToggle")?.addEventListener("click",()=>{personalHeatVisible=!personalHeatVisible;updatePersonalMapLayers();});
  $("mapFollow")?.addEventListener("click",()=>{
    setFollow(!followLive);
    const last=activeRide&&lastValid(activeRide.points);
    if(followLive&&liveMap&&last)liveMap.setView([last.lat,last.lon],Math.max(liveMap.getZoom(),15));
  });
  $("startRide").addEventListener("click",()=>{if(activeProfile)selectProfile(activeProfile);else setPage("home");});
  $("trackStartRide")?.addEventListener("click",startRide);
  document.addEventListener("visibilitychange",()=>{
    if(!activeRide)return;
    if(document.visibilityState==="hidden")persistActiveRide().catch(error=>console.error("Checkpoint fehlgeschlagen:",error));
    else{if(activeRide.status==="recording")acquireWakeLock();updateLive(true);scheduleLiveClock();}
  });
  window.addEventListener("pagehide",()=>{
    if(activeRide)persistActiveRide().catch(error=>console.error("Letzter Checkpoint fehlgeschlagen:",error));
  });
  $("pauseRide").addEventListener("click",pauseRide);
  $("stopRide").addEventListener("click",stopRide);
  $("exportBackup").addEventListener("click",exportBackup);
  $("importBackup").addEventListener("click",()=>$("backupFile").click());
  $("backupFile").addEventListener("change",e=>{if(e.target.files[0])importBackup(e.target.files[0]);e.target.value="";});
  $("deleteAll").addEventListener("click",async()=>{
    const result=await openSheet({title:"Alle Aktivitäten löschen?",body:'<p>Alle lokal gespeicherten VELOX-Aktivitäten werden unwiderruflich von diesem Gerät entfernt. Erstelle vorher eine Sicherung, wenn du die Daten behalten möchtest.</p>',actions:[{id:"delete",label:"Alles löschen",primary:true},{id:"cancel",label:"Abbrechen",skip:true}]});
    if(result.action!=="delete")return;
    await dbRequest("readwrite","clear");calcCache.clear();await refresh();showToast("Alle lokalen Tourdaten gelöscht.");
  });
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
    unfinished.status="paused";unfinished.pauseStarted=now;
    dopplerSeen=(unfinished.points||[]).some(p=>p&&Number.isFinite(p.speed)&&p.speed>=1);
    unfinished.pauseIntervals.push({startedAt:now,endedAt:null});
    activeRide=unfinished;
    selectedActivityType=isRunning(unfinished)?"running":"cycling";
    activeProfile=selectedActivityType;
    try{localStorage.setItem(PROFILE_STORAGE_KEY,activeProfile);}catch{}
    await persistActiveRide();syncTrackStartButton();
    $("pauseRide").disabled=false;$("stopRide").disabled=false;$("pauseRide").textContent="Fortsetzen";
    $("trackingStatus").textContent="Unterbrochene Aktivität wiederhergestellt · pausiert";$("trackingDot").style.background="#d9b879";
    setPage("track");drawLive(activeRide.points,true);updateLive(true);
    showToast("Eine nicht abgeschlossene Aktivität wurde wiederhergestellt.");
  }
  function setStorageStatus(ok){
    const el=$("storageStatus");if(!el)return;
    el.textContent=ok===true?"Dauerhafter Speicher: aktiv – der Browser räumt deine Aktivitäten nicht von selbst auf."
      :ok===false?"Dauerhafter Speicher: vom Browser nicht zugesagt. Bitte regelmäßig eine Sicherung exportieren."
      :"Dauerhafter Speicher: wird von diesem Browser nicht unterstützt. Bitte regelmäßig eine Sicherung exportieren.";
  }
  async function requestPersistentStorage(){
    try{
      if(!(navigator.storage&&navigator.storage.persist)){setStorageStatus(null);return;}
      const already=navigator.storage.persisted?await navigator.storage.persisted():false;
      setStorageStatus(already||await navigator.storage.persist());
    }catch{setStorageStatus(null);}
  }
  async function init(){
    try{db=await openDB();activeProfile=readSavedProfile();if(activeProfile)selectedActivityType=activeProfile;await recoverUnfinishedRide();await refresh();if(!activeRide&&activeProfile)setPage(activeProfile+"-dashboard");else if(!activeRide)setPage("home");}
    catch(e){showToast("Lokale Datenbank konnte nicht geöffnet werden.");console.error(e);}
    requestPersistentStorage();
    if("serviceWorker" in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
    if(navigator.onLine)ensureTrackMap();
    else renderOfflineRoute("liveMap",[]);
    window.addEventListener("online",()=>{
      if(activeRide&&$("trackingStatus"))$("trackingStatus").textContent="Verbindung wieder da · GPS-Aufzeichnung läuft lokal weiter";
      ensureTrackMap();
      restoreOnlineMaps();
    });
    window.addEventListener("offline",()=>{
      if(activeRide&&$("trackingStatus"))$("trackingStatus").textContent="Offline · GPS-Aufzeichnung wird lokal gespeichert";
    });
    updateSensorStatus(null);
    syncTrackStartButton();
    setFollow(true);
    if(window.VELOXSensors)window.VELOXSensors.subscribe(()=>{if(activeRide&&activeRide.status==="recording")$("trackingStatus").textContent="Barometerdaten empfangen";});
  }
  window.VELOXApp=Object.freeze({version:APP_VERSION,selectProfile,profileRides,getActiveProfile:()=>activeProfile});
  init();
})();
