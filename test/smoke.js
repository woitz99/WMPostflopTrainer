/* Smoke-Test der Engine (node test/smoke.js) */
global.window = {};
const fs = require('fs'), path = require('path');
const base = path.join(__dirname, '..', 'js');
for (const f of ['engine.js', 'review.js', 'ranges.js', 'strategy.js', 'handprofile.js', 'plan.js', 'tips.js', 'mental.js', 'eqtable.js', 'icm.js', 'multiway.js', 'w2d.js', 'w2dstats.js', 'w2daudit.js', 'w2dleaks.js', 'w2dpost.js', 'ownhands.js', 'riverdrill.js', 'stackoff.js', 'rangeflow.js', 'course.js', 'courseui.js']) {
  eval(fs.readFileSync(path.join(base, f), 'utf8'));
}
const P = global.window.PT;
let fails = 0;
function ok(cond, msg) { if (!cond) { console.log('  FAIL: ' + msg); fails++; } else console.log('  ok  : ' + msg); }
const C = s => s.match(/[2-9TJQKA][cdhs]/g).map(P.cardFromStr);

console.log('\n== Evaluator ==');
const ev = s => P.evaluate(C(s));
ok(ev('AsKsQsJsTs2h3d') > ev('AhAdAcAs2h3d4c'), 'Royal Flush > Quads');
ok(ev('AhAdAcAs2h3d4c') > ev('AhAdAcKsKh3d4c'), 'Quads > Full House');
ok(ev('AhAdAcKsKh3d4c') > ev('AsKsQs9s2s3d4c'), 'Full House > Flush');
ok(ev('AsKsQs9s2s3d4c') > ev('AhKdQcJs Ts2h3d'.replace(/ /g, '')), 'Flush > Straight');
ok(ev('5h4d3c2sAh8d9c') > ev('AhAdKcQsJh8d2c'), 'Rad-Straight (A2345) > Paar');
ok(ev('AhAdKcQsJh8d2c') > ev('AhKdQcJs9h8d2c'), 'Paar > High Card');
ok(P.catOfScore(ev('9h8h7h6h5h2d3c')) === 8, 'Straight Flush erkannt');
ok(P.catOfScore(ev('Kh Kd Ks 7c 7d 2h 3s'.replace(/ /g, ''))) === 6, 'Full House erkannt');
ok(ev('AhAdKcQsJh8d2c') > ev('AhAdKcQs9h8d2c'), 'Kicker zaehlt');

console.log('\n== Range-Parser ==');
const n = s => P.parseRange(s).length;
ok(n('AA') === 6, 'AA = 6 Kombos');
ok(n('AKs') === 4, 'AKs = 4');
ok(n('AKo') === 12, 'AKo = 12');
ok(n('AK') === 16, 'AK = 16');
ok(n('77+') === 8 * 6, '77+ = 48');
ok(n('A9s+') === 5 * 4, 'A9s+ = A9s..AKs = 20');
ok(n('KTo+') === 3 * 12, 'KTo+ = 36');
ok(n('55-22') === 4 * 6, '55-22 = 24');
ok(n('A5s-A2s') === 4 * 4, 'A5s-A2s = 16');
ok(n('T9s-76s') === 4 * 4, 'T9s-76s = 16');
ok(n('AhKd') === 1, 'explizite Kombo');
ok(n('AA, AA') === 6, 'Dedupe');
ok(P.parseRange('AKs:0.5')[0].w === 0.5, 'Gewicht');


console.log('\n== Range-Parser meldet Unlesbares ==');
{
  // Der Fehler, um den es geht: parseRange warf bei Unsinn nicht, sondern
  // lieferte still etwas anderes. Die Equity kam trotzdem -- nur falsch.
  const bad = s => P.parseRangeStrict(s).unknown.map(x => x.token).join('|');

  ok(n('AsK') === 0 && bad('AsK') === 'AsK',
    '"AsK" wird gemeldet statt still als AKo (12 Kombos) gelesen');
  ok(n('Kh Th') === 0 && bad('Kh Th') === 'Kh|Th',
    '"Kh Th": das Leerzeichen verschluckt nichts mehr, beide Haelften werden gemeldet');

  for (const t of ['XX', 'A', '9', 'AKx', 'JJ-', '--', 'AsAs', 'AAs', 'A5s-A2', 'AKs-52s', '77-AKs', 'A5s-A2x'])
    ok(bad(t) === t, 'unlesbar und gemeldet: ' + JSON.stringify(t));

  // Frueher warf ein einbuchstabiges Token eine Exception mitten im Parser.
  for (const t of ['A', '9', ':0.5', '-', '+'])
    ok((() => { try { P.parseRange(t); return true; } catch (e) { return false; } })(),
      'kein Absturz bei ' + JSON.stringify(t));

  // Gewichte: NaN wurde bisher stillschweigend an jede Kombo geschrieben.
  ok(bad('AKs:abc') === 'AKs:abc', 'kaputtes Gewicht wird gemeldet');
  ok(bad('AKs:2') === 'AKs:2', 'Gewicht > 1 wird gemeldet');
  ok(P.parseRange('AKs:0.5').every(x => x.w === 0.5), 'gueltiges Gewicht bleibt unveraendert');

  // Gueltiges neben Kaputtem geht nicht verloren, wird aber auch nicht still geschluckt.
  ok(n('AA, XX, KK') === 12, 'gueltige Tokens neben einem kaputten werden weiter geparst');
  ok(bad('AA, XX, KK') === 'XX', 'genau das kaputte Token wird gemeldet');
  ok(P.validateRange('AA, XX, KK').length === 1 && /XX/.test(P.validateRange('AA, XX, KK')[0]),
    'validateRange liefert eine lesbare Meldung');
  ok(P.validateRange('AA-22, AKs-A2s, AKo-A2o').length === 0, 'saubere Range: keine Meldung');

  // Bestehende Aufrufer duerfen nicht brechen: parseRange bleibt ein Array.
  ok(Array.isArray(P.parseRange('AA')) && P.parseRange('AA').length === 6,
    'parseRange liefert weiterhin direkt das Array');
  ok(P.parseRangeStrict('AA').range.length === 6 && P.parseRangeStrict('AA').unknown.length === 0,
    'parseRangeStrict trennt Range und Meldungen');

  // Alle Range-Strings des Projekts muessen die Grammatik erfuellen.
  const alle = [];
  for (const k of Object.keys(P.RFI)) alle.push(['RFI/' + k, P.RFI[k]]);
  for (const k of Object.keys(P.BB_FLAT)) alle.push(['BB_FLAT/' + k, P.BB_FLAT[k]]);
  for (const sp of P.SPOTS) for (const band of ['push', 'short', 'mid', 'deep']) {
    alle.push([sp.id + '/' + band + '/hero', sp.heroRange(band)]);
    alle.push([sp.id + '/' + band + '/vill', sp.villRange(band)]);
    if (sp.opponents > 1) sp.villRanges(band).forEach((r, i) => alle.push([sp.id + '/' + band + '/v' + i, r]));
  }
  const kaputt = alle.filter(([, str]) => P.validateRange(str).length)
    .map(([label, str]) => label + ': ' + P.validateRange(str).join(', '));
  ok(kaputt.length === 0, alle.length + ' Range-Strings im Projekt parsen vollstaendig' +
    (kaputt.length ? ': ' + kaputt.join(' | ') : ''));
}

console.log('\n== Ranges plausibel ==');
for (const k of Object.keys(P.RFI)) {
  const c = n(P.RFI[k]);
  ok(c > 100 && c < 700, `RFI ${k}: ${c} Kombos (${(c / 1326 * 100).toFixed(1)}%)`);
}
for (const k of Object.keys(P.BB_FLAT)) {
  const c = n(P.BB_FLAT[k]);
  ok(c > 150 && c < 900, `BB-Flat vs ${k}: ${c} Kombos (${(c / 1326 * 100).toFixed(1)}%)`);
}

console.log('\n== Spot-Vertrag (jeder Spot muss dieselben Felder anbieten) ==');
{
  // Diese Pruefung fehlte: ein Mehrweg-Spot ohne villRange() hat beim Start
  // eine Ausnahme geworfen und den ganzen Trainer leer gelassen.
  let bad = 0;
  for (const s of P.SPOTS) {
    for (const band of ['push', 'short', 'mid', 'deep']) {
      const probleme = [];
      if (typeof s.heroRange !== 'function') probleme.push('heroRange fehlt');
      if (typeof s.villRange !== 'function') probleme.push('villRange fehlt');
      if (s.opponents > 1 && typeof s.villRanges !== 'function') probleme.push('villRanges fehlt');
      if (probleme.length) { ok(false, `${s.id}: ${probleme.join(', ')}`); bad++; break; }
      const hr = P.parseRange(s.heroRange(band)), vr = P.parseRange(s.villRange(band));
      if (!hr.length || !vr.length) { ok(false, `${s.id}/${band}: leere Range`); bad++; break; }
      if (s.opponents > 1) {
        const list = s.villRanges(band);
        if (!Array.isArray(list) || list.length !== s.opponents) { ok(false, `${s.id}: villRanges liefert nicht ${s.opponents} Ranges`); bad++; break; }
        if (list.some(x => !P.parseRange(x).length)) { ok(false, `${s.id}: eine Gegner-Range ist leer`); bad++; break; }
        if (P.parseRange(list[0]).length !== vr.length) { ok(false, `${s.id}: villRange != erste villRanges`); bad++; break; }
      }
      for (const f of ['id', 'tag', 'name', 'heroPos', 'villPos', 'story']) {
        if (!s[f]) { ok(false, `${s.id}: Feld ${f} fehlt`); bad++; }
      }
      const g = P.geometry(s, band);
      if (!(g.pot > 0 && g.eff > 0 && g.spr > 0)) { ok(false, `${s.id}/${band}: Geometrie unplausibel`); bad++; }
    }
  }
  ok(bad === 0, `alle ${P.SPOTS.length} Spots erfuellen den Vertrag (heroRange/villRange/Geometrie)`);
  const ids = P.SPOTS.map(s => s.id);
  ok(ids.length === new Set(ids).size, 'keine doppelten Spot-IDs');
  ok(P.SPOTS.filter(s => s.opponents > 1).length >= 4, 'Mehrweg-Spots vorhanden');
}

console.log('\n== Merksaetze ==');
{
  const T = P.Tips;
  const D = P.Plan.DAYS;
  ok(!!T && T.TIPS.length === D, `ein Merksatz je Plantag (${T ? T.TIPS.length : 0} fuer ${D} Tage)`);
  ok(T.TIPS.every(t => t.k && t.d && t.d.length > 40), 'jeder Merksatz hat Titel und Inhalt');
  ok(new Set(T.TIPS.map(t => t.k)).size === D, 'keine doppelten Titel');
  ok(P.Plan.WEEKS.every(w => T.tipsOfWeek(w.n).length === 7), 'sieben Merksaetze je Woche');
  ok(T.tipFor(0) === T.TIPS[0] && T.tipFor(D - 1) === T.TIPS[D - 1], 'Tagesindex trifft den richtigen Satz');
  ok(T.tipFor(D) === null, 'ueber das Planende hinaus kein Satz');
  // Am Satellite-Tag steht die Re-Entry-Regel, und sie nennt dieselbe Grenze wie der Plan.
  const satIdx = Math.round((P.Plan.toUTC('2026-11-10') - P.Plan.toUTC(P.Plan.PLAN_START)) / 86400000);
  ok(/Re-Entry/.test(T.tipFor(satIdx).k), `Satellite-Tag zeigt die Re-Entry-Regel (${T.tipFor(satIdx).k})`);
  ok(T.tipFor(satIdx).d.indexOf(String(P.Plan.REENTRY.maxBigBlind)) >= 0, 'Merksatz und Plan nennen dieselbe Big-Blind-Grenze');
  ok(T.TIPS.every(t => (t.d.match(/\*\*/g) || []).length % 2 === 0), 'Fettmarkierungen sind paarweise geschlossen');
}

console.log('\n== Klassifikation ==');
function cl(h, b) { return P.classify(C(h), C(b)); }
ok(cl('AhKd', 'Kc7d2s').made === 'Top Pair Top Kicker', 'AK auf K72 = TPTK');
ok(cl('7h7d', 'Kc7s2h').made === 'Set', '77 auf K72 = Set');
ok(cl('AhAd', 'Kc7s2h').made === 'Overpair', 'AA auf K72 = Overpair');
ok(cl('AhQh', '9h4h2c').draws.some(d => /Flushdraw/.test(d)), 'AhQh auf 9h4h2c = Flushdraw');
ok(cl('9h8d', 'Tc7s2h').draws.some(d => /OESD/.test(d)), '98 auf T72 = OESD');
ok(cl('Ah5d', 'Kc7s2h').made === 'Ace High', 'A5 auf K72 = Ace High');
ok(cl('Kh7d', 'Kc7s2h').made === 'Two Pair', 'K7 auf K72 = Two Pair');
ok(cl('6h5d', '7c8s9h').made === 'Straight', '65 auf 789 = Straight');

console.log('\n== Board-Textur ==');
const t1 = P.boardTexture(C('Kc7d2s'));
const t2 = P.boardTexture(C('Jh Th 8h'.replace(/ /g, '')));
ok(t1.static === true, 'K72r ist statisch (dyn ' + t1.dyn + ')');
ok(t2.static === false, 'JT8 monotone ist dynamisch (dyn ' + t2.dyn + ')');
ok(t1.dyn < t2.dyn, 'K72r dynamischer Score < JT8hhh');

console.log('\n== Nuts ==');
const nuts1 = P.nutsOnBoard(C('Kc7d2s'), 3);
ok(nuts1[0].made === 'Set', 'Nuts auf K72r = Set (KK) — ' + nuts1[0].label);
const nuts2 = P.nutsOnBoard(C('AhKhQh'), 3);
ok(nuts2[0].made === 'Straight Flush', 'Nuts auf AKQhh = Royal — ' + nuts2[0].label);

console.log('\n== Equity ==');
const vr = P.parseRange(P.BB_FLAT.BTN);
const e1 = P.equityVsRange(C('AhKd'), vr, C('Kc7d2s'), 120000);
ok(e1.eq > 0.75 && e1.eq < 0.95, `AK auf K72 vs BB-Range: ${(e1.eq * 100).toFixed(1)}%`);
const e2 = P.equityVsRange(C('7h6h'), vr, C('Kc7d2s'), 120000);
ok(e2.eq > 0.35 && e2.eq < 0.75, `76s (2nd Pair) auf K72: ${(e2.eq * 100).toFixed(1)}%`);
const e3 = P.equityVsRange(C('2h2d'), P.parseRange('AA'), C('Kc7d3s'), 120000);
ok(e3.eq > 0.05 && e3.eq < 0.15, `22 vs AA auf K73: ${(e3.eq * 100).toFixed(1)}% (erwartet ~9%)`);

console.log('\n== Range vs Range (Range-Advantage) ==');
const btn = P.parseRange(P.RFI.BTN), bb = P.parseRange(P.BB_FLAT.BTN);
const rAhigh = P.rangeVsRange(btn, bb, C('AhKd7c'), 12000);
const rLow = P.rangeVsRange(btn, bb, C('7h6d5c'), 12000);
console.log(`  BTN-Range Equity auf AK7 : ${(rAhigh * 100).toFixed(1)}%`);
console.log(`  BTN-Range Equity auf 765: ${(rLow * 100).toFixed(1)}%`);
ok(rAhigh > rLow, 'BTN hat auf AK7 mehr Vorteil als auf 765');
ok(rAhigh > 0.5, 'BTN hat Range-Advantage auf AK7');

console.log('\n== Buckets ==');
const bk = P.rangeBuckets(bb, C('7h6d5c'), []);
console.log('  BB auf 765:', bk.list.slice(0, 6).map(x => `${x.name} ${(x.pct * 100).toFixed(1)}%`).join(' | '));
ok(bk.nuttedPct > 0.02, 'BB hat Nut-Anteil auf 765: ' + (bk.nuttedPct * 100).toFixed(1) + '%');
ok(Math.abs(bk.list.reduce((a, x) => a + x.pct, 0) - 1) < 0.01, 'Bucket-Prozente summieren auf 100%');

console.log('\n== Relative Staerke ==');
const rs = P.relativeStrength(C('AhKd'), bb, C('Kc7d2s'));
ok(rs.pct > 0.8, `AK auf K72 schlaegt ${(rs.pct * 100).toFixed(1)}% der BB-Range`);
const rs2 = P.relativeStrength(C('3h3d'), bb, C('Kc7d2s'));
ok(rs2.pct > 0.3 && rs2.pct < 0.7, `33 auf K72 schlaegt ${(rs2.pct * 100).toFixed(1)}%`);

console.log('\n== Geometrie ==');
for (const b of Object.keys(P.STACKS)) {
  const g = P.geometry(P.SPOTS[0], b);
  console.log(`  SRP ${b}: Pot ${g.pot} Eff ${g.eff} SPR ${g.spr}`);
  ok(g.spr > 2 && g.spr < 16, `SRP SPR plausibel (${g.spr})`);
  const g3 = P.geometry(P.SPOTS.find(s => s.potType === '3BP'), b);
  console.log(`  3BP ${b}: Pot ${g3.pot} Eff ${g3.eff} SPR ${g3.spr}`);
  ok(g3.spr > 0.5 && g3.spr < 5, `3BP SPR plausibel (${g3.spr})`);
}

console.log('\n== Strategie-Empfehlungen (Sanity) ==');
function ctxFor(boardStr, opts) {
  const board = C(boardStr);
  const hr = P.parseRange(opts.hero), vrr = P.parseRange(opts.vill);
  const hB = P.rangeBuckets(hr, board, []), vB = P.rangeBuckets(vrr, board, []);
  const rEq = P.rangeVsRange(hr, vrr, board, 20000);
  return Object.assign({
    street: opts.street || 'flop', tex: P.boardTexture(board), spr: opts.spr || 5,
    pot: 6, eff: 30, heroIP: opts.ip !== false, role: opts.role || 'PFR',
    potType: opts.potType || 'SRP',
    heroNut: hB.nuttedPct, villNut: vB.nuttedPct,
    heroBuckets: hB, villBuckets: vB, rangeEq: rEq
  }, P.advantage(hB, vB, rEq));
}
const dry = ctxFor('Kc7d2s', { hero: P.RFI.BTN, vill: P.BB_FLAT.BTN });
const wet = ctxFor('JhTh8c', { hero: P.RFI.BTN, vill: P.BB_FLAT.BTN });

function rec(handStr, boardStr, ctx) {
  const board = C(boardStr), h = C(handStr);
  const cls = P.classify(h, board);
  const c2 = Object.assign({}, ctx, {
    heroEq: P.equityVsRange(h, P.parseRange(P.BB_FLAT.BTN), board, 120000).eq,
    heroPct: P.relativeStrength(h, P.parseRange(P.BB_FLAT.BTN), board).pct, cls
  });
  const r = P.recommendBetting(cls, c2);
  return { best: r.best, s: r.scores, made: cls.made };
}
const r1 = rec('AhKd', 'Kc7d2s', dry);
console.log('  AK auf K72r (BTN vs BB):', r1.made, '->', r1.best, JSON.stringify(r1.s));
ok(r1.best.startsWith('BET'), 'TPTK auf trockenem Board = Bet');
ok(r1.s.BET_S >= r1.s.BET_L, 'auf trockenem Board klein > gross');

// Air auf K72r als BTN gegen BB ist bewusst KEIN Check: mit klarem
// Range-Advantage bettet der Solver dort fast die ganze Range klein.
// Der Check-Nachweis gehört in einen Spot ohne Range-Advantage:
const oopCtx = ctxFor('Kc7d2s', { hero: P.RFI.CO, vill: P.IP_FLAT.BTN_vs_CO, ip: false });
const r2 = (function () {
  const board = C('Kc7d2s'), h = C('5h4d');
  const cls = P.classify(h, board);
  const r = P.recommendBetting(cls, Object.assign({}, oopCtx, { cls, heroEq: .2, heroPct: .2 }));
  return { best: r.best, s: r.scores, made: cls.made };
})();
console.log('  54o (Air) auf K72r als CO OOP vs BTN-Flat:', r2.made, '->', r2.best, JSON.stringify(r2.s));
ok(r2.best === 'CHECK', 'Air ohne Range-Advantage OOP = Check');

const r2b = rec('3h2d', 'Kc7d2s', dry);
console.log('  32o (Bottom Pair) auf K72r:', r2b.made, '->', r2b.best, JSON.stringify(r2b.s));
ok(r2b.s.CHECK > 60 && r2b.s.BET_S > 60, 'Bottom Pair auf K72r ist ein echter Mix (Check und kleine Bet beide ok)');
ok(r2b.s.BET_L < 30, 'Bottom Pair niemals gross betten');

const r3 = rec('9h9d', 'JhTh8c', wet);
console.log('  99 auf JT8hh:', r3.made, '->', r3.best, JSON.stringify(r3.s));

const r4 = rec('AhQh', 'JhTh8c', wet);
console.log('  AQhh (Nut-FD+GS) auf JT8hh:', r4.made, r4.best, JSON.stringify(r4.s));
ok(r4.best.startsWith('BET'), 'starker Draw auf nassem Board = Bet');
ok(r4.s.BET_L >= r4.s.BET_S, 'auf nassem Board gross >= klein');

const r5 = rec('QhJd', 'JhTh8c', wet);
console.log('  QJ (Top Pair + GS) auf JT8hh:', r5.made, r5.best, JSON.stringify(r5.s));

console.log('\n== Facing-Bet Empfehlungen ==');
function recFace(handStr, boardStr, ctx, toCall, potNow) {
  const board = C(boardStr), h = C(handStr);
  const cls = P.classify(h, board);
  const betPct = toCall / (potNow - toCall);
  const vBet = P.bettingRangeOf(P.parseRange(P.RFI.BTN), board, betPct, ctx);
  const eq = P.equityVsRange(h, vBet, board, 120000).eq;
  const c2 = Object.assign({}, ctx, {
    facing: { toCall, potNow, betPct }, eqVsBettingRange: eq,
    heroEq: eq, heroPct: 0.5, cls
  });
  const r = P.recommendFacing(cls, c2);
  return { best: r.best, s: r.scores, made: cls.made, po: r.potOdds, mdf: r.mdf, eq };
}
const defCtx = ctxFor('Kc7d2s', { hero: P.BB_FLAT.BTN, vill: P.RFI.BTN, ip: false, role: 'CALLER' });
const f1 = recFace('KhQd', 'Kc7d2s', defCtx, 2, 8);
console.log('  KQ (Top Pair) vs 33% Bet:', f1.best, `eq ${(f1.eq * 100).toFixed(0)}% po ${(f1.po * 100).toFixed(0)}% mdf ${(f1.mdf * 100).toFixed(0)}%`, JSON.stringify(f1.s));
ok(Math.abs(f1.po - 0.2) < 0.01, 'Pot Odds bei 2 in 6 = 20%');
ok(Math.abs(f1.mdf - 0.75) < 0.01, 'MDF bei 33% Bet = 75%');
ok(f1.best !== 'FOLD', 'Top Pair vs kleine Bet ist kein Fold');

const f2 = recFace('5h4d', 'Kc7d2s', defCtx, 2, 8);
console.log('  54o (Air) vs 33% Bet:', f2.best, `eq ${(f2.eq * 100).toFixed(0)}%`, JSON.stringify(f2.s));
ok(f2.best === 'FOLD', 'Air vs Bet = Fold');

const f3 = recFace('7h7s', 'Kc7d2s', defCtx, 6, 12);
console.log('  77 (Set) vs Pot-Bet:', f3.best, JSON.stringify(f3.s));
ok(f3.best.startsWith('RAISE'), 'Set vs grosse Bet = Raise');

console.log('\n== Narrowing ==');
const before = P.parseRange(P.BB_FLAT.BTN);
const afterCall = P.narrow(before, C('Kc7d2s'), 'call', { betPct: 0.33, street: 'flop' });
const wBefore = before.reduce((a, x) => a + x.w, 0);
const wAfter = afterCall.reduce((a, x) => a + x.w, 0);
console.log(`  BB-Range Gewicht: ${wBefore.toFixed(0)} -> nach Call ${wAfter.toFixed(0)}`);
ok(wAfter < wBefore * 0.8, 'Range wird durch Call enger');
const bkA = P.rangeBuckets(afterCall, C('Kc7d2s'), []);
const bkB = P.rangeBuckets(before, C('Kc7d2s'), []);
console.log(`  Air-Anteil: ${(bkB.airPct * 100).toFixed(1)}% -> ${(bkA.airPct * 100).toFixed(1)}%`);
ok(bkA.airPct < bkB.airPct, 'Air-Anteil sinkt nach Call');
ok(bkA.strongPct > bkB.strongPct, 'Starke Haende anteilig mehr nach Call');

console.log('\n== Villain-KI laeuft durch ==');
for (let i = 0; i < 40; i++) {
  const board = [];
  const deck = P.fullDeck();
  for (let k = 0; k < 3; k++) board.push(deck.splice((Math.random() * deck.length) | 0, 1)[0]);
  const hole = [deck.pop(), deck.pop()];
  const a = P.villainAct(hole, board, dry, null);
  if (!['CHECK', 'BET_S', 'BET_M', 'BET_L', 'BET_XL'].includes(a)) { ok(false, 'villainAct ungueltig: ' + a); break; }
}
ok(true, 'villainAct liefert 40x gueltige Aktionen');

console.log('\n== Advantage-Signal trennt Boards ==');
{
  const btn2 = P.parseRange(P.RFI.BTN), bb2 = P.parseRange(P.BB_FLAT.BTN);
  const tab = [];
  for (const b of ['AhKd7c', 'Ah7d2c', 'KhQd4c', 'Th8d5c', '7h6d5c', '8h7d6c', 'KhJhTh', '9h5d2c']) {
    const bd = C(b);
    const hB = P.rangeBuckets(btn2, bd, []), vB = P.rangeBuckets(bb2, bd, []);
    const a = P.advantage(hB, vB, P.rangeVsRange(btn2, bb2, bd, 40000));
    tab.push({ b, ra: a.rangeAdv, na: a.nutAdv });
    console.log(`  ${b.padEnd(8)} rangeAdv ${(a.rangeAdv * 100).toFixed(1).padStart(5)}  nutAdv ${(a.nutAdv * 100).toFixed(1).padStart(5)}`);
  }
  const high = tab.find(x => x.b === 'KhQd4c').ra;
  const low = tab.find(x => x.b === '7h6d5c').ra;
  ok(high > low + 0.03, `KQ4 (${(high * 100).toFixed(1)}) deutlich > 765 (${(low * 100).toFixed(1)})`);
  ok(Math.max(...tab.map(x => Math.abs(x.ra))) > 0.04, 'Signal ist stark genug, um Strategie zu steuern');
}

console.log('\n== Draw-Flags ==');
ok(cl('AhQh', 'JhTh8c').hasFD === true, 'AQhh auf JT8hh = Flushdraw');
ok(cl('AhQh', 'JhTh8c').hasOESD === true, 'AQ auf JT8 = Double Gutshot (K und 9)');
ok(cl('AhKd', 'QcTd5s').hasGutshot === true, 'AK auf QT5 = Gutshot (nur J)');
ok(cl('AhQd', 'Jh9h3c').hasBDFD === false, 'offsuit -> kein BDFD');
ok(cl('AhQh', 'Jh9d3c').hasBDFD === true, 'AQhh auf Jh93 = Backdoor-FD');
ok(cl('Ah2h', 'Kh7h3c').hasNutFD === true, 'A2hh auf Kh7h3 = Nut-Flushdraw');
ok(cl('9h8h', 'Kh7h3c').hasNutFD === false, '98hh auf Kh7h3 = kein Nut-FD');
// Der Nut-Draw haengt an den UNGESEHENEN Karten, nicht an den sichtbaren.
// Vorher galt jeder Draw als Nut-Draw, sobald die eigenen Karten die
// hoechsten sichtbaren der Farbe waren -- 69% aller "Nut"-Meldungen falsch.
ok(cl('KhQh', 'Th7h3c').hasNutFD === false, 'KQhh auf Th7h3: Ah ungesehen -> kein Nut-FD');
ok(cl('QhJh', 'Th5h2c').hasNutFD === false, 'QJhh auf Th5h2: Ah und Kh ungesehen -> kein Nut-FD');
ok(cl('Kh2h', 'Ah7h3c').hasNutFD === true, 'K2hh auf Ah7h3: das Ass liegt fuer alle -> Kh ist der Nut-FD');
ok(cl('Qh2h', 'AhKh3c').hasNutFD === true, 'Q2hh auf AhKh3: A und K liegen -> Qh ist der Nut-FD');
ok(cl('2h3d', '9c8d7s').hasOESD === false, '23 auf 987 -> Board-Straight, kein eigener OESD');
ok(cl('Th9d', '8c7d2s').hasOESD === true, 'T9 auf 872 = OESD');

console.log('\n== C-Bet-Frequenz ueber die GANZE Range (der eigentliche Realitaetscheck) ==');
function cbetProfile(boardStr, heroStr, villStr, ip) {
  const board = C(boardStr);
  const hr = P.parseRange(heroStr), vrr = P.parseRange(villStr);
  const ctx = ctxFor(boardStr, { hero: heroStr, vill: villStr, ip });
  let bet = 0, tot = 0, small = 0, big = 0;
  for (const x of hr) {
    if (board.some(b => b === x.c[0] || b === x.c[1])) continue;
    const cls = P.classify(x.c, board);
    const r = P.recommendBetting(cls, Object.assign({}, ctx, {
      cls, heroEq: 0.5, heroPct: 0.5
    }));
    tot += x.w;
    if (r.best !== 'CHECK') {
      bet += x.w;
      if (r.best === 'BET_S') small += x.w; else big += x.w;
    }
  }
  return { freq: bet / tot, smallShare: bet ? small / bet : 0, bigShare: bet ? big / bet : 0 };
}
const cb1 = cbetProfile('Kc7d2s', P.RFI.BTN, P.BB_FLAT.BTN, true);
const cb2 = cbetProfile('7h6d5c', P.RFI.BTN, P.BB_FLAT.BTN, true);
const cb3 = cbetProfile('JhTh8c', P.RFI.BTN, P.BB_FLAT.BTN, true);
const cb4 = cbetProfile('Kc7d2s', P.RFI.CO, P.IP_FLAT.BTN_vs_CO, false);
console.log(`  BTN/BB  K72r  : Bet ${(cb1.freq * 100).toFixed(0)}%  davon klein ${(cb1.smallShare * 100).toFixed(0)}%`);
console.log(`  BTN/BB  765   : Bet ${(cb2.freq * 100).toFixed(0)}%  davon klein ${(cb2.smallShare * 100).toFixed(0)}%`);
console.log(`  BTN/BB  JT8hh : Bet ${(cb3.freq * 100).toFixed(0)}%  davon gross ${(cb3.bigShare * 100).toFixed(0)}%`);
console.log(`  CO OOP  K72r  : Bet ${(cb4.freq * 100).toFixed(0)}%  davon klein ${(cb4.smallShare * 100).toFixed(0)}%`);
ok(cb1.freq > 0.6, 'K72r IP: hohe C-Bet-Frequenz (Solver ~85% klein)');
ok(cb1.smallShare > 0.7, 'K72r: ueberwiegend kleine Sizings');
ok(cb2.freq < cb1.freq, '765 wird deutlich seltener gebettet als K72r');
ok(cb3.bigShare > cb1.bigShare, 'JT8hh nutzt mehr grosse Sizings als K72r');
ok(cb4.freq < cb1.freq, 'OOP wird seltener gebettet als IP');
// Baender, damit eine kuenftige Umkalibrierung nicht unbemerkt entgleist
ok(cb1.freq > 0.80 && cb1.freq <= 1.0, `K72r IP Frequenz im Band 80-100% (${(cb1.freq * 100).toFixed(0)}%)`);
ok(cb2.freq > 0.30 && cb2.freq < 0.75, `765 IP Frequenz im Band 30-75% (${(cb2.freq * 100).toFixed(0)}%)`);
ok(cb3.freq > 0.30 && cb3.freq < 0.70, `JT8hh IP Frequenz im Band 30-70% (${(cb3.freq * 100).toFixed(0)}%)`);
ok(cb4.freq > 0.12 && cb4.freq < 0.60, `K72r OOP Frequenz im Band 12-60% (${(cb4.freq * 100).toFixed(0)}%)`);

console.log('\n== Range-Serialisierung (Fehler-Wiederholung) ==');
{
  const orig = P.parseRange('AA, AKs, 76s:0.5');
  const round = P.unpackRange(P.packRange(orig));
  ok(round.length === orig.length, `Kombo-Zahl erhalten (${orig.length})`);
  const key = x => Math.max(...x.c) * 52 + Math.min(...x.c);
  const mo = new Map(orig.map(x => [key(x), x.w])), mr = new Map(round.map(x => [key(x), x.w]));
  let same = true, maxErr = 0;
  for (const [k, w] of mo) { const e = Math.abs((mr.get(k) ?? -9) - w); maxErr = Math.max(maxErr, e); if (e > 0.015) same = false; }
  ok(same, `Karten und Gewichte erhalten (max. Abweichung ${(maxErr * 100).toFixed(1)}%)`);
  const big = P.narrow(P.parseRange(P.BB_FLAT.BTN), C('Kc7d2s'), 'call', { betPct: .33, street: 'flop' });
  const packed = P.packRange(big);
  ok(packed.length < 6000, `verengte Range kompakt: ${packed.length} Zeichen fuer ${big.length} Kombos`);
  const eqBefore = P.rangeBuckets(big, C('Kc7d2s'), []);
  const eqAfter = P.rangeBuckets(P.unpackRange(packed), C('Kc7d2s'), []);
  ok(Math.abs(eqBefore.strongPct - eqAfter.strongPct) < 0.01, 'Bucket-Verteilung ueberlebt den Roundtrip');
  ok(P.unpackRange('').length === 0 && P.unpackRange(undefined).length === 0, 'leerer String -> leere Range');

  // --- Rueckwaertskompatibilitaet: alte Dezimal-Schnappschuesse muessen weiter lesbar sein
  const legacy = '2702:100,1234:64';
  const lg = P.unpackRange(legacy);
  ok(lg.length === 2, 'altes Format wird noch gelesen');
  ok(lg[0].c[0] === 51 && lg[0].c[1] === 50 && Math.abs(lg[0].w - 1) < 1e-9, 'alte Kombo korrekt dekodiert');
  ok(Math.abs(lg[1].w - 0.64) < 1e-9, 'altes Gewicht korrekt dekodiert');
  const v1 = '1|232:2s,ya:1o';
  const l1 = P.unpackRange(v1);
  ok(l1.length === 2 && Math.abs(l1[0].w - 1) < 1e-9, 'Zwischenformat "1|" wird noch gelesen');
  ok(P.packRange(orig).slice(0, 2) === '2|', 'aktuelles Format ist versioniert');

  // --- Kompaktheit: das entscheidet, ob 500 Spots in den localStorage passen
  const wide = P.parseRange(P.RFI.BTN);
  const packedWide = P.packRange(wide);
  const oldSize = wide.filter(x => x.w >= .02)
    .map(x => (Math.max(...x.c) * 52 + Math.min(...x.c)) + ':' + Math.round(x.w * 100)).join(',').length;
  console.log(`  volle Range: alt ${oldSize} -> neu ${packedWide.length} Zeichen (${Math.round((1 - packedWide.length / oldSize) * 100)}% kleiner)`);
  ok(packedWide.length < oldSize * 0.75, 'neues Format spart mindestens 25%');
  const rtWide = P.unpackRange(packedWide);
  ok(rtWide.length === wide.length, 'volle Range verlustfrei');
  ok(rtWide.every(x => Math.abs(x.w - 1) < 1e-9), 'Gewicht 1 korrekt wiederhergestellt');

  // Realistische Schnappschuss-Groesse bei 500 Eintraegen
  const nb = P.narrow(P.parseRange(P.BB_FLAT.BTN), C('Kc7d2s'), 'call', { betPct: .5, street: 'flop' });
  const snap = JSON.stringify({
    id: 'r1785856535194_1617', ts: Date.now(), box: 1, seen: 0, due: Date.now(),
    spotId: 'bb_vs_btn_def', band: 'mid', street: 'flop', profile: 'station',
    pot: 5.9, eff: 45.8, vChk: false, board: [1, 2, 3], hero: [4, 5], vill: [6, 7],
    hr: P.packRange(P.parseRange(P.RFI.BTN)), vr: P.packRange(nb),
    qMode: 'BET', facing: null, log: [{ who: 'vil', t: 'Preflop: BTN openst auf 2.2bb — du callst.' }],
    picked: 'Bet 130% / All-in', best: 'Check', score: 3
  }).length;
  const totalMB = snap * 500 / 1048576;
  console.log(`  Schnappschuss ${(snap / 1024).toFixed(1)} kB -> 500 Stueck ≈ ${totalMB.toFixed(2)} MB`);
  ok(totalMB < 2.5, `500 Spots passen ins localStorage-Budget (${totalMB.toFixed(2)} MB, Limit ~5 MB)`);
  ok(P.Review.MAX_ITEMS === 500, 'Obergrenze steht auf 500');
  // Der Schnappschuss muss den Spot auch nach der Kompression noch korrekt beschreiben
  const nbRound = P.unpackRange(P.packRange(nb));
  const b1 = P.rangeBuckets(nb, C('Kc7d2s'), []), b2 = P.rangeBuckets(nbRound, C('Kc7d2s'), []);
  ok(Math.abs(b1.strongPct - b2.strongPct) < 0.005 && Math.abs(b1.airPct - b2.airPct) < 0.005,
    `Range-Zusammensetzung unveraendert (stark ${(b1.strongPct * 100).toFixed(1)}% -> ${(b2.strongPct * 100).toFixed(1)}%)`);
  const eq1 = P.equityVsRange(C('AhKd'), nb, C('Kc7d2s'), 120000).eq;
  const eq2 = P.equityVsRange(C('AhKd'), nbRound, C('Kc7d2s'), 120000).eq;
  ok(Math.abs(eq1 - eq2) < 0.01, `Equity gegen die Range unveraendert (${(eq1 * 100).toFixed(1)}% -> ${(eq2 * 100).toFixed(1)}%)`);
}

console.log('\n== Gegnertypen ==');
{
  const board = C('Kc7d2s');
  const baseCtx = ctxFor('Kc7d2s', { hero: P.RFI.BTN, vill: P.BB_FLAT.BTN, ip: true });
  function recP(handStr, profKey) {
    const h = C(handStr), cls = P.classify(h, board);
    const ctx = Object.assign({}, baseCtx, {
      cls, heroEq: .5, heroPct: .5,
      profile: P.PROFILES[profKey], actorIsProfiled: false
    });
    return P.recommendBetting(cls, ctx);
  }
  // Value-Hand: gegen die Station oefter und groesser betten
  const vReg = recP('KhQd', 'reg'), vSta = recP('KhQd', 'station'), vNit = recP('KhQd', 'nit');
  console.log('  Top Pair  reg:', vReg.best, ' station:', vSta.best, ' nit:', vNit.best);
  ok(vSta.A > vReg.A, `Value gegen Station aggressiver (A ${vReg.A.toFixed(2)} -> ${vSta.A.toFixed(2)})`);
  ok(vSta.Pol > vReg.Pol, `Value gegen Station groessere Sizings (Pol ${vReg.Pol.toFixed(2)} -> ${vSta.Pol.toFixed(2)})`);
  ok(vNit.A < vReg.A, 'duenner Value gegen Nit zurueckfahren');
  // Bluff: gegen Station streichen, gegen Nit ausbauen
  const bReg = recP('5h4d', 'reg'), bSta = recP('5h4d', 'station'), bNit = recP('5h4d', 'nit');
  console.log('  Air       reg:', bReg.best, ' station:', bSta.best, ' nit:', bNit.best);
  ok(bSta.A < bReg.A, `Bluff gegen Station reduziert (A ${bReg.A.toFixed(2)} -> ${bSta.A.toFixed(2)})`);
  ok(bNit.A > bReg.A, `Bluff gegen Nit ausgebaut (A ${bReg.A.toFixed(2)} -> ${bNit.A.toFixed(2)})`);

  // Kernmechanik: seine Bet-Range wird echt staerker/schwaecher
  function eqVsBet(profKey) {
    const vr2 = P.parseRange(P.RFI.BTN);
    const br = P.bettingRangeOf(vr2, board, 0.55, baseCtx, P.PROFILES[profKey]);
    return { eq: P.equityVsRange(C('QhJd'), br, board, 120000).eq, n: br.reduce((a, x) => a + x.w, 0) };
  }
  const eReg = eqVsBet('reg'), eSta = eqVsBet('station'), eLag = eqVsBet('lag');
  console.log(`  QJ-Equity gegen seine Bet-Range: reg ${(eReg.eq * 100).toFixed(0)}% | station ${(eSta.eq * 100).toFixed(0)}% | maniac ${(eLag.eq * 100).toFixed(0)}%`);
  ok(eSta.eq < eReg.eq - 0.02, 'gegen Station ist seine Bet-Range staerker -> weniger Equity');
  ok(eLag.eq > eReg.eq + 0.02, 'gegen Maniac ist seine Bet-Range schwaecher -> mehr Equity');
  ok(eSta.n < eReg.n && eLag.n > eReg.n, 'Bet-Range-Groesse skaliert mit dem Bluff-Anteil');

  // Bluffcatcher gegen Station: Fold muss attraktiver werden
  function face(profKey) {
    const cls = P.classify(C('QhJd'), board);
    const br = P.bettingRangeOf(P.parseRange(P.RFI.BTN), board, 0.55, baseCtx, P.PROFILES[profKey]);
    const ctx = Object.assign({}, baseCtx, {
      cls, heroIP: false, facing: { toCall: 3.3, potNow: 9.2, betPct: .55 },
      eqVsBettingRange: P.equityVsRange(C('QhJd'), br, board, 120000).eq,
      profile: P.PROFILES[profKey], actorIsProfiled: false
    });
    return P.recommendFacing(cls, ctx);
  }
  const fReg = face('reg'), fSta = face('station'), fLag = face('lag');
  console.log('  QJ vs 55%-Bet  reg:', fReg.best, '| station:', fSta.best, '| maniac:', fLag.best);
  ok(fSta.scores.FOLD > fReg.scores.FOLD, `gegen Station oefter folden (${fReg.scores.FOLD} -> ${fSta.scores.FOLD})`);
  ok(fLag.scores.CALL >= fReg.scores.CALL, 'gegen Maniac mindestens so oft callen');

  // Der Gegner selbst spielt gemaess Profil
  function villFreq(profKey) {
    const vr2 = P.parseRange(P.RFI.BTN);
    let bet = 0, tot = 0;
    for (const x of vr2) {
      if (board.some(b => b === x.c[0] || b === x.c[1])) continue;
      const cls = P.classify(x.c, board);
      const d = P.handDrive(cls, Object.assign({}, baseCtx, {
        profile: P.PROFILES[profKey], actorIsProfiled: true
      }));
      tot++; if (d.A > 0.335) bet++;
    }
    return bet / tot;
  }
  const fr = { reg: villFreq('reg'), station: villFreq('station'), nit: villFreq('nit'), lag: villFreq('lag') };
  console.log('  Seine Bet-Frequenz:', Object.entries(fr).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' | '));
  ok(fr.station < fr.reg && fr.nit < fr.reg, 'Station und Nit betten seltener als ein Reg');
  ok(fr.lag > fr.reg, 'Maniac bettet oefter als ein Reg');

  // Reg darf sich nicht von der Baseline unterscheiden
  const noProf = P.recommendBetting(P.classify(C('KhQd'), board),
    Object.assign({}, baseCtx, { cls: P.classify(C('KhQd'), board), heroEq: .5, heroPct: .5 }));
  ok(Math.abs(noProf.A - vReg.A) < 1e-9, 'Profil "Reg" ist exakt die Baseline');
}

console.log('\n== Spaced Repetition (Leitner) ==');
{
  const RV = P.Review, DAY = RV.DAY, T0 = 1700000000000;
  const mk = (id, box, due) => ({ id, box, due, seen: 0 });

  // Faelligkeit
  const items = [mk('a', 1, T0 - 1000), mk('b', 1, T0 + DAY), mk('c', 1, T0 - 5000)];
  const d = RV.due(items, T0);
  ok(d.length === 2, `nur faellige Eintraege (${d.length} von 3)`);
  ok(d[0].id === 'c', 'aelteste Faelligkeit zuerst');
  ok(RV.due([], T0).length === 0, 'leere Liste ok');
  ok(RV.due([{ id: 'x' }], T0).length === 1, 'Eintrag ohne due gilt als faellig');

  // Richtig -> Box hoch, Intervall waechst
  let it = mk('r', 1, 0);
  const seq = [];
  for (let i = 0; i < 6; i++) { RV.schedule(it, true, T0); seq.push([it.box, +((it.due - T0) / DAY).toFixed(3)]); }
  console.log('  richtig x6 (Box, Tage):', JSON.stringify(seq));
  ok(seq[0][0] === 2 && seq[1][0] === 3 && seq[2][0] === 4 && seq[3][0] === 5, 'Boxen steigen 2,3,4,5');
  ok(seq[4][0] === 5 && seq[5][0] === 5, 'Box 5 ist die Obergrenze');
  ok(seq[0][1] === 1 && seq[1][1] === 3 && seq[2][1] === 7 && seq[3][1] === 21, 'Intervalle 1/3/7/21 Tage');
  ok(seq.every((s, i) => i === 0 || s[1] >= seq[i - 1][1]), 'Intervalle werden nie kuerzer');
  ok(it.seen === 6, 'seen mitgezaehlt');

  // Falsch -> zurueck auf Box 1 mit kurzem Intervall
  let it2 = mk('w', 4, 0);
  RV.schedule(it2, false, T0);
  ok(it2.box === 1, 'falsch -> Box 1');
  ok(Math.abs(it2.due - T0 - 0.003 * DAY) < 1, `Box 1 ist kurz (${((it2.due - T0) / 60000).toFixed(1)} min)`);
  ok((it2.due - T0) > 60000, 'aber nicht sofort — sonst erinnerst du nur die Antwort');

  // applyResult: gemeistert
  const store = { items: [mk('m', 5, 0), mk('n', 2, 0)] };
  const r1 = RV.applyResult(store, store.items[0], true, T0);
  ok(r1.mastered === true, 'Box 5 + richtig = gemeistert');
  ok(store.items.length === 1 && !store.items.some(x => x.id === 'm'), 'gemeisterter Eintrag entfernt');
  const nRef = store.items[0];
  const r2 = RV.applyResult(store, nRef, true, T0);
  ok(r2.mastered === false && nRef.box === 3, 'Box 2 + richtig -> Box 3, bleibt in der Liste');
  const r3 = RV.applyResult(store, nRef, false, T0);
  ok(r3.mastered === false && nRef.box === 1, 'danach falsch -> zurueck auf Box 1');
  ok(store.items.length === 1, 'Liste unveraendert gross');
  // Box 5 + FALSCH darf nicht als gemeistert gelten
  const store2 = { items: [mk('z', 5, 0)] };
  const r4 = RV.applyResult(store2, store2.items[0], false, T0);
  ok(r4.mastered === false && store2.items.length === 1 && store2.items[0].box === 1,
    'Box 5 + falsch = kein Meistern, zurueck auf Box 1');

  // Budget
  const N = RV.MAX_ITEMS + 20;
  const big = { items: [] };
  for (let i = 0; i < N; i++) big.items.push(mk('i' + i, 1, 0));
  RV.trim(big);
  ok(big.items.length === RV.MAX_ITEMS, `Liste auf ${RV.MAX_ITEMS} begrenzt`);
  ok(big.items[big.items.length - 1].id === 'i' + (N - 1), 'die neuesten Fehler bleiben erhalten');
  ok(big.items[0].id === 'i20', 'die aeltesten fallen raus');
  const exact = { items: [] };
  for (let i = 0; i < RV.MAX_ITEMS; i++) exact.items.push(mk('e' + i, 1, 0));
  RV.trim(exact);
  ok(exact.items.length === RV.MAX_ITEMS && exact.items[0].id === 'e0', 'genau am Limit wird nichts verworfen');

  // Realistischer Verlauf: 5x richtig in Folge meistert einen Eintrag
  const st3 = { items: [mk('p', 1, 0)] };
  let now = T0, guard = 0;
  while (st3.items.length && guard++ < 20) {
    const item = st3.items[0];
    const res = RV.applyResult(st3, item, true, now);
    now = item.due + 1;
    if (res.mastered) break;
  }
  ok(st3.items.length === 0, `nach ${guard} korrekten Wiederholungen gemeistert`);
  ok(guard === 5, 'genau 5 richtige Antworten noetig (Box 1->5)');
}

/* ===================== Hand-Steckbriefe ===================== */
{
  const H = P.HandProfile;
  const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: ${a.toFixed(2)} (erwartet ${b} ±${tol})`);

  console.log('\n== Steckbrief: Handklassen & Archetypen ==');
  ok(H.allHandClasses().length === 169, '169 Handklassen');
  ok(new Set(H.allHandClasses()).size === 169, 'alle Handklassen verschieden');
  ok(H.allHandClasses().filter(h => h.length === 2).length === 13, '13 Pocket-Paare');
  ok(H.allHandClasses().filter(h => h[2] === 's').length === 78, '78 suited');
  ok(H.allHandClasses().filter(h => h[2] === 'o').length === 78, '78 offsuit');
  for (const hc of H.allHandClasses()) {
    if (!H.ARCHETYPES[H.archetypeOf(hc)]) { ok(false, `Archetyp fehlt fuer ${hc}`); break; }
  }
  ok(H.allHandClasses().every(hc => H.ARCHETYPES[H.archetypeOf(hc)]), 'jede Hand hat einen Archetyp');
  ok(H.archetypeOf('AKs') === 'bw_s' && H.archetypeOf('AKo') === 'bw_o', 'AK -> Broadway');
  ok(H.archetypeOf('A5s') === 'ax_s' && H.archetypeOf('76s') === 'sc', 'A5s -> Suited Ace, 76s -> Connector');
  ok(H.archetypeOf('QQ') === 'pp_hi' && H.archetypeOf('88') === 'pp_mid' && H.archetypeOf('33') === 'pp_low',
    'Pockets nach Tier getrennt');
  // Die kanonische Kombo muss die Klasse zurueckgeben, sonst waere die
  // gesamte Enumeration fuer die falsche Hand gerechnet.
  ok(H.allHandClasses().every(hc => P.handClassOf(H.canonicalCombo(hc)) === hc),
    'canonicalCombo bildet jede Klasse korrekt ab');

  console.log('\n== Steckbrief: Trefferklassen (eigene Karten zaehlen) ==');
  function hitOf(hand, board) {
    const hole = C(hand), b = C(board);
    const hr = [P.rankOf(hole[0]), P.rankOf(hole[1])].sort((x, y) => y - x);
    const bc = {}; b.forEach(c => bc[P.rankOf(c)] = (bc[P.rankOf(c)] || 0) + 1);
    const br = [...new Set(b.map(P.rankOf))].sort((x, y) => y - x);
    return H.flopHit(hr, br, bc, P.classify(hole, b));
  }
  // Der Kern der Konvention: ein Board-Paar hat jeder, es ist kein Treffer.
  ok(hitOf('AhKd', '7d7s2c') === 'air', 'AK auf 772 = kein eigener Treffer (Showdown: Paar 7er)');
  ok(hitOf('JhJd', '7d7s2c') === 'overpair', 'JJ auf 772 = Overpair (Showdown: Two Pair)');
  ok(hitOf('JhJd', 'KdKs2c') === 'weakpair', 'JJ unter KK = schwaches Paar');
  ok(hitOf('7h6h', '5c5d5h') === 'air', '76 auf 555 = kein eigener Treffer (Board-Trips)');
  ok(hitOf('AhKd', 'Kc7s7h') === 'tptk', 'AK auf K77 = Top Pair, nicht Two Pair');
  ok(hitOf('KhQd', 'KcQs2h') === 'monster', 'KQ auf KQ2 = echte Two Pair');
  ok(hitOf('7h7d', 'Kc7s2h') === 'monster', '77 auf K72 = Set');
  ok(hitOf('AhKd', 'Kc7d2s') === 'tptk' && hitOf('Ah5d', 'Ac7d2s') === 'toppair', 'Kicker unterschieden');
  ok(hitOf('AhAd', 'Kc7s2h') === 'overpair', 'AA auf K72 = Overpair');
  ok(hitOf('5h4d', 'Ac3s2h') === 'monster', '54 auf A32 = Rad-Straight');
  ok(hitOf('AhKh', 'Qh7h2c') === 'draw' && hitOf('AhKd', 'QcJs2h') === 'gutshot', 'Draws vs Gutshot');

  console.log('\n== Steckbrief: Trefferverteilung (volle Enumeration) ==');
  const vr = P.parseRange(P.BB_FLAT.BTN);
  const ak = H.flopStats('AKo', { villRange: vr, sample: 400 });
  ok(ak.total === 19600, `alle ${ak.total} Flops enumeriert`);
  ok(Math.abs(ak.hits.reduce((a, h) => a + h.pct, 0) - 1) < 1e-9, 'Trefferklassen summieren auf 100%');
  // Referenz: P(kein A und kein K im Flop) = C(44,3)/C(50,3) -> Paar+ = 32.43%
  near(ak.strongPlus * 100, 32.8, 0.3, 'AKo trifft Top Pair+ in ~32.8% (Paar 32.4% + Straights)');
  near(ak.hits.find(h => h.key === 'air').pct * 100, 56.0, 0.5, 'AKo trifft in 56% gar nichts');
  ok(ak.draws.oesd === 0, 'AKo kann keinen OESD floppen (ueber dem Ass ist nichts)');
  const aks = H.flopStats('AKs', { sample: 0 });
  near(aks.draws.fd * 100, 10.9, 0.2, 'AKs floppt Flushdraw in 10.9%');
  near(aks.draws.nutfd * 100, 10.9, 0.2, 'AKs: jeder Flushdraw ist der Nut-Flushdraw');
  const jj = H.flopStats('JJ', { sample: 0 });
  near(jj.hits.find(h => h.key === 'monster').pct * 100, 12.0, 0.3, 'JJ floppt Set in ~11.8%');
  ok(jj.pairPlus === 1, 'ein Pocket-Paar hat immer mindestens ein Paar');
  ok(jj.hits.find(h => h.key === 'toppair').pct === 0, 'ein Pocket-Paar floppt nie "Top Pair"');
  const p22 = H.flopStats('22', { sample: 0 });
  near(p22.hits.find(h => h.key === 'monster').pct * 100, 12.0, 0.3, '22 floppt Set in ~11.8%');
  ok(p22.hits.find(h => h.key === 'overpair').pct === 0, '22 kann nie ein Overpair sein');
  ok(H.flopStats('76s', { sample: 0 }).draws.oesd > 0.09, '76s floppt OESD in ueber 9%');
  ok(ak.buckets.reduce((a, b) => a + b.n, 0) === 19600, 'Board-Buckets decken alle Flops ab');
  ok(ak.buckets.every(b => b.relAvg === null || (b.relAvg >= 0 && b.relAvg <= 1)), 'relative Staerke in [0,1]');

  console.log('\n== Steckbrief: Gegenrechnung in geschlossener Form ==');
  // Die Enumeration wird gegen von Hand hergeleitete Kombinatorik geprueft.
  // Diese Formeln benutzen bewusst nichts aus der Engine — ein Fehler dort
  // wuerde sonst denselben Fehler in der Pruefung erzeugen.
  {
    const Cb = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); };
    const F = Cb(50, 3), PAIRS = Cb(50, 2);
    ok(F === 19600 && PAIRS === 1225, `C(50,3)=${F}, C(50,2)=${PAIRS}`);
    const exact = (label, formulaPct, actualPct) =>
      ok(Math.abs(formulaPct - actualPct) < 0.002, `${label}: Formel ${formulaPct.toFixed(3)}% = App ${actualPct.toFixed(3)}%`);

    const ako = H.flopStats('AKo', { sample: 0 }), aks = H.flopStats('AKs', { sample: 0 });
    const jj = H.flopStats('JJ', { sample: 0 });
    const p = (s, k) => s.hits.find(h => h.key === k).pct * 100;

    // AK paart A oder K = Gegenwahrscheinlichkeit ueber die 44 Karten,
    // die weder Ass noch Koenig sind. Die Straight QJT zaehlt separat.
    exact('AK paart A oder K = 1-C(44,3)/C(50,3)', (1 - Cb(44, 3) / F) * 100,
      p(ako, 'tptk') + p(ako, 'toppair') + p(ako, 'monster') - 64 / F * 100);
    // Monster bei AKo, vollstaendig aufgeschluesselt:
    //   Two Pair   ein A + ein K + Beikarte      3*3*44 = 396
    //   Trips      zwei A oder zwei K + Beikarte 2*3*44 = 264
    //   Full House zwei A + ein K bzw. umgekehrt 2*3*3  =  18   <- leicht zu vergessen
    //   Quads      drei A oder drei K            2*1    =   2
    //   Straight   nur QJT                       4^3    =  64
    exact('AKo Monster = (396+264+18+2+64)/C(50,3)', (396 + 264 + 18 + 2 + 64) / F * 100, p(ako, 'monster'));
    // AKs zusaetzlich: C(11,3) Flushes, aber der Royal QJT in eigener Farbe
    // ist schon als Straight gezaehlt und darf nicht doppelt zaehlen.
    exact('AKs Monster = AKo + C(11,3) - 1 (Royal nicht doppelt)',
      (396 + 264 + 18 + 2 + 64 + Cb(11, 3) - 1) / F * 100, p(aks, 'monster'));
    exact('AKs Flushdraw = C(11,2)*39/C(50,3)', Cb(11, 2) * 39 / F * 100, aks.draws.fd * 100);
    exact('Pocket Pair Set = 1-C(48,3)/C(50,3)', (1 - Cb(48, 3) / F) * 100,
      p(jj, 'monster') - 12 * Cb(4, 3) / F * 100);
    exact('JJ Overpair = (C(36,3)-9*C(4,3))/C(50,3)', (Cb(36, 3) - 9 * Cb(4, 3)) / F * 100, p(jj, 'overpair'));
    exact('AKo dominiert = 2*3*44/C(50,2)', 2 * 3 * 44 / PAIRS * 100, H.dominance('AKo').domPct * 100);
    exact('JJ dominiert von = 3*C(4,2)/C(50,2)', 3 * 6 / PAIRS * 100, H.dominance('JJ').domByPct * 100);
    exact('JJ vs zwei Overcards = (C(12,2)-3*C(4,2))/C(50,2)',
      (Cb(12, 2) - 3 * Cb(4, 2)) / PAIRS * 100, H.dominance('JJ').twoOverPct * 100);
    // Merkposten: 43% ist die Wahrscheinlichkeit fuer KEINE Ueberkarte.
    // Mindestens eine Ueberkarte sieht JJ in 57% der Flops.
    const keine = Cb(38, 3) / F * 100;
    ok(Math.abs(keine - 43.04) < 0.05 && Math.abs(100 - keine - 56.96) < 0.05,
      `JJ: keine Ueberkarte ${keine.toFixed(1)}%, mindestens eine ${(100 - keine).toFixed(1)}%`);
    ok(ako.draws.oesd === 0 && aks.draws.oesd === 0,
      'AK kann nie einen OESD floppen — ueber dem Ass liegt nichts');
  }

  console.log('\n== Steckbrief: Staerke gegen ganze Range vs. Top-Anteil ==');
  {
    const b = C('Kc7d2s');
    const sp = h => H.strengthSplit(C(h), vr, b, P.evaluate(C(h).concat(b)));
    const ak = sp('AhKd'), q9 = sp('Qh9d'), aa = sp('AhAd');
    ok(ak.all > 0.8, `AK auf K72 schlaegt die ganze Range zu ${(ak.all * 100).toFixed(0)}%`);
    ok(ak.top < ak.all, `gegen sein staerkstes Viertel deutlich weniger (${(ak.top * 100).toFixed(0)}%)`);
    ok(q9.all < ak.all && q9.top < ak.top, 'Q9 high steht schlechter da als AK mit Top Pair');
    // Kontraintuitiv, aber korrekt: AA steht auf K72 gegen sein staerkstes
    // Viertel SCHLECHTER da als AK. Grund ist Card Removal — der Koenig in
    // AK blockt seine K7/K2, er haelt dann nur 7 statt 11 Two-Pair-Kombos.
    // Die Zahlen sind also pro Hand auf DEINE Blocker konditioniert und
    // zwischen zwei Haenden nur eingeschraenkt vergleichbar.
    ok(aa.top < ak.top, `Blocker-Effekt: AA ${(aa.top * 100).toFixed(0)}% < AK ${(ak.top * 100).toFixed(0)}% (AK blockt seine Two Pair)`);
    ok(aa.top > 0.8, 'AA bleibt trotzdem klar vorne');
    ok([ak, q9, aa].every(x => x.all >= 0 && x.all <= 1 && x.top >= 0 && x.top <= 1), 'beide Werte in [0,1]');
    // Konsistenz mit der Engine-Funktion, die dasselbe fuer die ganze Range rechnet
    const ref = P.relativeStrength(C('AhKd'), vr, b).pct;
    ok(Math.abs(ak.all - ref) < 1e-9, `deckt sich mit relativeStrength (${ak.all.toFixed(4)} vs ${ref.toFixed(4)})`);
  }
  // Die Falle muss bei einer dominierten Hand greifen und bei AK nicht.
  {
    const k5 = H.flopStats('K5o', { villRange: vr, sample: 500 });
    ok(k5.trapPct !== null, 'trapPct wird berechnet');
    ok(k5.trapPct > 0, `K5o: in ${(k5.trapPct * 100).toFixed(0)}% der Treffer trotzdem hinten`);
    ok(k5.traps.length > 0 && k5.traps.every(t => t.top < 0.5), 'Fallen sind alle unter 50% gegen den Top-Anteil');
    ok(ak.trapPct < k5.trapPct, `AKo faellt seltener in die Falle als K5o (${(ak.trapPct * 100).toFixed(0)}% vs ${(k5.trapPct * 100).toFixed(0)}%)`);
    ok(ak.buckets.every(b => b.topAvg === null || b.topAvg <= b.relAvg + 1e-9),
      'gegen den Top-Anteil steht man nie besser da als gegen die ganze Range');
  }

  console.log('\n== Steckbrief: Dominanz ==');
  const dAK = H.dominance('AKo');
  ok(dAK.tot === 1225, `alle C(50,2)=1225 Gegner-Kombos geprueft (${dAK.tot})`);
  // 3 Asse x 44 Nicht-A/K-Karten + 3 Koenige x 44 = 264 von 1225
  ok(dAK.dom === 264, `AKo dominiert exakt 264 Kombos (${dAK.dom}) = ${(dAK.domPct * 100).toFixed(1)}%`);
  ok(dAK.domPct < 0.25, 'AKo dominiert ~22%, NICHT ~90% — genau der Denkfehler, um den es geht');
  ok(dAK.domBy < dAK.dom, 'AKo wird selten dominiert');
  const d22 = H.dominance('22');
  ok(d22.twoOverPct > 0.8, `22 ist gegen ${(d22.twoOverPct * 100).toFixed(0)}% aller Kombos ein Flip`);
  ok(H.dominance('AA').domBy === 0, 'AA wird von nichts dominiert');
  ok(H.dominance('AA').twoOverPct === 0, 'gegen AA gibt es keine zwei Overcards');

  console.log('\n== Steckbrief: Preflop-Equity ==');
  const rnd = P.parseRange(H.ALL_HANDS);
  ok(rnd.length === 1326, `ALL_HANDS deckt alle 1326 Kombos ab (${rnd.length})`);
  const eq = hc => H.preflopEquity(H.canonicalCombo(hc), rnd, 30000) * 100;
  near(eq('AA'), 85.3, 1.0, 'AA vs Zufallshand ~85%');
  near(eq('AKs'), 67.0, 1.0, 'AKs vs Zufallshand ~67%');
  near(eq('AKo'), 65.4, 1.0, 'AKo vs Zufallshand ~65%');
  near(eq('22'), 50.3, 1.0, '22 vs Zufallshand ~50%');
  ok(eq('AKs') > eq('AKo'), 'suited schlaegt offsuit');

  console.log('\n== Steckbrief: Push/Fold-EV ==');
  const cache = {};
  const evOf = (hc, spotKey, stack) => {
    const spot = H.SHOVE_SPOTS.find(s => s.key === spotKey);
    return H.shoveEV(hc, spot, stack, cache).ev;
  };
  ok(evOf('AA', 'sb', 10) > evOf('AKo', 'sb', 10), 'AA shovt besser als AK');
  ok(evOf('AKo', 'sb', 10) > evOf('76s', 'sb', 10), 'AK shovt besser als 76s');
  ok(evOf('72o', 'co', 20) < 0, '72o mit 20bb aus dem CO ist ein Fold');
  // Nachgerechnet mit der hergeleiteten Call-Range (BB callt 43% bei 10bb):
  // 0.57 * 2.5 + 0.43 * (0.85 * 21 - 10 + 0.5) = 1.43 + 3.59 = 5.02
  near(evOf('AA', 'sb', 10), 5.02, 0.35, 'AA-Shove SB 10bb');
  // Die Call-Ranges muessen aus den Pot Odds folgen, nicht gesetzt sein.
  // Kontrolle der Form: gegen einen 55%-Shove callt der BB im Gleichgewicht
  // mit jedem Ass und jedem Koenig — Verbundenheit zaehlt im All-in nicht,
  // weil es kein Postflop gibt. Genau das war in der ersten Fassung falsch.
  {
    const bb10 = P.parseRange(H.CALL_VS_SHOVE[10].BB);
    const cls = new Set(bb10.map(x => P.handClassOf(x.c)));
    ok(cls.has('A2o') && cls.has('K2o') && cls.has('A2s') && cls.has('K2s'),
      'BB callt bei 10bb jedes Ass und jeden Koenig');
    ok(bb10.length / 1326 > 0.38 && bb10.length / 1326 < 0.48,
      `BB-Call bei 10bb liegt bei ${(bb10.length / 1326 * 100).toFixed(1)}% (Nash-Groessenordnung 40-45%)`);
    // Call-Frequenz muss mit steigendem Stack fallen (Pot Odds werden schlechter).
    const w = s => P.parseRange(H.CALL_VS_SHOVE[s].BB).length;
    ok(w(10) > w(15) && w(15) > w(20), `Call-Range wird mit tieferem Stack enger (${w(10)}/${w(15)}/${w(20)} Kombos)`);
    // Und aus frueher Position enger als aus dem BB.
    for (const s of [10, 15, 20]) {
      const a = P.parseRange(H.CALL_VS_SHOVE[s].BB).length;
      const b = P.parseRange(H.CALL_VS_SHOVE[s].OTHER).length;
      if (!(a > b)) { ok(false, `${s}bb: BB muesste weiter callen als OTHER`); break; }
    }
    ok([10, 15, 20].every(s => P.parseRange(H.CALL_VS_SHOVE[s].BB).length > P.parseRange(H.CALL_VS_SHOVE[s].OTHER).length),
      'BB callt auf jeder Stackgroesse weiter als eine fruehe Position');
    // Die schlechteste Hand im Deck muss beim 10bb-SB-Shove an der Grenze liegen.
    ok(Math.abs(evOf('72o', 'sb', 10)) < 0.35,
      `72o-Shove SB 10bb liegt an der Nash-Grenze (${evOf('72o', 'sb', 10).toFixed(2)}bb)`);
  }
  // Obergrenze: mehr als Stack + totes Geld kann man nie gewinnen.
  ok(H.SHOVE_SPOTS.every(sp => H.SHOVE_STACKS.every(st =>
    H.shoveEV('AA', sp, st, cache).ev < st + 3)), 'EV bleibt unter Stack + totem Geld');
  // Bei jeder Hand ist Fold-Equity das Minimum, wenn niemand callt.
  const noCall = H.shoveEV('72o', H.SHOVE_SPOTS[0], 10, cache);
  ok(noCall.foldPct > 0 && noCall.foldPct < 1, `Fold-Wahrscheinlichkeit plausibel (${(noCall.foldPct * 100).toFixed(0)}%)`);
  // Buchhaltung: der eigene geposte Blind muss zurueckkommen. SB shovt, alle
  // folden -> genau Ante + BB + eigener SB = 1 + 1 + 0.5 = 2.5bb.
  const sbSpot = H.SHOVE_SPOTS.find(s => s.key === 'sb');
  const cacheZero = { 'BB|10': { range: [] } };
  const zero = H.shoveEV('72o', sbSpot, 10, cacheZero);
  near(zero.ev, 2.5, 0.001, 'SB-Shove ohne Caller = Ante + BB + eigener Blind');
  const btnSpot = H.SHOVE_SPOTS.find(s => s.key === 'btn');
  const z2 = H.shoveEV('72o', btnSpot, 10, { 'SB|10': { range: [] }, 'BB|10': { range: [] } });
  near(z2.ev, 2.5, 0.001, 'BTN-Shove ohne Caller = Ante + SB + BB');
}

/* ===================== Trainingsplan ===================== */
{
  const PL = P.Plan;
  console.log('\n== Plan: Zeitrechnung ==');
  ok(PL.DAYS === 35, '35 Tage (fuenf Wochen)');
  ok(PL.WEEKS.length === 5 && PL.DAYS === PL.WEEKS.length * 7, '5 Wochen a 7 Tage decken den Plan genau ab');
  ok(PL.dateOf(0) === PL.PLAN_START && PL.PLAN_START === '2026-10-08', `Tag 0 = Planstart 08.10. (${PL.dateOf(0)})`);
  ok(PL.dateOf(34) === '2026-11-11', `letzter Plantag = 11.11. (${PL.dateOf(34)}) — Tag nach dem Satellite`);
  ok(PL.TARGET.start === '2026-11-14', 'Countdown zielt auf den Flight am 14.11.');
  ok(PL.TARGET.gtd === 1000000 && PL.TARGET.buyIn === 550, 'CAPT Million: €550, €1M GTD');
  // Wochentage aus casinos.at: Satellite ist ein "Dienstagsturnier", der Flight ein Samstag.
  const dow = iso => new Date(PL.toUTC(iso)).getUTCDay();
  ok(dow(PL.EVENTS[0].date) === 2, 'Satellite 10.11. ist ein Dienstag');
  ok(dow(PL.EVENTS[1].date) === 6, 'Flight 14.11. ist ein Samstag');
  ok(PL.EVENTS[0].stack === 18000, 'Satellite-Stack inklusive Gold Bonus (15.000 + 3.000)');
  const isos = []; for (let i = 0; i < PL.DAYS; i++) isos.push(PL.dateOf(i));
  ok(new Set(isos).size === PL.DAYS, 'alle Daten verschieden');
  // Im Plan liegt der 25.10. (Ende der Sommerzeit) — genau dort darf kein Tag doppelt oder verloren sein.
  ok(isos.every((d, i) => i === 0 || PL.toUTC(d) - PL.toUTC(isos[i - 1]) === 86400000),
    'exakt ein Tag Abstand zwischen allen Eintraegen, auch ueber den 25.10.');
  ok(isos.includes('2026-10-25') && isos.includes('2026-10-26'), 'Sommerzeit-Wechsel liegt im Plan');
  ok(PL.dayIndex('2026-10-08T23:30:00') === 0, 'spaeter Abend am Starttag ist noch Tag 0');
  ok(PL.dayIndex('2026-10-09T00:30:00') === 1, 'nach Mitternacht ist es Tag 1');
  ok(PL.dayIndex('2026-10-26T12:00:00') === 18, 'Tag nach der Zeitumstellung hat den richtigen Index');
  ok(PL.dayIndex('2026-10-07') === null && PL.dayIndex('2026-11-12') === null,
    'ausserhalb des Zeitraums kein Tagesindex');
  ok(PL.daysUntilTarget('2026-10-08') === 37, `37 Tage bis zum Flight (${PL.daysUntilTarget('2026-10-08')})`);
  ok(PL.daysUntil(PL.EVENTS[0].date, '2026-10-08') === 33, '33 Tage bis zum Satellite');

  console.log('\n== Plan: Re-Entry-Regel ==');
  const R = PL.REENTRY;
  ok(R.maxBigBlind === 720, `25bb mit 18.000 Chips = Big Blind 720 (${R.maxBigBlind})`);
  ok(Math.abs(R.rakeSat - 1 / 6) < 1e-9 && Math.abs(R.rakeMain - 1 / 11) < 1e-9, 'Rake 16,7 % im Satellite, 9,1 % im Flight');

  console.log('\n== Plan: Einheiten ==');
  const seen = {};
  for (let i = 0; i < PL.DAYS; i++) {
    const s = PL.sessionFor(i, []);
    if (!s.week || !s.type || s.hands.length !== 2) { ok(false, `Tag ${i} unvollstaendig`); break; }
    if (s.hands.some(h => !P.HandProfile.ARCHETYPES[P.HandProfile.archetypeOf(h)])) {
      ok(false, `Tag ${i}: unbekannte Handklasse ${s.hands}`); break;
    }
    seen[s.type.key] = (seen[s.type.key] || 0) + 1;
  }
  ok(true, 'alle 35 Einheiten sind vollstaendig und nennen gueltige Handklassen');
  ok(Object.keys(seen).length >= 5, `mehrere Tagesformen im Einsatz (${Object.keys(seen).join(', ')})`);
  ok(seen.event === 1, 'genau ein Turniertag im Plan (der Satellite)');
  const satDay = PL.sessionFor(33, []);
  ok(satDay.iso === '2026-11-10' && satDay.event && satDay.event.key === 'sat' && satDay.type.key === 'event',
    'am 10.11. ersetzt der Satellite-Tag die normale Tagesform');
  ok(satDay.type.blocks.some(b => b[1].indexOf('720') >= 0), 'Satellite-Tag nennt die Re-Entry-Grenze');
  ok(PL.sessionFor(0, []).week.n === 1 && PL.sessionFor(34, []).week.n === 5, 'Woche 1 am Anfang, Woche 5 am Ende');
  // Schnelle Level: der Plan beginnt unter 20bb, nicht mit tiefen Stacks.
  ok(PL.WEEKS[0].cfg.stacks.join() === 'push', 'Woche 1 nur Push/Fold-Band');
  ok(PL.WEEKS.slice(0, 4).every(w => !w.cfg.stacks.includes('deep')), 'bis zur Generalprobe keine tiefen Stacks');
  ok(PL.WEEKS[1].cfg.tags.includes('MW') && PL.WEEKS[4].cfg.tags.includes('MW'), 'Mehrweg im Live-Feld und in der Generalprobe');
  ok(PL.WEEKS[2].tool === 'range' && PL.WEEKS[3].tool === 'range', 'Woche 3 und 4 nutzen den Range-Designer');
  ok(/Satellite/.test(PL.WEEKS[3].title), 'Woche 4 ist die Satellite-Woche');
  ok(PL.WEEKS[4].cfg.profile === 'mix', 'Generalprobe mit gemischten Gegnertypen');
  ok(P.STACKS.push && P.STACKS.push.bb < 20, `Push/Fold-Band existiert (${P.STACKS.push.label})`);
  ok(P.geometry(P.SPOTS[0], 'push').spr < 3, `SRP bei 16bb hat SPR ${P.geometry(P.SPOTS[0], 'push').spr}`);
  ok(P.adjustForStack(P.RFI.BTN, 'push').length < P.RFI.BTN.length, 'Push-Band strafft die Ranges wie short');
  // Jede Wochen-Konfiguration muss in die echten Einstellungen passen.
  const VALID_TAGS = [...new Set(P.SPOTS.map(s => s.tag))], VALID_STACKS = Object.keys(P.STACKS);
  ok(PL.WEEKS.every(w => w.cfg.tags.every(t => VALID_TAGS.includes(t))), 'nur existierende Spot-Typen');
  ok(PL.WEEKS.every(w => w.cfg.stacks.every(s => VALID_STACKS.includes(s))), 'nur existierende Stackbaender');
  ok(PL.WEEKS.every(w => P.PROFILES[w.cfg.profile] || w.cfg.profile === 'mix'), 'nur existierende Gegnertypen');
  ok(PL.WEEKS.every(w => P.SPOTS.some(s => w.cfg.tags.includes(s.tag))), 'jede Woche hat spielbare Spots');

  console.log('\n== Plan: Generalprobe zieht die eigenen Fehler ==');
  ok(PL.WEEKS[4].hands === null, 'Woche 5 hat keine feste Handliste');
  const byHand = {
    'AKo': { pts: 3, max: 30 }, 'A5s': { pts: 20, max: 30 }, '72o': { pts: 1, max: 12 },
    'QQ': { pts: 29, max: 30 }, 'J4o': { pts: 5, max: 6 }
  };
  const w = PL.worstHandsFrom(byHand);
  ok(w[0] === '72o', `schlechteste Hand zuerst — 72o mit 1/12 vor AKo mit 3/30 (${w[0]})`);
  ok(w[1] === 'AKo', 'zweitschlechteste danach');
  ok(!w.includes('J4o'), 'Haende mit zu wenig Entscheidungen fliegen raus');
  ok(w.indexOf('QQ') === w.length - 1, 'die beste Hand steht hinten');
  ok(PL.sessionFor(30, w).hands.every(h => w.includes(h)), 'Woche 5 nutzt genau diese Haende');
  ok(PL.sessionFor(30, []).hands.length === 2, 'ohne Statistik faellt Woche 5 auf Standardhaende zurueck');
  ok([28, 29, 30, 31, 32, 33, 34].every(i => {
    const h = PL.sessionFor(i, ['AQo']).hands; return h[0] !== h[1];
  }), 'kurze Fehlerliste wird aufgefuellt statt Haende zu doppeln');
  ok(PL.sessionFor(28, ['AQo']).hands.includes('AQo'), 'die eigene Fehlerhand steht trotzdem vorne');
}

/* ===================== Satellite-ICM ===================== */
{
  const I = P.ICM;
  console.log('\n== ICM: Satellite mit gleichen Tickets ==');
  const fp = I.flatPayoutsForField(7, 5);
  ok(fp.length === 7 && fp.slice(0, 5).every(x => Math.abs(x - 0.2) < 1e-12) && fp[5] === 0 && fp[6] === 0,
    '5 Tickets bei 7 Spielern: fuenfmal 20 %, zweimal nichts');
  // Die Faelle aus den Merksaetzen der Woche 4 (js/tips.js) und den Satellite-Presets.
  const bub = { left: 12, paid: 10, bubble: 2, heroBB: 15, avgBB: 12, shortCount: 2, shortBB: 5, behind: 3 };
  const mtt = I.pushFoldICM(Object.assign({}, bub, { sat: false }));
  const sat = I.pushFoldICM(Object.assign({}, bub, { sat: true }));
  ok(sat.metrics.bubbleFactor > 3 * mtt.metrics.bubbleFactor,
    `Satellite-Bubble viel haerter (BF ${sat.metrics.bubbleFactor.toFixed(1)} statt ${mtt.metrics.bubbleFactor.toFixed(1)})`);
  ok(Math.abs(sat.defend.pct - 13) < 3 && Math.abs(mtt.defend.pct - 31) < 3,
    `Call gegen 5bb-Shove: ~13 % statt ~31 % (${sat.defend.pct.toFixed(1)} / ${mtt.defend.pct.toFixed(1)})`);
  ok(sat.metrics.needFlip > 0.9, `ein Flip braucht ueber 90 % (${(sat.metrics.needFlip * 100).toFixed(1)})`);
  ok(Math.abs(sat.minCash - 0.1) < 1e-12 && sat.firstPrize === sat.minCash, 'Platz 1 = letzter Ticketplatz');
  // Weit weg von der Bubble darf der Satellite kaum etwas aendern.
  const far = { left: 30, paid: 5, bubble: 25, heroBB: 12, avgBB: 12, shortCount: 5, shortBB: 6, behind: 3 };
  const fM = I.pushFoldICM(Object.assign({}, far, { sat: false, sims: 20000 }));
  const fS = I.pushFoldICM(Object.assign({}, far, { sat: true, sims: 20000 }));
  ok(Math.abs(fS.defend.pct - fM.defend.pct) < 4,
    `weit vor der Bubble fast gleich (${fS.defend.pct.toFixed(1)} vs ${fM.defend.pct.toFixed(1)})`);
  // Die Presets in app.js muessen genau diese Faelle setzen.
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  ok(/'#rdHero': 15, '#rdLeft': 12, '#rdBubble': 2, '#rdAvg': 12,\s*'#rdShorts': 2, '#rdShortBB': 5, '#rdBehind': 3, '#rdPay': 'sat'/.test(appSrc),
    'Preset "Satellite-Bubble" entspricht dem Fall aus den Merksaetzen');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok(htmlSrc.indexOf('id="rdPay"') >= 0 && htmlSrc.indexOf('id="rdSatBubble"') >= 0, 'Auszahlungs-Auswahl und Preset in index.html');
}

/* ===================== ICM & Range-Designer ===================== */
{
  const I = P.ICM;
  const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: ${a.toFixed(2)} (erwartet ${b} ±${tol})`);

  console.log('\n== ICM: Lehrbuchfall exakt nachgerechnet ==');
  // 3 Spieler 50/30/20, Auszahlung 50/30/20. Von Hand ueber Malmuth-Harville:
  //   P(A 2.) = 0.3*(50/70) + 0.2*(50/80) = 0.3393 -> Equity A = 38.39
  const pay3 = [0.5, 0.3, 0.2];
  const eA = I.heroEquityMulti([50], [30, 20], pay3, 300000)[0] * 100;
  const eB = I.heroEquityMulti([30], [50, 20], pay3, 300000)[0] * 100;
  const eC = I.heroEquityMulti([20], [50, 30], pay3, 300000)[0] * 100;
  near(eA, 38.39, 0.35, 'Spieler A (50 Chips)');
  near(eB, 32.75, 0.35, 'Spieler B (30 Chips)');
  near(eC, 28.86, 0.35, 'Spieler C (20 Chips)');
  near(eA + eB + eC, 100, 0.4, 'Summe aller Equities = ganzer Preispool');

  console.log('\n== ICM: Grundeigenschaften ==');
  for (const n of [5, 20]) {
    const e = I.heroEquityMulti([100], new Array(n - 1).fill(100),
      I.payoutsForField(n, Math.ceil(n * 0.3)), 150000)[0] * 100;
    near(e, 100 / n, 0.25, `${n} gleiche Stacks -> jeder 1/${n}`);
  }
  const oth = new Array(49).fill(20), p50 = I.payoutsForField(50, 20);
  const es = I.heroEquityMulti([10, 20, 30, 40, 50], oth, p50, 150000);
  ok(es.every((x, i) => i === 0 || x > es[i - 1]), 'mehr Chips = mehr Geld-Equity');
  const d = es.slice(1).map((x, i) => x - es[i]);
  ok(d.every((x, i) => i === 0 || x < d[i - 1]),
    `abnehmender Grenznutzen je +10 Chips (${d.map(x => (x * 100).toFixed(2)).join(' > ')})`);
  ok(I.heroEquityMulti([0], oth, p50, 20000)[0] === 0, 'Stack 0 = letzter Platz = keine Auszahlung');

  console.log('\n== ICM: Auszahlungskurve ==');
  const c = I.payoutCurve(100);
  ok(Math.abs(c.reduce((a, x) => a + x, 0) - 1) < 1e-9, 'Anteile summieren auf 1');
  ok(c.every((x, i) => i === 0 || x < c[i - 1]), 'streng fallend');
  ok(c[0] > 0.12 && c[0] < 0.20, `Sieger bekommt ${(c[0] * 100).toFixed(1)}% des Pools`);
  ok(c[99] * 700 > 1.2 && c[99] * 700 < 2.5, `Min-Cash bei 700 Teilnehmern: ${(c[99] * 700).toFixed(2)} Buy-ins`);

  console.log('\n== Equity-Tabelle (vorberechnet) ==');
  const M = I.buildMatrix(), IDX = I.classIndex();
  const pair = (a, b) => M[IDX[a] * 169 + IDX[b]] * 100;
  ok(P.EQ_TABLE && P.EQ_TABLE.length === 169 * 168, `Tabelle hat ${169 * 168} Zeichen fuer 14.196 Paare`);
  near(pair('AA', 'KK'), 82.4, 1.5, 'AA vs KK');
  near(pair('AA', 'AKs'), 87.2, 1.5, 'AA vs AKs');
  near(pair('AKs', 'QQ'), 46.0, 1.5, 'AKs vs QQ');
  near(pair('JJ', 'AKo'), 57.0, 1.5, 'JJ vs AKo');
  near(pair('22', 'AKo'), 52.4, 1.5, '22 vs AKo (der klassische Flip)');
  near(pair('76s', 'AA'), 22.9, 1.5, '76s vs AA');
  near(pair('TT', 'AKs'), 54.0, 1.5, 'TT vs AKs (nicht mit AKo verwechseln: 56.7)');
  ok(['AA', 'JJ', 'KQs'].every(a => ['72o', '76s', 'A5s'].every(b =>
    Math.abs(pair(a, b) + pair(b, a) - 100) < 1e-4)), 'Matrix ist symmetrisch');
  ok([...Array(169).keys()].every(i => Math.abs(M[i * 169 + i] - 0.5) < 1e-9), 'Diagonale = 50%');

  console.log('\n== Range-Designer: Verhalten ==');
  const base = { left: 100, paid: 97, heroBB: 5, shortCount: 10, shortBB: 8, avgBB: 25 };
  const r1 = I.pushFoldICM(Object.assign({}, base, { behind: 1 }));
  const r4 = I.pushFoldICM(Object.assign({}, base, { behind: 4 }));
  const r8 = I.pushFoldICM(Object.assign({}, base, { behind: 8 }));
  ok(r1.push.pct > r4.push.pct && r4.push.pct > r8.push.pct,
    `mehr Gegner hinter dir = engerer Push (${r1.push.pct.toFixed(0)}% > ${r4.push.pct.toFixed(0)}% > ${r8.push.pct.toFixed(0)}%)`);
  ok(r4.push.pct < r4.pushChipEV.pct, `ICM engt ein: ${r4.push.pct.toFixed(0)}% statt ${r4.pushChipEV.pct.toFixed(0)}%`);
  ok(r4.dropped.length > 0 && r4.added.length === 0, 'ICM streicht Haende, fuegt keine hinzu');
  // Die Shove-Range muss eine Schwellenrange sein: keine Luecken in der Staerke.
  const rank = I.rankedHands(), inPush = new Set(r8.push.range);
  const firstOut = rank.findIndex(h => !inPush.has(h));
  ok(rank.slice(firstOut).every(h => !inPush.has(h)),
    'Push-Range ist zusammenhaengend (staerkste Haende zuerst, keine Loecher)');
  ok(inPush.has('AA') && inPush.has('AKo') && !inPush.has('72o'), 'AA und AK drin, 72o draussen');
  ok(r4.metrics.bubbleFactor > 1, `Bubble-Faktor ueber 1 (${r4.metrics.bubbleFactor.toFixed(2)})`);
  ok(r4.metrics.needFlip > 0.5, `Flip braucht mehr als 50% (${(r4.metrics.needFlip * 100).toFixed(1)}%)`);
  // Naeher an der Bubble muss der Druck steigen und die Range enger werden.
  const b1 = I.pushFoldICM(Object.assign({}, base, { paid: 99, behind: 4 }));
  const b50 = I.pushFoldICM(Object.assign({}, base, { paid: 50, behind: 4 }));
  ok(b1.metrics.bubbleFactor > b50.metrics.bubbleFactor,
    `naeher an der Bubble mehr Druck (${b1.metrics.bubbleFactor.toFixed(2)} > ${b50.metrics.bubbleFactor.toFixed(2)})`);
  ok(b1.push.pct < b50.push.pct, `und eine engere Shove-Range (${b1.push.pct.toFixed(0)}% < ${b50.push.pct.toFixed(0)}%)`);
  // Der Kern: Shoven und Callen laufen an der Bubble gegensaetzlich.
  ok(b1.defend.pct < b1.push.pct,
    `an der Bubble callst du viel enger als du shovst (${b1.defend.pct.toFixed(1)}% vs ${b1.push.pct.toFixed(1)}%)`);
  ok(b1.defend.need > b1.defend.potOdds,
    `Callen braucht mehr als die Pot Odds (${(b1.defend.need * 100).toFixed(1)}% vs ${(b1.defend.potOdds * 100).toFixed(1)}%)`);
  ok(b1.defend.pct < b1.defend.chipPct, 'ICM engt auch die Call-Range ein');
  ok(b1.defend.range.includes('AA') && b1.defend.range.includes('KK'), 'AA und KK callen immer');
  ok(!b1.defend.range.includes('72o') && !b1.defend.range.includes('J8s'), 'Muell wird gefoldet');
  // Wer selbst der Kuerzeste ist, kann auf niemanden warten -> weiterer Push.
  const shortest = I.pushFoldICM({ left: 100, paid: 99, heroBB: 5, shortCount: 10, shortBB: 8, avgBB: 25, behind: 4 });
  const covered = I.pushFoldICM({ left: 100, paid: 99, heroBB: 12, shortCount: 10, shortBB: 3, avgBB: 25, behind: 4 });
  ok(shortest.isShortest === true && covered.isShortest === false, 'erkennt, ob du der kuerzeste Stack bist');
  ok(shortest.push.pct > covered.push.pct,
    `als Kuerzester shovst du weiter (${shortest.push.pct.toFixed(0)}%), weil niemand vor dir ausscheidet (sonst ${covered.push.pct.toFixed(0)}%)`);
  ok(r4.caller.need > r4.caller.potOdds,
    `Caller braucht mehr als die Pot Odds (${(r4.caller.need * 100).toFixed(1)}% vs ${(r4.caller.potOdds * 100).toFixed(1)}%)`);

  // Weit weg vom Geld muss der ICM-Druck verschwinden.
  const far = I.pushFoldICM({ left: 400, paid: 100, heroBB: 12, shortCount: 40, shortBB: 8, avgBB: 40, behind: 4 });
  ok(far.metrics.bubbleFactor < r4.metrics.bubbleFactor,
    `weit vor dem Geld weniger ICM-Druck (${far.metrics.bubbleFactor.toFixed(2)} < ${r4.metrics.bubbleFactor.toFixed(2)})`);

  // Determinismus: gleiche Eingabe, gleiches Ergebnis.
  ok(I.pushFoldICM(Object.assign({}, base, { behind: 4 })).push.pct === r4.push.pct,
    'gleiche Eingabe liefert reproduzierbar dasselbe Ergebnis');
  // Robustheit gegen die Simulationszahl.
  const rHi = I.pushFoldICM(Object.assign({}, base, { behind: 4, sims: 120000 }));
  ok(Math.abs(rHi.push.pct - r4.push.pct) < 6,
    `stabil bei 3x mehr Simulationen (${r4.push.pct.toFixed(1)}% vs ${rHi.push.pct.toFixed(1)}%)`);

  console.log('\n== Feldmodell ==');
  const f = I.fieldModel(base);
  ok(f.others.length === base.left - 1, `${f.others.length} Gegner bei ${base.left} Spielern`);
  near(f.hero + f.others.reduce((a, x) => a + x, 0), base.avgBB * base.left, 0.01,
    'Chips gehen genau auf');
  // 90 Shorties a 27bb bei 25bb Schnitt lassen fuer die uebrigen 9 nur 7bb —
  // die "grossen" Stacks waeren kuerzer als die Shorties. Widerspruch.
  ok(!I.fieldModel({ left: 100, paid: 97, heroBB: 5, shortCount: 90, shortBB: 27, avgBB: 25 }).valid,
    'widerspruechliches Feld wird erkannt (Reststacks kuerzer als die Shorties)');
  ok(I.fieldModel(base).valid, 'ein plausibles Feld gilt als gueltig');
}

/* ===================== Kopfrechnen ===================== */
{
  const M = P.Mental;
  console.log('\n== Kopfrechnen: die Formeln ==');
  // Pot 100, Bet 50: du legst 50 nach und spielst um 200 -> 25%.
  ok(Math.abs(M.needEquity(100, 50) - 0.25) < 1e-9, 'Pot 100, Bet 50 -> 25% noetig');
  ok(Math.abs(M.needEquity(100, 100) - 1 / 3) < 1e-9, 'Potbet -> 33,3% noetig');
  ok(Math.abs(M.mdf(100, 50) - 2 / 3) < 1e-9, 'MDF gegen Halbpot = 67%');
  ok(Math.abs(M.mdf(100, 33) - 100 / 133) < 1e-9, 'MDF gegen Drittelpot = 75%');
  ok(Math.abs(M.mdf(100, 100) - 0.5) < 1e-9, 'MDF gegen Potbet = 50%');
  ok(Math.abs(M.bluffBreakEven(100, 50) - 1 / 3) < 1e-9, 'Halbpot-Bluff braucht 33% Folds');
  ok(Math.abs(M.bluffBreakEven(100, 100) - 0.5) < 1e-9, 'Potbet-Bluff braucht 50% Folds');
  // MDF und Bluff-Break-even sind dieselbe Muenze von zwei Seiten.
  ok([[100, 25], [60, 40], [13, 7]].every(([p, b]) =>
    Math.abs(M.mdf(p, b) + M.bluffBreakEven(p, b) - 1) < 1e-9),
    'MDF + Bluff-Break-even = 100%');

  console.log('\n== Kopfrechnen: Aufgaben ==');
  P.seedRng(12345);
  let badQ = 0; const seenT = {};
  for (let i = 0; i < 400; i++) {
    const q = M.makeQuestion(P.rng, { maxLevel: 47 });
    seenT[q.type] = 1;
    if (!(q.answer > 0 && q.answer < 2)) badQ++;   // Overbet: > 100% ist zulaessig
    if (q.options.length !== 4) badQ++;
    if (!q.options.some(o => Math.abs(o - q.answer) < 0.006)) badQ++;
    if (new Set(q.options).size !== 4) badQ++;
    if (!(q.pot > 0 && q.bet > 0)) badQ++;
  }
  ok(badQ === 0, '400 Aufgaben: Antwort gueltig, 4 verschiedene Optionen, richtige immer dabei');
  ok(Object.keys(seenT).length === M.TYPES.length, `alle ${M.TYPES.length} Aufgabentypen kommen vor`);

  console.log('\n== Sizing-Tabelle ==');
  const sz = M.sizingTable(1);
  ok(sz.length === P.Plan.DAY1.length, `${sz.length} Zeilen fuer Tag 1`);
  ok(sz.every(r => r.s33.chips < r.s55.chips && r.s55.chips < r.s80.chips), 'Sizings steigen');
  // Jede Groesse muss aus den Jetons legbar sein, die es auf dem Level gibt.
  const all = [1, 2, 3, 4].reduce((a, d) => a.concat(M.sizingTable(d)), []);
  ok(all.every(r => [r.open, r.threeBet, r.s33.chips, r.s55.chips, r.s80.chips]
    .every(v => v % r.unit === 0)), 'alle Betraege liegen auf dem Chipraster');
  ok(all.every(r => r.unit <= r.bb / 8 || M.DENOMS.filter(d => r.sb % d === 0 && r.bb % d === 0).length === 1),
    'kleinster Jeton hoechstens ein Achtel des Big Blinds');
  ok(all.every(r => r.sb % r.unit === 0 && r.bb % r.unit === 0), 'beide Blinds sind aus dem Jeton legbar');
  // Das Runden darf die Groesse nicht nennenswert verschieben.
  const dev = Math.max(...all.map(r => Math.max(
    Math.abs(r.s33.real - 0.33), Math.abs(r.s55.real - 0.55), Math.abs(r.s80.real - 0.80))));
  ok(dev < 0.02, `Abweichung vom Zielprozentsatz unter 2 Punkten (${(dev * 100).toFixed(1)})`);
  ok(all.every(r => r.openBB >= 1.9 && r.openBB <= 2.6), 'Open liegt zwischen 1,9 und 2,6 BB');
  // Open und 3-Bet muessen GLATT sein — 875 legt niemand hin.
  ok(all.every(r => { const st = M.DENOMS.filter(d => d <= r.open / 4).pop() || r.unit; return r.open % st === 0; }),
    'Open ist auf eine glatte Stueckelung gelegt');
  ok(all.every(r => r.threeBet > r.open * 2.5 && r.threeBet < r.open * 4), '3-Bet liegt bei rund 3x dem Open');
  ok(sz.every(r => r.potSRP > r.dead), 'Pot am Flop groesser als das tote Geld praeflop');
  ok(M.sizingTable(4).length === P.Plan.DAY4.length, 'Tabelle gibt es auch fuer Tag 4');
  // Die Auswahlfelder in index.html muessen alle vier Tage und alle Level
  // abdecken — sonst sind Teile der Struktur in der App nicht erreichbar.
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok([1, 2, 3, 4].every(d => html.indexOf('>Tag ' + d + '<') >= 0), 'Sizing-Auswahl kennt alle vier Turniertage');
  ok(html.indexOf('"' + P.Plan.LEVELS.length + '">alle Level') >= 0,
    'Phasen-Auswahl deckt alle ' + P.Plan.LEVELS.length + ' Level ab');
}
/* ===================== win2day-Session-Auswertung ===================== */
{
  const W = P.W2D, ST = P.W2DStats, AU = P.W2DAudit;

  console.log('\n== win2day: Kartenformat ==');
  ok(W.parseCard('S8') === P.cardFromStr('8s'), 'S8 = 8 Pik');
  ok(W.parseCard('H10') === P.cardFromStr('Th'), 'H10 = 10 Herz (nicht T)');
  ok(W.parseCard('HA') === P.cardFromStr('Ah'), 'HA = Ass Herz');
  ok(W.parseCard('X') === null && W.parseCard('X X') === null, 'X = verdeckt');
  ok(W.parseCards('D5 CK SQ').length === 3, 'Board mit drei Karten');
  ok(W.parseCards('X X').length === 0, 'verdeckte Hand ergibt keine Karten');

  console.log('\n== win2day: Zahlenformat ==');
  ok(W.num('1.234') === 1234, 'Punkt ist Tausendertrennzeichen');
  ok(W.num('12,50') === 12.5, 'Komma ist Dezimaltrennzeichen');
  ok(W.num('2.644.975') === 2644975, 'mehrere Tausendergruppen');
  ok(W.num('') === 0 && W.num(undefined) === 0, 'leer ergibt 0');

  console.log('\n== win2day: Wilson-Intervall ==');
  const w = ST.wilson(50, 100);
  ok(Math.abs(w.p - 0.5) < 1e-9, 'Punktschaetzer 50 %');
  ok(w.lo > 0.39 && w.lo < 0.41 && w.hi > 0.59 && w.hi < 0.61, `50/100 -> [${(w.lo * 100).toFixed(1)}, ${(w.hi * 100).toFixed(1)}]`);
  ok(ST.wilson(0, 10).lo === 0, 'bei 0 Treffern bleibt die Untergrenze 0');
  ok(ST.wilson(10, 10).hi === 1, 'bei 100 % bleibt die Obergrenze 1');
  ok(ST.wilson(0, 0).n === 0, 'leere Stichprobe stuerzt nicht ab');
  const wide = ST.wilson(5, 20), narrow = ST.wilson(50, 200);
  ok((wide.hi - wide.lo) > (narrow.hi - narrow.lo), 'mehr Haende -> engeres Intervall');

  console.log('\n== win2day: Raise steht als Betrag AUF im XML ==');
  {
    // Synthetisch, Muster aus einer echten Twister-Hand: SB raist aus dem
    // Blind, Held raist zweimal in derselben Straße, dann All-in (Typ 7 =
    // Zusatzbetrag). Nur mit "Raise = auf" geht der Pot auf die Gewinne auf.
    const xml = '<session sessioncode="9"><general><nickname>H</nickname></general>' +
      '<game gamecode="1"><general><startdate>2026-01-01 20:00:00</startdate><smallblind>10</smallblind><bigblind>20</bigblind><ante>0</ante><players>' +
      '<player bet="530" chips="530" dealer="0" name="A" reg_code="" seat="3" win="0"/>' +
      '<player bet="20" chips="530" dealer="0" name="B" reg_code="" seat="6" win="0"/>' +
      '<player bet="440" chips="440" dealer="1" name="H" reg_code="9" seat="10" win="900"/>' +
      '</players></general><round no="0"><action no="1" player="A" sum="10" type="1"/><action no="2" player="B" sum="20" type="2"/></round>' +
      '<round no="1"><cards player="H" type="Pocket">SA HA</cards><action no="3" player="H" sum="40" type="23"/>' +
      '<action no="4" player="A" sum="60" type="23"/><action no="5" player="B" sum="0" type="0"/>' +
      '<action no="6" player="H" sum="140" type="23"/><action no="7" player="A" sum="530" type="23"/>' +
      '<action no="8" player="H" sum="300" type="7"/></round></game></session>';
    const h = W.parseSession(xml).hands[0];
    ok(h.invested.H === 440, `Held investiert genau seinen Stack (${h.invested.H})`);
    ok(h.invested.A === 530, `SB-Raise aus dem Blind zaehlt den Blind nicht doppelt (${h.invested.A})`);
    const re = h.streets.preflop.filter(a => a.player === 'H' && a.kind === 'raise');
    ok(re[1].amount === 100 && re[1].to === 140, 'zweiter Raise: Zusatz 100, auf 140');
    const pot = Object.values(h.invested).reduce((a, b) => a + b, 0) - 90; // 90 = ungecallter Rest von A
    ok(pot === 900, `Pot geht auf den Gewinn auf (${pot})`);
  }

  const sampleFile = path.join(__dirname, '..', 'Samples', '4192312021.xml');
  if (!fs.existsSync(sampleFile)) {
    console.log('  (Beispieldatei fehlt — Datentests uebersprungen)');
  } else {
    const xml = fs.readFileSync(sampleFile, 'utf8');
    const sess = W.parseSession(xml);

    console.log('\n== win2day: Parser gegen die Beispieldatei ==');
    ok(Object.keys(sess.unknownTypes).length === 0,
      'keine unbekannten Aktions-Codes' + (Object.keys(sess.unknownTypes).length ? ' ' + JSON.stringify(sess.unknownTypes) : ''));
    ok(sess.hands.length === 200, `200 Haende gelesen (${sess.hands.length})`);
    ok(sess.heroHands.length === 194, `194 davon mit dem Helden (${sess.heroHands.length})`);
    ok(sess.skipped === 6, 'die 6 Haende von einem fremden Tisch sind markiert, nicht still verworfen');
    // Nickname bewusst nicht hart verglichen: er stuende sonst im
    // oeffentlichen Repo, obwohl die Beispieldatei selbst nicht mitgeht.
    // Die staerkere Invariante ist ohnehin, dass Kopfdaten und Handdaten
    // denselben Helden meinen.
    ok(!!sess.meta.nickname && sess.meta.place === 10, 'Kopfdaten gelesen');
    ok(sess.heroHands.every(h => h.hero === sess.meta.nickname),
      'Held aus dem Dateikopf und Held in den Haenden sind derselbe');

    // Der Knockout haengt als Kind-Element im <player>-Tag, das dann NICHT
    // selbstschliessend ist. Frueher hat der Parser genau diese Haende
    // uebersprungen — also die, in denen der Held jemanden rausgeworfen hat.
    ok(sess.bounties.length === 5, `5 Knockouts erkannt (${sess.bounties.length})`);
    ok(sess.heroHands.every(h => h.heroCards.length === 2), 'in jeder Hand sind die eigenen Karten da');

    // Die haerteste Probe: die Summe aller Handergebnisse muss den Stack
    // exakt auf null bringen, weil der Held ausgeschieden ist.
    const start = sess.heroHands[0].heroChips;
    const sum = sess.heroHands.reduce((a, h) => a + h.heroNet, 0);
    ok(Math.abs(start + sum) < 1, `Chipbilanz geht auf: ${start} + (${sum}) = ${start + sum}`);

    // Positionen: wo das Dealer-Flag da ist, muss es mit der Zaehlung
    // uebereinstimmen; wo es fehlt (toter Button), wird als unsicher markiert.
    let certain = 0, uncertain = 0, mismatch = 0;
    for (const h of sess.heroHands) {
      const r = W.positionsOf(h);
      if (!r.certain) { uncertain++; continue; }
      certain++;
      const seated = h.players.slice().sort((a, b) => a.seat - b.seat), n = seated.length;
      const names = W.POS_NAMES[n] || W.POS_NAMES[9];
      const di = seated.findIndex(p => p.dealer);
      for (let k = 0; k < n; k++) if (r.map[seated[(di + k) % n].name] !== (names[k] || 'MP')) mismatch++;
    }
    ok(mismatch === 0, `alle ${certain} sicheren Positionen stimmen mit dem Dealer-Flag ueberein`);
    ok(uncertain === 8, `8 Haende mit totem Button als unsicher markiert (${uncertain})`);

    console.log('\n== win2day: Frequenzen ==');
    const A = ST.analyse(sess);
    for (const k of ST.STAT_KEYS) {
      const x = A.stats[k];
      if (x.k > x.n) { ok(false, `${k}: Zaehler ${x.k} groesser als Nenner ${x.n}`); break; }
    }
    ok(ST.STAT_KEYS.every(k => A.stats[k].k <= A.stats[k].n),
      'kein Zaehler groesser als sein Nenner (fruehere Fassung lieferte "Steal 177 %")');
    ok(ST.STAT_KEYS.every(k => A.stats[k].p <= 1), 'keine Frequenz ueber 100 %');
    ok(A.stats.pfr.p <= A.stats.vpip.p, 'PFR kann nicht groesser als VPIP sein');

    // All-in per Stackvergleich, nicht per Aktionstyp: Typ 7 kommt nur
    // 16-mal vor, tatsaechlich ist der Held 13-mal komplett investiert.
    ok(A.stats.allIns >= 10, `All-ins ueber den Stack erkannt (${A.stats.allIns}), nicht ueber den Aktionstyp`);
    ok(A.rows.filter(r => r.allIn).every(r => r.invested >= r.hand.heroChips - 0.5),
      'jedes erkannte All-in investiert wirklich den ganzen Stack');

    console.log('\n== win2day: All-in-Equity ==');
    ok(A.allIns.length > 0, `${A.allIns.length} All-ins mit aufgedeckten Gegnerkarten`);
    // Praeflop-All-ins duerfen nie 0 % oder 100 % ergeben — sonst waere mit
    // dem fertigen Board gerechnet worden statt mit dem Stand bei der Entscheidung.
    const pre = A.allIns.filter(x => x.street === 'preflop');
    ok(pre.length > 0 && pre.every(x => x.eq > 0.02 && x.eq < 0.98),
      `praeflop-Equities liegen echt zwischen 0 und 1 (${pre.map(x => (x.eq * 100).toFixed(0) + '%').join(', ')})`);
    ok(pre.every(x => x.known.length === 0), 'praeflop wird ohne Board gerechnet');

    console.log('\n== win2day: Zusammenfassung und Rueckrechnung ==');
    const sum1 = ST.summarise(A);
    ok(JSON.stringify(sum1).length < 4000, `Zusammenfassung bleibt klein (${JSON.stringify(sum1).length} Bytes)`);
    const back = ST.statsFromSummaries([sum1]);
    ok(ST.STAT_KEYS.every(k => Math.abs(back.stats[k].p - A.stats[k].p) < 1e-9),
      'aus der Zusammenfassung zurueckgerechnete Frequenzen sind identisch');
    const two = ST.statsFromSummaries([sum1, sum1]);
    ok(two.stats.hands === A.stats.hands * 2, 'zwei Sessions verdoppeln die Haende');
    ok(Math.abs(two.stats.vpip.p - A.stats.vpip.p) < 1e-9, 'der Punktschaetzer bleibt gleich');
    ok((two.stats.vpip.hi - two.stats.vpip.lo) < (back.stats.vpip.hi - back.stats.vpip.lo),
      'das Intervall wird enger');

    console.log('\n== win2day: Entscheidungspruefung ==');
    const R = AU.auditAll(A);
    const cache = {};
    const audits = A.rows.map(r => AU.auditShove(r, cache)).filter(Boolean);
    ok(audits.length >= 15, `${audits.length} Push/Fold-Entscheidungen nachgerechnet`);
    // Kernlogik: gemeldet wird nur, was der Rechnung widerspricht.
    ok(audits.filter(x => x.verdict === 'fold-statt-push').every(x => x.ev > AU.EV_THRESHOLD),
      'als "Fold statt Push" gemeldet wird nur, was wirklich klar +EV war');
    ok(audits.filter(x => x.verdict === 'push-war-schlecht').every(x => x.ev < -AU.EV_THRESHOLD),
      'als schlechter Push gemeldet wird nur, was wirklich -EV war');
    ok(audits.filter(x => !x.verdict && x.action === 'Fold').every(x => x.ev <= AU.EV_THRESHOLD),
      'ungemeldete Folds hatten alle negativen oder neutralen Shove-EV');
    ok(audits.filter(x => !x.verdict && x.action === 'All-in').every(x => x.ev >= -AU.EV_THRESHOLD),
      'ungemeldete All-ins hatten alle positiven oder neutralen EV');
    ok(R.openTooWide.every(o => o.opened) && R.openTooTight.every(o => !o.opened),
      'Open-Abweichungen sind richtig herum einsortiert');
  }
}


  console.log('\n== Skript-Reihenfolge ==');
  {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const build = fs.readFileSync(path.join(__dirname, '..', 'build', 'build-single.js'), 'utf8');
    const inHtml = [...html.matchAll(/<script src="js\/([\w.]+)\?/g)].map(m => m[1]);
    const inBuild = (build.match(/const JS_FILES = \[([\s\S]*?)\];/) || [, ''])[1]
      .match(/'js\/([\w.]+)'/g).map(x => x.replace(/'js\/|'/g, ''));
    ok(inHtml.join(',') === inBuild.join(','),
      'index.html und build-single.js laden dieselben Dateien in derselben Reihenfolge');
    if (inHtml.join(',') !== inBuild.join(',')) {
      console.log('    html : ' + inHtml.join(', '));
      console.log('    build: ' + inBuild.join(', '));
    }
    // Jede js-Datei muss auch wirklich geladen werden.
    const onDisk = fs.readdirSync(path.join(__dirname, '..', 'js')).filter(f => f.endsWith('.js')).sort();
    const missing = onDisk.filter(f => inHtml.indexOf(f) < 0);
    ok(missing.length === 0, 'keine js-Datei vergessen' + (missing.length ? ': ' + missing.join(', ') : ''));
    // Auch der Test selbst muss alle Module laden — sonst schlaegt er aus
    // dem falschen Grund fehl. Genau das ist mit multiway.js passiert.
    const self = fs.readFileSync(__filename, 'utf8');
    const loaded = (self.match(/for \(const f of \[([^\]]*)\]/) || [, ''])[1]
      .match(/'([\w.]+)'/g).map(x => x.replace(/'/g, ''));
    const notLoaded = onDisk.filter(f => f !== 'app.js' && loaded.indexOf(f) < 0);
    ok(notLoaded.length === 0, 'der Test laedt alle Module' + (notLoaded.length ? ': ' + notLoaded.join(', ') + ' fehlen' : ''));
  }

  console.log('\n== Postflop-Replay ==');
  {
    const PO = P.W2DPost, L = P.W2DLeaks;
    const sampleFile = path.join(__dirname, '..', 'Samples', '4192312021.xml');

    // Etikett: auf gepaartem Board ist "Two Pair" irrefuehrend, wenn das
    // Paar auf dem Board liegt und die eigenen Karten es nicht bilden.
    const C2 = s => s.match(/[2-9TJQKA][cdhs]/g).map(P.cardFromStr);
    // Die Korrektur sitzt inzwischen in der Engine, nicht mehr hier.
    ok(L.describeHolding(C2('JhTs'), C2('JdQhAdQs')).label === P.MADE.THIRD,
      'J-T auf JQAQ ist das dritte Paar, nicht Two Pair (die Damen liegen am Board)');
    ok(L.describeHolding(C2('KhQd'), C2('KcQs2h')).label === P.MADE.TWOPAIR,
      'echte Two Pair aus eigenen Karten bleibt Two Pair');
    ok(L.describeHolding(C2('7h7d'), C2('Kc7s2h')).label === P.MADE.SET, 'ein Set bleibt ein Set');

    // Sizing-Repertoire
    const eng = [];
    for (let i = 0; i < 12; i++) eng.push(i % 3 === 0 ? 0.33 : 0.65);
    ok(L.sizingProfile(eng).flagged, 'zwei feste Groessen werden als Muster erkannt');
    ok(!L.sizingProfile([0.28, 0.35, 0.42, 0.5, 0.58, 0.66, 0.72, 0.8, 0.9, 1.1, 0.31, 0.47]).flagged,
      'breit gestreute Groessen werden NICHT gemeldet');
    ok(L.sizingProfile([]) === null && L.sizingProfile([0.5, 0.5]).flagged === false,
      'zu wenige Bets ergeben kein Muster');

    // Abbildung echter Betraege auf die Engine-Optionen
    ok(PO.mapBet('check', 0, 100) === 'CHECK', 'Check bleibt Check');
    ok(PO.mapBet('bet', 33, 100) === 'BET_S' && PO.mapBet('bet', 80, 100) === 'BET_L',
      '33 % und 80 % werden richtig zugeordnet');
    ok(PO.mapBet('bet', 65, 100) === 'BET_M', '65 % landet bei der mittleren Groesse');
    ok(PO.mapBet('bet', 190, 100) === 'BET_XL', 'Overbet landet bei XL');
    ok(PO.mapFacing('fold', 0, 50) === 'FOLD' && PO.mapFacing('call', 0, 50) === 'CALL',
      'Fold und Call werden durchgereicht');
    ok(PO.mapFacing('raise', 150, 50) === 'RAISE_L' && PO.mapFacing('raise', 120, 50) === 'RAISE_S',
      'Raise-Groessen unterschieden');

    if (fs.existsSync(sampleFile)) {
      const sess = P.W2D.parseSession(fs.readFileSync(sampleFile, 'utf8'));
      const A = P.W2DStats.analyse(sess);
      const R = PO.replayAll(A);
      const byIdx = new Map(A.rows.map(r => [r.idx, r]));

      ok(R.decisions.length > 20, R.decisions.length + ' Entscheidungen bewertet');
      ok(R.decisions.every(d => d.score >= 0 && d.score <= 100), 'alle Noten liegen zwischen 0 und 100');

      // Die wichtigste Probe: keine Entscheidung darf einer Hand zugeordnet
      // werden, in der der Held praeflop gefoldet hat oder gar nicht sass.
      ok(R.decisions.every(d => {
        const r = byIdx.get(d.handIdx);
        return r && !r.hand.streets.preflop.some(a => a.player === r.hand.hero && a.kind === 'fold');
      }), 'keine Entscheidung aus einer praeflop gefoldeten Hand');
      ok(R.decisions.every(d => byIdx.get(d.handIdx).handClass === d.handClass),
        'Karten der Entscheidung stimmen mit der Hand ueberein');
      ok(R.decisions.every(d => byIdx.get(d.handIdx).pos === d.heroPos),
        'Position der Entscheidung stimmt mit der Hand ueberein');
      // Mehrweg bekommt keine Note, aber die exakt entscheidbaren Pruefungen.
      ok(R.multiway.length > 0, R.multiway.length + ' Mehrweg-Entscheidungen geprueft');
      ok(R.multiway.every(m => m.mode === 'FACE' ? (m.eq >= 0 && m.eq <= 1 && m.need > 0 && m.need < 1)
        : (m.needEach > 0 && m.needEach <= 1)), 'Mehrweg-Kennzahlen liegen im gueltigen Bereich');
      ok(R.decisions.every(d => !d.multiway), 'keine Mehrweg-Hand bekommt eine Note');

      const agg = L.aggregate(R.decisions);
      ok(Math.abs(agg.mean - R.decisions.reduce((a, d) => a + d.score, 0) / R.decisions.length) < 1e-9,
        'Durchschnittsnote stimmt');
      ok(agg.patterns.every(p => p.n > 0 && p.lost >= 0), 'jedes gemeldete Muster hat Faelle');
      // Die Muster duerfen sich nicht widersprechen: dieselbe Entscheidung
      // kann nicht gleichzeitig "zu gross" und "zu klein" sein.
      const gross = new Set((agg.patterns.find(p => p.key === 'sizing-zu-gross') || { examples: [] })
        .examples.map(e => e.handIdx + '|' + e.street));
      const klein = (agg.patterns.find(p => p.key === 'sizing-zu-klein') || { examples: [] })
        .examples.map(e => e.handIdx + '|' + e.street);
      ok(klein.every(k => !gross.has(k)), 'kein Sizing gleichzeitig zu gross und zu klein');

      // Speichern und zurueckrechnen
      const sp = L.summarisePost(R.decisions);
      ok(sp.n === R.decisions.length, 'Zusammenfassung zaehlt alle Entscheidungen');
      const back = L.combinePost([sp]);
      ok(Math.abs(back.mean - agg.mean) < 1e-9, 'zurueckgerechnete Note identisch');
      const two = L.combinePost([sp, sp]);
      ok(two.n === sp.n * 2 && Math.abs(two.mean - agg.mean) < 1e-9,
        'zwei Sessions verdoppeln die Faelle, die Note bleibt');
      ok(JSON.stringify(sp).length < 6000, 'Postflop-Zusammenfassung bleibt klein (' + JSON.stringify(sp).length + ' Bytes)');
    }
  }

  console.log('\n== Board spielt: eigene Karten muessen etwas beitragen ==');
  {
    const CB = s => s.match(/[2-9TJQKA][cdhs]/g).map(P.cardFromStr);
    const md = (h, b) => P.classify(CB(h), CB(b)).made;
    const tr = (h, b) => P.tierOf(P.classify(CB(h), CB(b)));
    // Der Fall aus dem Screenshot: drei Zweien auf dem Board, Hand traegt nichts bei.
    ok(md('8s5s', 'Ks2d2c2h') === P.MADE.BOARD, '8-hoch auf K222 = Board spielt, nicht "Trips"');
    ok(tr('8s5s', 'Ks2d2c2h') === P.TIER.AIR, 'und damit tier AIR statt STRONG');
    ok(md('3c2d', 'AhKhQhJhTh') === P.MADE.BOARD, 'Board-Royal-Flush gehoert nicht dir');
    ok(md('9c8d', '7h7d3s3c') === P.MADE.BOARD, 'zwei Board-Paare sind nicht deine Two Pair');
    ok(md('9c8d', 'Ah7h5h3h2h') === P.MADE.BOARD, 'Board-Flush ohne eigene Karte der Farbe');
    ok(md('8c7d', '2h2d2s2c9h') === P.MADE.BOARD, 'Board-Quads');
    ok(md('9c8d', '5h6d7s8c9d') === P.MADE.BOARD, 'Board-Straight, die du nicht verbesserst');
    ok(md('7h6d', '5c5d5h2c') === P.MADE.BOARD, 'Board-Trips am Turn');

    // Gegenprobe: ueberall dort, wo die Hand beitraegt, darf sich nichts aendern.
    ok(md('AhAd', 'Ks2d2c2h') === P.MADE.BOAT, 'AA auf 222 ist ein echtes Full House');
    ok(md('2s3d', 'Ks2d2c2h') === P.MADE.QUADS, 'die eigene Zwei macht Quads');
    ok(md('AhKd', 'Kc7d2s') === P.MADE.TPTK, 'Top Pair bleibt Top Pair');
    ok(md('7h7d', 'Kc7s2h') === P.MADE.SET, 'Set bleibt Set');
    ok(md('KhQd', 'KcQs2h') === P.MADE.TWOPAIR, 'echte Two Pair bleibt');
    ok(md('AhTh', 'Kh7h5h3h2h') === P.MADE.FLUSH, 'hoehere Karte der Flush-Farbe zaehlt');
    ok(md('ThTd', '9c8d7s6h2c') === P.MADE.STRAIGHT, 'eigene Zehn vervollstaendigt die Straight');
    ok(md('Ah5d', 'Kc7s2h') === P.MADE.ACEHIGH, 'Ass-hoch bleibt Ass-hoch');

    // Der Fehler wirkte bis in die Empfehlung durch.
    const hole = CB('8s5s'), board = CB('Ks2d2c2h');
    const cls = P.classify(hole, board);
    const vr = P.parseRange(P.RFI.BTN);
    const rel = P.relativeStrength(hole, vr, board).pct;
    ok(rel < 0.2, `8-hoch auf K222 schlaegt nur ${(rel * 100).toFixed(0)}% der Range`);
    ok(P.tierOf(cls) === P.TIER.AIR,
      'die Strategie sieht jetzt eine Air-Hand — vorher tier STRONG und eine Value-Bet');

    // Board spielt muss auch in den Range-Buckets auftauchen
    ok(P.BUCKET_ORDER.indexOf(P.MADE.BOARD) >= 0, 'Board spielt steht in der Bucket-Reihenfolge');
    // Bewusst ohne Zwei und ohne Koenig — sonst trifft die Range das Board
    // wirklich (72o macht auf K222 Quads, und das ist korrekt stark).
    const bk = P.rangeBuckets(P.parseRange('T9o, 98o, 87o'), CB('Ks2d2c2h'), []);
    ok(bk.list.some(b => b.name === P.MADE.BOARD), 'rangeBuckets weist Board-Haende aus');
    ok(bk.strongPct === 0, `Haende ohne Bezug zum Board sind zu ${(bk.strongPct * 100).toFixed(0)}% "stark" (vorher 100%)`);
    const bk2 = P.rangeBuckets(P.parseRange('72o'), CB('Ks2d2c2h'), []);
    ok(bk2.strongPct > 0.5, 'eine Range MIT Zwei ist auf K222 zu Recht stark (Quads)');
  }

  console.log('\n== Es gibt immer eine Setz-Option ==');
  {
    // Bei sehr niedrigem SPR fielen alle Sizings aus dem Filter und es blieb
    // nur der Check-Knopf stehen — auf dem Telefon ein Button ohne Ausweg.
    const pick = (pot, eff) => {
      const o = P.BET_OPTIONS.filter(x => x.pct === 0 || x.pct * pot <= eff * 1.35);
      if (eff > 0.05 && !o.some(x => x.pct > 0)) o.push(P.BET_OPTIONS[P.BET_OPTIONS.length - 1]);
      return o;
    };
    let bad = 0;
    for (let pot = 2; pot <= 120; pot += 2) {
      for (let eff = 0.5; eff <= 60; eff += 0.5) {
        const o = pick(pot, eff);
        if (!o.some(x => x.pct > 0)) bad++;
      }
    }
    ok(bad === 0, 'ueber alle Pot/Stack-Kombinationen bleibt immer eine Setz-Option');
    ok(pick(50, 8).length === 2 && pick(50, 8).some(o => o.key === 'BET_XL'),
      'bei SPR 0.16 wird das All-in nachgereicht (vorher: nur Check)');
    ok(pick(6, 40).length === 5, 'bei tiefem Stack bleiben alle fuenf Optionen');
    // Der Betrag muss immer auf den Stack gedeckelt sein.
    for (const [pot, eff] of [[50, 8], [100, 3], [20, 20]]) {
      const amts = pick(pot, eff).filter(o => o.pct > 0).map(o => Math.min(o.pct * pot, eff));
      ok(amts.every(a => a <= eff + 1e-9), `Sizings bei Pot ${pot}/Stack ${eff} ueberschreiten den Stack nicht`);
    }
  }

  console.log('\n== Gepaartes Board: Etikett nach eigenem Beitrag ==');
  {
    const CP = s => s.match(/[2-9TJQKA][cdhs]/g).map(P.cardFromStr);
    const b = CP('9s4h9cQh');   // Board-Paar Neunen, dazu Dame und Vier
    const md = h => P.classify(CP(h), b).made;
    const ti = h => P.tierOf(P.classify(CP(h), b));
    // Vorher bekamen alle vier dasselbe Etikett "Two Pair" und tier 4.
    ok(md('3s3h') === P.MADE.WEAKPAIR, '33 unter dem Board-Paar = schwaches Paar');
    ok(md('TsTh') === P.MADE.PP_MID, 'TT zwischen den Board-Karten = mittleres Pocket');
    ok(md('KsKh') === P.MADE.OVERPAIR, 'KK ueber allem = Overpair');
    ok(md('Qs5h') === P.MADE.TP, 'Q5 paart die Dame = Top Pair');
    ok(md('9d8h') === P.MADE.TRIPS, 'eine eigene Neun = Trips');
    ok(md('8s5h') === P.MADE.BOARD, 'ohne Bezug zum Board spielt das Board');
    // Die Reihenfolge der tiers muss der Reihenfolge der Staerke folgen.
    const order = ['8s5h', '3s3h', 'TsTh', 'Qs5h', 'KsKh', '9d8h'];
    const tiers = order.map(ti);
    ok(tiers.every((t, i) => i === 0 || t >= tiers[i - 1]),
      'tiers steigen mit der Handstaerke: ' + tiers.join(' <= '));
    ok(ti('3s3h') < ti('KsKh'), 'Underpair rangiert unter Overpair (vorher beide tier 4)');

    // Gegenprobe: auf unpaariertem Board darf sich nichts geaendert haben.
    ok(P.classify(CP('KhQd'), CP('KcQs2h')).made === P.MADE.TWOPAIR, 'echte Two Pair unveraendert');
    ok(P.classify(CP('AhKd'), CP('Kc7d2s')).made === P.MADE.TPTK, 'TPTK unveraendert');
    ok(P.classify(CP('9h8d'), CP('Kc9s2h')).made === P.MADE.SECOND, 'zweites Paar unveraendert');
    ok(P.classify(CP('AhAd'), CP('Kc7s2h')).made === P.MADE.OVERPAIR, 'Overpair unveraendert');

    // Und die Staerke muss zur echten Equity passen.
    const vr = P.parseRange(P.RFI.BTN);
    const eq = h => P.equityVsRange(CP(h), vr, b, 20000).eq;
    ok(eq('3s3h') < eq('TsTh') && eq('TsTh') < eq('KsKh'),
      'Equity steigt in derselben Reihenfolge wie die tiers');
  }


console.log('\n== Eigene Haende (ownhands.js) ==');
{
  const O = P.OwnHands;
  ok(O.HANDS.length >= 5, O.HANDS.length + ' feste Haende geladen');

  // Pot Odds sind eine geschlossene Formel — gegen Handrechnung geprueft.
  ok(Math.abs(O.requiredEquity(20, 10) - 1 / 3) < 1e-9, 'Pot 20, Call 10 -> 33.3% noetig');
  ok(Math.abs(O.requiredEquity(49.0, 20.5) - 20.5 / 69.5) < 1e-9, 'H126 River: 20.5 in 49.0');

  // Regression auf die zwei Tokens, die beim Schreiben dieser Ranges wirklich
  // danebengingen: 'AsK' wurde als AKo gelesen, 'Kh Th' verschwand still.
  // Seit parseRangeStrict werden beide gemeldet statt umgedeutet.
  ok(P.parseRange('AsK').length === 0, '"AsK" wird nicht mehr still als AKo gelesen');
  ok(P.validateRange('AsK').length === 1, '"AsK" wird als ungueltiges Token gemeldet');
  ok(P.validateRange('Kh Th').length === 2, 'Leerzeichen im Token: beide Haelften gemeldet');
  ok(P.validateRange('AsKc, 99, KhQh').length === 0, 'gueltige Notation bleibt unbeanstandet');
  const probs = O.validateRanges();
  ok(probs.length === 0, 'alle Range-Strings sauber geparst' + (probs.length ? ': ' + probs.join(' | ') : ''));

  for (const h of O.HANDS)
    for (const a of h.asks)
      ok(a.options.includes(a.actual), h.id + '/' + a.street + ': tatsaechliche Aktion steht zur Wahl');

  // Am Turn und River zaehlt die Engine vollstaendig aus. Stimmt das nicht,
  // waere das "exakt" in der UI eine Luege.
  for (const h of O.HANDS)
    for (const e of O.evalHand(h))
      if (e.basis === 'gerechnet' && (e.ask.street === 'turn' || e.ask.street === 'river'))
        ok(e.exact === true, h.id + '/' + e.ask.street + ': als exakt ausgewiesen');

  // Die inhaltlichen Kernaussagen des Session-Reviews. Kippt eine, weil
  // jemand spaeter eine Range anfasst, muss das hier auffallen.
  const rec = (id, street) => {
    const h = O.byId(id), a = h.asks.find(x => x.street === street);
    return O.evalAsk(h, a).rec;
  };
  ok(rec('h126', 'river') === 'FOLD', 'H126 River: T8 gegen die dritte Barrel ist ein Fold');
  ok(rec('h127', 'river') === 'FOLD', 'H127 River: Ass-hoch gegen drei Leads ist ein Fold');
  ok(rec('h118', 'river') === 'CHECK', 'H118 River: 99 in den fertigen Flush ist keine Value-Bet');
  ok(rec('h184', 'river') === 'CALL', 'H184 River: Trips zu 23% Pot Odds ist ein Call');

  // Wer die Empfehlung waehlt, muss auch 'ok' bekommen.
  for (const h of O.HANDS)
    for (const a of h.asks) {
      const e = O.evalAsk(h, a);
      const pick = e.rec === 'FOLD_OR_RAISE' ? 'FOLD' : e.rec;
      ok(O.grade(h, a, pick).level === 'ok', h.id + '/' + a.street + ': Empfehlung wird als ok benotet');
    }
}


console.log('\n== PWA / Offline ==');
{
  const root = path.join(__dirname, '..');
  const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sw  = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

  // Der Kernfehler bei GitHub Pages: absolute Pfade. Die App liegt unter
  // /<repo>/, ein fuehrender Slash zeigt ins Leere und sie startet leer.
  const mf = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  ok(mf.start_url === './' && mf.scope === './', 'Manifest: start_url und scope relativ');
  ok(mf.icons.every(i => !i.src.startsWith('/')), 'Manifest: Icon-Pfade relativ');
  ok(mf.icons.some(i => i.purpose === 'maskable'), 'Manifest: maskable Icon vorhanden');
  ok(/register\(['"]sw\.js['"]\)/.test(idx), 'Registrierung nutzt relatives sw.js');

  const pre = (sw.match(/const PRECACHE = \[([\s\S]*?)\];/) || [, ''])[1]
    .split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  ok(pre.length > 20, `Precache-Liste hat ${pre.length} Eintraege`);
  ok(pre.every(u => !u.startsWith('/')), 'Precache: alle Pfade relativ');
  ok(pre.every(u => !u.includes('?')), 'Precache: keine Query-Strings (wird per ignoreSearch aufgeloest)');
  ok(/ignoreSearch: true/.test(sw), 'sw.js loest ?v= per ignoreSearch auf');

  // Was index.html laedt, muss offline auch da sein. Genau diese Drift
  // macht die App still online-abhaengig.
  const wanted = [...idx.matchAll(/<script src="([^"?]+)/g)].map(m => m[1])
    .concat([...idx.matchAll(/<link rel="stylesheet" href="([^"?]+)/g)].map(m => m[1]));
  for (const w of wanted) ok(pre.includes(w), `sw.js cacht ${w}`);

  // Und die Dateien muessen es auch wirklich geben.
  for (const u of pre) {
    if (u === './') continue;
    ok(fs.existsSync(path.join(root, u)), `Datei existiert: ${u}`);
  }
}


console.log('\n== Postflop-Aktionsreihenfolge ==');
{
  // Der Fehler, der das ausgeloest hat: der Drill leitete die Reihenfolge aus
  // dem einen Boolean heroIP ab. Heads-up genuegt das, im Mehrweg nicht — als
  // CO hat man den BTN hinter sich UND den BB vor sich. Im Drill stand
  // deshalb "Du bist zuerst dran", obwohl der BB zuerst handelt.
  ok(P.actsBefore('BB', 'CO'), 'BB handelt postflop vor dem CO');
  ok(P.actsBefore('SB', 'BB'), 'SB vor BB');
  ok(!P.actsBefore('BTN', 'CO'), 'BTN handelt nach dem CO');
  ok(!P.actsBefore('CO', 'CO'), 'niemand handelt vor sich selbst');
  ok(P.POSTFLOP_ORDER[0] === 'SB' && P.POSTFLOP_ORDER[P.POSTFLOP_ORDER.length - 1] === 'BTN',
    'Reihenfolge laeuft von SB bis BTN');

  const mw = P.SPOTS.filter(s => s.tag === 'MW');
  ok(mw.length > 0, `${mw.length} Mehrweg-Spots`);
  for (const sp of mw) {
    ok(Array.isArray(sp.villPosKeys) && sp.villPosKeys.length === sp.villRanges('mid').length,
      `${sp.id}: je Gegner eine Position hinterlegt`);
    ok(sp.villActsBefore.length === sp.villPosKeys.length,
      `${sp.id}: Reihenfolge fuer jeden Gegner bestimmt`);
    // Hergeleitet, nicht gesetzt: muss zur Positionsliste passen.
    sp.villPosKeys.forEach((pk, i) => {
      ok(sp.villActsBefore[i] === P.actsBefore(pk, sp.heroPos),
        `${sp.id}: ${pk} vs ${sp.heroPos} korrekt eingeordnet`);
    });
    // Und der Anzeigetext darf dem nicht widersprechen.
    sp.villNames.forEach((nm, i) => {
      if (/vor dir/.test(nm)) ok(sp.villActsBefore[i] === true, `${sp.id}: "${nm}" ist auch wirklich vor dir`);
      if (/hinter dir/.test(nm)) ok(sp.villActsBefore[i] === false, `${sp.id}: "${nm}" ist auch wirklich hinter dir`);
    });
  }
  const co = mw.find(s => s.id === 'mw_co_btn_bb');
  ok(co && co.villActsBefore[1] === true && co.villActsBefore[0] === false,
    'CO vs BTN+BB: BB vor dir, BTN hinter dir — der Fall, der falsch war');
}

console.log('\n== River-Filter (Drill) ==');
{
  const RD = P.RiverDrill;
  const EIN_PAAR = [P.MADE.OVERPAIR, P.MADE.TPTK, P.MADE.TP, P.MADE.PP_MID, P.MADE.SECOND];
  P.seedRng(4242);
  let gebaut = 0, einPaar = 0, sortiert = 0, checkStimmt = 0;
  for (let i = 0; i < 25; i++) {
    const q = RD.make('deep');
    if (!q) continue;
    gebaut++;
    if (EIN_PAAR.includes(q.cls.made)) einPaar++;
    const ev = RD.evs(q);
    let abfallend = true;
    for (let k = 1; k < ev.list.length; k++) if (ev.list[k].ev > ev.list[k - 1].ev + 1e-9) abfallend = false;
    if (abfallend && ev.best === ev.list[0]) sortiert++;
    const check = ev.list.find(o => o.key === 'CHECK');
    const soll = ev.split.anteilVorne * q.pot + ev.split.anteilGleich * q.pot / 2;
    if (Math.abs(check.ev - soll) < 1e-9) checkStimmt++;
  }
  ok(gebaut >= 20, `Szenarien werden gebaut (${gebaut} von 25 Versuchen)`);
  ok(einPaar === gebaut, 'jedes Szenario ist eine Ein-Paar-Hand');
  ok(sortiert === gebaut, 'Optionen nach EV sortiert, best ist das Maximum');
  ok(checkStimmt === gebaut, 'EV(Check) ist der Showdown-Anteil am Pot');

  P.seedRng(99);
  let q2 = null;
  for (let i = 0; i < 20 && !q2; i++) q2 = RD.make('deep');
  const bet = RD.evs(q2).list.find(o => o.bet > 0).bet;
  const klein = RD.raiseSpot(q2, bet, 2), gross = RD.raiseSpot(q2, bet, 4);
  ok(Math.abs(klein.breakeven - klein.toCall / (klein.potNow + klein.toCall)) < 1e-9,
    'Breakeven = Call / (Pot + Call)');
  ok(gross.breakeven > klein.breakeven,
    `groessere Erhoehung verlangt mehr Bluffs (${(klein.breakeven * 100).toFixed(0)}% -> ${(gross.breakeven * 100).toFixed(0)}%)`);
  ok(klein.nValue + klein.nBluff > 0, 'seine Raise-Range ist nicht leer');
  const evSoll = klein.bluffAnteil * klein.potNow - (1 - klein.bluffAnteil) * klein.toCall;
  ok(Math.abs(klein.evCall - evSoll) < 1e-9, 'EV(Call) passt zum Bluff-Anteil');

  /* Der Bug, um den es ging: der Zufallsindex darf NICHT im find-Rueckruf
     gezogen werden — sonst liefert make() sporadisch null. */
  P.seedRng(20260911);
  let leer = 0;
  for (let i = 0; i < 40; i++) if (!RD.make('deep')) leer++;
  ok(leer === 0, `make() faellt nicht sporadisch auf null (${leer} Ausfaelle)`);
}

console.log('\n== Hand-Check (eigene Spots) ==');
{
  const SO = P.StackOff;
  ok(SO.SPOTS.length === 7, 'sieben Spots aus den Sessions 26./27.10.');
  ok(new Set(SO.SPOTS.map(s => s.id)).size === SO.SPOTS.length, 'Spot-IDs eindeutig');
  ok(SO.SPOTS.every(s => P.validateRange(s.villRange).length === 0 && (!s.callRange || P.validateRange(s.callRange).length === 0)),
    'alle Range-Strings lesbar');
  let maxOk = 0, foldNull = 0;
  const res = {};
  for (const s of SO.SPOTS) {
    const a = SO.analyse(s, 'station');
    res[s.id] = a;
    if (a.liste.every(o => o.ev <= a.best.ev + 1e-9)) maxOk++;
    if (!s.options.includes('FOLD') || a.evs.FOLD === 0) foldNull++;
  }
  ok(maxOk === SO.SPOTS.length, 'best ist jeweils die Option mit dem höchsten EV');
  ok(foldNull === SO.SPOTS.length, 'EV(Fold) ist 0');
  const k7 = res.k7s_midpair_jam;
  ok(k7.callAnteil === 1, 'K7s: er muss nur noch 6,5bb in 32bb nachlegen — committed, callt alles');
  ok(Math.abs(k7.A - (5.62 + 6.54)) < 1e-9, 'All-in-Betrag ist durch seinen Stack begrenzt');
  const jto = res.jto_bb_vs_3bet;
  ok(Math.abs(jto.callNoetig - 4.2 / 14.0) < 1e-9, 'JTo: Pot Odds = Call / (Pot + Call) = 30%');
  ok(jto.best.key === 'FOLD', 'JTo im BB gegen Open + 3-Bet: Fold ist die beste Option');
  ok(res.qjs_vs_min3bet.best.key === 'CALL', 'QJs gegen Min-3-Bet: Call ist die beste Option (20% Pot Odds)');
}

console.log('\n== Range-Verlauf ==');
{
  const RF = P.RangeFlow;
  // Linien folgen der Preflop-Reihenfolge: wer zuerst raist, sitzt vorne.
  ok(RF.linesFor('BB', 'BTN').join() === 'vOpen_hCall,vOpen_h3b', 'BB gegen BTN: nur er kann öffnen');
  ok(RF.linesFor('BTN', 'BB').join() === 'hOpen_vCall,hOpen_v3b', 'BTN gegen BB: nur du kannst öffnen');
  ok(RF.linesFor('BB', 'BB').length === 0, 'gleiche Position: keine Linie');
  ok(RF.villIP('BB', 'BTN') === true && RF.villIP('BTN', 'BB') === false, 'Position postflop richtig');
  ok(RF.villIP('CO', 'EP') === false, 'EP handelt postflop vor CO (EP/UTG-Abbildung)');

  // Hinterlegte Ranges werden exakt genommen, fehlende angenähert oder leer gemeldet.
  const a = RF.preflopRanges('vOpen_hCall', 'BB', 'BTN', 'mid');
  ok(a.vill.str === P.RFI.BTN && !a.vill.approx, 'BTN-Open = RFI.BTN');
  ok(a.hero.str === P.BB_FLAT.BTN, 'deine BB-Defense = BB_FLAT.BTN');
  const b = RF.preflopRanges('hOpen_vCall', 'MP', 'CO', 'mid');
  ok(b.vill.approx && b.vill.src.includes('CO_vs_EP'), 'CO-Call gegen MP: angenähert über CO_vs_EP und so markiert');
  const c = RF.preflopRanges('hOpen_vCall', 'EP', 'MP', 'mid');
  ok(c.vill === null, 'MP-Cold-Call gegen EP: nichts hinterlegt -> null statt erfundener Range');
  const d = RF.preflopRanges('vOpen_hCall', 'BB', 'BTN', 'short');
  ok(!d.vill.str.includes('43s'), 'Stackband short schneidet Randhände (adjustForStack)');

  // Flop: Aktionen verengen, ohne die Range zu verlieren; Karten werden entfernt.
  P.seedRng(7);
  const vr = P.parseRange(P.RFI.BTN), hr = P.parseRange(P.BB_FLAT.BTN);
  const board = C('Kh7d2c'), hero = C('AhKd');
  const base = { dead: hero, villIP: true, villRole: 'PFR', potType: 'SRP', band: 'mid', profile: P.PROFILES.reg, betPct: 0.33 };
  const W = r => r.reduce((x, y) => x + y.w, 0);
  const bet = RF.flopNarrow(vr, hr, board, Object.assign({ action: 'b' }, base));
  const chk = RF.flopNarrow(vr, hr, board, Object.assign({ action: 'x' }, base));
  ok(bet.range.length > 0 && chk.range.length > 0, 'Bet- und Check-Range nicht leer');
  ok(!bet.range.some(x => hero.includes(x.c[0]) || hero.includes(x.c[1]) || board.includes(x.c[0]) || board.includes(x.c[1])),
    'deine Karten und das Board sind aus seiner Range raus');
  const A0 = RF.analyse(vr, board, hero), Ab = RF.analyse(bet.range, board, hero), Ax = RF.analyse(chk.range, board, hero);
  const sh = (A, k) => A.groups[k].w / A.tot;
  ok(sh(Ab, 'strong') > sh(A0, 'strong') && sh(Ax, 'strong') < sh(A0, 'strong'), 'Bet-Range stärker, Check-Range schwächer als die Ausgangsrange');
  const sumG = Object.values(Ab.groups).reduce((x, g) => x + g.w, 0);
  ok(Math.abs(sumG - Ab.tot) < 1e-6, 'Gruppen summieren sich zur ganzen Range');
  const nit = RF.flopNarrow(vr, hr, board, Object.assign({}, base, { action: 'b', profile: P.PROFILES.nit }));
  ok(sh(RF.analyse(nit.range, board, hero), 'air') < sh(Ab, 'air'), 'Nit hat weniger Luft in der Bet-Range als ein Reg');
  // Abgleich mit Desktop Postflop (16.11.2026): BB-Caller donkt auf Q84 zwei Farben 0,7 %,
  // der BTN c-bettet deutlich öfter. Das Modell muss wenigstens die Richtung treffen.
  {
    const b2 = C('Qs8h4h');
    const take = (rng, opp, o) => {
      const base0 = W(rng.filter(x => !b2.includes(x.c[0]) && !b2.includes(x.c[1])));
      return W(RF.flopNarrow(rng, opp, b2, Object.assign({ dead: [], potType: 'SRP', band: 'mid', profile: P.PROFILES.reg, action: 'b', betPct: 0.33 }, o)).range) / base0;
    };
    const donk = take(hr, vr, { villIP: false, villRole: 'CALLER' });
    const cbet = take(vr, hr, { villIP: true, villRole: 'PFR' });
    ok(donk < 0.15, 'BB donkt auf Q84 selten (' + (donk * 100).toFixed(1) + ' %, Solver 0,7 %)');
    ok(cbet > 3 * donk, 'BTN bettet nach Check viel öfter als der BB donkt (' + (cbet * 100).toFixed(1) + ' %)');
    const chk2 = RF.flopNarrow(hr, vr, b2, { dead: [], potType: 'SRP', band: 'mid', profile: P.PROFILES.reg, action: 'x', villIP: false, villRole: 'CALLER' });
    ok(Math.abs(donk + W(chk2.range) / W(hr.filter(x => !b2.includes(x.c[0]) && !b2.includes(x.c[1]))) - 1) < 0.02, 'Bet + Check ≈ ganze Range (narrow verwirft Anteile unter 2 %)');
  }
  const xc = RF.flopNarrow(vr, hr, board, Object.assign({}, base, { villIP: false, villRole: 'CALLER', action: 'xc' }));
  const xo = RF.flopNarrow(vr, hr, board, Object.assign({}, base, { villIP: false, villRole: 'CALLER', action: 'x' }));
  ok(W(xc.range) < W(xo.range), 'Check-Call ist enger als nur Check');
  ok(RF.parseCards('AhAh').error && RF.parseCards('Xx').error && RF.parseCards('ah kd').cards.length === 2,
    'Karten-Eingabe: Dubletten und Unsinn werden gemeldet');

  // Solver-Export: jede Klasse einzeln, Teilgewichte als :w, zurückgelesen dieselbe Range.
  const ex1 = RF.solverRangeStr(P.parseRange('AA, AKs, KQo, 22:0.5'));
  ok(ex1 === 'AA,AKs,KQo,22:0.5', 'Export-Format: ' + ex1);
  const back = P.parseRange(RF.solverRangeStr(vr));
  ok(back.length === vr.length && Math.abs(W(back) - W(vr)) < 1e-6, 'Export der BTN-Range liest sich verlustfrei zurück');
  const ex2 = RF.solverExport({ villRange: vr, heroRange: hr, board, villIP: true, heroPos: 'BB', villPos: 'BTN', potType: 'SRP', band: 'mid' });
  ok(ex2.oop === RF.solverRangeStr(hr) && ex2.ip === RF.solverRangeStr(vr), 'BB ist OOP, BTN ist IP');
  const g2 = P.geometry({ potType: 'SRP', opponents: 1, id: '' }, 'mid');
  ok(ex2.board === 'Kh 7d 2c', 'Board mit Leerzeichen (WASM Postflop trennt nur daran)');
  ok(ex2.pot === g2.pot && /^\d+$/.test(ex2.potChips) && /^\d+$/.test(ex2.effChips)
    && +ex2.potChips === Math.round(g2.pot * 10), 'Pot/Stack als ganze Zahlen in Zehntel-bb');

  // Import-Dateien: dieselben Prüfungen wie checkJson/loadConfig in Desktop Postflop.
  const fr = ex2.files.ranges, fc = ex2.files.configurations;
  ok(fr.version === 2 && fr.name === 'ranges' && fc.version === 2 && fc.name === 'configurations', 'version 2 und exakte Store-Namen');
  const pathsOk = f => f.data.every((it, i) => it.path.length >= 1 && it.path.every(p => typeof p === 'string' && p.trim())
    && (it.path.length === 1 || f.data.slice(0, i).some(g => g.isGroup && g.path.join('/') === it.path.slice(0, -1).join('/'))));
  ok(pathsOk(fr) && pathsOk(fc), 'Pfade nicht leer, jede Gruppe steht vor ihren Einträgen');
  ok(fr.data.filter(x => !x.isGroup).every(x => typeof x.value === 'string')
    && fr.data[1].value === ex2.oop && fr.data[2].value === ex2.ip, 'Ranges als Strings, OOP und IP richtig');
  // Rate-Modus: Abweichung in Prozentpunkten, fehlende Schätzungen zählen nicht.
  const qs = RF.quizScore({ take: 40, value: 30, draws: 20, rest: 50 }, { take: 35, value: 45, draws: 20, rest: 35, eq: 60 });
  ok(qs.n === 4 && Math.abs(qs.meanAbs - (5 + 15 + 0 + 15) / 4) < 1e-9, 'Mittel der Beträge über geschätzte Felder, Equity ohne Schätzung ignoriert');
  ok(qs.worst.key === 'value' && qs.worst.diff === -15 && qs.rating.label === 'Gut', 'größte Abweichung und Bewertung (8,75 → Gut)');
  ok(RF.quizScore({}, { take: 10 }).meanAbs === null, 'ohne Schätzung keine Bewertung');
  ok(RF.quizScore({ take: 0 }, { take: 30 }).rating.label === 'Weit daneben', 'Schätzung 0 zählt als Schätzung');
  // Solver-Bibliothek: Zuordnung Spot -> Eintrag und Range aus Strategien.
  {
    const idx = { spots: [{ id: 'btn_bb__Qs8h4h', oopPos: 'BB', ipPos: 'BTN', openerPos: 'BTN', potType: 'SRP', band: 'mid', board: 'Qs8h4h' }] };
    const q84 = C('4hQs8h');
    ok(RF.solverEntryFor(idx, { heroPos: 'BB', villPos: 'BTN', line: 'vOpen_hCall', band: 'mid', board: q84 }), 'Eintrag gefunden (Board-Reihenfolge egal)');
    ok(RF.solverEntryFor(idx, { heroPos: 'BTN', villPos: 'BB', line: 'hOpen_vCall', band: 'mid', board: q84 }), 'auch aus Sicht des BTN');
    ok(!RF.solverEntryFor(idx, { heroPos: 'BB', villPos: 'BTN', line: 'vOpen_h3b', band: 'mid', board: q84 }), 'nicht im 3-Bet-Pot');
    ok(!RF.solverEntryFor(idx, { heroPos: 'BB', villPos: 'BTN', line: 'vOpen_hCall', band: 'deep', board: q84 }), 'nicht in anderem Stackband');
    // Mini-Lösung: zwei Hände je Spieler, Pot 60. OOP: X/B20/B48. IP nach Check: X/B20. OOP gg B20: F/C/R54.
    const d = {
      pot: 60, oop: { cards: ['AhAd', '7c6c'] }, ip: { cards: ['KcKd', '3c2c'] },
      nodes: {
        '': { p: 0, a: ['X', 'B20', 'B48'], s: [[1000, 200], [0, 300], [0, 500]] },
        '0': { p: 1, a: ['X', 'B20'], s: [[400, 100], [600, 900]] },
        '0-1': { p: 0, a: ['F', 'C', 'R54'], s: [[0, 700], [300, 300], [700, 0]] },
        '1': { p: 1, a: ['F', 'C', 'R54'], s: [[0, 1000], [1000, 0], [0, 0]] }
      }
    };
    const rOOP = P.parseRange('AA, 76s'), rIP = P.parseRange('KK, 32s');
    const W2 = r => r.reduce((a, x) => a + x.w, 0);
    const wOf = (r, s) => { const c = C(s); const x = r.find(y => (y.c[0] === c[0] && y.c[1] === c[1]) || (y.c[0] === c[1] && y.c[1] === c[0])); return x ? x.w : 0; };
    const brd = C('Js5h4d');
    const donk = RF.solverNarrow(d, rOOP, brd, { villIsOop: true, action: 'b', betPct: 0.8 });
    ok(donk.used === 80 && wOf(donk.range, '7c6c') === 0.5 && wOf(donk.range, 'AhAd') === 0, 'OOP-Bet 80 %: nächste Größe B48, Häufigkeit je Hand');
    const xr = RF.solverNarrow(d, rOOP, brd, { villIsOop: true, action: 'xr', betPct: 0.33 });
    ok(Math.abs(wOf(xr.range, 'AhAd') - 0.7) < 1e-9 && wOf(xr.range, '7c6c') === 0, 'Check-Raise = Check × Raise gegen die IP-Bet');
    const stab = RF.solverNarrow(d, rIP, brd, { villIsOop: false, action: 'b', betPct: 0.55 });
    ok(Math.abs(wOf(stab.range, '3c2c') - 0.9) < 1e-9 && /nächstliegende, 33 %/.test(stab.sizeNote), 'IP-Bet nach Check, Größenhinweis bei 55 % → 33 %');
    const call = RF.solverNarrow(d, rIP, brd, { villIsOop: false, action: 'c', betPct: 0.33 });
    ok(wOf(call.range, 'KcKd') === 1 && wOf(call.range, '3c2c') === 0 && W2(call.range) === 1, 'IP-Call gegen B20');
    ok(RF.solverNarrow(d, rIP, brd, { villIsOop: false, action: 'c', betPct: 0.33, dead: C('Kc2d') }).range.length === 0, 'deine Karten werden entfernt');
  }
  // Kurs (js/course.js)
  {
    const K = P.Course;
    ok(K.UNITS.length === 15 && new Set(K.UNITS.map(u => u.id)).size === 15, 'Block 1: 15 Einheiten, eindeutige IDs');
    const dows = K.UNITS.map((u, k) => new Date(K.plannedDate(k) + 'T00:00:00Z').getUTCDay());
    ok(dows.every(d => d >= 1 && d <= 5) && K.plannedDate(0) === '2026-11-16' && K.plannedDate(5) === '2026-11-23', 'Einheiten Mo–Fr ab 16.11.');
    ok(K.UNITS.every(u => u.tasks.reduce((a, t) => a + t.min, 0) <= 60), 'keine Einheit über 60 Minuten Aufträge');
    // Beispiel der Einheit 1: A7o gegen eine 4×-3-Bet ist ein klarer Fold — auch mit 90 % Realisierung.
    const ex1 = K.solve(K.UNITS[0].example());
    ok(ex1.best.key === 'FOLD' && ex1.robust, 'A7o gegen 4×-3-Bet: Fold, robust');
    // Robust heißt: bei 90 % und 75 % dieselbe beste Antwort.
    let seed = 3; const rr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let okAll = true, opts = new Set();
    for (const u of K.UNITS.slice(0, 3)) for (const g of u.quiz.gens) {
      const q = g(rr);
      if (q.kind === 'ev') { const a = K.solve(q); opts.add(a.best.key); if (!q.borderline && !a.robust) okAll = false; if (!(q.pot > 0 && q.toCall > 0 && q.heroBehind > q.toCall)) okAll = false; }
    }
    ok(okAll, 'Fragen der Einheiten 1–3: plausible Geometrie, robust oder als Grenzfall markiert');
    const oq = K.openQuestion({ positions: ['EP'], band: 'mid' }, rr);
    ok(oq.answer === (P.parseRange(P.adjustForStack(P.RFI.EP, 'mid')).some(x => P.handClassOf(x.c) === oq.hc) ? 'OPEN' : 'FOLD'), 'Open-Frage: Antwort aus RFI.EP');
    const g1 = K.grade(oq, oq.answer), g2 = K.grade(oq, oq.answer === 'OPEN' ? 'FOLD' : 'OPEN');
    ok(g1.right && !g2.right, 'Open-Frage wird richtig bewertet');
    const rep = K.report({ units: { 'b1-01': { started: 1, done: 2, quiz: { n: 6, right: 4, evLoss: 1.2 }, note: 'x' } } });
    ok(rep.units.length === 1 && rep.course.current === 'b1-02' && rep.units[0].quiz.right === 4, 'Coach-Bericht: erledigte Einheit, nächste ist b1-02');
  }
  const names = fr.data.slice(1).map(x => x.path[1]);
  ok(names[0].startsWith('1 OOP = BB') && names[1].startsWith('2 IP = BTN') && names.slice().sort().join() === names.join(),
    'Eintragsnamen: OOP sortiert vor IP, Position im Namen');
  // Schlüssel exakt wie in einer echten Export-Datei aus Desktop Postflop v0.2.7 (16.11.2026).
  const KEYS = 'startingPot,effectiveStack,rakePercent,rakeCap,donkOption,oopFlopBet,oopFlopRaise,oopTurnBet,oopTurnRaise,oopTurnDonk,oopRiverBet,oopRiverRaise,oopRiverDonk,ipFlopBet,ipFlopRaise,ipTurnBet,ipTurnRaise,ipRiverBet,ipRiverRaise,addAllInThreshold,forceAllInThreshold,mergingThreshold,expectedBoardLength,addedLines,removedLines';
  const cv = fc.data[1].value;
  ok(Object.keys(cv).join(',') === KEYS, 'configurations: alle Schlüssel, gleiche Reihenfolge');
  ok(cv.startingPot === +ex2.potChips && cv.effectiveStack === +ex2.effChips && Number.isInteger(cv.startingPot), 'Pot/Stack als ganze Zahlen');
  ok(/^[\d., x]*$/.test(cv.oopFlopBet + cv.ipTurnBet + cv.ipRiverRaise), 'Bet-Strings nur Zahlen/x');
}

console.log('\n' + (fails ? `### ${fails} FEHLER ###` : '### Alle Tests bestanden ###'));
process.exit(fails ? 1 : 0);
