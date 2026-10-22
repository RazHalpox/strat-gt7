// Mesures en course et carnet de courses.
// Les écrans Pilote et Complet appellent Learn.update(état) à chaque mise à jour : chaque course est enregistrée
// sur l'appareil (tours, plan, arrêts), et Learn.analyze() en tire le rythme et l'usure par gomme, le temps perdu
// à chaque arrêt et la vitesse de ravitaillement réelle. La page Stratégie propose ensuite d'utiliser ces mesures.
(function(){
const fin=x=>typeof x==="number"&&isFinite(x);
const RKEY="gt7-races",LKEY="gt7-learn",MAXR=20;
const rd=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k)||"null");return v==null?d:v}catch(e){return d}};
const wr=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}};
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN;
const median=a=>{if(!a.length)return NaN;const s=a.slice().sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2};
function plan(){return rd("gt7-plan",null)}

/* ---- arrêts mesurés en direct : temps immobile au stand et carburant ajouté ---- */
const LIVE={stopCur:null,prevFuel:null,moved:false};
function trackStop(L,cur,now=Date.now(),T=LIVE){
  const v=L.speed;
  if(!fin(v)||!fin(L.fuel)||L.paused||L.loading){T.prevFuel=L.fuel;return}
  if(!(L.lap>=1))T.moved=false;else if(v>30)T.moved=true; // l'attente sur la grille de départ n'est pas un arrêt
  if(v<1.5&&L.on_track&&T.moved){
    if(!T.stopCur)T.stopCur={t0:now,f0:L.fuel,fmax:L.fuel,lap:L.lap,r0:null,r1:null};
    else{T.stopCur.fmax=Math.max(T.stopCur.fmax,L.fuel);if(fin(T.prevFuel)&&L.fuel>T.prevFuel+0.02){T.stopCur.r0=T.stopCur.r0||now;T.stopCur.r1=now}}}
  else if(v>5&&T.stopCur){const s=T.stopCur;T.stopCur=null;const still=(now-s.t0)/1000,added=s.fmax-s.f0;
    if(still>=3){const rt=s.r0&&s.r1&&(s.r1-s.r0)>800?added/((s.r1-s.r0)/1000):NaN;
      cur.stops=(cur.stops||[]).filter(x=>x.lap!==s.lap).concat([{lap:s.lap,still:Math.round(still*10)/10,added:Math.round(added*10)/10,rate:fin(rt)?Math.round(rt*100)/100:null}])}}
  T.prevFuel=L.fuel}

/* ---- suivi de la course en cours et carnet ---- */
function update(s){
  if(!s||s.mode!=="live")return; // ni démo, ni relecture, ni attente
  const L=s.live||{},laps=s.laps||[];
  let cur=rd(LKEY,null);const last=laps.length?laps[laps.length-1].n:0,now=Date.now();
  // nouvelle course : le compteur de tours recule, ou la liste des tours repart de zéro (départ de la course suivante)
  const fresh=!cur||!cur.id||(laps.length&&last<cur.lastN)||laps.length<(cur.count||0)-1||(now-(cur.lastSeen||0)>2*3600e3);
  if(fresh){if(!laps.length&&!(L.lap>=1))return;cur={id:now,lastN:last,count:laps.length,lastSeen:now,stops:[]}}
  const done=window.Race&&Race.finished?Race.finished(L,laps):null;
  if(done)cur.finish=done.lap;else trackStop(L,cur); // après l'arrivée : ni arrêt, ni tour de décélération
  const changed=last!==cur.lastN||laps.length!==cur.count||fresh||(cur.stops||[]).length!==(cur.nStops||0);
  cur.lastN=last;cur.count=laps.length;cur.lastSeen=now;cur.nStops=(cur.stops||[]).length;
  if(now-(cur.saved||0)>5000||changed){cur.saved=now;wr(LKEY,cur);
    if(changed&&laps.length){const races=rd(RKEY,[]).filter(r=>r.id!==cur.id);
      const p=plan(),st=rd("gt7-endu-v1",null);
      races.unshift({id:cur.id,date:cur.id,updated:now,fuelCap:L.fuel_cap||100,total:L.total_laps||0,
        mode:st&&st.S?st.S.mode:null,duree:st&&st.S?+st.S.duree:null,
        laps:laps.map(l=>({n:l.n,ms:l.ms,fuel:l.fuel,pit:!!l.pit,fuel_end:l.fuel_end})),
        plan:p&&p.rows?p.rows.map(r=>({g:r.g,from:r.from,to:r.to})):[],stops:cur.stops||[],finish:cur.finish||null});
      races.sort((a,b)=>b.id-a.id);while(races.length>MAXR)races.pop();
      if(!wr(RKEY,races)){races.length=Math.max(1,races.length-5);wr(RKEY,races)}}}
}

/* ---- course reconstruite depuis un enregistrement de télémétrie (Stratégie › Carnet) ---- */
// text : le fichier de l'enregistrement (une image JSON par ligne, t = ms depuis le début, laps quand ils changent)
function fromRecording(text,start){
  let laps=[],L=null,first=null;const cur={stops:[]},T={stopCur:null,prevFuel:null,moved:false};
  for(const line of text.split("\n")){if(!line)continue;let d;try{d=JSON.parse(line)}catch(e){continue}
    if(d.laps)laps=d.laps;if(!(d.lap>=1))continue;L=d;if(first===null)first=start+(d.t||0);
    if(!(window.Race&&Race.finished&&Race.finished(d,laps)))trackStop(d,cur,start+(d.t||0),T)}
  if(!laps.length)return null;
  const p=plan(),st=rd("gt7-endu-v1",null),rows=p&&p.replan&&p.replan.orig?p.replan.orig.rows:p&&p.rows;
  const done=L&&window.Race&&Race.finished?Race.finished(L,laps):null;
  const race={id:first||start,date:first||start,updated:Date.now(),fuelCap:L&&L.fuel_cap||100,total:L&&L.total_laps||0,
    mode:st&&st.S?st.S.mode:null,duree:st&&st.S?+st.S.duree:null,
    laps:laps.map(l=>({n:l.n,ms:l.ms,fuel:l.fuel,pit:!!l.pit,fuel_end:l.fuel_end})),
    plan:rows?rows.map(r=>({g:r.g,from:r.from,to:r.to})):[],stops:cur.stops,finish:done?done.lap:null,fromRec:true};
  // remplace une version incomplète de la même course (même premier tour)
  const k=x=>x.laps&&x.laps.length?x.laps[0].n+":"+x.laps[0].ms:"",races=rd(RKEY,[]).filter(r=>!(k(r)===k(race)&&Math.abs(r.id-race.id)<3*3600e3));
  races.unshift(race);races.sort((a,b)=>b.id-a.id);while(races.length>MAXR)races.pop();wr(RKEY,races);return race}

/* ---- analyse d'une course enregistrée ---- */
function compOf(rows,lap){const r=(rows||[]).find(x=>lap>=x.from&&lap<=x.to);return r&&["S","M","H"].includes(r.g)?r.g:null}
function analyze(race){
  if(!race||!race.laps||!race.laps.length)return null;
  const laps=race.finish?race.laps.filter(l=>l.n<=race.finish):race.laps,byN={};laps.forEach(l=>byN[l.n]=l);
  const pits=new Set(laps.filter(l=>l.pit).map(l=>l.n));
  // tours représentatifs : pas le tour 1, ni un tour avec arrêt, ni le tour de sortie, ni un tour raté
  const isClean=l=>l.ms>0&&l.n>1&&!l.pit&&!pits.has(l.n-1);
  const cleanAll=laps.filter(isClean),med=median(cleanAll.map(l=>l.ms));
  // « arrêt » au T1 sans temps perdu (moins de 15 % au-dessus d'un tour normal) : c'était le départ, pas un arrêt
  // (anciennes versions : plein remis ou attente sur la grille comptés comme un arrêt)
  if(pits.has(1)&&byN[1]&&byN[1].ms>0&&fin(med)&&byN[1].ms<=med*1.15)pits.delete(1);
  const good=l=>isClean(l)&&l.ms<=med*1.07;
  // relais : de la sortie des stands jusqu'au tour de l'arrêt suivant
  const stints=[];let cur=null;
  laps.forEach(l=>{if(!cur){cur={from:l.n,to:l.n,laps:[]};stints.push(cur)}cur.to=l.n;cur.laps.push(l);if(pits.has(l.n))cur=null});
  stints.forEach(st=>{st.g=compOf(race.plan,st.from+(st.from>1?1:0))||compOf(race.plan,st.from);
    const c=st.laps.filter(good);st.n=st.laps.length;st.clean=c.length;
    st.avg=c.length?mean(c.map(l=>l.ms))/1000:NaN;
    const fu=st.laps.filter(l=>!l.pit&&fin(l.fuel)&&l.fuel>0.05);st.cons=fu.length?mean(fu.map(l=>l.fuel)):NaN;
    st.slope=NaN;
    if(c.length>=4){const xs=c.map(l=>l.n-st.from),ys=c.map(l=>l.ms/1000),mx=mean(xs),my=mean(ys);
      let a=0,b=0;xs.forEach((x,i)=>{a+=(x-mx)*(ys[i]-my);b+=(x-mx)*(x-mx)});st.slope=b>0?a/b:NaN}});
  // par gomme
  const comps={};
  ["S","M","H"].forEach(g=>{const ss=stints.filter(s=>s.g===g&&s.clean>0);if(!ss.length)return;
    const w=ss.reduce((a,s)=>a+s.clean,0),avg=ss.reduce((a,s)=>a+s.avg*s.clean,0)/w;
    const sl=ss.filter(s=>fin(s.slope)),slope=sl.length?sl.reduce((a,s)=>a+s.slope*s.clean,0)/sl.reduce((a,s)=>a+s.clean,0):NaN;
    const longest=Math.max(...ss.map(s=>s.n));
    // vie : tours avant que l'usure coûte 1,5 s par rapport au début du relais
    const life=fin(slope)&&slope>0.05?Math.max(1,Math.min(99,Math.round(1.5/slope))):null;
    comps[g]={avg,slope,life,laps:w,longest,stints:ss.length}});
  // conso moyenne de la course
  const fuelLaps=laps.filter(l=>!l.pit&&!pits.has(l.n-1)&&l.n>1&&fin(l.fuel)&&l.fuel>0.05);
  const cons=fuelLaps.length?mean(fuelLaps.map(l=>l.fuel)):NaN;
  // arrêts : temps perdu sur la fenêtre de 3 tours autour de l'arrêt, carburant ajouté
  const stops=[];
  [...pits].filter(n=>n>=1).sort((a,b)=>a-b).forEach(n=>{
    // arrêt à la fin du T1 : le temps perdu se mélange au départ arrêté, on ne le chiffre pas
    if(n===1){if(!byN[2])return;const live=(race.stops||[]).find(x=>x.lap<=2);
      stops.push({lap:1,loss:NaN,added:live&&fin(live.added)?live.added:(fin(byN[1].fuel_end)&&fin(byN[2].fuel_end)&&fin(cons)?Math.max(0,byN[2].fuel_end-byN[1].fuel_end+cons):NaN),
        still:live?live.still:NaN,rate:live&&fin(live.rate)?live.rate:NaN,g:compOf(race.plan,2)});return}
    const w=[n-1,n,n+1].map(k=>byN[k]);if(w.some(l=>!l||!(l.ms>0)))return;
    const near=laps.filter(l=>good(l)&&Math.abs(l.n-n)<=10),ref=near.length?mean(near.map(l=>l.ms))/1000:med/1000;
    if(!fin(ref))return;
    const loss=w.reduce((a,l)=>a+l.ms,0)/1000-3*ref;
    const live=(race.stops||[]).find(x=>Math.abs(x.lap-n)<=1);
    const before=byN[n-2],after=byN[n+1];
    const est=before&&fin(before.fuel_end)&&fin(after.fuel_end)&&fin(cons)?after.fuel_end-before.fuel_end+3*cons:NaN;
    stops.push({lap:n,loss,added:live&&fin(live.added)?live.added:(fin(est)?Math.min(race.fuelCap||100,Math.max(0,est)):NaN),still:live?live.still:NaN,rate:live&&fin(live.rate)?live.rate:NaN,g:compOf(race.plan,n+1)})});
  const best=Math.min(...laps.filter(l=>l.ms>0).map(l=>l.ms));
  return{pits:[...pits],stints,comps,cons,stops,best:fin(best)?best/1000:NaN,clean:cleanAll.length,laps:laps.length}}

/* ---- suggestions pour la page Stratégie ---- */
const lapStr=sec=>{const m=Math.floor(sec/60),s=sec-m*60;return m+":"+s.toFixed(3).padStart(6,"0")};
function suggest(A,S){if(!A||!S)return[];const out=[],num=v=>parseFloat(String(v).replace(",","."));
  if(fin(A.cons)&&A.clean>=2)out.push({key:"cons",label:"Conso par tour",cur:S.consMode==="avg"?num(S.cAvg):fin(num(S.mDeb)-num(S.mFin))&&num(S.mTours)>0?(num(S.mDeb)-num(S.mFin))/num(S.mTours):NaN,val:A.cons,unit:"L",
    apply:o=>{const n=Math.min(10,A.clean);o.consMode="mesure";o.mDeb=100;o.mFin=Math.round((100-A.cons*n)*100)/100;o.mTours=n}});
  ["S","M","H"].forEach(g=>{const c=A.comps[g];if(!c)return;const N={S:"Soft",M:"Medium",H:"Hard"}[g],x=S[g]||{};
    out.push({key:g+"-lap",label:`Temps au tour ${N}`,cur:x.lap,val:lapStr(c.avg),note:`moyenne de ${c.laps} tours`,apply:o=>{o[g]=Object.assign({},o[g]||{},{lap:lapStr(c.avg)})}});
    if(c.life)out.push({key:g+"-life",label:`Vie ${N}`,cur:x.life,val:c.life,unit:"tours",note:`perd ${(c.slope).toFixed(2).replace(".",",")} s par tour`,apply:o=>{o[g]=Object.assign({},o[g]||{},{life:c.life})}});
    else if(fin(c.slope))out.push({key:g+"-life",label:`Vie ${N}`,cur:x.life,unit:"tours",val:null,info:`usure faible sur ${c.longest} tours`})});
  const st=A.stops.filter(x=>fin(x.loss)&&x.loss>5);
  if(st.length){const rate=num(S.rate),mode=S.pitMode||"rate";
    const meas=median(A.stops.map(x=>x.rate).filter(r=>fin(r)&&r>0.3));
    if(fin(meas))out.push({key:"rate",label:"Refuel rate",cur:S.rate,val:Math.round(meas*10)/10,unit:"L/s",note:"mesuré au stand",apply:o=>{o.rate=Math.round(meas*10)/10}});
    const R=fin(meas)?meas:rate;
    if(mode==="rate"&&R>0){const base=median(st.map(x=>x.loss-(fin(x.added)?x.added:0)/R));
      if(fin(base)&&base>3)out.push({key:"pitTyre",label:"Arrêt pneus seuls",cur:S.pitTyre,val:Math.round(base),unit:"s",note:`d'après ${st.length} arrêt${st.length>1?"s":""}`,apply:o=>{o.pitTyre=Math.round(base)}})}
    else if(mode==="fixed"){const full=median(st.filter(x=>x.added>1).map(x=>x.loss)),ty=median(st.filter(x=>!(x.added>1)).map(x=>x.loss));
      if(fin(full))out.push({key:"pitFull",label:"Arrêt complet",cur:S.pitFull,val:Math.round(full),unit:"s",apply:o=>{o.pitFull=Math.round(full)}});
      if(fin(ty))out.push({key:"pitTyre",label:"Arrêt pneus seuls",cur:S.pitTyre,val:Math.round(ty),unit:"s",apply:o=>{o.pitTyre=Math.round(ty)}})}}
  return out}

function races(){return rd(RKEY,[])}
// supprimée aussi sur les autres écrans : on garde une trace de la suppression (partagée) avant d'enlever la course
function removeRace(id){const r=races().find(x=>x.id===id),k=r&&r.laps&&r.laps.length?r.laps[0].n+":"+r.laps[0].ms:"";
  wr("gt7-races-del",rd("gt7-races-del",[]).concat([{id,k}]).slice(-100));wr(RKEY,races().filter(x=>x.id!==id))}
// corrige la gomme d'un relais (la télémétrie ne la donne pas : elle vient du plan, qui peut avoir changé)
function setStintComp(id,from,g){const races=rd(RKEY,[]),r=races.find(x=>x.id===id);if(!r)return;const A=analyze(r);if(!A)return;
  r.plan=A.stints.map(s=>({g:s.from===from?g:(s.g||"?"),from:s.from,to:s.to}));r.updated=Date.now();r.gFixed=true;wr(RKEY,races)}
window.Learn={update,analyze,suggest,races,removeRace,lapStr,fromRecording,setStintComp};
})();
