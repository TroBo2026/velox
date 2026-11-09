/* VELOX 0.6.0 — local-first cycling tracker */
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
  let liveMap = null;
  let liveLine = null;
  let liveMarker = null;
  let detailMap = null;
  let personalMap = null;
  let personalLines = new Map();
  let personalRidesCache = [];
  let personalHeatLayer = null;
  let personalHeatVisible = false;
  const personalVisibility = new Map();
  const mapColors = ["#5bd6c5","#e7bd75","#8ca8ff","#d98ce8","#ff8e80","#8fd18b","#f0a75b","#7bd1e8"];
  let toastTimer = null;

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
      let req;
      if(action==="all")req=store.getAll();
      if(action==="put")req=store.put(value);
      if(action==="delete")req=store.delete(value);
      if(action==="clear")req=store.clear();
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
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
  const allRides=async()=>((await dbRequest("readonly","all"))||[]).sort((a,b)=>b.startedAt-a.startedAt);
  const activeSeconds=(ride)=>Math.max(0,((ride.endedAt||Date.now())-ride.startedAt-(ride.pausedMs||0)-(ride.status==="paused"?Date.now()-(ride.pauseStarted||Date.now()):0))/1000);
  function median(values){
    const sorted=values.slice().sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
    return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
  }
  function buildElevationProfile(points){
    const samples=[];let distance=0,segment=0,previous=null;
    for(const point of points){
      if(previous){
        const d=haversine(previous,point),dt=(point.t-previous.t)/1000;
        if(Number.isFinite(d)&&d>0.8&&d<150&&dt>0&&dt<=30)distance+=d;
        if(!Number.isFinite(dt)||dt<=0||dt>30||d>=150)segment++;
      }
      const accuracy=Number.isFinite(point.altAccuracy)?point.altAccuracy:null;
      if(Number.isFinite(point.alt)&&point.alt!==null&&(accuracy===null||accuracy<=35))samples.push({distanceM:distance,altitude:point.alt,time:point.t,segment,accuracy});
      previous=point;
    }
    const smoothed=samples.map((sample,index)=>{
      const nearby=[];
      for(let offset=-2;offset<=2;offset++){
        const candidate=samples[index+offset];
        if(candidate&&candidate.segment===sample.segment&&Math.abs(candidate.distanceM-sample.distanceM)<=100&&Math.abs(candidate.time-sample.time)<=60000)nearby.push(candidate.altitude);
      }
      return {...sample,elevationM:median(nearby.length>=3?nearby:[sample.altitude])};
    });
    let gain=0,loss=0,lastSegment=null,anchor=null;
    for(const sample of smoothed){
      if(sample.segment!==lastSegment){lastSegment=sample.segment;anchor=sample.elevationM;continue;}
      const delta=sample.elevationM-anchor;
      if(delta>=4){gain+=delta;anchor=sample.elevationM;}else if(delta<=-4){loss+=-delta;anchor=sample.elevationM;}
    }
    const accurate=smoothed.filter(sample=>sample.accuracy!==null);
    const medianAccuracy=accurate.length?median(accurate.map(sample=>sample.accuracy)):null;
    const quality=smoothed.length<5?"low":medianAccuracy===null?"medium":medianAccuracy<=12?"high":medianAccuracy<=25?"medium":"low";
    let minimum=null,maximum=null;
    for(const sample of smoothed){minimum=minimum===null?sample.elevationM:Math.min(minimum,sample.elevationM);maximum=maximum===null?sample.elevationM:Math.max(maximum,sample.elevationM);}
    return {samples:smoothed,gain,loss,distanceM:distance,validCount:samples.length,totalCount:points.length,minimum,maximum,medianAccuracy,quality};
  }
  const movingSeconds=(ride)=>{
    const p=ride.points||[];let total=0;
    for(let i=1;i<p.length;i++){
      const dt=(p[i].t-p[i-1].t)/1000,d=haversine(p[i-1],p[i]);
      const speed=d/dt*3.6;
      if(dt>0&&dt<=30&&d>0.8&&d<150&&speed>=1&&speed<=100)total+=dt;
    }
    return total;
  };
  function gradeStats(points){
    const grades=[];let weightedSum=0,weightedDistance=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],d=haversine(a,b),dt=(b.t-a.t)/1000;
      if(d<8||d>100||dt<=0||dt>30||!Number.isFinite(a.alt)||!Number.isFinite(b.alt))continue;
      const accuracy=Math.max(a.altAccuracy||0,b.altAccuracy||0);if(accuracy>35)continue;
      const grade=(b.alt-a.alt)/d*100;if(!Number.isFinite(grade)||Math.abs(grade)>35)continue;
      grades.push({grade,distance:d});weightedSum+=grade*d;weightedDistance+=d;
    }
    return {average:weightedDistance?weightedSum/weightedDistance:0,maximum:grades.reduce((max,x)=>Math.max(max,x.grade),0),minimum:grades.reduce((min,x)=>Math.min(min,x.grade),0),samples:grades.length};
  }
  function currentGrade(points){
    if(points.length<2)return null;
    const last=points[points.length-1];
    if(!Number.isFinite(last.alt)||(last.altAccuracy||0)>35)return null;
    for(let i=points.length-2;i>=0;i--){
      const first=points[i],distance=haversine(first,last),elapsed=(last.t-first.t)/1000;
      if(elapsed>90)break;
      if(distance<20)continue;
      if(distance>80)break;
      if(!Number.isFinite(first.alt)||(first.altAccuracy||0)>35)continue;
      const grade=(last.alt-first.alt)/distance*100;
      return Number.isFinite(grade)&&Math.abs(grade)<=35?grade:null;
    }
    return null;
  }
  function calcRide(ride){
    const p=ride.points||[];let distance=0;
    for(let i=1;i<p.length;i++){const d=haversine(p[i-1],p[i]),dt=(p[i].t-p[i-1].t)/1000;if(dt>0&&dt<=30&&d<150&&d>0.8)distance+=d;}
    const elevation=buildElevationProfile(p),grades=gradeStats(p);
    const elapsed=activeSeconds(ride),moving=movingSeconds(ride),avg=moving>0?distance/moving*3.6:0;
    const speeds=[];
    for(let i=1;i<p.length;i++){const dt=(p[i].t-p[i-1].t)/1000,d=haversine(p[i-1],p[i]),speed=d/dt*3.6;if(dt>0&&dt<=30&&d>0.8&&d<150&&Number.isFinite(speed)&&speed<=100)speeds.push(speed);}
    const stopped=Math.max(0,elapsed-moving);
    return {distanceM:distance,elevationGain:elevation.gain,elevationLoss:elevation.loss,elevationMin:elevation.minimum,elevationMax:elevation.maximum,elevationQuality:elevation.quality,elevationAccuracy:elevation.medianAccuracy,gradeAverage:grades.average,gradeMax:grades.maximum,gradeMin:grades.minimum,gradeSamples:grades.samples,elapsedSeconds:elapsed,movingSeconds:moving,stoppedSeconds:stopped,movingRatio:elapsed?moving/elapsed*100:0,averageSpeed:avg,maxSpeed:speeds.reduce((maximum,speed)=>Math.max(maximum,speed),0)};
  }
  function setPage(page){
    currentPage=page;
    document.querySelectorAll(".page").forEach(el=>el.classList.toggle("active",el.id==="page-"+page));
    document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("selected",el.dataset.page===page));
    if(page==="home"||page==="rides"||page==="stats")refresh();
    if(page==="track")setTimeout(()=>{if(liveMap)liveMap.invalidateSize();},100);
    if(page==="stats")setTimeout(()=>renderPersonalMap(),180);
    window.scrollTo({top:0,behavior:"instant"});
  }
  document.addEventListener("click",e=>{
    const nav=e.target.closest("[data-page]");
    if(nav){e.preventDefault();setPage(nav.dataset.page);}
  });
  function initMap(elementId,center=[51.05,13.74],options={}){
    if(!window.L)return null;
    const map=L.map(elementId,{zoomControl:true,attributionControl:true,...options}).setView(center,13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
    return map;
  }
  function drawLive(points){
    if(!liveMap)return;
    const coords=points.map(p=>[p.lat,p.lon]);
    if(liveLine)liveLine.setLatLngs(coords);else liveLine=L.polyline(coords,{color:"#5bd6c5",weight:5,opacity:.95}).addTo(liveMap);
    if(coords.length){const last=coords[coords.length-1];if(liveMarker)liveMarker.setLatLng(last);else liveMarker=L.circleMarker(last,{radius:7,color:"#07131f",weight:3,fillColor:"#5bd6c5",fillOpacity:1}).addTo(liveMap);liveMap.setView(last,Math.max(liveMap.getZoom(),15));}
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
    personalLines.forEach(layer=>personalMap.removeLayer(layer));personalLines.clear();
    if(personalHeatLayer){personalMap.removeLayer(personalHeatLayer);personalHeatLayer=null;}
    const rides=selectedMapRides().filter(ride=>personalVisibility.get(String(ride.id))!==false);
    const bounds=[];
    rides.forEach((ride,index)=>{
      const points=ride.points||[];if(points.length<2)return;
      const color=mapColors[personalRidesCache.indexOf(ride)%mapColors.length];
      const line=L.polyline(points.map(point=>[point.lat,point.lon]),{color,weight:4,opacity:.82,lineCap:"round",lineJoin:"round"}).addTo(personalMap);
      personalLines.set(String(ride.id),line);
      line.getLatLngs().forEach(point=>bounds.push(point));
    });
    if(personalHeatVisible&&rides.length){
      const cells=new Map();
      rides.forEach(ride=>{
        const touched=new Set();
        (ride.points||[]).forEach(point=>{
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
    const points=personalRidesCache.flatMap(ride=>ride.points||[]);
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
    personalLines.forEach(line=>line.getLatLngs().forEach(point=>points.push(point)));
    if(points.length)personalMap.fitBounds(L.latLngBounds(points),{padding:[24,24],maxZoom:15});
  }
  function renderRideList(container,rides){
    if(!rides.length){container.innerHTML='<div class="empty-state">Noch keine Touren gespeichert.</div>';return;}
    container.innerHTML=rides.map(r=>{
      const c=calcRide(r),date=new Date(r.startedAt).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"});
      return '<button class="ride-card" data-ride="'+r.id+'"><div><h3>'+escapeHtml(r.name||"Fahrradtour")+'</h3><p>'+date+' · '+fmt(c.movingSeconds/60,0)+' min · '+fmt(c.averageSpeed)+' km/h Ø</p></div><div class="ride-distance">'+fmt(c.distanceM/1000)+' <small>km</small></div></button>';
    }).join("");
    container.querySelectorAll("[data-ride]").forEach(el=>el.addEventListener("click",()=>openDetail(el.dataset.ride)));
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  async function startRide(){
    if(!navigator.geolocation){showToast("GPS wird von diesem Browser nicht unterstützt.");return;}
    if(!window.isSecureContext){showToast("GPS benötigt eine sichere HTTPS-Verbindung.");return;}
    activeRide={id:"ride-"+Date.now(),name:"Fahrradtour",startedAt:Date.now(),endedAt:null,pausedMs:0,points:[],status:"recording"};
    try{await dbRequest("readwrite","put",activeRide);}catch(e){activeRide=null;showToast("Lokale Speicherung nicht verfügbar.");return;}
    $("pauseRide").disabled=false;$("stopRide").disabled=false;$("pauseRide").textContent="Pause";
    $("trackingStatus").textContent="GPS wird gesucht …";$("trackingDot").style.background="#d9b879";
    liveMap=liveMap||initMap("liveMap");liveLine=null;liveMarker=null;
    setPage("track");
    watchId=navigator.geolocation.watchPosition(onPosition,onGeoError,{enableHighAccuracy:true,maximumAge:1000,timeout:20000});
    timerId=setInterval(updateLive,1000);updateLive();
  }
  async function onPosition(pos){
    if(!activeRide||activeRide.status!=="recording")return;
    const c=pos.coords,timestamp=pos.timestamp||Date.now();
    const sensor=window.VELOXSensors?window.VELOXSensors.fuseAltitude(c.altitude,c.altitudeAccuracy,timestamp):{altitudeM:Number.isFinite(c.altitude)?c.altitude:null,accuracyM:Number.isFinite(c.altitudeAccuracy)?c.altitudeAccuracy:null,source:"gps"};
    const point={lat:c.latitude,lon:c.longitude,t:timestamp,alt:sensor.altitudeM,altAccuracy:sensor.accuracyM,altSource:sensor.source,pressureKPa:sensor.pressureKPa,accuracy:c.accuracy};
    const prev=activeRide.points[activeRide.points.length-1];
    if(prev){const d=haversine(prev,point);const dt=(point.t-prev.t)/1000;if(d>150||dt<=0)return;if(d<1.5&&dt<3)return;}
    activeRide.points.push(point);
    await dbRequest("readwrite","put",activeRide);
    $("trackingStatus").textContent="Aufzeichnung läuft";$("trackingDot").style.background="var(--teal)";
    $("gpsAccuracy").textContent="GPS ±"+Math.round(c.accuracy)+" m";
    updateSensorStatus(point);drawLive(activeRide.points);updateLive();
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
  function updateLive(){
    if(!activeRide)return;
    const c=calcRide(activeRide);
    $("liveDistance").textContent=fmt(c.distanceM/1000,2);
    $("liveSpeed").innerHTML=fmt(currentSpeed(activeRide.points))+" <small>km/h</small>";
    $("liveDuration").textContent=fmtTime(c.elapsedSeconds);
    $("liveElevation").innerHTML=Math.round(c.elevationGain)+' <small>m</small>';
    $("liveAverage").innerHTML=fmt(c.averageSpeed)+' <small>km/h</small>';
    const last=activeRide.points[activeRide.points.length-1],elevation=buildElevationProfile(activeRide.points),grades=gradeStats(activeRide.points);
    $("liveAltitude").innerHTML=last&&Number.isFinite(last.alt)?Math.round(last.alt)+' <small>m</small>':'– <small>m</small>';
    const liveGrade=currentGrade(activeRide.points);
    $("liveGrade").innerHTML=liveGrade===null?'– <small>%</small>':fmt(liveGrade)+' <small>%</small>';
    $("liveMovingRatio").innerHTML=fmt(c.movingRatio,0)+' <small>%</small>';
    $("liveAltitudeQuality").textContent=elevation.quality==="high"?"Gut":elevation.quality==="medium"?"Mittel":"Begrenzt";
    const latest=activeRide.points[activeRide.points.length-1];updateSensorStatus(latest);
  }
  async function pauseRide(){
    if(!activeRide)return;
    if(activeRide.status==="recording"){
      activeRide.status="paused";activeRide.pauseStarted=Date.now();
      if(watchId!==null)navigator.geolocation.clearWatch(watchId);watchId=null;
      $("pauseRide").textContent="Fortsetzen";$("trackingStatus").textContent="Pausiert";
    }else{
      activeRide.pausedMs=(activeRide.pausedMs||0)+(Date.now()-(activeRide.pauseStarted||Date.now()));
      delete activeRide.pauseStarted;activeRide.status="recording";
      watchId=navigator.geolocation.watchPosition(onPosition,onGeoError,{enableHighAccuracy:true,maximumAge:1000,timeout:20000});
      $("pauseRide").textContent="Pause";$("trackingStatus").textContent="Aufzeichnung läuft";
    }
    await dbRequest("readwrite","put",activeRide);updateLive();
  }
  async function stopRide(){
    if(!activeRide)return;
    if(activeRide.status==="paused"){activeRide.pausedMs=(activeRide.pausedMs||0)+(Date.now()-(activeRide.pauseStarted||Date.now()));delete activeRide.pauseStarted;}
    if(watchId!==null)navigator.geolocation.clearWatch(watchId);watchId=null;
    clearInterval(timerId);timerId=null;
    activeRide.status="completed";activeRide.endedAt=Date.now();
    const c=calcRide(activeRide);
    await dbRequest("readwrite","put",activeRide);
    activeRide=null;$("pauseRide").disabled=true;$("stopRide").disabled=true;
    $("trackingStatus").textContent="Tour gespeichert";$("trackingDot").style.background="var(--teal)";
    showToast(c.distanceM>0?"Tour lokal gespeichert.":"Tour ohne ausreichende GPS-Daten gespeichert.");
    await refresh();setPage("rides");
  }
  async function openDetail(id){
    const r=(await allRides()).find(x=>x.id===id);if(!r)return;
    const c=calcRide(r),date=new Date(r.startedAt).toLocaleString("de-DE",{dateStyle:"full",timeStyle:"short"});
    $("rideDetail").innerHTML='<div class="detail-header"><span class="eyebrow">TOURENDETAIL</span><h1>'+escapeHtml(r.name||"Fahrradtour")+'</h1><p class="muted">'+date+'</p></div>'+
      '<div class="metric-grid detail-metrics">'+
      metric("Distanz",fmt(c.distanceM/1000)+" km")+metric("Fahrzeit",fmtTime(c.movingSeconds))+metric("Ø Geschwindigkeit",fmt(c.averageSpeed)+" km/h")+metric("Max. Geschwindigkeit",fmt(c.maxSpeed)+" km/h")+
      metric("Aufstieg",Math.round(c.elevationGain)+" m")+metric("Abstieg",Math.round(c.elevationLoss)+" m")+metric("Höchster Punkt",c.elevationMax===null?"–":Math.round(c.elevationMax)+" m")+metric("Tiefster Punkt",c.elevationMin===null?"–":Math.round(c.elevationMin)+" m")+metric("Ø Steigung",c.gradeSamples?fmt(c.gradeAverage)+" %":"–")+metric("Max. Steigung",c.gradeSamples?fmt(c.gradeMax)+" %":"–")+metric("Steilste Abfahrt",c.gradeSamples?fmt(Math.abs(c.gradeMin))+" %":"–")+metric("Fahrzeitanteil",fmt(c.movingRatio,0)+" %")+metric("Standzeit",fmtTime(c.stoppedSeconds))+metric("GPS-Punkte",r.points.length)+metric("Aufzeichnungsdauer",fmtTime(c.elapsedSeconds))+'</div>'+
      '<div class="detail-map" id="detailMap"></div>'+
      '<div class="panel"><span class="eyebrow">HÖHENPROFIL</span><h3>Höhenverlauf</h3><div class="chart-box" id="elevationChart"></div><p>Quelle: GPS-Höhenwerte des Geräts. Die Genauigkeit hängt vom Empfang und Sensor ab.</p></div><div class="panel"><span class="eyebrow">GESCHWINDIGKEITSPROFIL</span><h3>Tempo über die Strecke</h3><div class="chart-box" id="speedChart"></div><p>Aus gültigen GPS-Punktabständen berechnet; kurze Ausreißer und unplausible Werte werden ausgeschlossen.</p></div>'+
      '<div class="panel"><span class="eyebrow">DATENQUELLE</span><h3>Messwerte & Berechnungen</h3><p>Distanz, Geschwindigkeit und Steigung aus GPS-Positionen und Zeitstempeln. Höhenmeter aus geglätteten GPS-Höhenwerten mit Qualitätsprüfung und Ausreißerfilter. Herzfrequenz, Leistung und Trittfrequenz werden erst angezeigt, wenn eine spätere kompatible Sensor-Anbindung echte Messwerte liefert. Das iOS-Web kann den internen Barometer-Druckwert derzeit nicht direkt auslesen.</p></div>'+
      '<div class="tracking-actions"><button class="secondary-button" id="exportGpx">GPX exportieren</button><button class="danger-outline" id="deleteRide">Tour löschen</button></div>';
    setPage("detail");
    setTimeout(()=>{
      detailMap=initMap("detailMap",r.points.length?[r.points[0].lat,r.points[0].lon]:[51.05,13.74]);
      if(detailMap&&r.points.length){const line=L.polyline(r.points.map(p=>[p.lat,p.lon]),{color:"#5bd6c5",weight:5}).addTo(detailMap);detailMap.fitBounds(line.getBounds(),{padding:[20,20]});L.marker([r.points[0].lat,r.points[0].lon]).addTo(detailMap).bindPopup("Start");L.marker([r.points.at(-1).lat,r.points.at(-1).lon]).addTo(detailMap).bindPopup("Ziel");}
      renderElevation(r.points);
      renderSpeedProfile(r.points);
    },150);
    $("exportGpx").onclick=()=>exportGPX(r);$("deleteRide").onclick=async()=>{if(confirm("Diese Tour dauerhaft löschen?")){await dbRequest("readwrite","delete",r.id);showToast("Tour gelöscht.");setPage("rides");}};
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
    const startAnchor=firstX>left+70?'end':'start',endAnchor=lastX>left+width-70?'end':'start';
    const xLabels='<text class="axis-label" x="'+left+'" y="166" text-anchor="start">0 km</text><text class="axis-label" x="'+(left+width/2)+'" y="166" text-anchor="middle">'+fmt(xMax/2000,1)+' km</text><text class="axis-label" x="'+(left+width)+'" y="166" text-anchor="end">'+fmt(xMax/1000,1)+' km</text>';
    const markers='<circle class="profile-marker" cx="'+firstX+'" cy="'+firstY+'" r="4"/><text class="marker-label" x="'+(firstX+(startAnchor==="start"?6:-6))+'" y="'+Math.max(10,firstY-9)+'" text-anchor="'+startAnchor+'">Start</text><circle class="profile-marker" cx="'+lastX+'" cy="'+lastY+'" r="4"/><text class="marker-label" x="'+(lastX+(endAnchor==="start"?6:-6))+'" y="'+Math.max(10,lastY-9)+'" text-anchor="'+endAnchor+'">Ziel</text>';
    box.innerHTML='<div class="elevation-summary"><span class="elevation-stat">Aufstieg <strong>+'+Math.round(profile.gain)+' m</strong></span><span class="elevation-stat">Abstieg <strong>−'+Math.round(profile.loss)+' m</strong></span></div><svg class="elevation-chart" viewBox="0 0 640 184" role="img" aria-label="Höhenprofil mit '+samples.length+' gültigen GPS-Höhenpunkten"><text class="axis-title" x="8" y="12">Höhe (m)</text>'+grid.join('')+'<line class="axis-line" x1="'+left+'" y1="'+bottom+'" x2="'+(left+width)+'" y2="'+bottom+'"/>'+paths+markers+xLabels+'</svg><p class="elevation-footnote">GPS-Höhenpunkte: '+profile.validCount+' von '+profile.totalCount+'. Ein Medianfilter über bis zu fünf benachbarte Messungen dämpft Ausreißer; Höhenänderungen unter 4 m werden nicht zur Summe addiert.</p>';
  }
  function renderSpeedProfile(points){
    const box=$("speedChart"),samples=[];let distance=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dt=(b.t-a.t)/1000,d=haversine(a,b);
      if(dt<=0||dt>30||d<=0.8||d>=150)continue;
      const speed=d/dt*3.6;
      if(!Number.isFinite(speed)||speed>100)continue;
      distance+=d;samples.push({distance,speed});
    }
    if(samples.length<3){box.innerHTML='<div class="empty-state">Nicht genügend verlässliche GPS-Punkte für ein Geschwindigkeitsprofil vorhanden.</div>';return;}
    const filtered=samples.map((sample,index)=>{
      const values=samples.slice(Math.max(0,index-2),Math.min(samples.length,index+3)).map(x=>x.speed).sort((a,b)=>a-b);
      return {...sample,speed:values[Math.floor(values.length/2)]};
    });
    const maxSpeed=Math.max(10,Math.ceil(Math.max(...filtered.map(x=>x.speed))/5)*5);
    const left=48,top=14,width=576,height=132,bottom=top+height,xMax=Math.max(1,distance);
    const x=v=>left+v/xMax*width,y=v=>top+(maxSpeed-v)/maxSpeed*height;
    const stride=Math.max(1,Math.ceil(filtered.length/280)),plot=[];
    for(let i=0;i<filtered.length;i++)if(i===0||i===filtered.length-1||i%stride===0)plot.push(filtered[i]);
    const grid=[];
    for(let i=0;i<=4;i++){const value=maxSpeed*(1-i/4),yy=top+height*i/4;grid.push('<line class="grid-line" x1="'+left+'" y1="'+yy+'" x2="'+(left+width)+'" y2="'+yy+'"/><text class="axis-label" x="'+(left-8)+'" y="'+(yy+4)+'" text-anchor="end">'+Math.round(value)+'</text>');}
    const line=plot.map(p=>x(p.distance)+','+y(p.speed)).join(' ');
    const avg=filtered.reduce((sum,p)=>sum+p.speed,0)/filtered.length,peak=Math.max(...filtered.map(p=>p.speed));
    box.innerHTML='<div class="elevation-summary"><span class="elevation-stat">Ø GPS-Tempo <strong>'+fmt(avg)+' km/h</strong></span><span class="elevation-stat">Spitze <strong>'+fmt(peak)+' km/h</strong></span></div><svg class="elevation-chart" viewBox="0 0 640 184" role="img" aria-label="Geschwindigkeitsprofil über die Distanz"><text class="axis-title" x="8" y="12">km/h</text>'+grid.join('')+'<line class="axis-line" x1="'+left+'" y1="'+bottom+'" x2="'+(left+width)+'" y2="'+bottom+'"/><polyline class="profile-line" points="'+line+'"/><text class="axis-label" x="'+left+'" y="166" text-anchor="start">0 km</text><text class="axis-label" x="'+(left+width/2)+'" y="166" text-anchor="middle">'+fmt(xMax/2000,1)+' km</text><text class="axis-label" x="'+(left+width)+'" y="166" text-anchor="end">'+fmt(xMax/1000,1)+' km</text></svg><p class="elevation-footnote">'+filtered.length+' geglättete Messpunkte aus '+samples.length+' gültigen GPS-Abschnitten.</p>';
  }
  function exportGPX(r){
    const pts=r.points||[];if(!pts.length){showToast("Keine GPS-Punkte zum Export vorhanden.");return;}
    const esc=s=>String(s).replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]));
    const trk=pts.map(p=>'<trkpt lat="'+p.lat+'" lon="'+p.lon+'">'+(Number.isFinite(p.alt)?'<ele>'+p.alt+'</ele>':'')+'<time>'+new Date(p.t).toISOString()+'</time></trkpt>').join("");
    downloadFile("velox-"+r.id+".gpx",'<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="VELOX" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>'+esc(r.name||"VELOX Tour")+'</name><trkseg>'+trk+'</trkseg></trk></gpx>',"application/gpx+xml");
  }
  function downloadFile(name,content,type){
    const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function exportBackup(){
    const rides=await allRides();downloadFile("velox-backup-"+new Date().toISOString().slice(0,10)+".json",JSON.stringify({app:"VELOX",version:1,exportedAt:new Date().toISOString(),rides},null,2),"application/json");showToast("Sicherung erstellt.");
  }
  function validImportedRide(ride){
    return ride&&typeof ride==="object"&&ride.id!==undefined&&ride.id!==null&&String(ride.id).trim()!==""&&Number.isFinite(ride.startedAt)&&Array.isArray(ride.points)&&ride.points.every(point=>point&&Number.isFinite(point.lat)&&point.lat>=-90&&point.lat<=90&&Number.isFinite(point.lon)&&point.lon>=-180&&point.lon<=180&&Number.isFinite(point.t));
  }
  async function importBackup(file){
    try{
      const data=JSON.parse(await file.text());
      if(data.app!=="VELOX"||!Array.isArray(data.rides))throw new Error("Ungültige VELOX-Sicherung");
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
  $("pauseRide").addEventListener("click",pauseRide);
  $("stopRide").addEventListener("click",stopRide);
  $("exportBackup").addEventListener("click",exportBackup);
  $("importBackup").addEventListener("click",()=>$("backupFile").click());
  $("backupFile").addEventListener("change",e=>{if(e.target.files[0])importBackup(e.target.files[0]);e.target.value="";});
  $("deleteAll").addEventListener("click",async()=>{if(confirm("Wirklich alle VELOX-Touren auf diesem Gerät löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.")){await dbRequest("readwrite","clear");await refresh();showToast("Alle lokalen Tourdaten gelöscht.");}});
  $("installHint").addEventListener("click",()=>showToast('Safari: Teilen → „Zum Home-Bildschirm“ hinzufügen.'));
  async function init(){
    try{db=await openDB();await refresh();}
    catch(e){showToast("Lokale Datenbank konnte nicht geöffnet werden.");console.error(e);}
    if("serviceWorker" in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
    if(window.L)liveMap=initMap("liveMap");
    updateSensorStatus(null);
    if(window.VELOXSensors)window.VELOXSensors.subscribe(sample=>{if(activeRide&&activeRide.status==="recording")$("trackingStatus").textContent="Barometerdaten empfangen";});
  }
  init();
})();