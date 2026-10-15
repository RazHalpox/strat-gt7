// Réglages du Race Engineer, partagés par tous les écrans de cet appareil.
// L'onglet ⚙ Réglages les modifie ; les écrans les relisent à chaque mise à jour, donc ça s'applique tout de suite.
const OPTS_DEF = {
  // Écran Course
  warnLaps: 3,        // bannière « Arrêt dans X tours » : combien de tours avant l'arrêt prévu
  boxFlash: true,     // BOX BOX clignotant
  fuelSafety: true,   // BOX BOX « Carburant critique » si l'essence ne tient pas jusqu'à l'arrêt prévu
  // Écran Complet
  radio: true,        // bande radio avec les messages de l'ingénieur
  // Ingénieur vocal
  voiceLapTime: true, // annoncer le temps de chaque tour
  voiceBest: true,    // annoncer les meilleurs tours
  voiceFuelEvery: 3,  // annoncer le carburant restant tous les N tours (0 = jamais)
  voiceRate: 1.05,    // vitesse de la voix
  // Carburant
  consAvg: 5,         // conso moyenne calculée sur les N derniers tours sans arrêt
  fuelWarn: 4,        // jauge jaune sous N tours de carburant
  fuelCrit: 2,        // jauge rouge sous N tours de carburant
  // Pneus (°C)
  tCold: 55,          // en dessous : froid (bleu)
  tHot: 95,           // au-dessus : chaud (jaune)
  tOver: 110          // au-dessus : trop chaud (rouge)
};
function opts() {
  try { return Object.assign({}, OPTS_DEF, JSON.parse(localStorage.getItem("gt7-opts") || "{}")); }
  catch (e) { return Object.assign({}, OPTS_DEF); }
}
function saveOpts(o) {
  try { localStorage.setItem("gt7-opts", JSON.stringify(o)); return true; } catch (e) { return false; }
}
function tyreColorOpt(t) {
  const O = opts();
  if (typeof t !== "number" || !isFinite(t)) return "var(--panel-2)";
  return t < O.tCold ? "var(--cold)" : t <= O.tHot ? "var(--ok)" : t <= O.tOver ? "var(--warn)" : "var(--accent)";
}
