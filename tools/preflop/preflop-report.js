/* =========================================================================
   preflop-report.js — deine Preflop-Entscheidungen gegen die Trainer-Ranges.

   Liest alle Turnier-Handhistorien (wie das Hand-Logbuch: der Spielerordner
   mit der jüngsten Änderung) und baut zwei Seiten:
     open-ranges.html   Erster im Pot: Raise / Limp / Fold je Hand und Position
     calls-3bets.html   Gegen genau ein Open: Call / 3-Bet / Fold

   Gezählt wird nur ab mehr als 15 bb effektiv (darunter gilt Push/Fold).
   "Ideal" sind die Ranges aus js/ranges.js bzw. js/rangeflow.js — Näherungen
   des Trainers, keine Solver-Charts mit Ante. Wo das Modell für eine
   Positions-Kombination nichts hat, nimmt es die nächstliegende Range und
   schreibt "genähert" dazu.

   Die Ausgabe enthält deine Hände und ist privat: sie geht nach
   Dokumente\Poker-Handlog, nicht ins Repo.

   node tools/preflop/preflop-report.js [--out <ordner>]
   ========================================================================= */
global.window = {};
const fs = require('fs'), path = require('path');
const base = path.join(__dirname, '..', '..', 'js');
for (const f of ['engine.js', 'ranges.js', 'strategy.js', 'w2d.js', 'rangeflow.js', 'preflopdrill.js']) {
  eval(fs.readFileSync(path.join(base, f), 'utf8'));
}
const P = global.window.PT, W = P.W2D, D = P.PreflopDrill;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const HOME = process.env.USERPROFILE || process.env.HOME;
const OUT = arg('--out', path.join(HOME, 'Documents', 'Poker-Handlog'));

function findHH() {
  const b = path.join(process.env.LOCALAPPDATA || '', 'win2day Poker', 'data');
  let best = null, t = 0;
  for (const n of fs.readdirSync(b)) {
    const d = path.join(b, n, 'History', 'Data', 'Tournaments');
    try { const m = fs.statSync(d).mtimeMs; if (m > t) { best = d; t = m; } } catch (e) { }
  }
  return best;
}

/* win2day-Positionen auf die sechs Modell-Positionen. */
const MODEL_POS = { UTG: 'EP', UTG1: 'EP', UTG2: 'EP', MP: 'MP', MP1: 'MP', MP2: 'MP', HJ: 'MP', CO: 'CO', BTN: 'BTN', SB: 'SB', BB: 'BB' };
const RANKS = 'AKQJT98765432';
/** Handklasse wie in der 13×13-Matrix: "AKs", "T9o", "77". */
function cls(cs) {
  let [a, b] = cs.map(P.cardToStr);
  if (RANKS.indexOf(a[0]) > RANKS.indexOf(b[0])) [a, b] = [b, a];
  return a[0] === b[0] ? a[0] + b[0] : a[0] + b[0] + (a[1] === b[1] ? 's' : 'o');
}
const setOf = str => str ? [...new Set(P.parseRange(str).map(x => cls(x.c)))] : [];
const bandOf = bb => bb <= 35 ? 'short' : 'mid';

/* ---------------- Entscheidungen einsammeln ---------------- */
const open = [], vs = [], dates = [];
const HH = findHH();
if (!HH) { console.error('Kein win2day-Handhistorien-Ordner gefunden.'); process.exit(1); }
for (const fn of fs.readdirSync(HH).filter(n => /^\d+\.xml$/.test(n))) {
  const sess = W.parseSession(fs.readFileSync(path.join(HH, fn), 'utf8'));
  for (const h of sess.heroHands) {
    dates.push(h.startDate);
    if (!h.heroCards || h.heroCards.length !== 2) continue;
    const pre = h.streets.preflop, hero = h.hero, bb = h.bb || 1;
    const i = pre.findIndex(a => a.player === hero);
    if (i < 0) continue;
    const map = W.positionsOf(h).map, pos = MODEL_POS[map[hero]];
    if (!pos) continue;
    const before = pre.slice(0, i), act = pre[i], c = cls(h.heroCards);
    const chips = n => h.players.find(p => p.name === n).chips / bb;
    const raises = before.filter(a => a.kind === 'raise' || a.kind === 'allin' || a.kind === 'bet');
    const calls = before.filter(a => a.kind === 'call');
    if (!raises.length && !calls.length) {
      if (pos === 'BB') continue;
      // Effektiv gegen den größten Stack, der noch hinter dir sitzt (grob: am Tisch).
      const eff = Math.min(chips(hero), Math.max(...h.players.filter(p => p.name !== hero).map(p => p.chips / bb)));
      if (eff <= 15) continue;
      const a = act.kind === 'fold' ? 'f' : (act.kind === 'call' || act.kind === 'check') ? 'l' : 'r';
      open.push([pos, c, a, Math.round(eff)]);
    } else if (raises.length === 1 && !calls.length && raises[0].kind !== 'allin') {
      // Sauberer Spot: genau ein Open, kein Limper davor, kein Caller dazwischen.
      const opener = MODEL_POS[map[raises[0].player]];
      if (!opener || opener === 'BB') continue;
      const eff = Math.min(chips(hero), chips(raises[0].player));
      if (eff <= 15) continue;
      const a = act.kind === 'fold' ? 'f' : act.kind === 'call' ? 'c' : '3';
      vs.push([pos, opener, c, a, Math.round(eff)]);
    }
  }
}

/* ---------------- Modell-Ranges ---------------- */
const openModel = {};
for (const p of ['EP', 'MP', 'CO', 'BTN', 'SB']) {
  openModel[p] = { short: setOf(P.adjustForStack(P.RFI[p], 'short')), mid: setOf(P.RFI[p]) };
}

/* Call- und 3-Bet-Ranges: dieselben wie im Preflop-Drill (js/preflopdrill.js),
   inklusive genäherter Lücken und SB-Regel (3-Bet oder Fold). */
function vsModel(h, v, band) {
  const m = D.vsModel(h, v, band);
  return { sb: m.sb, call: [...m.call], tb: [...m.tb], src: m.src };
}
const vsM = {};
for (const [p, o, , , eff] of vs) { const k = `${p}|${o}|${bandOf(eff)}`; if (!vsM[k]) vsM[k] = vsModel(p, o, bandOf(eff)); }

/* ---------------- Seiten schreiben ---------------- */
dates.sort();
const span = JSON.stringify([dates[0].slice(0, 10), dates[dates.length - 1].slice(0, 10), dates.length]);
const page = (tpl, data) => fs.readFileSync(path.join(__dirname, tpl), 'utf8').replace('/*DATA*/', data);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'open-ranges.html'),
  page('open-tpl.html', `const ROWS=${JSON.stringify(open)};const MODEL=${JSON.stringify(openModel)};const SPAN=${span};`));
fs.writeFileSync(path.join(OUT, 'calls-3bets.html'),
  page('vs-tpl.html', `const ROWS=${JSON.stringify(vs)};const MODEL=${JSON.stringify(vsM)};const SPAN=${span};`));
console.log(`${dates.length} Hände (${dates[0].slice(0, 10)} bis ${dates[dates.length - 1].slice(0, 10)}): ` +
  `${open.length} Open-Entscheidungen, ${vs.length} gegen ein Open -> ${OUT}`);
