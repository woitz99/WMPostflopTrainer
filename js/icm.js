/* =========================================================================
   icm.js — Independent Chip Model und ICM-Push/Fold-Ranges

   Bis hierher hatte der Trainer kein ICM, und das war die größte Lücke für
   ein Turnier mit Payjumps. Chips sind im Turnier nicht linear: die letzten
   Chips, die du gewinnst, sind weniger wert als die, die du verlierst. Genau
   deshalb ist ein Shove, der in Chips +EV ist, an der Bubble oft -EV in Geld.

   MODELL — Malmuth-Harville, geschätzt per Monte Carlo.
   Die Annahme: Die Wahrscheinlichkeit, dass Spieler i als nächster gewinnt,
   ist sein Chipanteil. Exakt aufzählen lässt sich das bei 100 Spielern und
   97 bezahlten Plätzen nicht (das wären 100! Reihenfolgen), simulieren schon.

   Der Trick dabei: Malmuth-Harville ist identisch zu einem Exponential-Rennen.
   Zieht man für jeden Spieler T_i = -ln(U)/stack_i, dann ist die Reihenfolge
   nach aufsteigendem T exakt die Plackett-Luce-Ziehung ohne Zurücklegen mit
   Gewichtung nach Stack. Statt 100 gewichteter Ziehungen pro Simulation
   braucht es damit nur 100 unabhängige Zufallszahlen — und wir brauchen
   ohnehin nur DEINEN Platz, nicht die ganze Reihenfolge.

   Was das Modell NICHT kann (und was in der UI auch so steht):
   - kein Skill, keine Position, keine Blindstruktur
   - keine Zukunftsspiele ("Future Game Simulation")
   - Malmuth-Harville überschätzt die Platzierungschancen kurzer Stacks leicht
   ========================================================================= */
(function () {
  const P = window.PT;

  /* ------------------------------------------------------------------ *
   * Auszahlungskurve.
   * Realistische MTT-Kurven folgen ungefähr einem Potenzgesetz. Der
   * Exponent 0.9 trifft die üblichen Eckwerte: Sieger ~15 % des Pools,
   * Min-Cash ~1,5–1,8 Buy-ins. Beide Werte werden in der UI angezeigt,
   * damit man sieht, ob die Kurve zum eigenen Turnier passt.
   * ------------------------------------------------------------------ */
  const PAYOUT_EXP = 0.9;
  function payoutCurve(paid, exp) {
    exp = exp === undefined ? PAYOUT_EXP : exp;
    const w = [];
    let sum = 0;
    for (let i = 1; i <= paid; i++) { const x = Math.pow(i, -exp); w.push(x); sum += x; }
    return w.map(x => x / sum);              // Anteile am Preispool, Summe 1
  }

  /** Auszahlungsvektor über ALLE verbliebenen Plätze (unbezahlte = 0). */
  function payoutsForField(left, paid, exp) {
    const c = payoutCurve(Math.min(paid, left), exp);
    const out = new Array(left).fill(0);
    for (let i = 0; i < c.length && i < left; i++) out[i] = c[i];
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Satellite: alle bezahlten Plätze bekommen dasselbe Ticket.
   * Damit ist jeder Chip über der Ticketgrenze wertlos — Platz 1 ist nicht
   * mehr wert als der letzte Ticketplatz. Genau das macht die Bubble eines
   * Satellites so viel enger als die eines normalen Turniers.
   * ------------------------------------------------------------------ */
  function flatPayoutsForField(left, tickets) {
    const t = Math.min(tickets, left);
    const out = new Array(left).fill(0);
    for (let i = 0; i < t; i++) out[i] = 1 / t;
    return out;
  }

  /* ------------------------------------------------------------------ *
   * ICM-Equity mehrerer Szenarien per Monte Carlo.
   *
   * ENTSCHEIDEND: alle Szenarien teilen dieselben Zufallszahlen (Common
   * Random Numbers). Wir bilden am Ende Differenzen wie "Equity mit 27bb
   * minus Equity mit 22bb" — das sind kleine Unterschiede großer Zahlen.
   * Mit getrennten Läufen war das Rauschen größer als der gesuchte Effekt:
   * eine Caller-Schwelle streute über fünf Seeds von 37,5 % bis 46,3 %,
   * obwohl die reinen Pot Odds bei 37,0 % lagen und die echte ICM-Prämie
   * für einen 27bb-Stack nahe null ist. Mit geteilten Zufallszahlen liegt
   * die Streuung im Zehntelpunktbereich.
   *
   * @param scenarios [{hero, others}] — others müssen überall gleich lang sein
   * @returns Anteile am Preispool, gleiche Reihenfolge wie scenarios
   * ------------------------------------------------------------------ */
  function scenarioEquity(scenarios, payouts, sims, seed) {
    sims = sims || 40000;
    let st = (seed || 987654321) >>> 0;
    const rnd = () => {
      st ^= st << 13; st >>>= 0;
      st ^= st >>> 17;
      st ^= st << 5; st >>>= 0;
      return (st || 1) / 4294967296;
    };
    const k = scenarios.length, n = scenarios[0].others.length;
    const sum = new Float64Array(k);
    const L = new Float64Array(n);              // -ln(U) je Gegnerplatz
    for (let s = 0; s < sims; s++) {
      const eh = -Math.log(rnd() || 1e-12);
      for (let j = 0; j < n; j++) L[j] = -Math.log(rnd() || 1e-12);
      for (let i = 0; i < k; i++) {
        const sc = scenarios[i];
        // Stack 0 heißt: schon draußen, also letzter Platz.
        const th = sc.hero > 0 ? eh / sc.hero : Infinity;
        const o = sc.others;
        let cnt = 0;
        for (let j = 0; j < n; j++) if (L[j] / o[j] < th) cnt++;
        sum[i] += payouts[cnt] || 0;
      }
    }
    const out = [];
    for (let i = 0; i < k; i++) out.push(sum[i] / sims);
    return out;
  }

  /** Bequemer Spezialfall: mehrere Hero-Stacks, gleiches Gegnerfeld. */
  function heroEquityMulti(heroStacks, others, payouts, sims, seed) {
    return scenarioEquity(heroStacks.map(h => ({ hero: h, others })), payouts, sims, seed);
  }

  /* ------------------------------------------------------------------ *
   * Feldmodell aus den Angaben, die man am Tisch tatsächlich kennt.
   * ------------------------------------------------------------------ */
  function fieldModel(cfg) {
    const left = cfg.left, shorts = Math.min(cfg.shortCount, left - 1);
    const total = cfg.avgBB * left;
    const rest = left - 1 - shorts;
    const restChips = total - cfg.heroBB - shorts * cfg.shortBB;
    const restBB = rest > 0 ? restChips / rest : 0;
    const others = [];
    for (let i = 0; i < shorts; i++) others.push(cfg.shortBB);
    for (let i = 0; i < rest; i++) others.push(restBB);
    // Ungültig ist das Feld, wenn für die übrigen Spieler nichts übrig bleibt
    // oder sie kürzer wären als die Shorties — dann ist die Eingabe in sich
    // widersprüchlich und jede Rechnung darauf wäre Unsinn.
    return {
      hero: cfg.heroBB, others, restBB, total,
      valid: rest === 0 ? restChips >= -1e-9 : (restBB > 0 && (shorts === 0 || restBB >= cfg.shortBB))
    };
  }

  /* ------------------------------------------------------------------ *
   * Kennzahlen: Bubble-Faktor und Risikoprämie.
   *
   * Bubble-Faktor = (was du beim Verlieren an Geld-Equity abgibst)
   *               / (was du beim Gewinnen dazubekommst).
   * 1.0 = Chips sind linear, Chip-EV reicht. Darüber musst du enger spielen.
   * Die benötigte Equity in einem reinen Doppel-oder-nichts steigt von 50 %
   * auf BF/(1+BF).
   * ------------------------------------------------------------------ */
  function metrics(field, payouts, sims) {
    const s = field.hero;
    const [eqNow, eqDouble, eqBust] = heroEquityMulti([s, 2 * s, 0], field.others, payouts, sims);
    const lose = eqNow - eqBust, win = eqDouble - eqNow;
    const bf = win > 1e-12 ? lose / win : Infinity;
    return {
      eqNow, eqDouble, eqBust, bubbleFactor: bf,
      needFlip: bf === Infinity ? 1 : bf / (1 + bf)
    };
  }

  /* ------------------------------------------------------------------ *
   * ICM-Push/Fold.
   *
   * Ablauf: Der Caller entscheidet selbst nach ICM (auch er verliert Geld,
   * wenn er ausscheidet), also wird abwechselnd gerechnet — erst seine
   * Call-Schwelle gegen deine Shove-Range, dann deine Shove-Range gegen
   * seine Call-Range. Zwei Runden reichen; danach bewegt sich kaum noch was.
   * ------------------------------------------------------------------ */
  const ANTE = 1.0;

  /* Handklassen nach Equity gegen eine Zufallshand, stark -> schwach.
     Einmal mit 60.000 Simulationen je Hand erzeugt und hier festgeschrieben,
     weil die Berechnung zur Laufzeit allein 2,2 Sekunden gekostet hat. Die
     Reihenfolge deckt sich mit den bekannten Preflop-Ranglisten:
     AA KK QQ JJ TT 99 88 AKs 77 AQs ... 52o 62o 42o 32o. */
  const RANKED = [
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', 'AKs', '77', 'AQs', 'AJs', 'AKo',
    'AQo', 'ATs', 'AJo', 'KQs', '66', 'KJs', 'A9s', 'ATo', 'KTs', 'A8s', 'KQo',
    'A7s', 'KJo', 'A9o', '55', 'QJs', 'A6s', 'K9s', 'A8o', 'A5s', 'KTo', 'QTs',
    'A4s', 'A7o', 'QJo', 'K8s', 'A3s', 'K9o', 'A6o', 'JTs', 'QTo', 'Q9s',
    'K7s', 'A5o', 'A2s', '44', 'A4o', 'K6s', 'Q8s', 'A3o', 'K8o', 'J9s', 'K5s',
    'Q9o', 'JTo', 'K4s', 'K7o', 'A2o', 'K6o', 'Q7s', 'T9s', 'K3s', 'J8s', '33',
    'Q8o', 'Q6s', 'K5o', 'J9o', 'K2s', 'Q5s', 'T8s', 'J7s', 'K4o', 'Q4s',
    'Q7o', 'J8o', 'T9o', 'K3o', 'Q6o', '98s', 'J6s', 'Q3s', '22', 'K2o', 'T7s',
    'Q2s', 'J5s', 'T8o', 'Q5o', 'J7o', 'Q4o', '97s', 'J4s', 'T6s', 'J3s',
    'Q3o', '98o', '87s', 'J6o', 'T7o', 'J2s', '96s', 'Q2o', 'T5s', 'J5o',
    'T4s', 'J4o', '86s', '97o', 'T6o', 'T3s', '95s', '76s', 'J3o', '87o',
    'T2s', '96o', '85s', 'J2o', 'T5o', '94s', '75s', 'T4o', '86o', '65s',
    '93s', '84s', 'T3o', '95o', '92s', '76o', '74s', 'T2o', '85o', '54s',
    '64s', '94o', '83s', '75o', '82s', '65o', '93o', '53s', '73s', '63s',
    '84o', '92o', '43s', '74o', '72s', '54o', '64o', '52s', '62s', '83o',
    '42s', '53o', '82o', '73o', '63o', '32s', '43o', '72o', '52o', '62o',
    '42o', '32o'
  ];
  function rankedHands() { return RANKED; }

  /* ------------------------------------------------------------------ *
   * Paarweise Equity-Matrix, 169 x 169.
   *
   * Der Fixpunkt zwischen Shove- und Call-Range braucht viele Iterationen,
   * bis er sich nicht mehr bewegt — mit nur zweien schwingt er und liefert
   * Unsinn (mehr Gegner hinter dir ergaben eine ENGERE Call-Range und
   * dadurch einen weiteren Push). Jede Iteration einzeln per Monte Carlo
   * zu rechnen kostet 700 ms, also wird die Matrix einmal gebaut; danach
   * ist jede Range-Equity ein gewichteter Mittelwert über Lookups.
   *
   * Gewichtet wird mit den tatsächlich verfügbaren Kombos: hältst du AKo,
   * kann der Gegner weniger AA und weniger AK haben. Das ist reine
   * Kombinatorik und wird exakt gezählt, nicht geschätzt.
   * ------------------------------------------------------------------ */
  const N_CLASSES = 169;
  let _M = null, _CNT = null, _IDX = null, _COMBOS = null;

  function classIndex() {
    if (_IDX) return _IDX;
    _IDX = {};
    P.HandProfile.allHandClasses().forEach((h, i) => _IDX[h] = i);
    return _IDX;
  }
  function combosOf() {
    if (_COMBOS) return _COMBOS;
    _COMBOS = P.HandProfile.allHandClasses().map(h => {
      const t = h.length === 2 ? '' : h[2];
      return P.handToCombos(h[0] + h[1] + t);
    });
    return _COMBOS;
  }

  /** Verfügbare Kombos von Klasse j, wenn Klasse i die Karten c0/c1 hält. */
  function buildCounts() {
    if (_CNT) return _CNT;
    const cls = P.HandProfile.allHandClasses(), combos = combosOf();
    _CNT = new Int16Array(N_CLASSES * N_CLASSES);
    for (let i = 0; i < N_CLASSES; i++) {
      const hole = P.HandProfile.canonicalCombo(cls[i]);
      const a = hole[0], b = hole[1];
      for (let j = 0; j < N_CLASSES; j++) {
        let n = 0;
        for (const c of combos[j]) if (c[0] !== a && c[0] !== b && c[1] !== a && c[1] !== b) n++;
        _CNT[i * N_CLASSES + j] = n;
      }
    }
    return _CNT;
  }

  /**
   * Entpackt die vorberechnete Equity-Matrix aus js/eqtable.js.
   *
   * Zur Laufzeit gerechnet kostete das 7,4 Sekunden am Rechner (am iPhone
   * eher 25) und war mit 220 Simulationen je Paar trotzdem zu ungenau —
   * AA gegen KK kam auf 78,9 % statt 82 %. Deshalb einmal offline mit 8.000
   * Simulationen je Paar erzeugt (Standardfehler ~0,6 Punkte) und als
   * 28-kB-Tabelle beigelegt. Entpacken dauert Millisekunden.
   */
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const B64I = (() => { const m = {}; for (let i = 0; i < 64; i++) m[B64[i]] = i; return m; })();
  function buildMatrix() {
    if (_M) return _M;
    buildCounts();
    const t = P.EQ_TABLE;
    if (!t) throw new Error('js/eqtable.js fehlt — ohne die Tabelle gibt es keine ICM-Ranges.');
    _M = new Float32Array(N_CLASSES * N_CLASSES);
    let p = 0;
    for (let i = 0; i < N_CLASSES; i++) {
      _M[i * N_CLASSES + i] = 0.5;
      for (let j = i + 1; j < N_CLASSES; j++) {
        const e = ((B64I[t[p]] << 6) | B64I[t[p + 1]]) / 4095;
        p += 2;
        _M[i * N_CLASSES + j] = e;
        _M[j * N_CLASSES + i] = 1 - e;
      }
    }
    return _M;
  }
  function matrixReady() { return !!_M; }

  /** Equity einer Handklasse gegen eine Menge von Handklassen (Indizes). */
  function eqVsSet(i, setIdx) {
    let num = 0, den = 0;
    for (let k = 0; k < setIdx.length; k++) {
      const j = setIdx[k], w = _CNT[i * N_CLASSES + j];
      num += w * _M[i * N_CLASSES + j]; den += w;
    }
    return den ? num / den : 0.5;
  }

  const comboW = h => h.length === 2 ? 6 : h[2] === 's' ? 4 : 12;
  function topPct(p) {
    const target = 1326 * p / 100, out = [];
    let n = 0;
    for (const h of rankedHands()) { if (n >= target) break; out.push(h); n += comboW(h); }
    return out;
  }
  const widthOf = list => list.reduce((a, h) => a + comboW(h), 0) / 1326 * 100;

  /**
   * @param cfg {left, paid, heroBB, shortCount, shortBB, avgBB, behind, sims, eqSims}
   *   behind = wie viele Spieler nach dir noch handeln können.
   * @returns Kennzahlen plus Push-Entscheidung je Handklasse.
   */
  /** @param _noDefend intern: bricht die Rekursion bei der Shover-Range ab. */
  function pushFoldICM(cfg, _noDefend) {
    const H = P.HandProfile;
    const field = fieldModel(cfg);
    const payouts = cfg.sat ? flatPayoutsForField(cfg.left, cfg.paid) : payoutsForField(cfg.left, cfg.paid);
    const sims = cfg.sims || 40000, eqSims = cfg.eqSims || 1400;
    const behind = Math.max(1, cfg.behind || 3);
    const s = field.hero;
    const m = metrics(field, payouts, sims);

    /* Chip-Erhaltung: das tote Geld kommt aus konkreten Stacks, nicht aus
       dem Nichts. SB verliert 0.5, BB verliert 1.0 + 1.0 Ante. Angenommen
       wird, dass du selbst nicht in den Blinds sitzt. */
    const dead = ANTE + 1.5;
    const o = field.others;
    const idxOf = pred => { const i = o.findIndex(pred); return i < 0 ? 0 : i; };
    const iV = idxOf(x => x >= s);                     // Caller, deckt dich
    const v = o[iV];
    let iSB = -1, iBB = -1;
    for (let i = 0; i < o.length; i++) {
      if (i === iV) continue;
      if (iSB < 0) iSB = i; else if (iBB < 0) { iBB = i; break; }
    }
    const mk = (dV, dSB, dBB) => {
      const a = o.slice();
      a[iV] += dV; a[iSB] += dSB; a[iBB] += dBB;
      return a;
    };
    const oAllFold = mk(0, -0.5, -2.0);
    const oHeroWin = mk(-s, -0.5, -2.0);
    const oHeroLose = mk(s + dead, -0.5, -2.0);

    /* Alle Hero-Szenarien in EINEM Lauf, damit die Differenzen belastbar
       sind. Folden = Status quo; dass dich die Blinds weiter auffressen,
       ist bewusst NICHT modelliert (siehe Hinweis unten). */
    const hEq = scenarioEquity([
      { hero: s, others: o },                          // 0 Folden
      { hero: s + dead, others: oAllFold },            // 1 alle folden
      { hero: 2 * s + dead, others: oHeroWin },        // 2 gecallt, gewonnen
      { hero: 0, others: oHeroLose }                   // 3 gecallt, verloren
    ], payouts, sims);
    const EQ_FOLD = hEq[0], EQ_ALLFOLD = hEq[1], EQ_WIN = hEq[2], EQ_LOSE = hEq[3];

    /* Caller-Sicht — ebenfalls ein einziger Lauf. Er deckt dich, riskiert
       also nur s und nicht seinen Stack. Seine ICM-Prämie ist deshalb
       klein; seine Schwelle liegt nur knapp über den reinen Pot Odds. */
    const rebuild = (heroStack, arr) => {
      const a = arr.slice(); a.splice(iV, 1); a.push(heroStack); return a;
    };
    const vEq = scenarioEquity([
      { hero: v, others: rebuild(s + dead, oAllFold) },        // er foldet
      { hero: v + s + dead, others: rebuild(0, oHeroLose) },   // er callt, gewinnt
      { hero: v - s, others: rebuild(2 * s + dead, oHeroWin) } // er callt, verliert
    ], payouts, sims);
    const needCall = (vEq[0] - vEq[2]) / (vEq[1] - vEq[2]);
    const potOddsCall = s / (2 * s + dead);

    /* --- Fixpunkt: seine Call-Range und deine Shove-Range ---
       Gedämpft und über viele Runden. Ungedämpft schwingt das System:
       eine engere Call-Range macht deinen Push weiter, der weitere Push
       macht seinen Call wieder weiter, und nach zwei Runden landet man
       je nach Startwert auf der falschen Seite. Mit 0.5er Dämpfung und
       30 Runden steht es still. Dank der Matrix kostet eine Runde nichts. */
    buildMatrix(cfg.pairSims, cfg.onProgress);
    const IDX = classIndex();
    const hands = H.allHandClasses();
    const allIdx = hands.map((h, i) => i);
    const wOf = idxList => idxList.reduce((a, i) => a + comboW(hands[i]), 0) / 1326;

    let callIdx = topPct(20).map(h => IDX[h]);
    let pushIdx = topPct(50).map(h => IDX[h]);
    let pAny = 0;
    for (let it = 0; it < 30; it++) {
      const nc = allIdx.filter(i => eqVsSet(i, pushIdx) >= needCall);
      const ncSafe = nc.length ? nc : topPct(4).map(h => IDX[h]);
      // Dämpfung über die Breite: Ziel-Breite mitteln, dann die stärksten
      // Hände bis zu dieser Breite nehmen.
      const targetW = 0.5 * wOf(callIdx) + 0.5 * wOf(ncSafe);
      callIdx = topPct(targetW * 100).map(h => IDX[h]);

      const p1 = wOf(callIdx);
      pAny = 1 - Math.pow(1 - p1, behind);
      const np = allIdx.filter(i => {
        const eq = eqVsSet(i, callIdx);
        return (1 - pAny) * EQ_ALLFOLD + pAny * (eq * EQ_WIN + (1 - eq) * EQ_LOSE) > EQ_FOLD;
      });
      const targetP = 0.5 * wOf(pushIdx) + 0.5 * wOf(np);
      pushIdx = topPct(targetP * 100).map(h => IDX[h]);
    }
    const callList = callIdx.map(i => hands[i]);
    const pushList = pushIdx.map(i => hands[i]);

    /* --- Dieselbe Rechnung rein in Chips, als Vergleich --- */
    const pushChips = allIdx.filter(i => {
      const eq = eqVsSet(i, callIdx);
      return (1 - pAny) * dead + pAny * (eq * (2 * s + dead) - s) > 0;
    }).map(i => hands[i]);

    /* --- Die andere Seite: DU musst callen ---
       Das ist der Fall, in dem an der Bubble tatsächlich fast alles in den
       Müll gehört. Beim Shoven hilft dir der ICM-Druck der anderen (sie
       müssen folden), beim Callen gibt es keine Fold-Equity — der ganze
       Druck wirkt gegen dich. Deshalb sind die beiden Ranges völlig
       verschieden, und wer sie verwechselt, spielt an der Bubble falsch. */
    const shover = Math.min(cfg.shortBB, s);       // er deckt dich höchstens
    const risk = Math.min(s, shover);
    const dEq = scenarioEquity([
      { hero: s, others: o },                                        // folden
      { hero: s + risk + dead, others: mk(0, -0.5, -2.0) },          // callen, gewonnen
      { hero: s - risk, others: mk(0, -0.5, -2.0) }                  // callen, verloren
    ], payouts, sims);
    const needDefend = (dEq[0] - dEq[2]) / (dEq[1] - dEq[2]);
    const potOddsDefend = risk / (2 * risk + dead);

    /* Referenz ist SEINE Shove-Range, nicht deine.
       Vorher wurde gegen pushIdx (die eigene Shove-Range) gerechnet. Bei
       gleichen Stacks fiel das kaum auf, bei ungleichen war es grob falsch:
       ein 60bb-Chipleader wurde an seiner eigenen Premium-Push-Range
       gemessen und durfte einen 8bb-Shove nur mit AA/KK callen, obwohl
       seine ICM-Schwelle fast auf Pot-Odds-Niveau liegt.
       Die Shove-Range des Shorties entsteht aus derselben Rechnung mit ihm
       als Held — _noDefend bricht die Rekursion nach einer Ebene ab. */
    let shoveRef = pushIdx, shoveRefPct = null;
    if (!_noDefend && shover < s - 0.01) {
      const sub = pushFoldICM(Object.assign({}, cfg, {
        heroBB: shover, sims: Math.max(8000, Math.round(sims / 4))
      }), true);
      const idx = sub.push.range.map(h => IDX[h]).filter(i => i !== undefined);
      if (idx.length >= 8) { shoveRef = idx; shoveRefPct = sub.push.pct; }
    }
    const defendIdx = allIdx.filter(i => eqVsSet(i, shoveRef) >= needDefend);
    const defendChipIdx = allIdx.filter(i => eqVsSet(i, shoveRef) >= potOddsDefend);

    return {
      field, payouts, metrics: m, behind,
      defend: {
        vsStack: shover, risk, shoverPct: shoveRefPct,
        need: needDefend, potOdds: potOddsDefend,
        range: defendIdx.map(i => hands[i]), pct: widthOf(defendIdx.map(i => hands[i])),
        chipRange: defendChipIdx.map(i => hands[i]), chipPct: widthOf(defendChipIdx.map(i => hands[i]))
      },
      isShortest: field.others.every(x => x >= s),
      minCash: payouts[cfg.paid - 1] || 0, firstPrize: payouts[0],
      caller: { stack: v, need: needCall, potOdds: potOddsCall, range: callList, pct: widthOf(callList) },
      pAnyCall: pAny,
      push: { range: pushList, pct: widthOf(pushList) },
      pushChipEV: { range: pushChips, pct: widthOf(pushChips) },
      dropped: pushChips.filter(h => !pushList.includes(h)),
      added: pushList.filter(h => !pushChips.includes(h)),
      dead, EQ_FOLD, EQ_ALLFOLD, EQ_WIN, EQ_LOSE
    };
  }

  P.ICM = {
    PAYOUT_EXP, payoutCurve, payoutsForField, flatPayoutsForField, scenarioEquity, heroEquityMulti,
    fieldModel, metrics, pushFoldICM, rankedHands, topPct, widthOf, ANTE,
    buildMatrix, matrixReady, eqVsSet, classIndex, N_CLASSES
  };
})();
