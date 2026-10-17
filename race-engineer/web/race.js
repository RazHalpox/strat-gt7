// Calculs de course partagés par les écrans Pilote et Complet :
// rythme réel, prévision du tour d'arrivée (course à la durée), conso à viser pour tenir jusqu'à un tour donné.
(function(){
const fin=x=>typeof x==="number"&&isFinite(x);
const num=v=>v===""||v==null?NaN:typeof v==="number"?v:parseFloat(String(v).replace(",","."));

// réglages de la page Stratégie (durée, stand…)
function strat(){
  try{const o=JSON.parse(localStorage.getItem("gt7-endu-v1")||"null"),S=o&&o.S;if(!S)return null;
    const P={mode:S.mode||"time",T:num(S.duree)*60,laps:Math.floor(num(S.laps)),tank:num(S.tank),rate:num(S.rate),
      pitMode:S.pitMode||"rate",pitFull:num(S.pitFull),pitTyre:num(S.pitTyre)};
    P.stopTime=add=>P.pitMode==="rate"?(fin(P.pitTyre)?P.pitTyre:0)+(P.rate>0?add/P.rate:0):(add>0?P.pitFull:P.pitTyre)||0;
    return P}catch(e){return null}}
function plan(){try{return JSON.parse(localStorage.getItem("gt7-plan")||"null")}catch(e){return null}}

// tours représentatifs du rythme : ni tour 1, ni tour avec arrêt, ni tour de sortie des stands, ni tour raté (> 107 %)
function cleanPace(laps){
  const pits=new Set(laps.filter(l=>l.pit).map(l=>l.n));
  const c=laps.filter(l=>l.ms>0&&l.n>1&&!l.pit&&!pits.has(l.n-1));
  if(!c.length)return[];
  const ms=c.map(l=>l.ms).sort((a,b)=>a-b),med=ms[Math.floor(ms.length/2)];
  return c.filter(l=>l.ms<=med*1.07)}
// rythme actuel en secondes : moyenne des 5 derniers tours représentatifs
function pace(laps,n=5){const c=cleanPace(laps).slice(-n);return c.length?c.reduce((a,l)=>a+l.ms,0)/c.length/1000:NaN}

/* Tour d'arrivée d'une course à la durée : le premier passage sur la ligne après la fin du chrono.
   On part du temps déjà écoulé, on ajoute le rythme actuel et le temps des arrêts encore prévus.
   Renvoie {finalLap, over, under} : over = secondes entre la fin du chrono et l'arrivée (petit = un tour de plus possible
   si tu vas plus vite), under = avance sur le chrono au tour d'avant (petit = un tour de moins possible si tu ralentis). */
function predict(L,laps){
  const P=strat();if(!P||P.mode!=="time"||!(P.T>0)||L.total_laps>0||!fin(L.lap)||L.lap<1)return null;
  const pc=pace(laps);if(!fin(pc))return null;
  const p=plan(),rows=p&&p.rows||[],loss={};
  for(let i=0;i<rows.length-1;i++){const r=rows[i],nx=rows[i+1];if(r.to>=L.lap&&nx.stop&&!nx.stop.done)loss[r.to]=P.stopTime(nx.stop.full?nx.stop.add||0:0)}
  const cur=Math.max(0,(L.cur_ms||0)/1000);
  let t=laps.reduce((a,l)=>a+(l.ms>0?l.ms:0),0)/1000+cur+Math.max(0,pc-cur),n=L.lap,prev=t-pc;
  if(loss[n])t+=loss[n];
  let guard=0;while(t<P.T&&guard++<400){prev=t;n++;t+=pc;if(loss[n])t+=loss[n]}
  return{finalLap:n,over:t-P.T,under:P.T-prev,pace:pc}}

// dernier tour de la course : nombre de tours (course aux tours), sinon la prévision, sinon la fin du plan
function finishLap(L,laps){
  if(L.total_laps>0)return L.total_laps;
  const pr=predict(L,laps);if(pr)return pr.finalLap;
  const p=plan();return p&&p.rows&&p.rows.length?p.rows[p.rows.length-1].to:NaN}

// conso maximale (L/tour) pour tenir lapsTo tours avec l'essence actuelle
function target(fuel,lapsTo){return fin(fuel)&&lapsTo>0?fuel/lapsTo:NaN}

window.Race={strat,pace,cleanPace,predict,finishLap,target};
})();
