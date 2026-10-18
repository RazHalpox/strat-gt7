// Coach de tour : enregistrement des tours (flux /coach du relais, 60 images/s), rapport, graphiques et piste 3D.
// Le calcul est dans coach-analyse.js. Les tours sont gardés dans ce navigateur (IndexedDB) : un rechargement ne perd rien.
(function () {
"use strict";
const A = window.CoachAnalyse, $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888";
const { fmtLap, nf } = A;

/* ================= état ================= */
let S = { track: "", car: "", target: 10, laps: [], ref: null, refName: "" };
let recording = false, paused = false, report = null, mode = "?", cap = null, lapId = 1;

/* ---------- découpage du flux en tours ---------- */
// image compacte : [t, x, y, z, vitesse, gaz, frein, tour, dernier tour ms, rapport, drapeaux, régime]
function Segmenter(onLap) { this.onLap = onLap; this.cur = null; this.last = null; this.lastT = 0; }
Segmenter.prototype.feed = function (f) {
  const flags = f[10] | 0;
  if (flags & 4) { if (this.cur) this.cur.broken = true; return; }   // chargement
  if (flags & 2) return;                                             // pause : le temps de jeu s'arrête aussi
  if (f[0] <= this.lastT) return;
  if (this.cur && this.cur.s.length && f[0] - this.lastT > 2000) this.cur.broken = true; // trou dans le flux
  this.lastT = f[0];
  const lap = f[7] | 0, smp = [f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[9] | 0];
  if (this.last == null) { this.last = lap; this.cur = { n: lap, s: [], fromLine: false }; }
  else if (lap > this.last) {
    const c = this.cur;
    if (c && c.s.length > 10) {
      c.s.push(smp);                                                 // le passage de la ligne ferme le tour
      const meas = f[0] - c.s[0][0], off = f[8] | 0;
      const ms = off > 0 && Math.abs(off - meas) < 1500 ? off : meas;
      this.onLap({ n: c.n, ms, s: c.s, complete: c.fromLine && !c.broken && c.n >= 1 && c.s.length > 100 });
    }
    this.last = lap; this.cur = { n: lap, s: [], fromLine: true };
  } else if (lap < this.last) { this.last = lap; this.cur = { n: lap, s: [], fromLine: false }; } // nouvelle session
  this.cur.s.push(smp);
};
Segmenter.prototype.curTime = function () { const c = this.cur; return c && c.fromLine && c.s.length ? c.s[c.s.length - 1][0] - c.s[0][0] : null; };

const seg = new Segmenter(lap => {
  if (!recording || paused) return;
  lap.id = lapId++;
  S.laps.push(lap); save(); renderRec(); scheduleReport();
});

/* ---------- capture d'un tour de référence pendant un replay ---------- */
function startCapture() {
  cap = { seg: new Segmenter(l => {
    if (!l.complete) return;
    cap.n++;
    if (!cap.best || l.ms < cap.best.ms) cap.best = l;
    refMsg(`Tour capturé : ${fmtLap(l.ms)}${cap.n < 2 ? ". On attend un deuxième tour pour garder le plus rapide…" : "."}`);
    if (cap.n >= 2) stopCapture();
  }), best: null, n: 0 };
  $("cap").textContent = "■ Arrêter"; refMsg("En attente du passage de la ligne… Lance le replay maintenant.");
}
function stopCapture() {
  if (!cap) return;
  const c = cap; cap = null; $("cap").textContent = "⏺ Capturer depuis un replay";
  if (c.best) setRef(c.best, $("refName").value.trim());
  else refMsg("Aucun tour complet n'a été vu. La page doit voir la voiture passer la ligne deux fois.");
}
function setRef(l, name) {
  S.ref = { n: 0, ms: l.ms, s: l.s, complete: true, ref: true }; S.refName = name || "Référence";
  save(); refUI(); scheduleReport(true);
}
function refMsg(t) { $("refMsg").textContent = t; }
function refUI() {
  $("refDrop").classList.toggle("hidden", !S.ref);
  if (S.ref) refMsg(`Référence : ${S.refName}, ${fmtLap(S.ref.ms)}. Roule tes tours, le rapport te mesure à elle.`);
}

/* ================= connexion au relais ================= */
function setConn(cls, txt) {
  for (const id of ["conn", "conn2"]) { const p = $(id); p.className = "pill " + cls; p.lastElementChild.textContent = txt; }
}
function connect() {
  const offline = location.protocol === "file:" || /github\.io$/.test(location.hostname);
  if (offline || !window.EventSource) {
    setConn("off", "Fichiers seulement");
    $("connHelp").innerHTML = "Pour enregistrer en direct, ouvre cette page depuis l'adresse du relais (appli Android ou PC), par exemple <code>http://192.168.1.30:8777/coach.html</code>. Ici, tu peux charger des tours enregistrés.";
    $("start").disabled = true; $("cap").disabled = true;
    return;
  }
  const es = new EventSource("coach");
  let got = false;
  es.onmessage = e => {
    let d; try { d = JSON.parse(e.data); } catch (x) { return; }
    got = true; mode = d.mode;
    setConn(d.mode === "attente" ? "wait" : "live", { attente: "Relais OK · en attente de GT7", live: "En direct", demo: "Démo", replay: "Relecture" }[d.mode] || d.mode);
    $("connHelp").textContent = d.mode === "attente" ? "Le relais tourne. Lance une session dans GT7 : la télémétrie arrive dès que tu es en piste." : "";
    for (const f of d.s || []) { seg.feed(f); if (cap) cap.seg.feed(f); }
  };
  es.onerror = () => {
    setConn("off", "Relais injoignable");
    $("connHelp").textContent = got ? "Connexion perdue, nouvel essai…" : "Pas de réponse du relais. Vérifie qu'il tourne et qu'il est à jour (le Coach a besoin de la dernière version du relais PC ou de l'appli Android).";
  };
}
setInterval(() => {
  if (!recording) return;
  const t = seg.curTime();
  $("curTime").textContent = t != null ? fmtLap(t) : "–";
}, 100);

/* ================= sauvegarde (IndexedDB) ================= */
const DB = "gt7-coach";
function idb() {
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error("IndexedDB indisponible"));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
let saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => idb().then(d => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(S, "session"); }).catch(() => {}), 800);
}
function load() {
  return idb().then(d => new Promise(res => {
    const r = d.transaction("kv").objectStore("kv").get("session");
    r.onsuccess = () => res(r.result || null); r.onerror = () => res(null);
  })).catch(() => null);
}

/* ================= écrans ================= */
function ownLaps() { return S.laps; }
function completeLaps() { return S.laps.filter(l => l.complete); }
function renderRec() {
  const done = completeLaps().length;
  $("count").textContent = `${done} / ${S.target}`;
  $("bar").style.width = Math.min(100, done / S.target * 100) + "%";
  const best = completeLaps().reduce((a, b) => (!a || b.ms < a.ms ? b : a), null);
  const html = S.laps.slice(-30).map(l => `<div class="lap${l === best ? " best" : ""}${l.complete ? "" : " bad"}"><small>T${l.n}${l.complete ? "" : " · incomplet"}</small>${fmtLap(l.ms)}</div>`).join("");
  $("strip").innerHTML = html + (recording ? `<div class="lap cur"><small>en cours</small><span id="stripCur">…</span></div>` : "");
  $("recTitle").textContent = (S.track || "Session") + (S.car ? " · " + S.car : "");
  $("recMsg").textContent = done >= S.target
    ? "Objectif atteint ! Tu peux continuer : chaque tour de plus affine le rapport."
    : done >= 3 ? "Le rapport est prêt plus bas et se met à jour à chaque tour."
      : "En attente de trois tours complets. Le tour en cours s'affiche en rouge.";
  $("pause").textContent = paused ? "▶ Reprendre" : "⏸ Pause";
  $("pause").classList.toggle("hidden", !recording);
}
setInterval(() => { const e = $("stripCur"); if (e) { const t = seg.curTime(); e.textContent = t != null ? fmtLap(t) : "…"; } }, 250);

let repT = null;
function scheduleReport(force) {
  clearTimeout(repT);
  repT = setTimeout(() => { if (force || completeLaps().length >= 3 || (S.ref && completeLaps().length >= 1)) buildReport(); }, 150);
}
function buildReport() {
  const laps = S.laps.concat(S.ref ? [S.ref] : []);
  report = A.analyse(laps);
  $("report").classList.remove("hidden");
  const ok = report.ok;
  $("empty").classList.toggle("hidden", ok);
  for (const el of $("report").children) if (el.firstElementChild && el !== $("report").firstElementChild) el.classList.toggle("hidden", !ok);
  renderTiles();
  if (!ok) return;
  $("pRef").classList.toggle("hidden", !report.ref);
  $("mRef").classList.toggle("hidden", !report.ref);
  $("lgRef").classList.toggle("hidden", !report.ref);
  renderSpeed(); renderSpread(); renderGain(); fillLapSelects(); renderLapVs(); renderTips(); renderCorners(); renderTable(); renderRefDelta();
  T3.set(report);
}

function renderTiles() {
  const t = [];
  if (!report.ok) { $("tiles").innerHTML = ""; $("repSub").textContent = ""; return; }
  const valid = report.laps.filter(r => r.ok);
  const ms = valid.map(r => r.ms);
  const sd = ms.length > 1 ? Math.sqrt(ms.reduce((a, x) => a + (x - ms.reduce((p, q) => p + q, 0) / ms.length) ** 2, 0) / ms.length) : 0;
  t.push(["Meilleur tour", fmtLap(report.best.ms), "tour " + report.best.n]);
  t.push(["Meilleur théorique", fmtLap(report.theoMs), "tes meilleurs virages bout à bout"]);
  t.push(["Régularité", "±" + nf(sd / 1000, 2) + " s", "écart-type des tours"]);
  if (report.ref) t.push(["Écart à la réf.", A.fmtS(report.refGap), S.refName + " · " + fmtLap(report.ref.ms)]);
  else t.push(["Tours analysés", String(valid.length), report.corners.length + " virages trouvés"]);
  $("tiles").innerHTML = t.map(x => `<div class="tile"><small>${x[0]}</small><b>${x[1]}</b><small style="letter-spacing:.04em;text-transform:none">${esc(x[2])}</small></div>`).join("");
  $("repSub").textContent = `${nf(report.L / 1000, 2)} km · ${report.corners.length} virages`;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* ================= graphiques (canvas) ================= */
const charts = new Map();
function canvasIn(el, h) {
  let c = el.querySelector("canvas");
  if (!c) { c = document.createElement("canvas"); el.appendChild(c); const r = document.createElement("div"); r.className = "readout"; el.appendChild(r); }
  const w = el.clientWidth || 300, dpr = window.devicePixelRatio || 1;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.height = h + "px";
  const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, g, w, h, ro: el.querySelector(".readout") };
}
// graphique en lignes selon la distance : séries sur la grille de 2 m
function lineChart(id, cfg) {
  charts.set(id, () => lineChart(id, cfg));
  const el = $(id), { c, g, w, h, ro } = canvasIn(el, cfg.h || 220);
  const pad = { l: 40, r: 8, t: 14, b: 22 }, W = w - pad.l - pad.r, H = h - pad.t - pad.b;
  const x0 = cfg.x0 || 0, x1 = cfg.x1, y0 = cfg.y0, y1 = cfg.y1;
  const X = x => pad.l + (x - x0) / (x1 - x0) * W, Yp = y => pad.t + (1 - (y - y0) / (y1 - y0)) * H;
  const draw = cursor => {
    g.clearRect(0, 0, w, h);
    g.font = "11px " + css("--f-mono"); g.fillStyle = css("--muted"); g.strokeStyle = css("--line"); g.lineWidth = 1;
    const ticks = cfg.yTicks || niceTicks(y0, y1, 4);
    for (const v of ticks) { const y = Yp(v); g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke(); g.textAlign = "right"; g.fillText(cfg.yFmt ? cfg.yFmt(v) : nf(v), pad.l - 5, y + 4); }
    // virages
    g.textAlign = "center";
    for (const m of cfg.marks || []) {
      const x = X(m.x); if (x < pad.l || x > w - pad.r) continue;
      g.strokeStyle = m.gold ? css("--gold") : css("--line"); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, pad.t); g.lineTo(x, h - pad.b); g.stroke(); g.setLineDash([]);
      g.fillStyle = m.gold ? css("--gold") : css("--muted"); g.fillText(m.label, x, h - 6);
    }
    g.save(); g.beginPath(); g.rect(pad.l, pad.t, W, H); g.clip();
    for (const s of cfg.series) {
      const n = s.y.length, step = Math.max(1, Math.floor(n / (W * 1.5)));
      if (s.fill) { // écart : rouge au-dessus de zéro (tu perds), vert en dessous
        for (const [sign, col] of [[1, css("--accent")], [-1, css("--ok")]]) {
          g.beginPath(); g.moveTo(X(x0), Yp(0));
          for (let i = 0; i < n; i += step) { const v = s.y[i]; g.lineTo(X(i * A.STEP), Yp(sign > 0 ? Math.max(0, v) : Math.min(0, v))); }
          g.lineTo(X((n - 1) * A.STEP), Yp(0)); g.closePath(); g.globalAlpha = .55; g.fillStyle = col; g.fill(); g.globalAlpha = 1;
        }
      }
      g.beginPath(); g.globalAlpha = s.a || 1; g.strokeStyle = s.color; g.lineWidth = s.w || 1.5;
      for (let i = 0; i < n; i += step) { const x = X(i * A.STEP), y = Yp(s.y[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke(); g.globalAlpha = 1;
    }
    g.restore();
    if (cursor != null) {
      const x = X(cursor); g.strokeStyle = css("--fg"); g.globalAlpha = .6; g.beginPath(); g.moveTo(x, pad.t); g.lineTo(x, h - pad.b); g.stroke(); g.globalAlpha = 1;
      const i = Math.round(cursor / A.STEP);
      const lines = [nf(cursor) + " m"].concat(cfg.series.filter(s => s.name).map(s => s.name + " " + (cfg.yFmt ? cfg.yFmt(s.y[i]) : nf(s.y[i]))));
      ro.textContent = lines.join("\n"); ro.style.display = "block";
    } else ro.style.display = "none";
  };
  draw(null);
  const pos = e => { const r = c.getBoundingClientRect(); return x0 + (e.clientX - r.left - pad.l) / W * (x1 - x0); };
  c.onpointermove = e => { const v = pos(e); draw(v >= x0 && v <= x1 ? v : null); };
  c.onpointerleave = () => draw(null);
}
function niceTicks(a, b, n) {
  const span = b - a, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), st = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => span / x <= n + 1) || mag * 10;
  const out = []; for (let v = Math.ceil(a / st) * st; v <= b + 1e-9; v += st) out.push(+v.toFixed(6)); return out;
}
function barChart(id, bars, fmt, h) {
  charts.set(id, () => barChart(id, bars, fmt, h));
  const el = $(id), { g, w, h: H } = canvasIn(el, h || 200);
  const pad = { l: 8, r: 8, t: 18, b: 22 }, W = w - pad.l - pad.r, IH = H - pad.t - pad.b;
  const max = Math.max(...bars.map(b => b.v), 1e-6), bw = W / bars.length;
  g.clearRect(0, 0, w, H); g.font = "11px " + css("--f-mono"); g.textAlign = "center";
  bars.forEach((b, i) => {
    const bh = b.v / max * IH, x = pad.l + i * bw + bw * .15, y = pad.t + IH - bh;
    g.fillStyle = b.color; g.fillRect(x, y, bw * .7, bh);
    g.fillStyle = css("--fg"); if (bw > 26) g.fillText(fmt(b.v), x + bw * .35, y - 4);
    g.fillStyle = b.gold ? css("--gold") : css("--muted"); g.fillText(b.label, x + bw * .35, H - 6);
  });
}
let resizeT = null;
window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { for (const f of charts.values()) f(); T3.resize(); cornersRedraw(); }, 150); });

function marks() { return report.corners.map(c => ({ x: c.apexS, label: c.name, gold: c.gold })); }
function speedRange(gs) { let lo = 1e9, hi = 0; for (const g of gs) for (const v of g.v) { if (v < lo) lo = v; if (v > hi) hi = v; } return [Math.max(0, Math.floor(lo / 20) * 20), Math.ceil(hi / 20) * 20]; }

function renderSpeed() {
  const valid = report.laps.filter(r => r.ok).map(r => r.lap);
  const gs = valid.map(l => report.grids.get(l));
  const [lo, hi] = speedRange(gs);
  const series = valid.filter(l => l !== report.best).map(l => ({ y: report.grids.get(l).v, color: css("--muted"), a: .35, w: 1 }));
  if (report.ref) series.push({ y: report.grids.get(report.ref).v, color: css("--warn"), w: 1.6, name: "Réf." });
  series.push({ y: report.grids.get(report.best).v, color: css("--cold"), w: 2.2, name: "Meilleur" });
  lineChart("chSpeed", { x1: report.L, y0: lo, y1: hi, series, marks: marks(), h: 260, yFmt: v => nf(v) });
}
function renderSpread() {
  barChart("chSpread", report.corners.map(c => ({ label: c.name, v: c.spread, gold: c.gold, color: c.gold ? css("--gold") : css("--cold") })), v => nf(v, 2));
}
function renderGain() {
  const cs = report.corners.slice().sort((a, b) => b.gain - a.gain);
  barChart("chGain", cs.map(c => ({ label: c.name, v: Math.max(0, c.gain), gold: c.gold, color: c.gold ? css("--gold") : css("--accent") })), v => nf(v, 2));
}
function renderRefDelta() {
  if (!report.ref) return;
  const d = report.refDelta;
  let lo = 0, hi = 0; for (const v of d) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const m = Math.max(.2, Math.abs(lo), Math.abs(hi));
  $("refSub").textContent = `Ton meilleur tour (${fmtLap(report.best.ms)}) contre ${S.refName} (${fmtLap(report.ref.ms)}), au même endroit de la piste. Quand la courbe monte, tu perds du temps ; quand elle descend, tu en reprends.`;
  lineChart("chRef", { x1: report.L, y0: Math.min(-.2, lo * 1.1), y1: hi * 1.1 + .05, series: [{ y: d, color: css("--fg"), w: 1.6, fill: true, name: "Écart" }], marks: marks(), yFmt: v => (v > 0 ? "+" : "") + nf(v, 2) + "s" });
}
function fillLapSelects() {
  const valid = report.laps.filter(r => r.ok).map(r => r.lap);
  const opts = valid.map(l => `<option value="${l.id}">T${l.n} · ${fmtLap(l.ms)}${l === report.best ? " (meilleur)" : ""}</option>`).join("") + (report.ref ? `<option value="ref">Réf. · ${esc(S.refName)}</option>` : "");
  const a = $("lapA").value, b = $("lapB").value;
  $("lapA").innerHTML = opts; $("lapB").innerHTML = opts;
  const has = v => [...$("lapA").options].some(o => o.value === v);
  $("lapA").value = has(a) ? a : String(report.best.id);
  const worst = valid.reduce((x, y) => (y.ms > x.ms ? y : x), valid[0]);
  $("lapB").value = has(b) ? b : String((worst === report.best && valid[1] ? valid[1] : worst).id);
}
function lapById(v) { return v === "ref" ? report.ref : report.laps.map(r => r.lap).find(l => String(l.id) === v); }
function renderLapVs() {
  const la = lapById($("lapA").value), lb = lapById($("lapB").value);
  if (!la || !lb) return;
  const ga = report.grids.get(la), gb = report.grids.get(lb);
  const [lo, hi] = speedRange([ga, gb]);
  const name = l => l.ref ? "Réf." : "T" + l.n;
  $("lgA").textContent = name(la); $("lgB").textContent = name(lb);
  lineChart("chLapV", { x1: report.L, y0: lo, y1: hi, h: 220, marks: marks(), series: [{ y: ga.v, color: css("--cold"), w: 1.8, name: name(la) }, { y: gb.v, color: css("--warn"), w: 1.8, name: name(lb) }] });
  const d = new Float32Array(ga.N); let mn = 0, mx = 0;
  for (let i = 0; i < ga.N; i++) { d[i] = gb.t[i] - ga.t[i]; mn = Math.min(mn, d[i]); mx = Math.max(mx, d[i]); }
  lineChart("chLapD", { x1: report.L, y0: Math.min(-.1, mn * 1.1), y1: Math.max(.1, mx * 1.1), h: 150, marks: marks(), series: [{ y: d, color: css("--fg"), w: 1.4, fill: true, name: "Écart" }], yFmt: v => (v > 0 ? "+" : "") + nf(v, 2) + "s" });
}
$("lapA").onchange = $("lapB").onchange = renderLapVs;

function renderTips() {
  const tips = report.tips.slice(0, 8);
  $("tips").innerHTML = tips.length ? tips.map(t => `<li class="${t.corner.gold ? "gold" : ""}"><div class="h"><b>${t.corner.name}${t.corner.gold ? " · sortie clé" : ""}</b><span>≈ ${nf(t.worth, 2)} s ${t.vsRef ? "vs réf." : "/ tour"}</span></div>${t.lines.map(x => `<p>${esc(x)}</p>`).join("")}</li>`).join("")
    : `<li><p>Rien de net à corriger pour l'instant : tes passages se ressemblent beaucoup. Roule quelques tours de plus, ou charge un tour de référence pour viser plus haut.</p></li>`;
}

/* ---------- virages freinés : petits graphiques pédales ---------- */
let cornersRedraw = () => {};
function renderCorners() {
  const cs = report.corners.filter(c => c.braking);
  const box = $("corners");
  box.innerHTML = cs.length ? cs.map((c, i) => {
    const b = c.onBest, r = c.refM;
    const shape = b.rise == null ? "–" : b.rise <= 8 ? "attaque franche" : "progressive";
    const row = (k, v, rv) => `<dt>${k}</dt><dd>${v}${r && rv != null ? ` <span class="muted">· réf. ${rv}</span>` : ""}</dd>`;
    const m = v => v == null ? "–" : nf(v) + " m";
    return `<div class="cbox${c.gold ? " gold" : ""}"><div class="h"><b>${c.name}${c.gold ? " ★" : ""}</b><span>à ${nf(c.apexS)} m · ${nf(c.onBest.time, 2)} s</span></div>
      <div class="chart" id="cc${i}"></div>
      <dl>${row("Freinage", b.brake == null ? "–" : nf(b.brake) + " m avant la corde", r && r.brake != null ? nf(r.brake) + " m" : null)}
      ${row("Frein maxi", nf(b.peak) + " % · " + shape)}
      ${row("Frein lâché", b.release == null ? "–" : b.release >= 0 ? nf(b.release) + " m avant la corde" : nf(-b.release) + " m après", null)}
      ${row("Vitesse mini", nf(b.minV) + " km/h", r ? nf(r.minV) + " km/h" : null)}
      ${row("Gaz", b.gasOn == null ? "–" : b.gasOn >= 0 ? nf(b.gasOn) + " m après la corde" : nf(-b.gasOn) + " m avant", r && r.gasOn != null ? (r.gasOn >= 0 ? "+" : "−") + nf(Math.abs(r.gasOn)) + " m" : null)}
      ${row("Roue libre", m(b.coast), r ? m(r.coast) : null)}
      ${row("Sortie", nf(b.exitV) + " km/h", r ? nf(r.exitV) + " km/h" : null)}</dl></div>`;
  }).join("") : `<p class="muted small">Aucun virage freiné franchement sur ce circuit.</p>`;
  cornersRedraw = () => cs.forEach((c, i) => pedalChart("cc" + i, c));
  cornersRedraw();
}
function pedalChart(id, c) {
  const el = $(id); if (!el) return;
  const { g, w, h } = canvasIn(el, 130);
  const n = report.grids.get(report.best).N;
  const from = Math.max(c.start - c.apex, -Math.round(300 / A.STEP)), to = Math.min(c.end - c.apex, Math.round(160 / A.STEP));
  const pad = { l: 4, r: 4, t: 6, b: 16 }, W = w - pad.l - pad.r, H = h - pad.t - pad.b;
  const X = k => pad.l + (k - from) / (to - from) * W, Yp = v => pad.t + (1 - v / 100) * H;
  g.clearRect(0, 0, w, h);
  g.strokeStyle = css("--line"); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(0), pad.t); g.lineTo(X(0), h - pad.b); g.stroke(); g.setLineDash([]);
  g.fillStyle = css("--muted"); g.font = "10px " + css("--f-mono"); g.textAlign = "center"; g.fillText("corde", X(0), h - 4);
  g.textAlign = "left"; g.fillText("−" + nf(-from * A.STEP) + " m", pad.l, h - 4); g.textAlign = "right"; g.fillText("+" + nf(to * A.STEP) + " m", w - pad.r, h - 4);
  const valid = report.laps.filter(r => r.ok).map(r => r.lap);
  const order = valid.filter(l => l !== report.best).map(l => [l, .22, 1]).concat(report.ref ? [[report.ref, .9, 1.4, true]] : []).concat([[report.best, 1, 2.2]]);
  for (const [l, a, lw, isRef] of order) {
    const gr = report.grids.get(l); if (!gr) continue;
    for (const [arr, col] of [[gr.brk, isRef ? css("--warn") : css("--brk")], [gr.gas, isRef ? css("--warn") : css("--gas")]]) {
      g.beginPath(); g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = lw;
      if (isRef && arr === gr.gas) g.setLineDash([4, 3]);
      for (let k = from; k <= to; k++) { const i = ((c.apex + k) % n + n) % n, x = X(k), y = Yp(arr[i]); k === from ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    }
  }
}

function renderTable() {
  const best = report.best;
  const rows = S.laps.map(l => {
    const ok = report.grids.has(l);
    const st = !l.complete ? "incomplet" : ok ? "analysé" : "hors trajectoire";
    return `<tr><td>T${l.n}</td><td class="${l === best ? "best" : ""}">${fmtLap(l.ms)}</td><td>${l.complete ? (l === best ? "–" : "+" + nf((l.ms - best.ms) / 1000, 3)) : "–"}</td><td style="font-family:var(--f-body)" class="muted">${st}</td><td><button class="btn small" data-del="${l.id}" aria-label="Retirer ce tour">✕</button></td></tr>`;
  }).join("");
  $("lapTable").innerHTML = `<tr><th>Tour</th><th>Temps</th><th>Écart</th><th>État</th><th></th></tr>` + rows;
}
$("lapTable").onclick = e => {
  const id = e.target.getAttribute && e.target.getAttribute("data-del"); if (!id) return;
  S.laps = S.laps.filter(l => String(l.id) !== id); save(); renderRec(); scheduleReport(true);
};

/* ================= piste 3D (canvas 2D, sans bibliothèque) ================= */
const T3 = (function () {
  const cv = $("c3d"), g = cv.getContext("2d");
  let R = null, P = [], C = [], box = null, yaw = .6, pitch = .85, zoom = 1, colorMode = "speed", spin = false, play = false;
  let pos = 0, last = 0, hits = [], sel = null, mirror = false, need = true, W = 0, H = 0;
  try { mirror = localStorage.getItem("gt7-coach-mirror") === "1"; } catch (e) {}
  function resize() { const dpr = window.devicePixelRatio || 1; W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); need = true; }
  function set(rep) {
    R = rep; const gb = rep.grids.get(rep.best), gm = rep.grids.get(rep.ref || rep.best);
    // le ruban suit la règle (référence ou meilleur tour), un point tous les 4 m
    P = []; const n = gm.N;
    let ymin = 1e9, ymax = -1e9;
    for (let i = 0; i < n; i += 2) { P.push({ i, x: gm.x[i], y: gm.y[i], z: gm.z[i] }); ymin = Math.min(ymin, gm.y[i]); ymax = Math.max(ymax, gm.y[i]); }
    let xs = P.map(p => p.x), zs = P.map(p => p.z);
    box = { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cz: (Math.min(...zs) + Math.max(...zs)) / 2, cy: (ymin + ymax) / 2, span: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)), ymin, ymax };
    const [lo, hi] = speedRange([gb]);
    C = P.map(p => {
      const i = p.i;
      if (colorMode === "speed") return ramp((gb.v[i] - lo) / (hi - lo));
      if (colorMode === "pedals") return gb.brk[i] > 5 ? mix([79, 168, 255], gb.brk[i] / 100) : gb.gas[i] > 5 ? mix([61, 220, 132], gb.gas[i] / 100) : "rgb(90,96,104)";
      if (colorMode === "relief") { const u = (gm.y[i] - ymin) / Math.max(1, ymax - ymin); return `rgb(${40 + 200 * u | 0},${70 + 160 * u | 0},${110 + 120 * u | 0})`; }
      if (colorMode === "ref" && rep.refDelta) { const d = rep.refDelta, j = Math.min(d.length - 1, i + 5), k = Math.max(0, i - 5), s = d[j] - d[k]; return s > .003 ? mix([255, 59, 78], s * 40) : s < -.003 ? mix([61, 220, 132], -s * 40) : "rgb(90,96,104)"; }
      return "#888";
    });
    $("scrub").max = Math.round(gb.total * 1000);
    resize();
  }
  const mix = (c, u) => { u = .35 + .65 * Math.max(0, Math.min(1, u)); return `rgb(${c[0] * u | 0},${c[1] * u | 0},${c[2] * u | 0})`; };
  function ramp(u) { u = Math.max(0, Math.min(1, u)); const a = u < .5 ? [[255, 59, 78], [255, 200, 51], u * 2] : [[255, 200, 51], [61, 220, 132], u * 2 - 1]; const [p, q, t] = a; return `rgb(${p[0] + (q[0] - p[0]) * t | 0},${p[1] + (q[1] - p[1]) * t | 0},${p[2] + (q[2] - p[2]) * t | 0})`; }
  function proj(x, y, z) {
    const ex = colorMode === "relief" ? 4 : 2;            // relief exagéré pour qu'il se voie
    let px = (x - box.cx) * (mirror ? -1 : 1), py = (y - box.cy) * ex, pz = z - box.cz;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    let rx = px * cy - pz * sy, rz = px * sy + pz * cy;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    let ry = py * cp - rz * sp; rz = py * sp + rz * cp;
    const D = box.span * 1.4, f = Math.min(W, H) * 1.05 * zoom;
    const k = f / (rz + D);
    return [W / 2 + rx * k, H / 2 - ry * k, rz];
  }
  function draw() {
    need = false; g.clearRect(0, 0, W, H);
    if (!R || !P.length) return;
    const hw = 7, n = P.length, quads = [];
    const sides = P.map((p, k) => {
      const a = P[(k - 1 + n) % n], b = P[(k + 1) % n];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      return [proj(p.x - dz * hw, p.y, p.z + dx * hw), proj(p.x + dz * hw, p.y, p.z - dx * hw)];
    });
    // ombre au sol (lecture du relief)
    g.beginPath();
    for (let k = 0; k < n; k++) { const p = P[k], s = proj(p.x, box.ymin - 4, p.z); k ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]); }
    g.closePath(); g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 6; g.stroke();
    for (let k = 0; k < n - (R.closed ? 0 : 1); k++) { const a = sides[k], b = sides[(k + 1) % n]; quads.push([(a[0][2] + a[1][2] + b[0][2] + b[1][2]) / 4, a, b, C[k]]); }
    quads.sort((p, q) => q[0] - p[0]);
    for (const [, a, b, col] of quads) {
      g.beginPath(); g.moveTo(a[0][0], a[0][1]); g.lineTo(a[1][0], a[1][1]); g.lineTo(b[1][0], b[1][1]); g.lineTo(b[0][0], b[0][1]); g.closePath();
      g.fillStyle = col; g.fill(); g.strokeStyle = col; g.lineWidth = .8; g.stroke();
    }
    // ligne de départ
    const s0 = sides[0]; g.strokeStyle = "#fff"; g.lineWidth = 3; g.beginPath(); g.moveTo(s0[0][0], s0[0][1]); g.lineTo(s0[1][0], s0[1][1]); g.stroke();
    // trajectoire de ton meilleur tour si la règle est la référence
    if (R.ref) {
      const gb = R.grids.get(R.best); g.beginPath(); g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 1.2;
      for (let i = 0; i < gb.N; i += 2) { const s = proj(gb.x[i], gb.y[i] + .5, gb.z[i]); i ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]); }
      g.stroke();
    }
    // virages
    hits = [];
    g.font = "600 13px " + css("--f-display"); g.textAlign = "center";
    const gm = R.grids.get(R.ref || R.best);
    for (const c of R.corners) {
      const i = ((c.apex % gm.N) + gm.N) % gm.N, s = proj(gm.x[i], gm.y[i] + 12, gm.z[i]);
      g.fillStyle = c === sel ? css("--accent") : c.gold ? css("--gold") : "rgba(12,15,19,.85)";
      g.beginPath(); g.arc(s[0], s[1], 13, 0, 7); g.fill(); g.strokeStyle = c.gold ? css("--gold") : "#fff"; g.lineWidth = 1; g.stroke();
      g.fillStyle = c === sel || c.gold ? "#0c0f13" : "#fff"; g.fillText(c.name, s[0], s[1] + 4.5);
      hits.push([s[0], s[1], c]);
    }
    // voiture (lecture du tour)
    const gb = R.grids.get(R.best), t = pos / 1000;
    let lo = 0, hi = gb.N - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (gb.t[m] <= t) lo = m; else hi = m; }
    const s = proj(gb.x[lo], gb.y[lo] + 1, gb.z[lo]);
    g.fillStyle = "#fff"; g.beginPath(); g.arc(s[0], s[1], 6, 0, 7); g.fill(); g.strokeStyle = css("--accent"); g.lineWidth = 3; g.stroke();
    $("hud3d").textContent = `${fmtLap(pos)} · ${nf(gb.v[lo])} km/h`;
  }
  function loop(ts) {
    const dt = last ? Math.min(100, ts - last) : 16; last = ts;
    if (R) {
      if (spin) { yaw += dt * .00025; need = true; }
      if (play) {
        const tot = R.grids.get(R.best).total * 1000;
        pos += dt; if (pos >= tot) { pos = tot; play = false; $("play").textContent = "▶ Lire le tour"; }
        $("scrub").value = Math.round(pos); need = true;
      }
      if (need) draw();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  // gestes
  const ptrs = new Map(); let pinch = null, moved = 0;
  cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; spin = false; $("spin").setAttribute("aria-pressed", "false"); });
  cv.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId)) return;
    const p = ptrs.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1];
    ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 1) { yaw += dx * .008; pitch = Math.max(.15, Math.min(1.5, pitch + dy * .006)); }
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) zoom = Math.max(.4, Math.min(8, zoom * d / pinch)); pinch = d;
    }
    need = true;
  });
  const up = e => {
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
    if (e.type === "pointerup" && moved < 8) {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const h = hits.find(h => Math.hypot(h[0] - x, h[1] - y) < 20);
      sel = h ? h[2] : null; showCard(); need = true;
    }
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => { e.preventDefault(); zoom = Math.max(.4, Math.min(8, zoom * Math.exp(-e.deltaY * .0015))); need = true; }, { passive: false });
  function showCard() {
    const el = $("card3d");
    if (!sel) { el.classList.add("hidden"); return; }
    const b = sel.onBest, r = sel.refM;
    el.innerHTML = `<b>${sel.name}${sel.gold ? " ★" : ""}</b><br>Vitesse mini : ${nf(b.minV)} km/h${r ? ` (réf. ${nf(r.minV)})` : ""}<br>Freinage : ${b.brake == null ? "–" : nf(b.brake) + " m avant la corde"}<br>Sortie : ${nf(b.exitV)} km/h<br>Secteur : ${nf(b.time, 2)} s · meilleur ${nf(sel.minT, 2)} s (T${sel.bestRow.lap.n})<br><span class="muted">À gagner : ≈ ${nf(Math.max(0, sel.gain), 2)} s / tour</span>`;
    el.classList.remove("hidden");
  }
  $("mode3d").onclick = e => { const m = e.target.getAttribute("data-m"); if (!m) return; colorMode = m; for (const b of $("mode3d").children) b.setAttribute("aria-pressed", String(b === e.target)); if (R) set(R); };
  $("play").onclick = () => { if (!R) return; const tot = R.grids.get(R.best).total * 1000; if (pos >= tot) pos = 0; play = !play; $("play").textContent = play ? "⏸ Pause" : "▶ Lire le tour"; };
  $("spin").onclick = () => { spin = !spin; $("spin").setAttribute("aria-pressed", String(spin)); };
  $("mirror").onclick = () => { mirror = !mirror; try { localStorage.setItem("gt7-coach-mirror", mirror ? "1" : "0"); } catch (e) {} need = true; };
  $("scrub").oninput = e => { pos = +e.target.value; need = true; };
  return { set, resize: () => { if (R) resize(); } };
})();

/* ================= fichiers : export et import ================= */
function download() {
  const head = "tour,ref,nom,temps_ms,t_ms,x,y,z,vitesse_kmh,gaz,frein,rapport\n";
  const lines = [];
  const add = (l, isRef) => { for (const s of l.s) lines.push([l.n, isRef ? 1 : 0, isRef ? JSON.stringify(S.refName) : (l.complete ? "" : "incomplet"), l.ms, s[0], s[1].toFixed(2), (s[2] || 0).toFixed(2), s[3].toFixed(2), s[4].toFixed(1), (+s[5]).toFixed(0), (+s[6]).toFixed(0), s[7]].join(",")); };
  S.laps.forEach(l => add(l, false)); if (S.ref) add(S.ref, true);
  const blob = new Blob([head + lines.join("\n")], { type: "text/csv" });
  const d = new Date(), p = n => String(n).padStart(2, "0");
  const name = `coach-${(S.track || "session").replace(/[^\w-]+/g, "_")}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.csv`;
  const file = new File([blob], name, { type: "text/csv" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: "Tours GT7" }).catch(() => {}); return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function readFile(f) {
  if (/\.gz$/i.test(f.name)) {
    if (typeof DecompressionStream !== "function") throw new Error("Ce navigateur ne sait pas ouvrir les .gz");
    return new Response(f.stream().pipeThrough(new DecompressionStream("gzip"))).text();
  }
  return f.text();
}
// renvoie { laps:[…], ref:{lap,name}|null }
function parseText(text) {
  const out = { laps: [], ref: null };
  const first = text.slice(0, 200).trim();
  if (first.startsWith("tour,")) {                       // CSV exporté par cette page
    const groups = new Map();
    for (const line of text.split(/\r?\n/).slice(1)) {
      if (!line) continue;
      const m = line.match(/^(-?\d+),(\d),("(?:[^"]|"")*"|[^,]*),(\d+),(.*)$/); if (!m) continue;
      const k = m[2] + ":" + m[1] + ":" + m[4], v = m[5].split(",").map(Number);
      if (!groups.has(k)) groups.set(k, { n: +m[1], ms: +m[4], s: [], complete: m[3] !== "incomplet", ref: m[2] === "1", name: m[3].replace(/^"|"$/g, "").replace(/""/g, '"') });
      groups.get(k).s.push([v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7]]);
    }
    for (const l of groups.values()) { if (l.ref) out.ref = { lap: Object.assign(l, { ref: false }), name: l.name }; else out.laps.push(l); }
    return out;
  }
  // enregistrement du relais, de l'appli Android ou de l'iPad : une image JSON par ligne (10 par seconde)
  const sg = new Segmenter(l => out.laps.push(l));
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let d; try { d = JSON.parse(line); } catch (e) { continue; }
    if (d.x == null) continue;
    sg.feed([d.t || 0, d.x, d.y || 0, d.z, d.speed || 0, d.throttle || 0, d.brake || 0, d.lap || 0, d.last_ms || 0, d.gear || 0, (d.on_track ? 1 : 0) | (d.paused ? 2 : 0) | (d.loading ? 4 : 0), d.rpm || 0]);
  }
  return out;
}
$("files").onchange = async e => {
  const files = [...e.target.files]; e.target.value = "";
  let n = 0;
  for (const f of files) {
    try {
      const r = parseText(await readFile(f));
      for (const l of r.laps) { l.id = lapId++; S.laps.push(l); n++; }
      if (r.ref) setRef(r.ref.lap, r.ref.name);
    } catch (x) { alert(`${f.name} : ${x.message}`); }
  }
  if (!n) { alert("Aucun tour trouvé dans ce fichier."); return; }
  showRec(); save(); renderRec(); scheduleReport(true);
};
$("refFile").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const r = parseText(await readFile(f));
    if (r.ref) { setRef(r.ref.lap, r.ref.name); return; }
    const best = r.laps.filter(l => l.complete).reduce((a, b) => (!a || b.ms < a.ms ? b : a), null);
    if (!best) { refMsg("Aucun tour complet dans ce fichier."); return; }
    setRef(best, $("refName").value.trim() || f.name.replace(/\.(csv|jsonl|gz)+$/i, ""));
  } catch (x) { refMsg(x.message); }
};

/* ================= boutons ================= */
function showRec() { $("rec").classList.remove("hidden"); }
$("target").onclick = e => {
  const n = +e.target.getAttribute("data-n"); if (!n) return;
  S.target = n; for (const b of $("target").children) b.setAttribute("aria-pressed", String(b === e.target)); renderRec(); save();
};
$("start").onclick = () => {
  S.track = $("track").value.trim(); S.car = $("car").value.trim();
  recording = true; paused = false; showRec(); renderRec(); save();
  $("rec").scrollIntoView({ behavior: "smooth", block: "start" });
};
$("resume").onclick = () => { recording = true; paused = false; showRec(); renderRec(); $("resume").classList.add("hidden"); };
$("pause").onclick = () => { paused = !paused; renderRec(); };
$("analyse").onclick = () => { if (!S.laps.length) { $("recMsg").textContent = "Pas encore de tour à analyser."; return; } buildReport(); $("report").scrollIntoView({ behavior: "smooth" }); };
$("dl").onclick = download;
$("reset").onclick = () => {
  if (S.laps.length && !confirm("Effacer les tours de cette session ? (la référence est gardée)")) return;
  S.laps = []; report = null; save(); renderRec(); $("report").classList.add("hidden");
};
$("cap").onclick = () => (cap ? stopCapture() : startCapture());
$("refDrop").onclick = () => { S.ref = null; S.refName = ""; save(); refUI(); refMsg(""); if (S.laps.length) scheduleReport(true); };
$("track").onchange = () => { S.track = $("track").value.trim(); save(); };
$("car").onchange = () => { S.car = $("car").value.trim(); save(); };

/* ================= démarrage ================= */
load().then(saved => {
  if (saved && saved.laps) {
    S = Object.assign(S, saved);
    lapId = S.laps.reduce((m, l) => Math.max(m, l.id || 0), 0) + 1;
    $("track").value = S.track || ""; $("car").value = S.car || "";
    for (const b of $("target").children) b.setAttribute("aria-pressed", String(+b.getAttribute("data-n") === S.target));
    if (S.laps.length) { showRec(); renderRec(); $("resume").classList.remove("hidden"); scheduleReport(true); }
    refUI();
  }
  connect();
});
})();
