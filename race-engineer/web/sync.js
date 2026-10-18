// Partage de la stratégie entre les appareils qui affichent les écrans (téléphone, iPad, PC…).
// Chaque navigateur garde ses données à part : sans ce partage, la stratégie faite sur le téléphone
// n'existe pas sur l'iPad, et le Plan B ne peut pas s'y déclencher.
// Le serveur (appli Android ou relais PC) garde la dernière version de chaque clé partagée ;
// chaque écran la récupère à l'ouverture puis toutes les 2 secondes. La plus récente gagne.
// Les réglages (thème, voix…) et le carnet restent propres à chaque appareil.
(function(){
const KEYS=["gt7-endu-v1","gt7-plan","gt7-saved","gt7-pitack"],META="gt7-sync-meta";
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
  for(const k of KEYS){const e=items[k],lt=localT(k),lv=LS.getItem(k);
    if(e&&typeof e.v==="string"&&e.t>lt){if(lv!==e.v){try{rawSet.call(LS,k,e.v)}catch(x){}changed.push(k)}meta[k]=e.t}
    else if(first&&lv!=null&&(!e||e.t<lt))push(k,lv,lt)} // le serveur n'a pas, ou a plus ancien : on lui envoie
  if(r.seq>seq)seq=r.seq;if(changed.length)saveMeta();return changed}
// à l'ouverture de la page : récupération immédiate, avant que les écrans lisent leurs données
try{const x=new XMLHttpRequest();x.open("GET","/sync?since=0",false);x.send(null);
  if(x.status===200)merge(JSON.parse(x.responseText),true);else ok=false}catch(e){ok=false}
if(!ok)return; // serveur sans partage (calculateur en ligne, ancien relais)
// chaque modification locale part tout de suite au serveur
Storage.prototype.setItem=function(k,v){if(this===LS&&KEYS.indexOf(k)>=0&&LS.getItem(k)===String(v))return;rawSet.call(this,k,v);
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
