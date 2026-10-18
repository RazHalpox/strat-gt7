// Coach de tour : analyse des tours enregistrés (tout se calcule dans le navigateur, rien n'est envoyé).
// Entrée : des tours { n, ms, s:[[t,x,y,z,v,gaz,frein,rapport],…], ref?, name? }.
// 1. La trajectoire du meilleur tour (ou du tour de référence) sert de « règle » : chaque image de chaque tour
//    est projetée dessus pour connaître sa distance depuis la ligne. Les tours se superposent ainsi au mètre près.
// 2. Les virages sont trouvés dans ta propre vitesse : chaque creux net de vitesse est un virage (point de corde).
// 3. Pour chaque virage et chaque tour : freinage, vitesse mini, remise des gaz, roue libre, temps du secteur.
// 4. Les conseils sont classés par le temps qu'ils valent, mesuré entre tes propres passages.
(function (root) {
"use strict";
const STEP = 2;            // grille de calcul : un point tous les 2 m
const T = 0, X = 1, Y = 2, Z = 3, V = 4, GAS = 5, BRK = 6, GEAR = 7;

/* ---------- outils ---------- */
const median = a => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); };
function fmtLap(ms) {
  if (!(ms > 0)) return "–";
  const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
  return m + ":" + s.toFixed(3).padStart(6, "0");
}
const fmtS = (s, d = 2) => (s >= 0 ? "+" : "−") + Math.abs(s).toFixed(d).replace(".", ",") + " s";
const nf = (x, d = 0) => (Math.round(x * 10 ** d) / 10 ** d).toFixed(d).replace(".", ",");

/* ---------- 1. la règle : trajectoire de référence ---------- */
function buildPath(lap) {
  const pts = [];
  let s = 0, prev = null;
  for (const f of lap.s) {
    if (prev) {
      const d = Math.hypot(f[X] - prev[X], f[Z] - prev[Z]);
      if (d < 0.05) continue;
      if (d > 60) continue;            // saut (téléportation) : on ignore
      s += d;
    }
    pts.push({ x: f[X], y: f[Y] || 0, z: f[Z], s });
    prev = f;
  }
  // on referme la boucle : le dernier point rejoint le premier
  const a = pts[pts.length - 1], b = pts[0];
  const close = Math.hypot(a.x - b.x, a.z - b.z);
  const L = s + (close < 80 ? close : 0);
  return { pts, L, closed: close < 80 };
}

// projection d'un point sur la règle : distance le long de la piste et écart latéral (+ = à droite)
function project(path, x, z, hint) {
  const P = path.pts, n = P.length;
  let best = Infinity, bs = 0, blat = 0, bi = 0;
  const scan = (i0, i1) => {
    for (let k = i0; k <= i1; k++) {
      const i = ((k % n) + n) % n, j = (i + 1) % n;
      if (j === 0 && !path.closed) continue;
      const a = P[i], b = P[j];
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1e-9;
      let u = ((x - a.x) * dx + (z - a.z) * dz) / l2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const px = a.x + u * dx, pz = a.z + u * dz, d = (x - px) ** 2 + (z - pz) ** 2;
      if (d < best) {
        best = d; bi = i;
        const segL = j === 0 ? path.L - a.s : b.s - a.s;
        bs = a.s + u * segL;
        blat = (dx * (z - a.z) - dz * (x - a.x)) / Math.sqrt(l2);
      }
    }
  };
  if (hint != null) scan(hint - 40, hint + 120);
  if (hint == null || best > 30 * 30) scan(0, n - 1);
  return { s: bs, lat: blat, d: Math.sqrt(best), i: bi };
}

/* ---------- 2. chaque tour posé sur la règle, rééchantillonné tous les 2 m ---------- */
function resample(lap, path) {
  const L = path.L, raw = [];
  let hint = null, acc = null, prevS = null;
  for (const f of lap.s) {
    const p = project(path, f[X], f[Z], hint);
    hint = p.i;
    if (p.d > 60) continue;                         // hors piste lointain / stands : ignoré
    if (acc == null) acc = p.s > L / 2 ? p.s - L : p.s;
    else {
      let d = p.s - prevS;
      if (d < -L / 2) d += L;
      if (d > L / 2) d -= L;
      acc += d;
    }
    prevS = p.s;
    raw.push([acc, f[T], f[V], f[GAS], f[BRK], f[GEAR] || 0, p.lat, f[X], f[Z], f[Y] || 0]);
  }
  // distance strictement croissante (un recul ou un arrêt ne compte pas)
  const mono = [];
  for (const r of raw) if (!mono.length || r[0] > mono[mono.length - 1][0] + 0.01) mono.push(r);
  if (mono.length < 20) return null;
  const s0 = mono[0][0], s1 = mono[mono.length - 1][0];
  const cover = (Math.min(s1, L) - Math.max(s0, 0)) / L;
  const N = Math.floor(L / STEP) + 1;
  const g = { t: new Float64Array(N), v: new Float32Array(N), gas: new Float32Array(N), brk: new Float32Array(N),
    gear: new Uint8Array(N), lat: new Float32Array(N), x: new Float32Array(N), z: new Float32Array(N), y: new Float32Array(N), N, cover };
  let k = 0;
  for (let i = 0; i < N; i++) {
    const s = Math.min(i * STEP, L);
    while (k < mono.length - 2 && mono[k + 1][0] < s) k++;
    const a = mono[k], b = mono[Math.min(k + 1, mono.length - 1)];
    const span = b[0] - a[0] || 1;
    const u = (s - a[0]) / span;                    // extrapolation linéaire aux bords
    const uc = u < 0 ? 0 : u > 1 ? 1 : u;
    g.t[i] = a[1] + u * (b[1] - a[1]);
    g.v[i] = a[2] + uc * (b[2] - a[2]);
    g.gas[i] = a[3] + uc * (b[3] - a[3]);
    g.brk[i] = a[4] + uc * (b[4] - a[4]);
    g.gear[i] = uc < .5 ? a[5] : b[5];
    g.lat[i] = a[6] + uc * (b[6] - a[6]);
    g.x[i] = a[7] + uc * (b[7] - a[7]); g.z[i] = a[8] + uc * (b[8] - a[8]); g.y[i] = a[9] + uc * (b[9] - a[9]);
  }
  // temps de la ligne à la ligne, mesuré sur la règle (même départ et même arrivée pour tous les tours)
  const tEnd = interpAt(mono, L, 1);
  g.t0 = interpAt(mono, 0, 1);
  for (let i = 0; i < N; i++) g.t[i] = (g.t[i] - g.t0) / 1000;   // en secondes
  g.total = (tEnd - g.t0) / 1000;
  return g;
}
function interpAt(m, s, col) {
  let k = 0;
  while (k < m.length - 2 && m[k + 1][0] < s) k++;
  const a = m[k], b = m[Math.min(k + 1, m.length - 1)], span = b[0] - a[0] || 1;
  return a[col] + (s - a[0]) / span * (b[col] - a[col]);
}

function smooth(arr, w) {
  const n = arr.length, out = new Float32Array(n);
  let sum = 0, cnt = 0;
  for (let i = -w; i < n + w; i++) {
    const add = i + w, rem = i - w - 1;
    if (add < n && add >= 0) { sum += arr[add]; cnt++; }
    if (rem >= 0 && rem < n) { sum -= arr[rem]; cnt--; }
    if (i >= 0 && i < n) out[i] = sum / cnt;
  }
  return out;
}

/* ---------- 3. les virages, trouvés dans la vitesse ---------- */
function findCorners(g, L, closed) {
  const v = smooth(g.v, 4), n = v.length;
  const at = i => closed ? v[((i % n) + n) % n] : v[Math.max(0, Math.min(n - 1, i))];
  const win = Math.round(70 / STEP), look = Math.round(500 / STEP);
  const mins = [];
  for (let i = 0; i < n; i++) {
    let isMin = true;
    for (let k = -win; k <= win && isMin; k++) if (k && at(i + k) < v[i]) isMin = false;
    if (!isMin) continue;
    let before = 0, after = 0;
    for (let k = 1; k <= look; k++) { before = Math.max(before, at(i - k)); after = Math.max(after, at(i + k)); }
    const drop = before - v[i], rise = after - v[i];
    if (drop >= Math.max(10, v[i] * .07) && rise >= Math.max(8, v[i] * .05)) mins.push(i);
  }
  // deux creux trop proches (chicane serrée) : un seul virage, le plus lent
  const ap = [];
  for (const i of mins) {
    const last = ap[ap.length - 1];
    if (last != null && (i - last) * STEP < 60) { if (v[i] < v[last]) ap[ap.length - 1] = i; }
    else ap.push(i);
  }
  if (closed && ap.length > 1 && (n - ap[ap.length - 1] + ap[0]) * STEP < 60) {
    if (v[ap[0]] <= v[ap[ap.length - 1]]) ap.pop(); else ap.shift();
  }
  // bornes : le point le plus rapide entre deux virages (fin de la ligne droite = début du freinage)
  const m = ap.length, corners = [];
  for (let c = 0; c < m; c++) {
    const prev = c ? ap[c - 1] : (closed ? ap[m - 1] - n : 0), next = c < m - 1 ? ap[c + 1] : (closed ? ap[0] + n : n - 1);
    let si = ap[c], sv = -1, ei = ap[c], ev = -1;
    for (let i = prev + 1; i < ap[c]; i++) if (at(i) > sv) { sv = at(i); si = i; }
    for (let i = ap[c] + 1; i < next; i++) if (at(i) > ev) { ev = at(i); ei = i; }
    corners.push({ apex: ap[c], start: si, end: ei, name: "V" + (c + 1) });
  }
  // la ligne droite la plus longue : le virage qui y débouche a la sortie qui compte le plus
  let gold = -1, gl = 0;
  corners.forEach((c, i) => { const l = c.end - c.apex; if (l > gl) { gl = l; gold = i; } });
  if (gold >= 0) corners[gold].gold = true;
  corners.forEach(c => { c.apexS = c.apex * STEP; c.braking = false; });
  return corners;
}

/* ---------- 4. mesures d'un tour dans un virage ---------- */
function cornerMetrics(g, c, nextStart, closed) {
  const n = g.N;
  const idx = i => closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
  const get = (arr, i) => arr[idx(i)];
  const tAt = i => { // temps continu au-delà de la ligne (tour bouclé)
    if (!closed || (i >= 0 && i < n)) return g.t[idx(i)];
    return i >= n ? g.t[idx(i)] + g.total : g.t[idx(i)] - g.total;
  };
  let a = c.apex, minV = Infinity, minI = a;
  for (let i = a - 30; i <= a + 30; i++) { const v = get(g.v, i); if (v < minV) { minV = v; minI = i; } }
  // freinage : premier appui franc après la ligne droite, avant la corde
  let bOn = null, bOff = null, peak = 0, peakI = null;
  for (let i = c.start; i <= a + 15; i++) {
    const b = get(g.brk, i);
    if (b >= 5 && bOn == null) bOn = i;
    if (bOn != null && b > peak) { peak = b; peakI = i; }
    if (bOn != null && b >= 5) bOff = i;
  }
  // montée du frein jusqu'à 80 % du maxi : un mur (attaque franche) ou une pente (progressif)
  let rise = null;
  if (bOn != null) for (let i = bOn; i <= peakI; i++) if (get(g.brk, i) >= peak * .8) { rise = (i - bOn) * STEP; break; }
  // remise des gaz
  let gOn = null, gFull = null;
  const from = bOff != null ? bOff : c.start;
  for (let i = from; i <= c.end; i++) {
    const t = get(g.gas, i);
    if (gOn == null && t >= 20 && i >= a - 60) gOn = i;
    if (gOn != null && t >= 95) { gFull = i; break; }
  }
  // roue libre : ni frein ni gaz entre le lâcher du frein et la remise des gaz
  let coast = 0;
  for (let i = (bOff != null ? bOff : c.start); i < (gOn != null ? gOn : a); i++) if (get(g.brk, i) < 5 && get(g.gas, i) < 5) coast += STEP;
  const exitI = Math.min(a + Math.round(120 / STEP), c.end);
  return {
    minV, minAt: (minI - a) * STEP,
    entryV: bOn != null ? get(g.v, bOn) : get(g.v, c.start),
    exitV: get(g.v, exitI),
    brake: bOn != null ? (a - bOn) * STEP : null,          // m avant la corde
    release: bOff != null ? (a - bOff) * STEP : null,      // m avant la corde (négatif : après)
    peak: bOn != null ? peak : 0, rise,
    gasOn: gOn != null ? (gOn - a) * STEP : null,          // m après la corde (négatif : avant)
    gasFull: gFull != null ? (gFull - a) * STEP : null,
    coast,
    time: tAt(nextStart) - tAt(c.start)                    // temps du secteur (freinage, virage, ligne droite suivante)
  };
}

/* ---------- 5. le rapport ---------- */
function analyse(laps, opt) {
  opt = opt || {};
  const own = laps.filter(l => !l.ref && l.complete && l.s.length > 100);
  const ref = laps.find(l => l.ref && l.s.length > 100) || null;
  if (own.length < 1) return { ok: false, why: "pas-de-tour" };
  const best = own.reduce((a, b) => (b.ms < a.ms ? b : a));
  const master = ref || best;
  const path = buildPath(master);
  if (path.L < 300 || path.pts.length < 50) return { ok: false, why: "pas-de-piste" };
  const L = path.L, closed = path.closed;
  const all = (ref ? [ref] : []).concat(own);
  const res = new Map();
  for (const l of all) { const g = resample(l, path); if (g && g.cover > .9) res.set(l, g); }
  const valid = own.filter(l => res.has(l));
  if (!valid.length) return { ok: false, why: "pas-de-piste" };
  const gm = res.get(master) || res.get(best);
  const corners = findCorners(gm, L, closed);
  if (!corners.length) return { ok: false, why: "pas-de-virage", path, L };
  const n = gm.N;
  corners.forEach((c, i) => {
    const nx = corners[i + 1] ? corners[i + 1].start : (closed ? corners[0].start + n : n - 1);
    c.next = nx;
    let pk = 0;
    for (let k = c.start; k <= c.apex; k++) pk = Math.max(pk, gm.brk[((k % n) + n) % n]);
    c.braking = pk >= 15;
  });
  // mesures par virage et par tour
  const M = new Map();
  for (const l of all) { const g = res.get(l); if (g) M.set(l, corners.map(c => cornerMetrics(g, c, c.next, closed))); }
  const bestOwn = valid.reduce((a, b) => (b.ms < a.ms ? b : a));
  const lapRows = own.map(l => ({ lap: l, ms: l.ms, ok: res.has(l), best: l === bestOwn }));
  // par virage : ton meilleur passage, ta régularité
  const cs = corners.map((c, ci) => {
    const rows = valid.map(l => ({ lap: l, m: M.get(l)[ci] }));
    const times = rows.map(r => r.m.time);
    const minT = Math.min(...times), bestRow = rows[times.indexOf(minT)];
    const med = median(times);
    return Object.assign(c, {
      rows, minT, med, bestRow,
      spread: Math.max(...times) - minT,
      sd: std(times),
      gain: med - minT,                                   // ce que tu gagnes si tu refais ton meilleur passage à chaque tour
      onBest: M.get(bestOwn)[ci],
      refM: ref && M.has(ref) ? M.get(ref)[ci] : null
    });
  });
  const theo = cs.reduce((a, c) => a + c.minT, 0);
  const sumBest = cs.reduce((a, c) => a + c.onBest.time, 0);
  const theoMs = bestOwn.ms - (sumBest - theo) * 1000;
  const tips = buildTips(cs, valid.length, ref);
  const out = {
    ok: true, L, closed, path, corners: cs, laps: lapRows, best: bestOwn, ref: ref && res.has(ref) ? ref : null,
    theoMs, grids: res, tips,
    refDelta: null
  };
  if (out.ref) {
    const gb = res.get(bestOwn), gr = res.get(ref), d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = gb.t[i] - gr.t[i];
    out.refDelta = d;
    out.refGap = gb.total - gr.total;
  }
  return out;
}

/* ---------- 6. les conseils, classés par le temps qu'ils valent ---------- */
function buildTips(cs, nLaps, ref) {
  const tips = [];
  cs.forEach((c, ci) => {
    const prevName = cs[(ci - 1 + cs.length) % cs.length].name;
    const b = c.bestRow.m, others = c.rows.filter(r => r !== c.bestRow).map(r => r.m);
    const typ = k => median(others.map(m => m[k]).filter(x => x != null));
    const lines = [];
    let worth = 0;
    // contre la référence : c'est elle qui fixe l'objectif
    if (ref && c.refM) {
      const r = c.refM, me = c.onBest, gap = me.time - r.time;
      if (gap > .03) {
        worth = gap;
        if (r.brake != null && me.brake != null && me.brake - r.brake >= 5) lines.push(`Freine ${nf(me.brake - r.brake)} m plus tard : la référence attaque le frein à ${nf(r.brake)} m de la corde, toi à ${nf(me.brake)} m.`);
        if (r.minV - me.minV >= 2) lines.push(`Porte plus de vitesse au point de corde : ${nf(r.minV)} km/h pour la référence, ${nf(me.minV)} km/h pour toi.`);
        if (r.gasOn != null && me.gasOn != null && me.gasOn - r.gasOn >= 8) lines.push(`Remets les gaz ${nf(me.gasOn - r.gasOn)} m plus tôt (elle accélère ${posTxt(r.gasOn)}).`);
        if (r.exitV - me.exitV >= 3) lines.push(`Elle sort ${nf(r.exitV - me.exitV)} km/h plus vite : ${c.gold ? "c'est la sortie qui ouvre la plus longue ligne droite, privilégie-la." : "vise une sortie plus propre plutôt qu'une entrée plus rapide."}`);
        if (me.coast - r.coast >= 10) lines.push(`Tu passes ${nf(me.coast)} m en roue libre, elle ${nf(r.coast)} m.`);
        if (r.entryV - me.entryV >= 5) lines.push(`Tu arrives ${nf(r.entryV - me.entryV)} km/h moins vite au freinage (${nf(me.entryV)} contre ${nf(r.entryV)}) : une bonne part de ce temps se perd à la sortie de ${prevName}.`);
        if (!lines.length) lines.push(`Les pédales se ressemblent : la différence est dans la trajectoire. Compare vos lignes sur la piste 3D (ta trajectoire en blanc).`);
        tips.push({ corner: c, worth, lines, vsRef: true });
        return;
      }
    }
    worth = c.gain;
    if (nLaps >= 2 && worth > .02) {
      const lapTxt = `au tour ${c.bestRow.lap.n}`;
      const bt = typ("brake"), mv = typ("minV"), go = typ("gasOn"), co = typ("coast"), ex = typ("exitV");
      if (b.brake != null && bt - b.brake >= 5) lines.push(`Freine plus tard : ${nf(b.brake)} m avant la corde ${lapTxt}, ${nf(bt)} m d'habitude.`);
      if (b.minV - mv >= 2) lines.push(`Ta meilleure vitesse mini, ${nf(b.minV)} km/h ${lapTxt}, contre ${nf(mv)} km/h d'habitude : fais confiance à l'adhérence.`);
      if (b.gasOn != null && go - b.gasOn >= 8) lines.push(`Remets les gaz plus tôt : ${posTxt(b.gasOn)} ${lapTxt}, ${posTxt(go)} d'habitude.`);
      if (co - b.coast >= 10) lines.push(`Moins de roue libre : ${nf(b.coast)} m ${lapTxt}, ${nf(co)} m d'habitude.`);
      const en = typ("entryV");
      if (b.entryV - en >= 5) lines.push(`Tu arrives ${nf(b.entryV - en)} km/h plus vite ${lapTxt} : la sortie de ${prevName} prépare ce virage.`);
      if (b.exitV - ex >= 3) lines.push(`Sortie à ${nf(b.exitV)} km/h ${lapTxt} contre ${nf(ex)} d'habitude${c.gold ? " : c'est la plus longue ligne droite, c'est là que ça paie le plus" : ""}.`);
      const bsd = std(c.rows.map(r => r.m.brake).filter(x => x != null));
      if (bsd >= 8) lines.push(`Ton point de freinage varie de ±${nf(bsd)} m d'un tour à l'autre : prends un repère fixe (panneau, marque au sol).`);
      if (!lines.length) lines.push(`Même pédales à quelques mètres près : ${lapTxt}, la différence vient de la trajectoire. Regarde ce virage dans « Tour contre tour ».`);
    }
    // habitudes visibles même sans comparaison
    if (c.braking && b.coast >= 15 && !lines.some(x => x.includes("roue libre"))) {
      lines.push(`${nf(b.coast)} m sans frein ni gaz même sur ton meilleur passage : enchaîne frein et accélérateur.`);
      worth = Math.max(worth, b.coast / 15 * .03);
    }
    if (c.braking && b.release != null && b.release >= 25 && b.minV < 160) {
      lines.push(`Tu lâches le frein ${nf(b.release)} m avant la corde : garde un filet de frein en entrant dans le virage (trail braking) pour aider l'avant à tourner.`);
      worth = Math.max(worth, .03);
    }
    if (lines.length) tips.push({ corner: c, worth, lines, vsRef: false });
  });
  tips.sort((a, b) => b.worth - a.worth);
  return tips;
}
function posTxt(m) { return m == null ? "–" : m >= 0 ? `${nf(m)} m après la corde` : `${nf(-m)} m avant la corde`; }

const api = { analyse, buildPath, project, resample, findCorners, fmtLap, fmtS, nf, STEP, median };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.CoachAnalyse = api;
})(this);
