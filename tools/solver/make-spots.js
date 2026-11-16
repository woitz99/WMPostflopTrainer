/* =========================================================================
   make-spots.js — erzeugt spots.txt für den Batch-Solver aus den Ranges
   des Trainers. Damit rechnet der Solver mit GENAU den Preflop-Ranges und
   der Pot-/Stack-Geometrie, die der Trainer anzeigt — kein zweiter Satz
   Ranges, der auseinanderlaufen kann.

   Auswahl (16.11.2026): die Spots hinter den teuren Leaks, je sechs
   Board-Familien. Stackband 40–60bb.
     node tools/solver/make-spots.js            -> tools/solver/spots.txt
   ========================================================================= */
global.window = {};
const fs = require('fs'), path = require('path');
const base = path.join(__dirname, '..', '..', 'js');
for (const f of ['engine.js', 'ranges.js', 'strategy.js', 'rangeflow.js']) {
  eval(fs.readFileSync(path.join(base, f), 'utf8'));
}
const P = global.window.PT, RF = P.RangeFlow;

const BAND = 'mid';
/* id-Präfix, OOP-Range, IP-Range, Pot-Typ. OOP/IP aus der Postflop-Reihenfolge. */
const SPOTS = [
  { id: 'btn_bb', name: 'BTN öffnet, BB callt', oop: P.adjustForStack(P.BB_FLAT.BTN, BAND), ip: P.adjustForStack(P.RFI.BTN, BAND), potType: 'SRP', oopPos: 'BB', ipPos: 'BTN', openerPos: 'BTN' },
  { id: 'co_bb', name: 'CO öffnet, BB callt', oop: P.adjustForStack(P.BB_FLAT.CO, BAND), ip: P.adjustForStack(P.RFI.CO, BAND), potType: 'SRP', oopPos: 'BB', ipPos: 'CO', openerPos: 'CO' },
  { id: 'ep_bb', name: 'EP öffnet, BB callt', oop: P.adjustForStack(P.BB_FLAT.EP, BAND), ip: P.adjustForStack(P.RFI.EP, BAND), potType: 'SRP', oopPos: 'BB', ipPos: 'EP', openerPos: 'EP' },
  { id: 'co_btn', name: 'CO öffnet, BTN callt', oop: P.adjustForStack(P.RFI.CO, BAND), ip: P.IP_FLAT.BTN_vs_CO, potType: 'SRP', oopPos: 'CO', ipPos: 'BTN', openerPos: 'CO' },
  { id: '3b_bb_btn', name: 'BTN öffnet, BB 3-bettet, BTN callt', oop: P.THREEBET.BB_vs_BTN, ip: P.CALL_3BET.BTN_vs_BB, potType: '3BP', oopPos: 'BB', ipPos: 'BTN', openerPos: 'BTN' }
];
/* Je eine Vertreterin der sechs Board-Familien. Q84 zwei Farben ist der
   Flop, den du in Desktop Postflop schon gerechnet hast — Gegenprobe. */
const BOARDS = [
  { b: 'Ad7c2h', fam: 'A-hoch trocken' },
  { b: 'Qs8h4h', fam: 'K/Q-hoch, zwei Farben' },
  { b: 'Jd9c8h', fam: 'J-hoch verbunden' },
  { b: '7s6h5c', fam: 'tief verbunden' },
  { b: 'TcTd4s', fam: 'gepaart' },
  { b: 'Jh7h3h', fam: 'monoton' }
];

/* Baumgröße für die Nacht-Rechnung. Gespeichert und abgefragt werden nur
   die FLOP-Entscheidungen; Turn und River müssen nur so weit stimmen, dass
   der Flop richtig bewertet wird. Mit zwei Größen auf allen Straßen
   (wie TREE_SIZES im Export) brauchte BTN vs BB auf Q84 6 GB und lief auf
   dem Notebook (i7-1185G7) nach 15 min noch — deshalb Turn/River mit einer
   Größe; All-in kommt über add_allin_threshold automatisch dazu. */
/* Abgleich 16.11.2026, BTN vs BB auf Q84 zwei Farben:
     vereinfacht (66 %), 0,88 % Pot: BB donkt 9,1 %, BTN 33/80 % = 16/40 %   (3 min)
     voll (55/130 %),    0,46 % Pot: BB donkt 1,9 %, BTN 33/80 % = 24/29 %   (25 min)
     Desktop Postflop (User):         BB donkt 0,7 %
   Der vereinfachte Baum verzerrt kleine Häufigkeiten und die Größenwahl.
   PT_SOLVE=full (nachtlauf.ps1 -Full) rechnet deshalb mit dem vollen Baum. */
const FULL = process.env.PT_SOLVE === 'full';
const SOLVE = FULL
  ? { flop: RF.TREE_SIZES.flop, turn: RF.TREE_SIZES.turn, river: RF.TREE_SIZES.river, raise: RF.TREE_SIZES.raise }
  : { flop: RF.TREE_SIZES.flop, turn: '66', river: '66', raise: RF.TREE_SIZES.raise };

const rows = ['# id\tboard\tpot\teff\toop\tip\tflop\tturn\triver\traise'];
const index = [];
const pctList = s => s.split(',').map(x => x.trim()).filter(Boolean).map(x => x + '%').join(', ');
for (const s of SPOTS) {
  const ex = RF.solverExport({
    villRange: P.parseRange(s.ip), heroRange: P.parseRange(s.oop), board: [], villIP: true,
    heroPos: s.oopPos, villPos: s.ipPos, potType: s.potType, band: BAND
  });
  for (const bd of BOARDS) {
    const id = `${s.id}__${bd.b}`;
    rows.push([id, bd.b, ex.potChips, ex.effChips, ex.oop, ex.ip, pctList(SOLVE.flop), pctList(SOLVE.turn), pctList(SOLVE.river), SOLVE.raise].join('\t'));
    index.push({ id, spot: s.id, name: s.name, oopPos: s.oopPos, ipPos: s.ipPos, openerPos: s.openerPos, potType: s.potType, band: BAND, board: bd.b, fam: bd.fam, pot: +ex.potChips, eff: +ex.effChips });
  }
}
fs.writeFileSync(path.join(__dirname, 'spots.txt'), rows.join('\n') + '\n');
fs.writeFileSync(path.join(__dirname, 'plan.json'), JSON.stringify({ v: 1, chipsPerBB: 10, spots: index }, null, 1));
console.log(`${index.length} Rechnungen -> tools/solver/spots.txt (Plan: tools/solver/plan.json)`);
require('./build-index.js');
