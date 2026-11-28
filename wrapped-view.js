/* Jahresansicht, persönliche Karte und lokaler PNG-Export. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const km=m=>m===null?"–":(m/1000).toLocaleString("de-DE",{maximumFractionDigits:2})+" km";
  const monthName=i=>new Date(2000,i,1).toLocaleDateString("de-DE",{month:"long"});
  let selectedYear=null, worker=null, map=null, generation=0;

  function leave(){
    generation++;
    $("wrappedYear").onchange=null;
    if(worker){worker.terminate();worker=null;}
    if(map){map.remove();map=null;}
    const dialog=$("wrappedPreview");
    if(dialog.open)dialog.close();
    $("yearContent").innerHTML="";
  }

  function drawLocalMap(host,result){
    const {routes,discoveries}=result;
    if(!routes.length){host.textContent="Für dieses Jahr fehlen auswertbare Strecken.";return;}
    const origin=routes[0][0];
    const scale=Math.max(.001,Math.cos(origin[0]*Math.PI/180));
    const x=lon=>(((lon-origin[1]+540)%360)-180)*scale;
    let left=Infinity,right=-Infinity,low=Infinity,high=-Infinity;
    for(const route of routes)for(const [lat,lon] of route){
      const v=x(lon);
      left=Math.min(left,v);right=Math.max(right,v);low=Math.min(low,lat);high=Math.max(high,lat);
    }
    const factor=Math.min(548/Math.max(.00001,right-left),248/Math.max(.00001,high-low));
    const line=points=>points.map(([lat,lon],i)=>(i?"L":"M")+(290+(x(lon)-(left+right)/2)*factor).toFixed(1)+" "+(140+((high+low)/2-lat)*factor).toFixed(1)).join(" ");
    host.innerHTML='<svg viewBox="0 0 580 280" role="img" aria-label="Strecken des Jahres, neu entdeckte Abschnitte in Türkis">'+
      '<path class="year-route" d="'+routes.map(line).join(" ")+'"/><path class="year-new" d="'+discoveries.map(line).join(" ")+'"/></svg>';
  }

  function showMap(result,loadLeaflet,version){
    const host=$("yearMap");
    drawLocalMap(host,result);
    const button=$("yearMapTiles");
    button.hidden=!result.routes.length||!navigator.onLine;
    button.onclick=async()=>{
      button.disabled=true;
      const available=await loadLeaflet();
      if(version!==generation)return;
      if(!available){button.disabled=false;button.textContent="Straßenkarte erneut laden";return;}
      host.innerHTML="";
      map=L.map(host,{preferCanvas:true,scrollWheelZoom:false});
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
      const base=L.polyline(result.routes,{color:"#546879",opacity:.85,weight:4}).addTo(map);
      L.polyline(result.discoveries,{color:"#007869",weight:5}).addTo(map);
      map.fitBounds(base.getBounds(),{padding:[16,16],maxZoom:17});
      button.hidden=true;
    };
  }

  // Nur diese vier Jahreskennzahlen gelangen auf die neu gezeichnete Fläche.
  function preview({year,totalM,longestM,activeMonths}){
    const dialog=$("wrappedPreview"),canvas=$("wrappedCanvas"),ctx=canvas.getContext("2d");
    if(!ctx)return;
    const months=activeMonths.map(monthName);
    const lines=[];
    ctx.font="bold 46px system-ui";
    for(const month of months){
      const last=lines.length-1;
      if(last>=0&&ctx.measureText(lines[last]+", "+month).width<922)lines[last]+=", "+month;
      else lines.push(month);
    }
    canvas.height=750+60*Math.max(1,lines.length);
    ctx.fillStyle="#102332";ctx.fillRect(0,0,canvas.width,canvas.height);
    const write=(value,y,size,color,weight)=>{
      ctx.font=weight+" "+size+"px system-ui";ctx.fillStyle=color;ctx.fillText(value,64,y,952);
    };
    write("VELOX   /   WRAPPED",96,38,"#6bdfce",700);
    write(String(year),235,126,"#ffffff",800);
    ctx.fillStyle="#6bdfce";ctx.fillRect(64,282,96,8);
    write("Gesamtstrecke",375,34,"#b6c8d4",500);write(km(totalM),452,68,"#ffffff",750);
    write("Längste Fahrt",542,34,"#b6c8d4",500);write(km(longestM),612,60,"#ffffff",750);
    write(months.length>1?"Aktivste Monate":"Aktivster Monat",702,34,"#b6c8d4",500);
    (lines.length?lines:["–"]).forEach((line,i)=>write(line,766+i*60,46,"#ffffff",700));
    const save=$("wrappedSave"),share=$("wrappedShare"),status=$("wrappedExportStatus");
    const token={};dialog.previewToken=token;
    save.hidden=true;share.hidden=true;status.textContent="PNG wird erstellt …";
    dialog.showModal();
    canvas.toBlob(blob=>{
      if(!dialog.open||dialog.previewToken!==token)return;
      if(!blob){status.textContent="PNG konnte nicht erstellt werden.";return;}
      const name="velox-wrapped-"+year+".png",url=URL.createObjectURL(blob);
      save.href=url;save.download=name;save.hidden=false;status.textContent="";
      const file=new File([blob],name,{type:"image/png"});
      const payload={files:[file]};
      share.hidden=!(navigator.canShare&&navigator.canShare(payload));
      share.onclick=async()=>{
        try{await navigator.share(payload);}
        catch(error){if(error.name!=="AbortError")status.textContent="Teilen fehlgeschlagen. Du kannst das PNG speichern.";}
      };
      dialog.addEventListener("close",()=>{URL.revokeObjectURL(url);save.removeAttribute("href");share.onclick=null;},{once:true});
    },"image/png");
  }

  function display(result,loadLeaflet,version){
    const {card,rideCount,missing,previousTracks}=result;
    const host=$("yearContent");
    if(!rideCount){host.innerHTML='<p class="empty-state">Für dieses Jahr hast du noch keine abgeschlossene Fahrradtour gespeichert.</p>';return;}
    const active=card.activeMonths.map(monthName).join(", ")||"–";
    host.innerHTML='<div class="year-kpis">'+
      '<article><span>Gesamtstrecke</span><strong>'+km(card.totalM)+'</strong></article>'+
      '<article><span>Längste Fahrt</span><strong>'+km(card.longestM)+'</strong><small id="yearLongestName"></small></article>'+
      '<article><span>'+ (card.activeMonths.length>1?"Aktivste Monate":"Aktivster Monat")+'</span><strong>'+active+'</strong><small>nach Kilometern</small></article></div>'+
      '<p class="small-note">'+rideCount+' abgeschlossene '+(rideCount===1?"Fahrt":"Fahrten")+(missing?" · "+missing+" ohne auswertbare Strecke":"")+'</p>'+
      '<section class="panel year-explore"><h2>Deine neu entdeckten Wege</h2><p id="yearCaption"></p><div id="yearMap"></div>'+
      '<div class="year-legend"><span>Jahresstrecken</span><span>Neu im Archiv</span></div>'+
      '<p class="small-note">GPS-Vergleich ab 45 m zusammenhängender Strecke. '+km(result.uncertainM)+' sind zu kurz oder nicht eindeutig zuzuordnen.</p>'+
      '<button id="yearMapTiles" class="secondary-button" type="button">Straßenkarte laden · OpenStreetMap</button></section>'+
      '<button id="yearPreview" class="primary-button" type="button">Jahresgrafik ansehen</button>';
    $("yearLongestName").textContent=result.longestName;
    $("yearCaption").textContent=card.totalM===null?"Streckendaten fehlen.":km(result.newM)+(previousTracks?" erstmals gegenüber früheren Fahrten entdeckt.":" erstmals im lokalen Archiv. Es gibt keine älteren auswertbaren Vergleichsstrecken.");
    $("yearPreview").onclick=()=>preview(card);
    showMap(result,loadLeaflet,version);
  }

  function render(rides,loadLeaflet){
    leave();
    const version=generation,now=new Date().getFullYear();
    const recordedYears=rides.map(VELOXWrapped.rideYear).filter(Number.isFinite);
    const years=Array.from(new Set([now,...recordedYears])).sort((a,b)=>b-a);
    if(!years.includes(selectedYear))selectedYear=years.find(y=>recordedYears.includes(y))??now;
    const select=$("wrappedYear");
    select.innerHTML=years.map(y=>'<option value="'+y+'">'+y+'</option>').join("");
    select.value=String(selectedYear);
    select.onchange=()=>{selectedYear=Number(select.value);render(rides,loadLeaflet);};
    $("yearContent").textContent="Jahresstrecken werden lokal verglichen …";
    if(!window.Worker){display(VELOXWrapped.analyzeYear(rides,selectedYear),loadLeaflet,version);return;}
    worker=new Worker("./wrapped-worker.js");
    worker.onmessage=({data})=>{
      if(version!==generation)return;
      worker.terminate();worker=null;
      display(data,loadLeaflet,version);
    };
    worker.onerror=()=>{
      if(version!==generation)return;
      worker.terminate();worker=null;
      $("yearContent").textContent="Der lokale Jahresvergleich konnte nicht geladen werden. Öffne VELOX erneut.";
    };
    worker.postMessage({rides:rides.filter(r=>{const y=VELOXWrapped.rideYear(r);return y!==null&&y<=selectedYear;}),year:selectedYear});
  }
  window.VELOXYearView={render,leave};
})();
