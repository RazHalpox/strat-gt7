// Partage de la stratégie entre les appareils qui affichent les écrans (téléphone, iPad, PC…).
// Chaque navigateur garde ses données à part : sans ce partage, la stratégie faite sur le téléphone
// n'existe pas sur l'iPad, et le Plan B ne peut pas s'y déclencher.
// Le serveur (appli Android ou relais PC) garde la dernière version de chaque clé partagée ;
// chaque écran la récupère à l'ouverture puis toutes les 2 secondes. La plus récente gagne.
// Le carnet de courses est fusionné (une course vue par deux écrans n'apparaît qu'une fois).
// Les réglages (thème, voix…), la disposition et les enregistrements restent propres à chaque appareil.
(function(){
const KEYS=["gt7-endu-v1","gt7-plan","gt7-saved","gt7-pitack","gt7-races","gt7-races-del"],META="gt7-sync-meta";
/* ---- carnet : fusion au lieu de « la plus récente gagne » ---- */
const H3=3*3600e3,arr=v=>{try{const a=JSON.parse(v||"[]");return Array.isArray(a)?a:[]}catch(e){return[]}};
// la même course vue par deux écrans : même premier tour (numéro et temps), commencée à moins de 3 h d'écart
const rkey=r=>r&&r.laps&&r.laps.length?r.laps[0].n+":"+r.laps[0].ms:"";
const same=(a,b)=>{const k=rkey(a);return k!==""&&k===rkey(b)&&Math.abs(a.id-b.id)<H3};
function mergeDel(a,b){const m=new Map();for(const x of arr(a).concat(arr(b)))if(x&&x.id)m.set(x.id+":"+(x.k||""),x);
  return JSON.stringify([...m.values()].sort((x,y)=>y.id-x.id).slice(0,100))}
function mergeRaces(a,b){const del=arr(LS.getItem("gt7-races-del"));
  const gone=r=>del.some(d=>d.id===r.id||(d.k&&d.k===rkey(r)&&Math.abs(d.id-r.id)<H3));
  const groups=[];
  for(const r of arr(a).concat(arr(b))){if(!r||!r.id||gone(r))continue;const g=groups.find(g=>g.some(x=>x.id===r.id||same(x,r)));if(g)g.push(r);else groups.push([r])}
  // une course = la version qui a le plus de tours, sous le plus petit numéro (le même sur tous les écrans)
  const out=groups.map(g=>{const best=g.slice().sort((x,y)=>(y.laps||[]).length-(x.laps||[]).length||(y.updated||0)-(x.updated||0)||x.id-y.id)[0];
    const id=Math.min(...g.map(x=>x.id));return Object.assign({},best,{id,date:Math.min(...g.map(x=>x.date||x.id))})});
  return JSON.stringify(out.sort((x,y)=>y.id-x.id).slice(0,20))}
const MERGE={"gt7-races":mergeRaces,"gt7-races-del":mergeDel},remote={};
const LS=window.localStorage;if(!LS||!window.XMLHttpRequest||location.protocol==="file:")return;
const rawSet=Storage.prototype.setItem;
let meta={};try{meta=JSON.parse(LS.getItem(META)||"{}")||{}}catch(e){meta={}}
const saveMeta=()=>{try{rawSet.call(LS,META,JSON.stringify(meta))}catch(e){}};
// date de la version locale (les données d'avant le partage : la date du plan, sinon « très ancienne »)
function localT(k){if(meta[k])return meta[k];const v=LS.getItem(k);if(v==null)return 0;
  if(k==="gt7-plan"){try{const t=JSON.parse(v).t;if(t>0)return t}catch(e){}}
  return window.AndroidApp?2:1} // données d'avant le partage : celles du téléphone (l'appli) passent devant
let seq=0,ok=true;
function push(k,v,t){try{const x=new XMLHttpRequest();x.open("POST","/sync",true);x.setRequestHeader("Content-Type","application/json");
  x.send(JSON.stringify({k,v,t}))}catch(e){}}
// réponse du serveur : {seq, items:{clé:{v,t}}}
function merge(r,first){const changed=[];if(!r||typeof r!=="object")return changed;
  const items=r.items||{};
  for(const k of KEYS.filter(k=>MERGE[k]).reverse()){const e=items[k],lv=LS.getItem(k); // suppressions d'abord, puis le carnet
    if(e&&typeof e.v==="string")remote[k]=e;
    if(!e&&!(first&&lv!=null))continue;
    const m=MERGE[k](lv,e?e.v:null);
    if(m!==lv&&(lv!=null||m!=="[]")){try{rawSet.call(LS,k,m)}catch(x){}changed.push(k)}
    if(!e||m!==e.v){const t=Math.max(Date.now(),e?e.t+1:0);remote[k]={v:m,t};push(k,m,t)}}
  for(const k of KEYS.filter(k=>!MERGE[k])){const e=items[k],lt=localT(k),lv=LS.getItem(k);
    if(e&&typeof e.v==="string"&&e.t>lt){if(lv!==e.v){try{rawSet.call(LS,k,e.v)}catch(x){}changed.push(k)}meta[k]=e.t}
    else if(first&&lv!=null&&(!e||e.t<lt))push(k,lv,lt)} // le serveur n'a pas, ou a plus ancien : on lui envoie
  if(r.seq>seq)seq=r.seq;if(changed.length)saveMeta();return changed}
// à l'ouverture de la page : récupération immédiate, avant que les écrans lisent leurs données
try{const x=new XMLHttpRequest();x.open("GET","/sync?since=0",false);x.send(null);
  if(x.status===200)merge(JSON.parse(x.responseText),true);else ok=false}catch(e){ok=false}
if(!ok)return; // serveur sans partage (calculateur en ligne, ancien relais)
// chaque modification locale part tout de suite au serveur
Storage.prototype.setItem=function(k,v){
  if(this===LS&&MERGE[k]){const e=remote[k],m=MERGE[k](String(v),e?e.v:null);if(LS.getItem(k)!==m)rawSet.call(LS,k,m);
    if(!e||e.v!==m){const t=Math.max(Date.now(),e?e.t+1:0);remote[k]={v:m,t};push(k,m,t)}return}
  if(this===LS&&KEYS.indexOf(k)>=0&&LS.getItem(k)===String(v))return;rawSet.call(this,k,v);
  if(this===LS&&KEYS.indexOf(k)>=0){const t=Math.max(Date.now(),(meta[k]||0)+1);meta[k]=t;saveMeta();push(k,String(v),t)}};
// puis on écoute les modifications des autres appareils
function poll(){const x=new XMLHttpRequest();x.open("GET","/sync?since="+seq,true);x.timeout=4000;
  x.onload=()=>{if(x.status===200){try{const ch=merge(JSON.parse(x.responseText),false);
    if(ch.length)window.dispatchEvent(new CustomEvent("gt7-sync",{detail:{keys:ch}}))}catch(e){}}};
  x.send(null)}
setInterval(()=>{if(document.visibilityState!=="hidden")poll()},2000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")poll()});
window.Sync={keys:KEYS,poll,get seq(){return seq}};
})();
