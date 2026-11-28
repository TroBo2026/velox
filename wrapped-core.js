/* Lokaler Jahresvergleich aus den gleichen Bewegungsintervallen wie die Tourdetails. */
(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory(require("./ride-core.js"));
  else root.VELOXWrapped=factory(root.VELOXCore);
})(typeof self!=="undefined"?self:this,function(Core){
  "use strict";
  const radius=6371000, rad=Math.PI/180;
  const cellM=48, sampleM=10, minDiscoveryM=45;

  function rideYear(ride){
    if(!ride||!Number.isFinite(ride.startedAt)||ride.activityType==="running")return null;
    if(ride.status && ride.status!=="completed")return null;
    if(!ride.status && !Number.isFinite(ride.endedAt))return null;
    const year=new Date(ride.startedAt).getFullYear();
    return Number.isFinite(year)?year:null;
  }

  // Erdfeste Koordinaten in Metern halten die Suche auch am 180. Längengrad lokal.
  function xyz(point){
    const lat=point.lat*rad, lon=point.lon*rad, horizontal=radius*Math.cos(lat);
    return [horizontal*Math.cos(lon),horizontal*Math.sin(lon),radius*Math.sin(lat)];
  }
  function edge(interval){
    const a=xyz(interval.from), b=xyz(interval.to);
    const delta=b.map((v,i)=>v-a[i]);
    const accuracy=Math.max(...[interval.from.accuracy,interval.to.accuracy].filter(Number.isFinite),0);
    return {a,delta,length:Math.hypot(...delta),accuracy};
  }
  const interpolate=(e,f)=>e.a.map((v,i)=>v+f*e.delta[i]);
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const key=(x,y,z)=>x+","+y+","+z;

  function addEdge(index,e){
    const n=Math.ceil(e.length/cellM);
    let lastKey;
    for(let i=0;i<=n;i++){
      const pos=interpolate(e,i/n).map(v=>Math.floor(v/cellM));
      const k=key(...pos);
      if(k===lastKey)continue;
      if(!index.has(k))index.set(k,[]);
      index.get(k).push(e);
      lastKey=k;
    }
  }
  function match(index,e,mid){
    if(e.accuracy>25)return "uncertain";
    const [x,y,z]=mid.map(v=>Math.floor(v/cellM));
    let result="new";
    for(let i=x-1;i<=x+1;i++)for(let j=y-1;j<=y+1;j++)for(let k=z-1;k<=z+1;k++){
      const bucket=index.get(key(i,j,k));
      if(!bucket)continue;
      for(const old of bucket){
        const direction=dot(e.delta,old.delta)/(e.length*old.length);
        const along=Math.abs(direction);
        if(along<0.5)continue;
        const offset=mid.map((v,axis)=>v-old.a[axis]);
        const projection=dot(offset,old.delta)/(old.length*old.length);
        // Die Vorwärtsverlängerung gerade durchfahrener Kanten ist kein Wiederbesuch.
        if(e.track===old.track&&e.track!==undefined&&e.position-old.position<=minDiscoveryM+old.length&&direction>0&&projection>=1)continue;
        const frac=Math.max(0,Math.min(1,projection));
        const separation=Math.hypot(...offset.map((v,axis)=>v-frac*old.delta[axis]));
        const tolerance=Math.min(18,Math.max(10,e.accuracy,old.accuracy));
        if(separation<=tolerance&&along>=0.71&&old.accuracy<=25)return "known";
        // Ein Kreuzungspunkt allein belegt keinen gemeinsamen Weg.
        if(along>=0.5&&separation<=tolerance+6)result="uncertain";
      }
    }
    return result;
  }
  function coordinate(interval,f){
    const {from,to}=interval;
    const lonDelta=((to.lon-from.lon+540)%360)-180;
    return [from.lat+(to.lat-from.lat)*f,((from.lon+lonDelta*f+540)%360)-180];
  }

  function analyzeYear(rides,year){
    const archive=rides.filter(r=>rideYear(r)!==null&&rideYear(r)<=year).sort((a,b)=>a.startedAt-b.startedAt);
    const index=new Map(), months=Array(12).fill(0), routes=[], discoveries=[];
    let rideCount=0, missing=0, measured=0, totalM=0, longestM=0, longestName="";
    let previousTracks=0, newM=0, uncertainM=0;
    for(const ride of archive){
      const scan=Core.scan(Array.isArray(ride.points)?ride.points:[],Core.ridePauses(ride));
      const current=rideYear(ride)===year;
      if(!current){
        if(scan.intervals.length)previousTracks++;
        for(const it of scan.intervals)addEdge(index,edge(it));
        continue;
      }
      rideCount++;
      if(!scan.acceptedIntervals)missing++;
      else measured++;
      totalM+=scan.distanceM;
      months[new Date(ride.startedAt).getMonth()]+=scan.distanceM;
      if(scan.distanceM>longestM){longestM=scan.distanceM;longestName=ride.name||"Fahrradtour";}
      let candidate=[], length=0, lastIndex=-1, route;
      let pos=0;
      function flush(){
        if(length>=minDiscoveryM){discoveries.push(candidate);newM+=length;}
        else uncertainM+=length;
        length=0;candidate=[];
      }
      for(const it of scan.intervals){
        if(it.fromIndex!==lastIndex){flush();route=[coordinate(it,0)];routes.push(route);}
        route.push(coordinate(it,1));
        lastIndex=it.toIndex;
        const e=edge(it), steps=Math.ceil(it.distanceM/sampleM), stepM=it.distanceM/steps;
        e.track=rideCount;e.position=pos;
        for(let i=0;i<steps;i++){
          const state=match(index,e,interpolate(e,(i+0.5)/steps));
          if(state==="new"){
            if(!length)candidate.push(coordinate(it,i/steps));
            candidate.push(coordinate(it,(i+1)/steps));length+=stepM;
          }else{
            flush();
            if(state==="uncertain")uncertainM+=stepM;
          }
        }
        pos+=it.distanceM;
        addEdge(index,e);
      }
      flush();
    }
    const bestMonth=Math.max(...months);
    const activeMonths=months.flatMap((d,i)=>d>0&&Math.round(d)===Math.round(bestMonth)?[i]:[]);
    const card={year,totalM:measured?totalM:null,longestM:longestM||null,activeMonths};
    return {card,rideCount,missing,longestName,previousTracks,newM,uncertainM,routes,discoveries};
  }
  return {rideYear,analyzeYear};
});
