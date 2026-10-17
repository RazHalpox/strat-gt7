// Plan B : recalcule la fin de la course depuis la situation réelle (tour, essence, gommes déjà utilisées).
// Même méthode que la page Stratégie (mêmes réglages : temps au tour, vie des gommes, stand, règles),
// mais en partant du tour où tu rentres au lieu du départ. Le calcul prend quelques millisecondes.
(function(){
const CNR={S:"Soft",M:"Medium",H:"Hard"},KS=["S","M","H"];
const fin=x=>typeof x==="number"&&isFinite(x);
const num=v=>v===""||v==null?NaN:typeof v==="number"?v:parseFloat(String(v).replace(",","."));
function parseLap(s){s=String(s??"").trim().replace(",",".");const m=s.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);return m?+m[1]*60+ +m[2]:num(s)}
function readS(){try{const o=JSON.parse(localStorage.getItem("gt7-endu-v1")||"null");return o&&o.S||null}catch(e){return null}}
function readPlan(){try{return JSON.parse(localStorage.getItem("gt7-plan")||"null")}catch(e){return null}}

// réglages de la page Stratégie ; c = conso réelle (L/tour) si on l'a, sinon celle des réglages
function params(c){
  const S=readS();if(!S)return null;
  const P={mode:S.mode||"time",T:num(S.duree)*60,L:Math.floor(num(S.laps)),tank:num(S.tank),rate:num(S.rate),
    pitMode:S.pitMode||"rate",pitFull:num(S.pitFull),pitTyre:num(S.pitTyre),nReq:+S.nReq||1};
  const c0=(num(S.mDeb)-num(S.mFin))/num(S.mTours);
  P.c=c>0?c:c0;
  P.comps=KS.map(k=>{const x=S[k]||{};return{k,lap:parseLap(x.lap),life:Math.floor(num(x.life)),req:!!x.req}});
  P.fuelCap=x=>P.c>0?Math.max(0,Math.floor(x/P.c+1e-9)):999;
  P.stopTime=add=>P.pitMode==="rate"?P.pitTyre+add/P.rate:(add>0?P.pitFull:P.pitTyre);
  const ok=P.c>0&&P.tank>0&&P.pitTyre>0&&(P.pitMode!=="rate"||P.rate>0)&&(P.pitMode!=="fixed"||P.pitFull>0)&&
    P.comps.every(g=>g.lap>0&&g.life>=1)&&(P.mode==="laps"?P.L>0:P.T>0);
  return ok?P:null;
}

// suites de k relais qui respectent les règles, en tenant compte des gommes déjà utilisées
function sequences(k,P,used,first){const out=[],C=P.comps;
  for(let a=0;a<=k;a++)for(let b=0;a+b<=k;b++){const n=[a,b,k-a-b];
    if(C.some((g,j)=>g.req&&!used.has(g.k)&&n[j]<1))continue;
    const kinds=new Set(used);C.forEach((g,j)=>{if(n[j]>0)kinds.add(g.k)});if(kinds.size<P.nReq)continue;
    const flat=[];C.forEach((g,j)=>{for(let x=0;x<n[j];x++)flat.push(g)});flat.sort((p,q)=>p.lap-q.lap);
    const seen=new Set();flat.forEach((f,fi)=>{if(seen.has(f.k)||(first&&f.k!==first))return;seen.add(f.k);
      const rest=flat.slice();rest.splice(fi,1);out.push([f,...rest])})}
  return out}

// répartit n tours (1 mini par relais, les gommes rapides d'abord) puis compte le temps, arrêts compris
function simulate(seq,caps,n,X,P){
  const k=seq.length,s=caps.map(()=>1);let rem=n-k;
  const order=seq.map((g,i)=>i).sort((a,b)=>seq[a].lap-seq[b].lap||caps[b]-caps[a]);
  for(const i of order){const a=Math.min(caps[i]-s[i],rem);s[i]+=a;rem-=a;if(!rem)break}
  let fuel=X.fuel,drive=0,pits=0,lapNo=X.fromLap;const rows=[];
  for(let i=0;i<k;i++){let stop=null;
    if(i>0||X.firstStop){const need=s[i]*P.c-fuel,add=need>1e-9?Math.min(need,P.tank-Math.max(0,fuel)):0,t=P.stopTime(add);
      fuel+=add;pits+=t;stop={add,full:add>0,t}}
    rows.push({g:seq[i].k,laps:s[i],from:lapNo,to:lapNo+s[i]-1,stop});
    lapNo+=s[i];drive+=s[i]*seq[i].lap;fuel-=s[i]*P.c}
  return{seq,rows,drive,pits,time:drive+pits,laps:n}}

function bestForSeq(seq,X,P){
  const caps=seq.map((g,i)=>Math.min(i===0&&!X.firstStop?P.fuelCap(X.fuel):P.fuelCap(P.tank),g.life));
  if(caps.some(c=>c<1))return null;
  const k=seq.length,sum=caps.reduce((a,b)=>a+b,0);
  if(P.mode==="laps"){const n=X.lapsLeft;return n>=k&&n<=sum?simulate(seq,caps,n,X,P):null}
  // course à la durée : on compte jusqu'au premier passage sur la ligne après la fin du chrono
  if(simulate(seq,caps,sum,X,P).time<X.timeLeft)return null;
  let lo=k,hi=sum;while(lo<hi){const m=Math.floor((lo+hi)/2);if(simulate(seq,caps,m,X,P).time>=X.timeLeft)hi=m;else lo=m+1}
  return simulate(seq,caps,lo,X,P)}
const better=(a,b,P)=>!b||(P.mode==="laps"?a.time<b.time:a.laps>b.laps||a.laps===b.laps&&a.time<b.time);

/* X : { fromLap (1er tour du nouveau relais), fuel (L au début de ce tour, avant l'arrêt si firstStop),
         elapsed (s de course écoulées à ce moment), used (Set des gommes déjà roulées), firstStop, first (gomme imposée ou null),
         totalLaps (course aux tours) }
   renvoie la meilleure option pour chaque gomme de départ, la meilleure en premier */
function options(X,P){
  if(P.mode==="laps"){X.lapsLeft=(X.totalLaps>0?X.totalLaps:P.L)-X.fromLap+1;if(!(X.lapsLeft>=1))return[]}
  else{X.timeLeft=P.T-X.elapsed;if(!(X.timeLeft>0))X.timeLeft=1}
  const res=[];
  for(const g of (X.first?[X.first]:KS)){let best=null,firstK=null;
    for(let k=1;k<=12;k++){if(firstK!==null&&k>firstK+3)break;
      for(const seq of sequences(k,P,X.used,g)){const r=bestForSeq(seq,X,P);if(r&&better(r,best,P)){best=r}}
      if(best&&firstK===null)firstK=k}
    if(best)res.push(best)}
  res.sort((a,b)=>better(a,b,P)?-1:better(b,a,P)?1:0);
  return res}

// le plan complet : les relais déjà roulés (coupés au dernier tour fait) + les nouveaux
function buildPlan(opt,X,atLap){const p=readPlan()||{rows:[]};
  const past=(p.rows||[]).filter(r=>r.from<X.fromLap).map(r=>{const to=Math.min(r.to,X.fromLap-1);return{g:r.g,from:r.from,to,laps:to-r.from+1,stop:r.stop||null}});
  const rows=past.concat(opt.rows.map((r,i)=>({g:r.g,from:r.from,to:r.to,laps:r.laps,
    stop:r.stop?{add:Math.round(r.stop.add*10)/10,full:r.stop.full}:(i===0&&past.length?{add:0,full:false,done:true}:null)})));
  return{t:Date.now(),stops:rows.length-1,rows,replan:{at:atLap,t:Date.now(),from:p.replan?p.replan.from||p.t:p.t}}}
function apply(opt,X,atLap){const plan=buildPlan(opt,X,atLap);try{localStorage.setItem("gt7-plan",JSON.stringify(plan))}catch(e){}return plan}

// gommes déjà roulées d'après le plan (relais commencés avant le tour donné)
function usedBefore(lap){const p=readPlan(),u=new Set();(p&&p.rows||[]).forEach(r=>{if(r.from<lap&&KS.includes(r.g))u.add(r.g)});return u}

window.Replan={params,options,apply,buildPlan,usedBefore,readPlan,CN:CNR};
})();
