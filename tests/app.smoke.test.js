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
const legacyRun=ride("legacy-run",1.73e12,2000);legacyRun.activityType="running";data.set(legacyRun.id,legacyRun);
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
 isSecureContext:true,scrollTo(){},addEventListener(){},console,setTimeout,clearTimeout,Date,Math,JSON,Number,String,Array,Object,Map,Set,Promise,Blob:class{},URL,Error,
 indexedDB:{open(){const req={};const db={objectStoreNames:{contains:()=>true},createObjectStore(){},close(){},
  transaction(){const tx={};const mk=fn=>{const r={};setTimeout(()=>{r.result=fn();r.onsuccess&&r.onsuccess()},0);return r};
   tx.objectStore=()=>({getAll:()=>mk(()=>[...data.values()].map(v=>JSON.parse(JSON.stringify(v)))),put:v=>mk(()=>{data.set(v.id,JSON.parse(JSON.stringify(v)));return v.id}),add:v=>mk(()=>{if(data.has(v.id)){tx.error=new Error("ConstraintError");tx.onerror?.();return;}data.set(v.id,v)}),delete:id=>mk(()=>{data.delete(id)}),clear:()=>mk(()=>data.clear())});
   setTimeout(()=>tx.oncomplete&&tx.oncomplete(),8);return tx}};
  setTimeout(()=>{req.result=db;req.onsuccess&&req.onsuccess()},0);return req}},
 localStorage:{getItem:()=>null,setItem(){}}};
sb.window=sb;sb.self=sb;sb.requestAnimationFrame=f=>setTimeout(f,0);
const ctx=vm.createContext(sb);
for(const f of["sensor-core.js","elevation-core.js","ride-core.js","charts.js","app.js","analysis-pro.js"])vm.runInContext(fs.readFileSync(R+f,"utf8"),ctx,{filename:f});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ok=(c,m)=>{if(!c){console.log("  ✗",m);process.exitCode=1}else console.log("  ✓",m)};
(async()=>{
 await sleep(150);
 ok(els.totalRides.textContent==3,"Übersicht: 3 Fahrradtouren; alte Laufdatensätze werden ausgeblendet ("+els.totalRides.textContent+")");
 ok(!els.recentRides.innerHTML.includes("legacy-run"),"Archiv blendet alte Laufdatensätze aus");
 ok(/km/.test(els.totalDistance.innerHTML)&&!/^0,0/.test(els.totalDistance.innerHTML),"Gesamtdistanz: "+els.totalDistance.innerHTML);
 ok(/ride-card/.test(els.recentRides.innerHTML),"Tourenliste gerendert");
 ok(/<table/.test(els.rideComparison.innerHTML),"Tourenvergleich gerendert");
 ok(els.backupHint&&els.backupHint.innerHTML.includes("Noch keine Sicherung"),"Backup-Hinweis erscheint");
 ok(/Dauerhafter Speicher: aktiv/.test(els.storageStatus?.textContent||""),"Speicherschutz-Status");
 // Detail öffnen
 const card=els["ride:a:recentRides"];(card.listeners.click||[])[0]();await sleep(500);
 ok(els.rideDetail.innerHTML.length>5000,"Detailseite gerendert ("+els.rideDetail.innerHTML.length+" Zeichen)");
 ok(/Steilste Abfahrt/.test(els.rideDetail.innerHTML)&&!/NaN/.test(els.rideDetail.innerHTML),"Detail ohne NaN");
 ok(/vx-svg/.test(els.elevationPlot.innerHTML),"Höhenprofil-Grafik (SVG) gerendert");
 ok(/vx-band/.test(els.elevationPlot.innerHTML),"Längster Anstieg als Band markiert");
 ok(/vx-svg/.test(els.speedPlot.innerHTML),"Tempo-Grafik gerendert");
 ok(/vx-svg/.test(els.gradePlot.innerHTML),"Steigungs-Grafik gerendert");
 ok(els.speedPlot.innerHTML.includes('class="vx-reference"'),"Tempodiagramm zeigt Bewegungsschnitt");
 ok(els.detailMap.innerHTML.includes('class="offline-route-outline"'),"Offline-Karte zeigt Streckenkontur");
 ok((els.rideSplitChart.innerHTML.match(/class="split-row"/g)||[]).length>=7,"1-km-Abschnitte werden angezeigt");
 els.rideSplitLength.listeners.change[0]({target:{value:"5000"}});
 ok((els.rideSplitChart.innerHTML.match(/class="split-row"/g)||[]).length===2&&els.rideSplitChart.innerHTML.includes("Rest"),"5-km-Abschnitte werden mit Rest neu berechnet");
 ok(/ride-time-moving.*ride-time-standing.*ride-time-unknown/.test(els.rideDetail.innerHTML),"Zeitgrafik unterscheidet Bewegung, GPS-Stillstand und übrige Zeit");
 ok(/Stopps/.test(els.rideDetail.innerHTML)&&/Erkannte Stopps<\/span><strong>1<\/strong>/.test(els.rideDetail.innerHTML),"1 Stopp erkannt");
 ok(!/Strecken-Geradlinigkeit<\/span><strong>–/.test(els.rideDetail.innerHTML),"Geradlinigkeit trotz Stopp berechnet");
 const offlineSegmentCount=()=> (els.detailMap.innerHTML.split('<g class="offline-route-lines">')[1]?.split("</g>")[0]?.match(/<polyline/g)||[]).length;
 const segmentsBeforePause=offlineSegmentCount();
 // Wrapped
 docL.click.forEach(f=>f({target:{closest:()=>({dataset:{page:"wrapped"}})},preventDefault(){}}));await sleep(300);
 ok(/Persönliche Rekorde/.test(els.wrappedContent.innerHTML)&&!/NaN|undefined/.test(els.wrappedContent.innerHTML),"Wrapped gerendert ohne NaN/undefined");
 // Fahrradmodus ist der einzige verfügbare Aufzeichnungsmodus.
 els.startRide.listeners.click[0]();
 ok(els.trackPageTitle.textContent==="Deine Fahrt","Startseite öffnet die Fahrrad-Aufzeichnung");
 ok(els.liveMovingRatioTile.hidden===false,"Fahranteil bleibt in der Fahrradansicht sichtbar");
 ok(els.liveMapCaption.textContent==="GPS-STRECKENVERLAUF","Karte verwendet Fahrrad-Streckenbeschriftung");
 await els.trackStartRide.listeners.click[0]();await sleep(100);
 ok(geoCbs.ok,"GPS-Watch gestartet (kein liveLine-Fehler)");
 let t=Date.now()-130000,d=0;
 for(let i=0;i<120;i++){t+=1000;d+=5;await geoCbs.ok({timestamp:t,coords:{latitude:LAT,longitude:13.7+d*M_LON,accuracy:5,altitude:200+d*0.03,altitudeAccuracy:6,speed:5}});}
 await sleep(3200);
 ok(/^0?,?\d/.test(els.liveDistance.textContent)&&parseFloat(els.liveDistance.textContent.replace(",","."))>0.5,"Live-Distanz: "+els.liveDistance.textContent+" km");
 ok(/km\/h/.test(els.liveSpeed.innerHTML)&&/18/.test(els.liveSpeed.innerHTML),"Live-Geschwindigkeit (5 m/s ≈ 18 km/h): "+els.liveSpeed.innerHTML);
 ok(els.liveSpeedLabel.textContent==="Geschwindigkeit"&&els.liveAverageLabel.textContent==="Ø Geschwindigkeit"&&els.liveDurationLabel.textContent==="Fahrzeit","Fahrrad-Live-Bezeichnungen");
 ok(els.trackingStatus.textContent==="Aufzeichnung läuft","Status: "+els.trackingStatus.textContent);
 ok(els.sensorWakeStatus.textContent==="Bildschirm bleibt an","Wake Lock: "+els.sensorWakeStatus.textContent);
 // Der GPS-Checkpoint wartet in der Schreibwarteschlange, während die Pause beginnt.
 const oldWatch=geoCbs.ok;
 const nextFix={timestamp:t+1000,coords:{latitude:LAT,longitude:13.7+(d+5)*M_LON,accuracy:5,altitude:215,altitudeAccuracy:6,speed:5}};
 const checkpoint=oldWatch(nextFix);
 await els.pauseRide.listeners.click[0]();
 await checkpoint;
 const activeInDB=()=>[...data.values()].find(r=>String(r.id).startsWith("ride-"));
 ok(activeInDB()?.status==="paused"&&activeInDB()?.points.length===121,"Pause bleibt nach ausstehendem GPS-Checkpoint gespeichert");
 ok(els.trackingStatus.textContent==="Pausiert","Ausstehender GPS-Checkpoint überschreibt Pausenstatus nicht");
 await els.pauseRide.listeners.click[0]();
 await oldWatch({...nextFix,timestamp:t+2000});
 dialogAnswers.push("delete");
 await els.deleteAll.listeners.click[0]();
 ok(data.has("a")&&activeInDB()?.status==="recording","Archivlöschung schützt eine laufende Tour");
 dialogAnswers.pop();
 // Tour beenden: Bestätigung "stop", Wetter "skip"
 dialogAnswers.push("stop","skip");await els.stopRide.listeners.click[0]();await sleep(300);
 ok(data.size===5&&data.has("legacy-run"),"Neue Fahrradtour gespeichert; vorhandener Legacy-Datensatz bleibt erhalten ("+data.size+" in DB)");
 const saved=[...data.values()].find(r=>String(r.id).startsWith("ride-"));
 ok(saved&&saved.status==="completed"&&saved.activityType==="cycling"&&saved.name==="Fahrradtour"&&saved.points.length===121&&saved.points[5].speed===5,"Fahrradaktivität vollständig gespeichert, verspäteter Callback des alten GPS-Watchers verworfen");
 const r=data.get("a"),pro=sb.VELOXProAnalysis.analyzeRide(r,5),core=sb.VELOXCore.analyze(r);
 const same=(a,b)=>Math.abs(a-b)<1e-6;
 ok(same(pro.distanceM,core.distanceM)&&same(pro.movingSeconds,core.movingSeconds),"Pro = Detail: Distanz/Fahrzeit ("+(pro.distanceM/1000).toFixed(3)+" km)");
 ok(same(pro.elevation.gain,core.elevationGain)&&same(pro.elevation.loss,core.elevationLoss),"Pro = Detail: Aufstieg/Abstieg (+"+pro.elevation.gain.toFixed(1)+" / -"+pro.elevation.loss.toFixed(1)+")");
 ok(same(pro.elevation.averageGrade,core.gradeAverage)&&same(pro.maxSpeed,core.maxSpeed),"Pro = Detail: Ø Steigung/Max-Tempo");
 ok(pro.splits.length===2&&pro.splits[0].complete,"Pro: Splits ("+pro.splits.map(x=>x.distanceM.toFixed(0)).join("/")+" m)");
 const beforePause=r.points[100].t;
 const paused={...r,pauseIntervals:undefined,pauses:[{start:beforePause+1,end:beforePause+999}],pausedMs:998};
 data.set(r.id,paused);
 const pausedPro=sb.VELOXProAnalysis.analyzeRide(paused,5);
 ok(pausedPro.distanceM<pro.distanceM,"Pro-Analyse zieht die Strecke über eine ältere manuelle Pause ab");
 await els["ride:a:recentRides"].listeners.click[0]();
 await sleep(350);
 ok(segmentsBeforePause>0&&offlineSegmentCount()===segmentsBeforePause+1,"Offline-Karte trennt die Route an einer manuellen Pause");
 await els.backupFile.listeners.change[0]({target:{files:[{text:async()=>JSON.stringify({app:"VELOX",version:1,rides:[{...r,id:"legacy-run"}]})}]}});
 ok(data.get("legacy-run").activityType==="running"&&[...data.values()].some(ride=>ride.importedFromId==="legacy-run"),"Import ordnet eine ID-Kollision mit einer ausgeblendeten Alttour neu zu");
 console.log(process.exitCode?"\nFEHLER":"\nRauchtest bestanden");
})().catch(e=>{console.log("ABSTURZ",e);process.exit(1)});
