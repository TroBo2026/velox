/* VELOX App-Rauchtest: lädt die komplette App mit Attrappen für DOM/IndexedDB und spielt Übersicht, Tourdetail, Wrapped, Live-Aufzeichnung und Pro-Analyse durch. Ausführen: node tests/app.smoke.test.js */
const vm=require("vm"),fs=require("fs");
const R=require("path").join(__dirname,"..")+"/";
let seed=7;const rnd=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296};
const gauss=()=>Math.sqrt(-2*Math.log(rnd()+1e-12))*Math.cos(2*Math.PI*rnd());
const LAT=51.05,M_LON=1/(111320*Math.cos(LAT*Math.PI/180)),M_LAT=1/110574;
const alt=d=>d<2000?200+d*0.05:d<3000?300:d<5000?300-(d-3000)*0.05:200;
function ride(id,startMs,len){const pts=[];let d=0,t=startMs;while(d<len){pts.push({lat:LAT+gauss()*.8*M_LAT,lon:13.7+(d+gauss()*.8)*M_LON,t,accuracy:5,alt:alt(d)+gauss()*3,altAccuracy:8,altSource:"gps",speed:5});d+=5;t+=1000;if(Math.floor(d)===1000&&pts.length%2===0){for(let i=0;i<40;i++){t+=1000;pts.push({lat:LAT,lon:13.7+d*M_LON,t,accuracy:5,alt:alt(d),altAccuracy:8,speed:0});}t+=1000;d+=0.001;}}
 return{id,name:"Testtour "+id,startedAt:startMs,endedAt:t,pausedMs:0,pauseIntervals:[],status:"completed",points:pts,weather:{condition:"Sonnig",temperatureC:12,source:"open-meteo",sourceLabel:"Open-Meteo"}};}
const data=new Map();[ride("a",1.7e12,8000),ride("b",1.71e12,6000),ride("c",1.72e12,3000)].forEach(r=>data.set(r.id,r));
const els={};const docL={};const dialogAnswers=[];
class El{constructor(id){this.id=id;this.innerHTML="";this.textContent="";this.style={};this.dataset={};this.listeners={};this.hidden=false;this.disabled=false;this.classList={add(){},remove(){},toggle(){},contains(){return false}};}
 addEventListener(t,f){(this.listeners[t]=this.listeners[t]||[]).push(f)} removeEventListener(){} setAttribute(){} getAttribute(){return null} removeAttribute(){}
 querySelector(){return null} appendChild(){} remove(){} click(){} focus(){} getBoundingClientRect(){return{left:0,width:640}}
 querySelectorAll(sel){const m=[...this.innerHTML.matchAll(/data-ride="([^"]+)"/g)];if(sel==="[data-ride]")return m.map(x=>{const e=new El();e.dataset.ride=x[1];els["ride:"+x[1]+":"+this.id]=e;return e});return[]}
 showModal(){const a=dialogAnswers.shift()||"cancel";setTimeout(()=>{this.returnValue=a;(this.listeners.close||[]).forEach(f=>f())},0)}}
const doc={getElementById:id=>els[id]||(els[id]=new El(id)),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>new El(),body:new El("body"),head:new El("head"),
 addEventListener:(t,f)=>{(docL[t]=docL[t]||[]).push(f)},visibilityState:"visible"};
const geoCbs={};
const sb={document:doc,navigator:{onLine:false,geolocation:{watchPosition:(ok,err)=>{geoCbs.ok=ok;return 1},clearWatch(){}},storage:{persist:async()=>true,persisted:async()=>false},wakeLock:{request:async()=>({addEventListener(){},release:async()=>{}})}},
 isSecureContext:true,scrollTo(){},addEventListener(){},dispatchEvent(){},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},console,setTimeout,clearTimeout,Date,Math,JSON,Number,String,Array,Object,Map,Set,Promise,Blob:class{},URL,Error,
 indexedDB:{open(){const req={};const db={objectStoreNames:{contains:()=>true},createObjectStore(){},close(){},
  transaction(){const tx={};const mk=fn=>{const r={};setTimeout(()=>{r.result=fn();r.onsuccess&&r.onsuccess()},0);return r};
   tx.objectStore=()=>({getAll:()=>mk(()=>[...data.values()].map(v=>JSON.parse(JSON.stringify(v)))),put:v=>mk(()=>{data.set(v.id,JSON.parse(JSON.stringify(v)));return v.id}),add:v=>mk(()=>{data.set(v.id,v)}),delete:id=>mk(()=>{data.delete(id)}),clear:()=>mk(()=>data.clear())});
   setTimeout(()=>tx.oncomplete&&tx.oncomplete(),8);return tx}};
  setTimeout(()=>{req.result=db;req.onsuccess&&req.onsuccess()},0);return req}},
 localStorage:{data:new Map([["velox-profile-height-cm","170"]]),getItem(k){return this.data.has(k)?this.data.get(k):null;},setItem(k,v){this.data.set(k,String(v));}}};
sb.window=sb;sb.self=sb;sb.requestAnimationFrame=f=>setTimeout(f,0);
const ctx=vm.createContext(sb);
for(const f of["sensor-core.js","elevation-core.js","ride-core.js","charts.js","step-counter.js","app.js","analysis-pro.js"])vm.runInContext(fs.readFileSync(R+f,"utf8"),ctx,{filename:f});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ok=(c,m)=>{if(!c){console.log("  ✗",m);process.exitCode=1}else console.log("  ✓",m)};
(async()=>{
 await sleep(150);
 ok(els.totalRides.textContent==3,"Übersicht: 3 Touren ("+els.totalRides.textContent+")");
 ok(/km/.test(els.totalDistance.innerHTML)&&!/^0,0/.test(els.totalDistance.innerHTML),"Gesamtdistanz: "+els.totalDistance.innerHTML);
 ok(/ride-card/.test(els.bikeRecentRides.innerHTML),"Fahrradprofil zeigt alte Aktivitäten als Fahrradtouren");
 ok(!/ride-card/.test(els.runRecentRides.innerHTML),"Laufprofil bleibt frei von Fahrradtouren");
 ok(els.bikeCount.textContent==="3"&&els.runCount.textContent==="0","Getrennte Dashboard-Zähler für Rad und Lauf");
 ok(/<table/.test(els.rideComparison.innerHTML),"Tourenvergleich gerendert");
 ok(els.backupHint&&els.backupHint.innerHTML.includes("Noch keine Sicherung"),"Backup-Hinweis erscheint");
 ok(/Dauerhafter Speicher: aktiv/.test(els.storageStatus?.textContent||""),"Speicherschutz-Status");
 // Detail öffnen
 const card=els["ride:a:bikeRecentRides"];(card.listeners.click||[])[0]();await sleep(500);
 ok(els.rideDetail.innerHTML.length>5000,"Detailseite gerendert ("+els.rideDetail.innerHTML.length+" Zeichen)");
 ok(/Steilste Abfahrt/.test(els.rideDetail.innerHTML)&&!/NaN/.test(els.rideDetail.innerHTML),"Detail ohne NaN");
 ok(/vx-svg/.test(els.elevationPlot.innerHTML),"Höhenprofil-Grafik (SVG) gerendert");
 ok(/vx-band/.test(els.elevationPlot.innerHTML),"Längster Anstieg als Band markiert");
 ok(/vx-svg/.test(els.speedPlot.innerHTML),"Tempo-Grafik gerendert");
 ok(/vx-svg/.test(els.gradePlot.innerHTML),"Steigungs-Grafik gerendert");
 ok(/Stopps/.test(els.rideDetail.innerHTML)&&/Erkannte Stopps<\/span><strong>1<\/strong>/.test(els.rideDetail.innerHTML),"1 Stopp erkannt");
 ok(!/Strecken-Geradlinigkeit<\/span><strong>–/.test(els.rideDetail.innerHTML),"Geradlinigkeit trotz Stopp berechnet");
 // Profile auswählen: bestehende Datensätze ohne activityType müssen im Fahrradprofil bleiben.
 sb.VELOXApp.selectProfile("cycling");await sleep(150);
 ok(sb.VELOXApp.getActiveProfile()==="cycling"&&els.bikeCount.textContent==="3","Fahrradprofil wird dauerhaft ausgewählt");
 ok(sb.localStorage.getItem("velox-active-profile")==="cycling","Aktives Profil wird lokal gespeichert");
 ok(els.allRides.innerHTML.includes("Testtour a")&&!els.allRides.innerHTML.includes("Laufrunde"),"Aktivitätenarchiv folgt dem Fahrradprofil");
 const mixed=[{id:"run",activityType:"running"},{id:"bike",activityType:"cycling"},{id:"legacy"}];
 ok(sb.VELOXApp.profileRides(mixed,"running").length===1&&sb.VELOXApp.profileRides(mixed,"cycling").length===2,"Profilfilter trennt neue und alte Aktivitätsdatensätze korrekt");
 // Wrapped
 docL.click.forEach(f=>f({target:{closest:(selector)=>selector==="[data-page]"?{dataset:{page:"wrapped"}}:null},preventDefault(){}}));await sleep(300);
 ok(/Persönliche Rekorde/.test(els.wrappedContent.innerHTML)&&!/NaN|undefined/.test(els.wrappedContent.innerHTML),"Wrapped gerendert ohne NaN/undefined");
 // Laufprofil vor dem Tracking auswählen; im Tracking gibt es keine Sportauswahl mehr.
 sb.VELOXApp.selectProfile("running");await sleep(150);
 ok(els.trackPageTitle.textContent==="Dein Lauf","Laufprofil stellt automatisch die passende Tracking-Oberfläche ein");
 ok(!els.activityModePicker,"Im Tracking existiert keine Sportauswahl mehr");
 ok(els.allRides.innerHTML.includes("Noch keine Aktivitäten"),"Archiv zeigt im Laufprofil keine Fahrradtouren");
 await els.trackStartRide.listeners.click[0]();await sleep(100);
 sb.VELOXApp.selectProfile("cycling");
 ok(sb.VELOXApp.getActiveProfile()==="running","Profilwechsel wird während einer laufenden Aktivität blockiert");
 ok(geoCbs.ok,"GPS-Watch gestartet (kein liveLine-Fehler)");
 let t=Date.now()-130000,d=0;
 for(let i=0;i<120;i++){t+=1000;d+=5;await geoCbs.ok({timestamp:t,coords:{latitude:LAT,longitude:13.7+d*M_LON,accuracy:5,altitude:200+d*0.03,altitudeAccuracy:6,speed:5}});}
 await sleep(3200);
 ok(/^0?,?\d/.test(els.liveDistance.textContent)&&parseFloat(els.liveDistance.textContent.replace(",","."))>0.5,"Live-Distanz: "+els.liveDistance.textContent+" km");
 ok(/min\/km/.test(els.liveSpeed.innerHTML)&&/3:20/.test(els.liveSpeed.innerHTML),"Live-Pace (Doppler 5 m/s ≈ 18 km/h): "+els.liveSpeed.innerHTML);
 ok(els.liveSpeedLabel.textContent==="Aktuelle Pace"&&els.liveAverageLabel.textContent==="Ø Pace"&&els.liveDurationLabel.textContent==="Laufzeit","Lauf-spezifische Live-Bezeichnungen");
 ok(els.trackingStatus.textContent==="Aufzeichnung läuft","Status: "+els.trackingStatus.textContent);
 ok(els.sensorWakeStatus.textContent==="Bildschirm bleibt an","Wake Lock: "+els.sensorWakeStatus.textContent);
 // Tour beenden: Bestätigung "stop", Wetter "skip"
 dialogAnswers.push("stop","skip");await els.stopRide.listeners.click[0]();await sleep(300);
 ok(data.size===4,"Tour gespeichert (4 in DB): "+data.size);
 const saved=[...data.values()].find(r=>!["a","b","c"].includes(r.id));
 ok(saved&&saved.status==="completed"&&saved.activityType==="running"&&saved.name==="Laufrunde"&&saved.points.length===120&&saved.points[5].speed===5,"Laufaktivität vollständig inkl. Sportart und Doppler-Tempo");
 ok(saved&&saved.heightCm===170&&saved.stepCountSource==="unavailable","Laufprofil speichert Körpergröße und Sensorstatus auch ohne Bewegungssensor");
 await sb.VELOXApp.openDetail(saved.id);await sleep(450);
 ok(/Schrittanalyse \(Schätzung\)/.test(els.rideDetail.innerHTML)&&/Schrittlänge/.test(els.rideDetail.innerHTML),"Schrittanalyse erscheint in den gespeicherten Laufdetails");
 const r=data.get("a"),pro=sb.VELOXProAnalysis.analyzeRide(r,5),core=sb.VELOXCore.analyze(r);
 const runPro=sb.VELOXProAnalysis.analyzeRide({...r,activityType:"running"},5);
 ok(runPro.activityType==="running"&&runPro.speedZones.some(zone=>zone.label.includes("min/km")),"Pro-Analyse nutzt Laufpace-Zonen statt Fahrrad-km/h");
 const stepRide={...r,activityType:"running",stepCountSource:"device-motion",stepSensorEvents:600,steps:500,heightCm:170};
 const stepAnalysis=sb.VELOXProAnalysis.analyzeRide(stepRide,5);
 ok(sb.VELOXProAnalysis.renderSingle(stepAnalysis,5).includes("Erkannte Schritte")&&sb.VELOXProAnalysis.renderSingle(stepAnalysis,5).includes("Schrittdistanz (Schätzung)"),"Pro-Einzeltouranalyse enthält erkannte Schritte und geschätzte Schrittdistanz");
 ok(sb.VELOXProAnalysis.renderArchive([stepRide],[stepAnalysis]).includes("Erkannte Schritte"),"Pro-Archiv addiert Schrittzahlen nur im Laufprofil");
 const same=(a,b)=>Math.abs(a-b)<1e-6;
 ok(same(pro.distanceM,core.distanceM)&&same(pro.movingSeconds,core.movingSeconds),"Pro = Detail: Distanz/Fahrzeit ("+(pro.distanceM/1000).toFixed(3)+" km)");
 ok(same(pro.elevation.gain,core.elevationGain)&&same(pro.elevation.loss,core.elevationLoss),"Pro = Detail: Aufstieg/Abstieg (+"+pro.elevation.gain.toFixed(1)+" / -"+pro.elevation.loss.toFixed(1)+")");
 ok(same(pro.elevation.averageGrade,core.gradeAverage)&&same(pro.maxSpeed,core.maxSpeed),"Pro = Detail: Ø Steigung/Max-Tempo");
 ok(pro.splits.length===2&&pro.splits[0].complete,"Pro: Splits ("+pro.splits.map(x=>x.distanceM.toFixed(0)).join("/")+" m)");
 console.log(process.exitCode?"\nFEHLER":"\nRauchtest bestanden");
})().catch(e=>{console.log("ABSTURZ",e);process.exit(1)});
