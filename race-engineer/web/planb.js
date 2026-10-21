// Plan B : recalcul de la stratégie en course, partagé par les écrans Pilote et Complet.
// Bouton « Plan B » (si tu rentres à la fin de ce tour), ouverture automatique à l'entrée de la voie des stands
// hors plan, et question « quelle gomme as-tu montée ? » après un arrêt hors plan passé inaperçu.
(function(){
const $=id=>document.getElementById(id);
const fin=x=>typeof x==="number"&&isFinite(x);
const f1=x=>fin(x)?(Math.round(x*10)/10).toLocaleString("fr-FR",{minimumFractionDigits:1,maximumFractionDigits:1}):"–";
const CN={S:"Soft",M:"Medium",H:"Hard"};
const fk=()=>{const S=window.__S;return S&&S.L&&S.L.fuel_cap>0?100/S.L.fuel_cap:1};
const say=t=>{try{if(typeof window.say==="function")window.say(t)}catch(e){}};
const radio=t=>{try{if(typeof window.radio==="function")window.radio(t)}catch(e){}};
const CSS=`/* ---- Plan B : recalcul de la stratégie en course ---- */
#planBBtn{border-color:var(--warn);color:var(--warn)}
.pb{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:12px}
.pbBox{background:var(--panel);border:2px solid var(--warn);border-radius:10px;width:min(720px,100%);max-height:100%;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.pbBox h2{margin:0;font:700 24px var(--f-display);text-transform:uppercase;letter-spacing:.05em;color:var(--warn)}
.pbBox .sub{color:var(--muted);font:600 15px var(--f-display);letter-spacing:.03em}
.pbOpt{display:grid;grid-template-columns:auto 1fr auto;gap:4px 12px;align-items:center;text-align:left;width:100%;background:var(--panel-2);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:12px 14px;cursor:pointer;font-family:var(--f-display)}
.pbOpt:hover,.pbOpt:focus-visible{border-color:var(--warn);outline:none}
.pbOpt.best{border-color:var(--ok)}
.pbOpt .chip{width:40px;height:40px;font-size:19px;grid-row:span 2}
.pbOpt b{font:700 21px var(--f-display);text-transform:uppercase;letter-spacing:.04em}
.pbOpt small{grid-column:2;color:var(--muted);font:600 14px var(--f-display);letter-spacing:.02em}
.pbOpt em{grid-row:1/span 2;grid-column:3;font:700 17px var(--f-mono);font-style:normal;color:var(--muted);text-align:right;white-space:nowrap}
.pbOpt.best em{color:var(--ok)}
.pbFoot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}
.pbFoot p{margin:0;color:var(--muted);font:500 13px var(--f-display);flex:1;min-width:200px}
@media (max-height:500px){.pbBox{padding:8px 12px;gap:6px}.pbBox h2{font-size:18px}.pbOpt{padding:6px 10px}.pbOpt b{font-size:16px}.pbOpt small{font-size:12px}.pbOpt .chip{width:30px;height:30px;font-size:14px}}`;
const HTML=`<div class="pb" id="pb" hidden role="dialog" aria-modal="true" aria-labelledby="pbTitle"><div class="pbBox">
  <h2 id="pbTitle">Plan B</h2><div class="sub" id="pbSub"></div>
  <div id="pbList" style="display:flex;flex-direction:column;gap:8px"></div>
  <div class="pbFoot"><p id="pbNote">Calculé avec ta conso réelle et tes réglages de Stratégie (temps au tour, vie des gommes, stand, règles). Touche une option pour l'appliquer : le plan des écrans est mis à jour.</p>
  <button class="btn" type="button" id="pbClose">Annuler</button></div>
</div></div>`;
// ---- Plan B : recalcul de la stratégie depuis la situation réelle ----
let pbOpen=null,pbAutoOpen=false; // {kind:"now"|"after", X, atLap}
const pct=x=>Math.round(x*fk());
function ctxNow(){const S=window.__S;if(!S||!fin(S.L.lap))return null;const {L,laps,cons,rem}=S;
  const c=cons>0?cons:NaN,done=laps.reduce((a,l)=>a+(l.ms>0?l.ms:0),0)/1000,ref=L.last_ms>0?L.last_ms/1000:(laps.length?laps[laps.length-1].ms/1000:90);
  return{fromLap:L.lap+1,fuel:fin(c)?Math.max(0,L.fuel-rem*c):L.fuel,elapsed:done+Math.max(0,(L.cur_ms||0)/1000)+rem*ref,
    used:Replan.usedBefore(L.lap+1),firstStop:true,first:null,totalLaps:L.total_laps,c}}
function ctxAfter(pl,g){const S=window.__S;if(!S)return null;const {L,laps,cons}=S;const e=laps.find(l=>l.n===pl);
  return{fromLap:pl+1,fuel:e&&fin(e.fuel_end)?e.fuel_end:L.fuel,elapsed:laps.filter(l=>l.n<=pl).reduce((a,l)=>a+(l.ms>0?l.ms:0),0)/1000,
    used:Replan.usedBefore(pl+1),firstStop:false,first:g||null,totalLaps:L.total_laps,c:cons>0?cons:NaN}}
function optLine(r,kind){const f=r.rows[0],nx=r.rows.slice(1);
  const head=kind==="now"?`${CN[f.g]} · ${f.stop&&f.stop.add>0.05?"+"+pct(f.stop.add)+" %":"pneus seuls"}`:`${CN[f.g]} monté`;
  const tail=`${f.laps} tour${f.laps>1?"s":""} (T${f.from}–${f.to})`+(nx.length?", puis "+nx.map(x=>`${x.g} au T${x.from}${x.stop&&x.stop.add>0.05?" +"+pct(x.stop.add)+" %":" pneus seuls"}`).join(", "):", jusqu'à l'arrivée");
  return{head,tail}}
function showPB(kind,X,atLap,title,sub){
  const P=Replan.params(X.c);
  pbOpen={kind,X,atLap,auto:!!pbAutoOpen,planT:(Replan.readPlan()||{}).t};pbAutoOpen=false;$("pb").hidden=false;$("pbTitle").textContent=title;$("pbSub").textContent=sub;
  if(!P){$("pbList").innerHTML='<div class="sub">Il manque des réglages dans Stratégie › Paramètres (temps au tour, vie des gommes, stand) pour recalculer.</div>';return}
  const kinds=kind==="after"?["S","M","H"]:[null];
  const opts=kinds.flatMap(g=>Replan.options(Object.assign({},X,{first:g,used:new Set(X.used)}),P));
  // à l'arrêt : la meilleure option pour chaque gomme ; après un arrêt : une ligne par gomme montée
  const list=opts.slice().sort((a,b)=>P.mode==="laps"?a.time-b.time:(b.laps-a.laps)||(a.time-b.time));
  if(!list.length){$("pbList").innerHTML='<div class="sub">Aucune stratégie possible avec ces réglages.</div>';return}
  const best=list[0],gap=r=>r===best?"Meilleur":r.laps!==best.laps?`${r.laps-best.laps} tour${Math.abs(r.laps-best.laps)>1?"s":""}`:r.time-best.time<0.05?"Égal":`+${f1(r.time-best.time)} s`;
  const ordered=kind==="after"?opts:list;
  $("pbList").innerHTML="";
  ordered.forEach(r=>{const t=optLine(r,kind),b=document.createElement("button");b.type="button";b.className="pbOpt"+(r===best?" best":"");
    b.innerHTML=`<span class="chip ${r.rows[0].g}">${r.rows[0].g}</span><b></b><em></em><small></small>`;
    b.querySelector("b").textContent=t.head;b.querySelector("small").textContent=t.tail;b.querySelector("em").textContent=gap(r);
    b.addEventListener("click",()=>{Replan.apply(r,X,atLap);closePB();
      say(kind==="now"?`Plan B. Box box ce tour-ci. ${t.head.replace(" · ",", ").replace("+","").replace("%"," pour cent")}.`:`Nouveau plan. ${CN[r.rows[0].g]} jusqu'au tour ${r.rows[0].to}.`);
      radio("Plan B appliqué : "+t.head+" · "+t.tail)});
    $("pbList").appendChild(b)});
}
function closePB(){pbOpen=null;$("pb").hidden=true}
function onClose(){if(pbOpen&&pbOpen.kind==="after")ackPit(pbOpen.atLap);closePB()}
function onBtn(){const X=ctxNow();if(!X){return}
  const S=window.__S;if(window.Race&&S&&Race.finished(S.L,S.laps)){showPB("now",X,X.fromLap-1,"Course terminée","Drapeau à damier : il n'y a plus rien à recalculer.");$("pbList").innerHTML="";return}
  if(!(Replan.readPlan()||{}).rows){showPB("now",X,X.fromLap-1,"Plan B","Choisis d'abord un plan dans Stratégie.");$("pbList").innerHTML="";return}
  showPB("now",X,X.fromLap-1,`Plan B · arrêt à la fin du T${X.fromLap-1}`,`Si tu rentres à la fin de ce tour : la meilleure option pour chaque gomme, pour la suite de la course.`)}
// entrée dans la voie des stands : le limiteur fige la vitesse (±1 km/h, entre 30 et 110 km/h) sans freiner.
// Si ce tour n'est pas un arrêt prévu, le Plan B s'ouvre tout de suite et l'ingénieur annonce le meilleur choix.
let pitBuf=[],pitAutoLap=null,tpPrev=null,tpDrop=null;
function pitLaneCheck(L){
  // le téléphone (ou le PC) détecte lui-même l'entrée aux stands à 60 images/s et l'envoie dans chaque image :
  // tous les écrans réagissent en même temps, même si le Wi-Fi de l'iPad livre les images en retard ou par paquets
  if(typeof L.pit_lane==="boolean"){if(L.pit_lane)pitLaneHit(L);return}
  // horloge : le chrono du tour (suit aussi une relecture accélérée), sinon l'heure de l'appareil
  const now=fin(L.cur_ms)?L.cur_ms:performance.now(),v=L.speed;
  // entrée aux stands dans GT7 : de ~200 km/h à 0 d'un coup, voiture figée (transition vers la voie des stands)
  {const ok=L.on_track&&!L.paused&&!L.loading&&L.lap>=1,p=tpPrev;
   if(ok&&p&&p.v>40&&v<3&&Math.abs(now-p.t)<=250&&L.lap===p.lap)tpDrop={t:now,x:L.x,z:L.z};
   else if(tpDrop&&(!ok||v>3||Math.abs(L.x-tpDrop.x)>0.5||Math.abs(L.z-tpDrop.z)>0.5||now-tpDrop.t>15000||now<tpDrop.t))tpDrop=null;
   tpPrev={t:now,v,lap:L.lap};
   if(tpDrop&&now-tpDrop.t>=300){pitLaneHit(L);return}}
  if(pitBuf.length&&now<pitBuf[pitBuf.length-1].t)pitBuf=[];
  if(!fin(v)||!L.on_track||L.paused||L.loading||v<30||v>110||(L.brake||0)>5){pitBuf=[];return}
  if(pitBuf.length&&now===pitBuf[pitBuf.length-1].t)return;
  const rev=!!L.rev_limit||(L.rpm_hi>1000&&L.rpm>=L.rpm_hi*0.95)||(L.slip||[]).some(x=>Math.abs(x)>=15); // rupteur ou roues qui patinent : vitesse figée aussi, mais en piste
  pitBuf.push({t:now,v,th:L.throttle||0,rev});pitBuf=pitBuf.filter(x=>now-x.t<=2500);
  // vitesse figée depuis 1,2 s, sans gaz ni frein : dans la voie des stands, GT7 conduit la voiture tout seul
  // (gaz à 0 dans la télémétrie). Avec du gaz, c'est une courbe en piste à vitesse constante.
  const flat=w=>{const b=pitBuf.filter(x=>now-x.t<=w);if(!b.length||now-b[0].t<w-150)return null;
    const vs=b.map(x=>x.v);return Math.max(...vs)-Math.min(...vs)<=1.2&&!b.some(x=>x.rev)?b:null};
  const slow=flat(1200);
  if(!(slow&&slow.every(x=>x.th<5)))return;
  pitLaneHit(L)}
function pitLaneHit(L){
  window.inPitLane=fin(L.cur_ms)?L.cur_ms:performance.now();
  if(pbOpen||window.editing||pitAutoLap===L.lap||!fin(L.lap)||L.lap<1||!window.__S)return;
  const p=Replan.readPlan();if(!p||!p.rows||!p.rows.length)return;
  const ends=p.rows.slice(0,-1).map(r=>r.to),r=p.replan,lap=L.lap;
  if(ends.includes(lap)||ends.includes(lap-1)||(r&&(r.at===lap||r.at===lap-1)))return; // arrêt prévu : rien à faire
  pitAutoLap=lap;
  const X=ctxNow();if(!X)return;
  pbAutoOpen=true;showPB("now",X,lap,`Arrêt hors plan · T${lap}`,"Tu es dans la voie des stands : choisis ce que tu montes, la suite de la course est recalculée.");
  const b=document.querySelector(".pbOpt.best b");if(b)say(`Arrêt hors plan. Conseil : ${b.textContent.replace(" · ",", ").replace("+","").replace("%"," pour cent")}.`);
}
// Plan B appliqué sur un autre écran (le téléphone pendant que l'iPad affiche la même question) : on ferme ici
function syncClose(){if(!pbOpen||!pbOpen.auto)return;const p=Replan.readPlan();
  if(p&&p.replan&&p.t!==pbOpen.planT)closePB();else if(pbOpen.kind==="after"&&acked(pbOpen.atLap))closePB()}
function ackPit(pl){try{localStorage.setItem("gt7-pitack",JSON.stringify({pl,t:Date.now(),k:Replan.raceKey()}))}catch(e){}}
function acked(pl){try{const a=JSON.parse(localStorage.getItem("gt7-pitack")||"null");return a&&a.pl===pl&&Date.now()-a.t<3*3600e3&&(!a.k||a.k===Replan.raceKey())}catch(e){return false}}
// nouvelle course : un Plan B choisi pendant la course précédente ne compte plus, on remet le plan de départ
// (sinon son arrêt, par exemple au T2, passerait pour un arrêt prévu et le Plan B ne s'ouvrirait plus)
let lastLap=null,restart=false;
function newRaceCheck(L,laps){
  if(fin(L.lap)){if(lastLap!==null&&L.lap<lastLap){restart=true;pitAutoLap=null}lastLap=L.lap} // compteur de tours qui recule : course relancée
  const p=Replan.readPlan(),r=p&&p.replan;if(!r){restart=false;return}if(!(L.lap>=1))return;
  const k=laps.length?laps[0].n+":"+laps[0].ms:"";
  const fresh=restart||(r.k&&k&&k!==r.k)||(!laps.length&&L.lap<r.at)||(!r.k&&k&&!laps.some(l=>l.n>=r.at)&&L.lap<r.at);
  restart=false;if(!fresh)return;
  const o=r.orig&&r.orig.rows&&r.orig.rows.length?{t:Date.now(),stops:r.orig.stops,rows:r.orig.rows}
    :{t:Date.now(),stops:p.stops,rows:p.rows,stale:true}; // ancien Plan B sans plan de départ : on oublie au moins l'arrêt « prévu »
  try{localStorage.setItem("gt7-plan",JSON.stringify(o))}catch(e){}
  if(pbOpen&&pbOpen.auto)closePB()}
// arrêt hors plan détecté (accident, crevaison…) : on demande la gomme montée et on recalcule la suite
function planBCheck(L,laps,cons){
  if(pbOpen||window.editing)return;const p=Replan.readPlan();if(!p||!p.rows||p.rows.length<1)return;
  let pl=null;laps.forEach(l=>{if(l.pit&&l.n>1)pl=l.n});if(pl===null||!(L.lap<=pl+3))return;
  const ends=p.rows.slice(0,-1).map(r=>r.to),r=p.replan;
  if(ends.includes(pl)||ends.includes(pl-1)||(r&&(r.at===pl||r.at===pl-1))||acked(pl))return;
  const X=ctxAfter(pl);if(!X)return;
  pbAutoOpen=true;showPB("after",X,pl,`Arrêt hors plan au T${pl}`,"Quelle gomme as-tu montée ? La suite de la course est recalculée depuis ce tour.");
  say("Arrêt hors plan. Quelle gomme as-tu montée ?");
}

function init(){
  const st=document.createElement("style");st.textContent=CSS;document.head.insertBefore(st,document.head.firstChild);
  document.body.insertAdjacentHTML("beforeend",HTML);
  const tools=document.querySelector(".tools,.hdr-right"),vb=$("voiceBtn"),b=document.createElement("button");
  b.className="btn";b.id="planBBtn";b.type="button";b.title="Recalculer la stratégie si tu rentres à la fin de ce tour";b.textContent="Plan B";
  if(tools)tools.insertBefore(b,vb&&vb.parentNode===tools?(vb.previousElementSibling&&vb.previousElementSibling.id==="layoutBtn"?vb.previousElementSibling:vb):null);
  b.addEventListener("click",onBtn);$("pbClose").addEventListener("click",onClose);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
window.PlanB={tick(L,laps,cons,O){if(!$("pb"))return;if(O&&O.planBAuto===false)return;if(window.Race&&Race.finished(L,laps)){if(pbOpen&&pbOpen.auto)closePB();return}newRaceCheck(L,laps);syncClose();pitLaneCheck(L);planBCheck(L,laps,cons)},open:onBtn,
  // appelé dès l'arrivée d'une image, avant le reste de l'écran : l'entrée aux stands est vue sans délai
  pit(L,O){if(!$("pb")||(O&&O.planBAuto===false))return;const S=window.__S;if(window.Race&&S&&Race.finished(L,S.laps))return;pitLaneCheck(L)}};
})();
