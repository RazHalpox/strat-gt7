// Assistant du premier lancement : 3 questions (course, essence, gommes) pour préparer la stratégie,
// puis comment régler l'écran Pilote (masquer ou déplacer ce qui ne sert pas).
// Il s'ouvre une seule fois sur un appareil neuf (nouvelle installation) ; ⚙ Réglages › Assistant le relance.
(function(){
const W="gt7-onboard";
const get=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const put=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
const html=document.documentElement;
// déjà des réglages ou des courses : ce n'est pas une nouvelle installation, pas d'assistant
if(get(W)==null&&["gt7-endu-v1","gt7-races","gt7-opts","gt7-plan","gt7-saved"].some(k=>get(k)!=null))put(W,"1");
try{localStorage.removeItem("gt7-mode");sessionStorage.removeItem("gt7-adv")}catch(e){} // ancien mode Simple / Expert, retiré

const css=document.createElement("style");
css.textContent=`
#wiz{position:fixed;inset:0;z-index:9999;background:rgba(5,7,10,.82);display:flex;align-items:center;justify-content:center;padding:16px;
  font-family:"IBM Plex Sans",system-ui,sans-serif;color:#e9edf1}
#wiz .wz{background:#151a21;border:1px solid #27303b;border-radius:12px;width:100%;max-width:460px;max-height:100%;overflow:auto;padding:22px 22px 18px}
#wiz .st{font:600 13px "Barlow Condensed","Arial Narrow",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8e99a5}
#wiz h2{font:700 28px "Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:.02em;margin:4px 0 6px;color:#e9edf1}
#wiz p{margin:0 0 14px;color:#b6bfc9;line-height:1.45}
#wiz .ch{display:grid;gap:8px;margin:0 0 14px}
#wiz .ch.row{grid-template-columns:repeat(auto-fit,minmax(0,1fr))}
#wiz .ch button{background:#1c232c;color:#e9edf1;border:2px solid #27303b;border-radius:8px;padding:12px;text-align:left;font:inherit;cursor:pointer}
#wiz .ch button b{display:block;font:700 19px "Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:.04em}
#wiz .ch button small{color:#8e99a5}
#wiz .ch button[aria-pressed=true]{border-color:#ff3b4e;background:#2a1a1f}
#wiz .ch.ty button{text-align:center}
#wiz .ch.ty i{display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:6px;vertical-align:-1px}
#wiz label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;font-weight:500}
#wiz label span{display:flex;align-items:center;gap:6px;color:#8e99a5}
#wiz input{font:600 20px "JetBrains Mono",ui-monospace,monospace;width:110px;text-align:right;background:#0c0f13;color:#e9edf1;border:1px solid #3a4552;border-radius:6px;padding:8px 10px}
#wiz .nav{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:8px}
#wiz .go{background:#ff3b4e;color:#fff;border:0;border-radius:8px;padding:12px 20px;font:700 17px "Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:.06em;cursor:pointer}
#wiz .lk{background:none;border:0;color:#8e99a5;font:inherit;text-decoration:underline;cursor:pointer;padding:8px 0}
#wiz .dots{display:flex;gap:6px;margin-bottom:12px}#wiz .dots i{width:22px;height:4px;border-radius:2px;background:#27303b}#wiz .dots i.on{background:#ff3b4e}
#wiz .tip{font-size:13px;color:#8e99a5;margin:-4px 0 14px}
#wiz button:focus-visible,#wiz input:focus-visible{outline:2px solid #ff3b4e;outline-offset:2px}`;
(document.head||html).appendChild(css);

/* ---- assistant du premier lancement ---- */
function readS(){try{const o=JSON.parse(get("gt7-endu-v1")||"null");return o&&o.S?o:{S:{},tab:"strat"}}catch(e){return{S:{},tab:"strat"}}}
function wizard(){
  if(document.getElementById("wiz"))return;
  const o=readS(),S=o.S,A={mode:S.mode==="laps"?"laps":"time",duree:+S.duree||60,laps:+S.laps||35,tank:+S.tank||100,
    cAvg:S.consMode==="avg"&&+S.cAvg>0?String(S.cAvg):"",req:{S:false,M:false,H:false}};
  let step=0;
  const box=document.createElement("div");box.id="wiz";box.setAttribute("role","dialog");box.setAttribute("aria-modal","true");box.setAttribute("aria-labelledby","wizT");
  document.body.appendChild(box);
  const num=v=>{const x=parseFloat(String(v).replace(",","."));return isFinite(x)?x:NaN};
  const steps=[
    ()=>`<div class="st">Bienvenue</div><h2 id="wizT">Ta stratégie en 3 questions</h2>
      <p>Réponds à 3 questions et ta stratégie d'endurance est prête : quand rentrer au stand, combien d'essence mettre et quelle gomme monter.</p>
      <p>Tu pourras tout changer plus tard dans l'onglet Stratégie.</p>`,
    ()=>`<div class="st">1 / 3 · La course</div><h2 id="wizT">Comment se termine ta course ?</h2>
      <div class="ch row"><button type="button" data-k="mode" data-v="time" aria-pressed="${A.mode==="time"}"><b>À la durée</b><small>ex. 1 heure</small></button>
      <button type="button" data-k="mode" data-v="laps" aria-pressed="${A.mode==="laps"}"><b>Au nombre de tours</b><small>ex. 35 tours</small></button></div>
      ${A.mode==="time"?`<label for="wzD">Durée de la course<span><input id="wzD" type="number" inputmode="numeric" min="1" step="1" value="${A.duree}">min</span></label>`
        :`<label for="wzL">Nombre de tours<span><input id="wzL" type="number" inputmode="numeric" min="1" step="1" value="${A.laps}">tours</span></label>`}`,
    ()=>`<div class="st">2 / 3 · L'essence</div><h2 id="wizT">Ton carburant</h2>
      <label for="wzT">Taille du réservoir<span><input id="wzT" type="number" inputmode="numeric" min="1" step="1" value="${A.tank}">L</span></label>
      <label for="wzC">Conso moyenne par tour<span><input id="wzC" type="text" inputmode="decimal" placeholder="7,5" value="${A.cAvg}">L</span></label>
      <p class="tip">Dans GT7, 1 % de jauge = 1 L avec un réservoir de 100 L.</p>
      <p class="tip">Si tu ne la connais pas, laisse vide. L'appli la mesure pendant que tu roules et te la propose ensuite dans Stratégie › Paramètres.</p>`,
    ()=>`<div class="st">3 / 3 · Les pneus</div><h2 id="wizT">Gommes obligatoires</h2>
      <p>Touche les gommes que le règlement de la course t'oblige à utiliser. Si rien n'est imposé, n'en touche aucune.</p>
      <div class="ch row ty">${[["S","Soft","#ff4a5c"],["M","Medium","#ffc833"],["H","Hard","#dfe5ea"]].map(([k,n,c])=>
        `<button type="button" data-k="req" data-v="${k}" aria-pressed="${A.req[k]}"><b><i style="background:${c}"></i>${n}</b></button>`).join("")}</div>`,
    ()=>`<div class="st">Bon à savoir</div><h2 id="wizT">Ton écran, à ta façon</h2>
      <p>L'écran Pilote affiche beaucoup d'infos. Retire celles qui ne te servent pas :</p>
      <p>• Sur Pilote, touche <b>▦</b>, en haut à côté du casque : c'est le mode <b>Disposition</b>.<br>
      • Touche un élément pour le masquer (compte-tours, conso des derniers tours, températures des pneus…). Ce qui reste grandit. Touche-le encore pour le remettre.<br>
      • <b>✕ Masquer</b> retire une fenêtre entière. Fais glisser une fenêtre pour changer sa place.<br>
      • <b>Par défaut</b> remet tout comme au départ, <b>Terminé</b> enregistre.</p>
      <p class="tip">Thème, alertes et voix : ⚙ Réglages. Tu peux relancer ce guide depuis ⚙ Réglages › Assistant.</p>`];
  function grab(){const v=id=>{const e=document.getElementById(id);return e?e.value:null};
    if(v("wzD")!=null){const x=num(v("wzD"));if(x>0)A.duree=Math.round(x)}
    if(v("wzL")!=null){const x=num(v("wzL"));if(x>0)A.laps=Math.round(x)}
    if(v("wzT")!=null){const x=num(v("wzT"));if(x>0)A.tank=Math.round(x)}
    if(v("wzC")!=null)A.cAvg=v("wzC").trim()}
  function draw(){const last=step===steps.length-1;
    box.innerHTML=`<div class="wz"><div class="dots">${steps.map((_,i)=>`<i class="${i<=step?"on":""}"></i>`).join("")}</div>${steps[step]()}
      <div class="nav">${step?`<button type="button" class="lk" data-a="back">Retour</button>`:`<button type="button" class="lk" data-a="skip">Passer</button>`}
      <button type="button" class="go" data-a="next">${step===0?"C'est parti":last?"Voir ma stratégie":"Suivant"}</button></div></div>`;
    const f=box.querySelector("input")||box.querySelector(".go");if(f)try{f.focus({preventScroll:true})}catch(e){}}
  function finish(){
    const n=readS(),T=n.S;T.mode=A.mode;if(A.mode==="time")T.duree=A.duree;else T.laps=A.laps;
    T.tank=A.tank;T.start=A.tank;const c=num(A.cAvg);if(c>0){T.consMode="avg";T.cAvg=Math.round(c*100)/100}
    const nr=["S","M","H"].filter(k=>A.req[k]);["S","M","H"].forEach(k=>{T[k]=Object.assign({},T[k]||{},{req:A.req[k]})});
    T.nReq=Math.max(1,nr.length);n.tab="strat";
    try{localStorage.setItem("gt7-endu-v1",JSON.stringify(n))}catch(e){}
    put(W,"1");close();
    if(!/strategie\.html$/.test(location.pathname))location.href="strategie.html";else location.reload()}
  function close(){box.remove();document.removeEventListener("keydown",esc)}
  function esc(e){if(e.key==="Escape"){put(W,"1");close()}}
  document.addEventListener("keydown",esc);
  box.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.tagName==="INPUT"){e.preventDefault();box.querySelector(".go").click()}});
  box.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;
    if(b.dataset.k){grab();const k=b.dataset.k,v=b.dataset.v;if(k==="req")A.req[v]=!A.req[v];else A[k]=v;draw();return}
    const a=b.dataset.a;if(a==="skip"){put(W,"1");close();return}
    grab();if(a==="back"){step--;draw();return}
    if(a==="next"){if(step===steps.length-1)finish();else{step++;draw()}}});
  draw()}

window.Tuto={open:wizard};
// les anciens enregistrements de télémétrie des écrans (fonction retirée) : on libère la place une fois
if(get("gt7-rec-gone")!=="1"){try{if(window.indexedDB)indexedDB.deleteDatabase("gt7-rec")}catch(e){}put("gt7-rec-gone","1")}
// au premier lancement, sur n'importe quel écran (sauf Réglages et la relecture d'une course)
document.addEventListener("DOMContentLoaded",()=>{
  if(get(W)==="1"||/reglages\.html$/.test(location.pathname)||/[?&]replay=/.test(location.search))return;
  wizard()});
})();
