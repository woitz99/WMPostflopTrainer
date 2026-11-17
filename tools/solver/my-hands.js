/* =========================================================================
   my-hands.js — macht aus den eigenen Handhistorien Solver-Spots.

   Nimmt Hände, in denen du heads-up einen Flop gesehen hast (Single-Raised
   oder 3-Bet-Pot, kein Limp, niemand preflop all-in), und schreibt für die
   teuersten bzw. kommentierten eine Zeile im Format von spots.txt:
     - Board, Pot und effektiver Stack EXAKT aus der Hand,
     - Ranges aus dem Trainer-Modell für die gespielte Preflop-Linie
       (dieselben wie im Tab "Verlauf") — das ist die einzige Annahme.

   Die Ausgabe ist privat (eigene Hände, Turniere, Karten) und geht nach
   Dokumente\Poker-Handlog\solver, nicht ins Repo:
     hands-spots.txt   Eingabe für pt-solver-batch
     hands.json        Zuordnung Spot -> Hand (Datum, Turnier, deine Karten,
                       Linie, Ergebnis, Kommentar)

   node tools/solver/my-hands.js [--max 18] [--dry]
   ========================================================================= */
global.window = {};
const fs = require('fs'), path = require('path');
const base = path.join(__dirname, '..', '..', 'js');
for (const f of ['engine.js', 'ranges.js', 'strategy.js', 'w2d.js', 'rangeflow.js']) {
  eval(fs.readFileSync(path.join(base, f), 'utf8'));
}
const P = global.window.PT, RF = P.RangeFlow, W = P.W2D;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MAX = +arg('--max', 18), DRY = process.argv.includes('--dry');

const HOME = process.env.USERPROFILE || process.env.HOME;
const OUT = path.join(HOME, 'Documents', 'Poker-Handlog', 'solver');
const NOTES = path.join(HOME, 'Documents', 'Poker-Handlog', 'notizen.json');

/* Handhistorien-Ordner wie im Hand-Logbuch: der Spielerordner mit der
   jüngsten Änderung. */
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
const bandOf = bb => bb <= 35 ? 'short' : bb <= 60 ? 'mid' : 'deep';

let notes = {};
try { notes = JSON.parse(fs.readFileSync(NOTES, 'utf8')); } catch (e) { }

const HH = findHH();
const cands = [];
const skip = {};
const sk = k => { skip[k] = (skip[k] || 0) + 1; };
for (const fn of fs.readdirSync(HH).filter(n => /^\d+\.xml$/.test(n))) {
  const sess = W.parseSession(fs.readFileSync(path.join(HH, fn), 'utf8'));
  for (const h of sess.heroHands) {
    if (h.board.flop.length !== 3) continue;
    const pre = h.streets.preflop, hero = h.hero, bb = h.bb || 1;
    const folded = new Set(pre.filter(a => a.kind === 'fold').map(a => a.player));
    const inPot = h.players.map(p => p.name).filter(n => !folded.has(n) && (pre.some(a => a.player === n) || h.streets.blinds.some(a => a.player === n && a.kind !== 'ante')));
    if (inPot.length !== 2 || !inPot.includes(hero)) { sk('nicht heads-up'); continue; }
    const vill = inPot.find(n => n !== hero);
    const raises = pre.filter(a => a.kind === 'raise' || a.kind === 'allin' || a.kind === 'bet');
    // Preflop-Einsatz und Reststack am Flop
    const inv = {};
    for (const st of ['blinds', 'preflop']) for (const a of h.streets[st]) inv[a.player] = (inv[a.player] || 0) + a.amount;
    const stack = n => (h.players.find(p => p.name === n).chips - (inv[n] || 0));
    const eff = Math.min(stack(hero), stack(vill));
    if (eff <= bb * 0.5) { sk('preflop all-in'); continue; }
    if (raises.length === 0) { sk('Limp-Pot'); continue; }
    if (raises.length > 2) { sk('4-Bet-Pot'); continue; }
    const opener = raises[0].player;
    // Hat der andere vor dem ersten Raise schon gecallt, war es ein Limp und
    // dein Raise eine Iso — dafür hat das Modell keine eigene Range.
    const firstRaiseNo = raises[0].no;
    const limpIso = pre.some(a => a.no < firstRaiseNo && a.kind === 'call' && a.player !== opener);
    if (opener !== hero && opener !== vill) { sk('Opener foldete'); continue; }
    let line;
    if (raises.length === 1) line = opener === hero ? 'hOpen_vCall' : 'vOpen_hCall';
    else {
      const three = raises[1].player;
      if (three === opener) { sk('Limp-Raise'); continue; }
      line = opener === hero ? 'hOpen_v3b' : 'vOpen_h3b';
    }
    const pm = W.positionsOf(h).map;
    const hp = MODEL_POS[pm[hero]], vp = MODEL_POS[pm[vill]];
    if (!hp || !vp || hp === vp) { sk('Position unklar'); continue; }
    const effBB = eff / bb, band = bandOf(effBB + (inv[hero] || 0) / bb);
    const pr = RF.preflopRanges(line, hp, vp, band);
    if (!pr.vill || !pr.hero) { sk('keine Modell-Range'); continue; }
    const potBB = Object.values(inv).reduce((a, b) => a + b, 0) / bb;
    const n = notes[h.gamecode];
    cands.push({
      h, fn, line, limpIso, hp, vp, band, pr, potBB, effBB, net: h.heroNetBB,
      note: n ? (n.text || '').slice(0, 300) : '', tags: n ? [...(n.tags || []), ...(n.leaks || [])] : [],
      tournament: sess.meta.tournamentName
    });
  }
}

/* Auswahl: zuerst kommentierte Hände (sie zeigen, wo du gezweifelt hast),
   dann die größten Verluste. SPR unter 1 bringt dem Solver kaum Entscheidungen. */
const useful = cands.filter(c => c.effBB / c.potBB >= 1);
const score = c => (c.note || c.tags.length ? 1000 : 0) + Math.max(0, -c.net);
useful.sort((a, b) => score(b) - score(a));
// Rechenreihenfolge: kleine Bäume zuerst. Tiefe Stacks (SPR > 10) brauchen
// ein Vielfaches an Speicher und Zeit und sollen den Rest nicht blockieren.
const pick = useful.slice(0, MAX).sort((a, b) => a.effBB / a.potBB - b.effBB / b.potBB);

const rows = ['# id\tboard\tpot\teff\toop\tip\tflop\tturn\triver\traise'];
const meta = [];
const S = RF.TREE_SIZES, pct = s => s.split(',').map(x => x.trim()).filter(Boolean).map(x => x + '%').join(', ');
for (const c of pick) {
  const h = c.h, board = h.board.flop.map(P.cardToStr).join('');
  /* Deine echte Hand ist oft nicht in der Modell-Range (QQ würde laut Modell
     3-betten statt callen). Ohne sie gibt es keine Strategie für genau diese
     Karten — deshalb kommt die eine Kombination mit Gewicht 1 dazu. Das
     ändert die Range um ein Combo von typisch 100–500. */
  const hc = h.heroCards, heroParsed = P.parseRange(c.pr.hero.str);
  const has = heroParsed.some(x => x.w > 0 && ((x.c[0] === hc[0] && x.c[1] === hc[1]) || (x.c[0] === hc[1] && x.c[1] === hc[0])));
  // Der Solver verlangt den höheren Rang zuerst ("QdTd", nicht "TdQd").
  const combo = hc.map(P.cardToStr).sort((a, b) => P.RANKS.indexOf(b[0]) - P.RANKS.indexOf(a[0])).join('');
  const heroR = RF.solverRangeStr(heroParsed) + (has ? '' : ', ' + combo);
  c.added = !has;
  const villR = RF.solverRangeStr(P.parseRange(c.pr.vill.str));
  const oop = c.pr.villIP ? heroR : villR, ip = c.pr.villIP ? villR : heroR;
  const id = 'h' + h.gamecode;
  rows.push([id, board, Math.round(c.potBB * 10), Math.round(c.effBB * 10), oop, ip, pct(S.flop), pct(S.turn), pct(S.river), S.raise].join('\t'));
  meta.push({
    id, gamecode: h.gamecode, date: h.startDate, tournament: c.tournament,
    heroCards: h.heroCards.map(P.cardToStr).join(''), board, boardAll: h.boardAll.map(P.cardToStr).join(''),
    heroPos: c.hp, villPos: c.vp, heroIsOop: c.pr.villIP, heroComboAdded: c.added, limpIso: c.limpIso, line: c.line, lineLabel: RF.LINES[c.line].label,
    potType: RF.LINES[c.line].potType, band: c.band,
    potBB: +c.potBB.toFixed(1), effBB: +c.effBB.toFixed(1), spr: +(c.effBB / c.potBB).toFixed(2),
    netBB: +c.net.toFixed(1), note: c.note, tags: c.tags,
    rangeSrc: { hero: c.pr.hero.src + (c.pr.hero.approx ? ' (genähert)' : ''), vill: c.pr.vill.src + (c.pr.vill.approx ? ' (genähert)' : '') }
  });
}

console.log(`Kandidaten: ${cands.length} heads-up-Flops, davon ${useful.length} mit SPR >= 1. Übersprungen: ${JSON.stringify(skip)}`);
for (const m of meta) console.log(`  ${m.id}  ${m.date.slice(0, 10)}  ${m.heroCards} auf ${m.board}  ${m.heroPos} vs ${m.villPos}  ${m.potType}  Pot ${m.potBB}  eff ${m.effBB}  SPR ${m.spr}  ${m.netBB > 0 ? '+' : ''}${m.netBB}bb${m.note ? '  [Notiz]' : ''}`);
if (!DRY) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'hands-spots.txt'), rows.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'hands.json'), JSON.stringify(meta, null, 1));
  console.log(`${meta.length} Spots -> ${path.join(OUT, 'hands-spots.txt')}`);
}
