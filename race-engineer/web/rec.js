// Enregistrement des courses sur l'appareil qui affiche les écrans (iPad, téléphone, PC…).
// Les écrans Pilote et Complet reçoivent la télémétrie 10 fois par seconde : chaque image est gardée dans la mémoire
// du navigateur (IndexedDB), compressée par paquets de 5 s. Même format que l'appli Android et le relais PC
// (une image JSON par ligne, + les tours bouclés quand ils changent) : un enregistrement exporté se rejoue partout.
(function(){
const DB="gt7-rec",KEEP=10,GAP=120000;
let dbp=null;
function db(){if(dbp)return dbp;dbp=new Promise((res,rej)=>{if(!window.indexedDB)return rej(new Error("IndexedDB indisponible"));
  const r=indexedDB.open(DB,1);
  r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("recs"))d.createObjectStore("recs",{keyPath:"id"});
    if(!d.objectStoreNames.contains("chunks")){const c=d.createObjectStore("chunks",{keyPath:["rec","seq"]});c.createIndex("rec","rec")}};
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});return dbp}
const tx=(names,mode,fn)=>db().then(d=>new Promise((res,rej)=>{const t=d.transaction(names,mode);let out;try{out=fn(t)}catch(e){rej(e)}
  t.oncomplete=()=>res(out&&out.result!==undefined?out.result:out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)}));
const canGz=typeof CompressionStream==="function"&&typeof DecompressionStream==="function";
async function gz(text){return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).blob()}
async function gunzip(blob){return new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).text()}

function opts(){try{return JSON.parse(localStorage.getItem("gt7-opts")||"{}")}catch(e){return{}}}
// activé par défaut, sauf dans l'appli Android (elle enregistre déjà la télémétrie elle-même)
function enabled(){const o=opts();return o.recLocal===undefined?!window.AndroidApp:!!o.recLocal}

/* ---- enregistrement ---- */
let cur=null,buf=[],bufBytes=0,lastFlush=0,lastLapKey="",flushing=Promise.resolve(),replaying=false,ready=false,pending=[];
/* Une course = un seul enregistrement, même si tu passes de Pilote à Complet ou Stratégie (chaque écran est une
   nouvelle page) : à l'ouverture, on reprend l'enregistrement en cours s'il a reçu une image il y a moins de 2 min.
   Pas de nouvel enregistrement tant que la voiture ne roule pas (menus, résultats après l'arrivée). */
const moving=L=>L&&L.lap>=1&&L.speed>5&&L.on_track!==false&&!L.paused&&!L.loading;
async function init(){
  try{const a=await list(),r=a[0];
    if(r&&Date.now()-r.end<GAP){const cs=await chunks(r.id);
      cur={id:r.id,start:r.start,last:r.end,frames:r.frames||0,bytes:r.bytes||0,seq:cs.length?cs[cs.length-1].seq+1:0,laps:r.laps||0,resumed:true}}
    await prune()}catch(e){}
  ready=true;const p=pending;pending=[];p.forEach(feed)}
function feed(s){
  if(replaying||!s||s.mode!=="live"||!s.live||!enabled())return;
  if(!ready){if(pending.length<50)pending.push(s);return}
  const now=Date.now();
  if(!cur||now-cur.last>GAP){
    if(!moving(s.live)){if(cur&&now-cur.last>GAP){flush();cur=null}return}
    flush();cur={id:now,start:now,last:now,frames:0,bytes:0,seq:0,laps:0};lastLapKey="";
    tx(["recs"],"readwrite",t=>t.objectStore("recs").put(meta())).then(prune).catch(()=>{})}
  if(now-cur.last<90&&cur.frames)return; // au plus ~10 images par seconde
  cur.last=now;cur.frames++;
  const line=Object.assign({},s.live,{t:now-cur.start,st:s.t}) /* st : heure d'envoi par le serveur (mesure du retard Wi-Fi) */,laps=s.laps||[],lk=laps.length+":"+(laps.length?laps[laps.length-1].n+":"+laps[laps.length-1].ms:"");
  if(lk!==lastLapKey){lastLapKey=lk;line.laps=laps;cur.laps=laps.length}
  const txt=JSON.stringify(line);buf.push(txt);bufBytes+=txt.length;
  if(now-lastFlush>5000||bufBytes>400000)flush();
}
function meta(){return{id:cur.id,start:cur.start,end:cur.last,frames:cur.frames,bytes:cur.bytes,laps:cur.laps,gz:canGz}}
function flush(){
  if(!cur||!buf.length)return flushing;
  const text=buf.join("\n")+"\n",rec=cur,seq=rec.seq++;buf=[];bufBytes=0;lastFlush=Date.now();
  flushing=flushing.then(async()=>{const data=canGz?await gz(text):text;rec.bytes+=canGz?data.size:text.length;
    await tx(["chunks","recs"],"readwrite",t=>{t.objectStore("chunks").put({rec:rec.id,seq,data});
      t.objectStore("recs").put({id:rec.id,start:rec.start,end:rec.last,frames:rec.frames,bytes:rec.bytes,laps:rec.laps,gz:canGz})})}).catch(()=>{});
  return flushing}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")flush()});
window.addEventListener("pagehide",()=>flush());

/* ---- liste, suppression, export ---- */
function list(){return tx(["recs"],"readonly",t=>t.objectStore("recs").getAll()).then(a=>(a||[]).sort((x,y)=>y.id-x.id)).catch(()=>[])}
async function remove(id){await tx(["recs","chunks"],"readwrite",t=>{t.objectStore("recs").delete(id);
  const idx=t.objectStore("chunks").index("rec").openCursor(IDBKeyRange.only(id));idx.onsuccess=()=>{const c=idx.result;if(c){c.delete();c.continue()}}})}
// on garde les 10 derniers enregistrements, sans les bouts de moins de 2 min (menus, rechargements)
async function prune(){const a=await list(),now=Date.now(),act=cur&&cur.id;
  const junk=a.filter(r=>r.id!==act&&now-r.end>GAP&&(r.end-r.start<120000||!(r.frames>=600)));
  for(const r of junk)await remove(r.id);
  for(const r of a.filter(r=>!junk.includes(r)).slice(KEEP))await remove(r.id)}
function chunks(id){return tx(["chunks"],"readonly",t=>t.objectStore("chunks").index("rec").getAll(IDBKeyRange.only(id))).then(a=>(a||[]).sort((x,y)=>x.seq-y.seq))}
async function text(id){if(cur&&cur.id===id)await flush();const cs=await chunks(id);let out="";
  for(const c of cs)out+=typeof c.data==="string"?c.data:await gunzip(c.data);return out}
function fileName(r){const d=new Date(r.start),p=n=>String(n).padStart(2,"0");return`course-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jsonl.gz`}
// un fichier .jsonl.gz : les paquets gzip mis bout à bout forment un gzip valide (relu par l'appli Android et le relais PC)
async function exportFile(r){if(cur&&cur.id===r.id)await flush();const cs=await chunks(r.id);
  let blob;if(cs.length&&cs.every(c=>typeof c.data!=="string"))blob=new Blob(cs.map(c=>c.data),{type:"application/gzip"});
  else{const t=await text(r.id);blob=canGz?await gz(t):new Blob([t],{type:"text/plain"})}
  const name=canGz||blob.type==="application/gzip"?fileName(r):fileName(r).replace(/\.gz$/,"");
  const file=new File([blob],name,{type:blob.type});
  if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:"Course GT7 enregistrée"});return"partagé"}catch(e){if(e&&e.name==="AbortError")return"annulé"}}
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);return"téléchargé"}

/* ---- relecture dans la page (sans la PS5) ---- */
async function replay(id,speed,onState,onEnd){
  replaying=true;speed=Math.max(.1,+speed||1);
  const lines=(await text(id)).split("\n").filter(Boolean);let laps=[],prev=null,i=0;
  const step=()=>{
    if(i>=lines.length){if(onEnd)onEnd();return}
    let d;try{d=JSON.parse(lines[i++])}catch(e){return step()}
    const t=d.t||0;delete d.t;if(d.laps){laps=d.laps;delete d.laps}
    onState({mode:"replay",live:d,laps,t:Date.now()/1000});
    const nx=lines[i];let wait=100;
    if(nx){const m=nx.match(/"t":(\d+)/);if(m)wait=Math.min(3000,Math.max(0,(+m[1]-t)/speed))}
    prev=t;setTimeout(step,wait)};
  step()}

init();
window.Rec={feed,prune,text,flush,list,remove,exportFile,replay,enabled,fileName,get recording(){return cur&&Date.now()-cur.last<5000?cur.id:null}};
})();
