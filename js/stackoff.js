/* =========================================================================
   stackoff.js — Hand-Check: deine eigenen Stack-off- und 3-Bet-Spots

   Sieben Hände aus Manuels Sessions vom 26. und 27.10.2026, mit den echten
   Beträgen aus den win2day-Handhistorien (umgerechnet in bb). Gefragt wird
   jeweils die eine Entscheidung, um die es ging. Die Frage dahinter ist
   immer dieselbe: „Welche schlechtere Hand bezahlt mich hier?"

   Was gerechnet wird und was nicht:
   - Equity: exakt über alle Runouts (Flop/Turn) bzw. Monte Carlo preflop,
     mit der Engine des Trainers.
   - Seine Range am Entscheidungspunkt ist pro Hand von Hand gesetzt und
     begründet (Position, Stack, Aktion). Das ist die eine Annahme, von der
     alles abhängt — deshalb steht die Begründung im Spot selbst.
   - Wer auf einen All-in callt: postflop aus continueWeight (dieselbe
     Logik wie im Trainer). Muss er weniger als ein Viertel nachlegen, callt
     er alles — so weit committed foldet niemand. Preflop steht seine
     Call-Range explizit im Spot.
   - Call und Check sind eine Showdown-Näherung: Equity × Realisierung ×
     Pot, mit denselben Faktoren wie recommendFacing (IP 1,04 / OOP 0,90).
     Spätere Straßen sind nicht modelliert. Für einen Call ist das eher zu
     freundlich — wenn der Call trotzdem hinten liegt, liegt er sicher hinten.
   ========================================================================= */
(function () {
  const P = window.PT;

  const REALIZE = { IP: 1.04, OOP: 0.90 };   // wie in strategy.js recommendFacing
  const COMMITTED = 0.25;                    // muss er weniger nachlegen, callt er alles
  const TOLERANZ = 0.3;                      // bb, innerhalb derer zwei Optionen gleich gut sind

  const OPT_LABEL = { FOLD: 'Fold', CHECK: 'Check', CALL: 'Call', JAM: 'All-in' };

  /* Alle Beträge in bb, gerechnet aus den Chipbeträgen der Handhistorie.
     pot = Pot VOR deiner Entscheidung, inklusive seiner Bet. */
  const SPOTS = [
    {
      id: 'a7o_cr_jam',
      titel: 'A7o — Check-Raise-All-in mit Top Pair, schwachem Kicker',
      quelle: '26.10. · €5 Rebuy · Hand #13 · Blinds 125/250',
      hero: 'Ac7d', board: 'AdTh6h', heroPos: 'CO', villPos: 'BTN', ip: false,
      log: [
        'Preflop: ein Limper, du limpst mit A7o dahinter (53,6bb hinter dir).',
        'Der BTN (26,8bb) raist auf 5bb, du callst. Pot 13,5bb.',
        'Flop A♦T♥6♥: du checkst, er bettet 6bb.'
      ],
      pot: 19.46, toCall: 6.0, heroBehind: 53.58, villBehind: 15.64,
      villRange: '22+, A2s+, A7o+, K9s+, KTo+, QTs+, QJo, JTs, T9s, 98s',
      villRangeWarum: 'Iso-Raise vom BTN über Limper mit 27bb: Paare, Asse ab A7o, gute Broadways und suited Connectors. Auf einem Ass-Board bettet er klein mit fast allem.',
      options: ['FOLD', 'CALL', 'JAM'],
      passiert: 'Du gehst all-in, er callt mit A♠T♦ — Two Pair. −26,8bb.'
    },
    {
      id: 'jto_bb_vs_3bet',
      titel: 'JTo im BB gegen Open und 3-Bet',
      quelle: '26.10. · €5 Rebuy · Hand #10 · Blinds 100/200',
      hero: 'JdTc', board: '', heroPos: 'BB', villPos: 'UTG+1', ip: false, preflop: true,
      log: [
        'UTG raist auf 2,1bb, UTG+1 (25bb) 3-bettet auf 5,2bb.',
        'Alle folden zu dir in den BB (94bb). Hinter dir hat der Opener noch zu entscheiden.'
      ],
      pot: 9.8, toCall: 4.2, heroBehind: 92.9, villBehind: 19.55,
      villRange: 'TT+, AQ+, AJs, KQs, A5s:0.5, A4s:0.5',
      villRangeWarum: '3-Bet aus UTG+1 gegen ein UTG-Open mit 25bb: wertlastig, dazu ein paar Ax suited als Bluff.',
      callRange: 'JJ+, AK',
      callRangeWarum: 'Gegen einen 4-Bet-All-in bleibt er mit JJ+ und AK — mit 25bb ist er dafür ohnehin fast committed.',
      options: ['FOLD', 'CALL', 'JAM'],
      passiert: 'Du callst, der Opener callt auch. Am Turn gehst du mit J-hoch und Flushdraw all-in, er hat JJ. −24,9bb. Der teure Teil war der Call hier.'
    },
    {
      id: 'k8s_cbet_jam',
      titel: 'K8s — C-Bet-All-in mit K-hoch auf A-6-4',
      quelle: '26.10. · €5 Rebuy · Hand #91 · Blinds 500/1000',
      hero: 'Ks8s', board: 'Ad6s4d', heroPos: 'SB', villPos: 'CO', ip: false,
      log: [
        'Der CO (31bb) öffnet auf 2bb, du 3-bettest aus dem SB auf 7bb (22bb Stack).',
        'Er callt. Pot 16bb, du hast noch 15bb.',
        'Flop A♦6♠4♦: du bist dran.'
      ],
      pot: 16.0, toCall: 0, heroBehind: 14.98, villBehind: 24.37,
      villRange: '22-JJ, AQo, AJs-A2s, AJo, ATo:0.5, KQs, KJs, KQo, QJs, JTs, T9s, 98s',
      villRangeWarum: 'Flat gegen eine 3-Bet aus dem SB mit 31bb: mittlere Paare, Ax, Broadways. AA/KK/QQ/AK hätte er meist selbst 4-gebettet.',
      options: ['CHECK', 'JAM'],
      passiert: 'Du gehst all-in, er callt mit A♠Q♦. Bust. −22,1bb.'
    },
    {
      id: 'qto_flop_jam',
      titel: 'QTo — Flop-All-in mit Q-hoch gegen den 3-Bettor',
      quelle: '26.10. · €10 BOOST · Hand #40 · Blinds 175/350',
      hero: 'QcTh', board: '5s6c8s', heroPos: 'BTN', villPos: 'SB', ip: true,
      log: [
        'Du öffnest vom BTN auf 2,3bb (29,5bb Stack), der SB (74bb) 3-bettet auf 7bb.',
        'Du callst. Pot 16bb.',
        'Flop 5♠6♣8♠: er bettet 5,4bb.'
      ],
      pot: 21.48, toCall: 5.45, heroBehind: 22.4, villBehind: 61.6,
      villRange: 'TT+, 99:0.7, 88:0.7, 77:0.5, AQ+, AJs, ATs, KQs, KJs, QJs, JTs, A5s-A2s, AJo:0.5, ATo:0.3, A9o:0.3, A8o:0.3, KQo:0.5',
      villRangeWarum: 'SB gegen BTN-Steal 3-bettet breit: starke Hände plus Ax und Broadways. Auf diesem Board bettet er klein mit seiner ganzen Range.',
      options: ['FOLD', 'CALL', 'JAM'],
      passiert: 'Du gehst all-in, er callt mit A♠8♦ — Top Pair. −29,5bb, Rebuy.'
    },
    {
      id: 'k7s_midpair_jam',
      titel: 'K7s — mittleres Paar gegen eine Bet, Raise oder nicht?',
      quelle: '26.10. · €10 BOOST · Hand #33 · Blinds 175/350',
      hero: 'Kd7d', board: 'Qh7c6c', heroPos: 'CO', villPos: 'LJ', ip: true,
      log: [
        'Der LJ (14bb) öffnet auf 2bb, du callst im CO (26,8bb), der SB callt mit.',
        'Pot 8bb.',
        'Flop Q♥7♣6♣: SB checkt, der LJ bettet 5,6bb. Ihm bleiben dahinter nur noch 6,5bb.'
      ],
      pot: 13.65, toCall: 5.62, heroBehind: 24.62, villBehind: 6.54,
      villRange: '22+, A2s+, A9o+, K9s+, KJo+, QTs+, QJo, JTs, T9s, 98s, 87s',
      villRangeWarum: 'Open aus dem LJ mit 14bb: Paare, Ax, Broadways, ein paar suited Connectors. Nach seiner großen Bet ist er mit dem Rest committed.',
      options: ['FOLD', 'CALL', 'JAM'],
      passiert: 'Du gehst all-in, er callt mit Q♠J♣ — Top Pair. −14,3bb.'
    },
    {
      id: 'qjs_vs_min3bet',
      titel: 'QJs gegen einen Min-3-Bet',
      quelle: '27.10. · €10 BOOST · Hand #57 · Blinds 250/500',
      hero: 'QhJh', board: '', heroPos: 'UTG', villPos: 'UTG+1', ip: false, preflop: true,
      log: [
        'Du öffnest aus UTG auf 2,3bb (50bb Stack).',
        'Direkt hinter dir 3-bettet UTG+1 (32bb) auf nur 4,6bb — ein Min-3-Bet. Alle anderen folden.'
      ],
      pot: 9.24, toCall: 2.3, heroBehind: 47.8, villBehind: 27.0,
      villRange: 'TT+, AQ+, AJs, KQs, JJ, 99:0.5, AJo:0.5',
      villRangeWarum: 'Ein Min-3-Bet gegen ein UTG-Open ist auf diesem Level meist stark: hohe Paare, gute Asse, wenige Bluffs.',
      callRange: 'QQ+, AK, JJ:0.5',
      callRangeWarum: 'Gegen einen 4-Bet-All-in über 32bb bleibt er mit QQ+, AK und einem Teil seiner JJ.',
      options: ['FOLD', 'CALL', 'JAM'],
      passiert: 'Du callst. Am Turn bettest du mit Gutshot in ihn, er raist, du foldest. −15,2bb — der teure Teil war die Turn-Bet, nicht der Call hier.'
    },
    {
      id: 'kjo_vs_3bet',
      titel: 'KJo ohne Position gegen eine 3-Bet',
      quelle: '27.10. · €10 BOOST · Hand #106 · Blinds 600/1200',
      hero: 'KdJc', board: '', heroPos: 'UTG+1', villPos: 'LJ', ip: false, preflop: true,
      log: [
        'Du öffnest aus UTG+1 auf 2,3bb (64bb Stack).',
        'Der Spieler direkt hinter dir (32bb) 3-bettet auf 6,6bb. Alle folden zu dir.'
      ],
      pot: 11.28, toCall: 4.3, heroBehind: 61.9, villBehind: 25.4,
      villRange: 'TT+, AQ+, AJs, KQs, A5s:0.5, A4s:0.5, 99:0.5, AJo:0.3',
      villRangeWarum: '3-Bet in Position gegen ein frühes Open mit 32bb: wertlastig, dazu ein paar Ax suited.',
      callRange: 'QQ+, AK, JJ:0.6',
      callRangeWarum: 'Gegen deinen 4-Bet-All-in callt er mit QQ+, AK und meist JJ.',
      options: ['FOLD', 'CALL', 'JAM'],
      passiert: 'Du callst, checkst und callst am Flop mit K-hoch, am Turn foldest du gegen seine zweite Bet. −10,6bb.'
    }
  ];

  const cards = s => (s.match(/[2-9TJQKA][cdhs]/g) || []).map(P.cardFromStr);
  const sumW = r => r.reduce((a, x) => a + x.w, 0) || 1;

  /** Equity, Call-Verhalten und EV aller Optionen für einen Spot. */
  /**
   * @param opts optional { realize, sims } — für den Kurs (js/course.js), der
   *   prüft, ob eine Antwort auch bei schlechterer Realisierung hält, und
   *   preflop mit weniger Simulationen auskommt. Ohne opts: wie bisher.
   */
  function analyse(spot, profilKey, opts) {
    opts = opts || {};
    const profil = P.PROFILES[profilKey || 'reg'] || P.PROFILES.reg;
    const hero = cards(spot.hero), board = cards(spot.board);
    const dead = new Set(hero.concat(board));
    const range = P.parseRange(spot.villRange).filter(x => !dead.has(x.c[0]) && !dead.has(x.c[1]));
    const tw = sumW(range);
    const realize = opts.realize || (spot.ip ? REALIZE.IP : REALIZE.OOP);
    const SIMS = opts.sims || 40000;

    /* Was du mit einem All-in insgesamt einsetzt — mehr als er noch hat,
       kann er nicht bezahlen. */
    const A = Math.min(spot.heroBehind, spot.toCall + spot.villBehind);
    const seinCall = A - spot.toCall;
    const finalPot = spot.pot + A + seinCall;
    const seinBedarf = seinCall / finalPot;    // Pot Odds für SEINEN Call

    let eqGesamt, callAnteil, eqGegenCaller, vorneGegenCaller, combos = [];

    if (spot.preflop) {
      P.seedRng(20261027);
      eqGesamt = P.equityVsRange(hero, range, [], SIMS).eq;
      const callR = P.parseRange(spot.callRange).filter(x => !dead.has(x.c[0]) && !dead.has(x.c[1]));
      /* Call-Anteil = Gewicht seiner Call-Hände INNERHALB seiner 3-Bet-Range. */
      const key = c => Math.min(c[0], c[1]) * 52 + Math.max(c[0], c[1]);
      const inRange = new Map(range.map(x => [key(x.c), x.w]));
      let wCall = 0;
      const callIn = [];
      for (const x of callR) {
        const w = inRange.get(key(x.c));
        if (w) { const ww = Math.min(w, x.w); wCall += ww; callIn.push({ c: x.c, w: ww }); }
      }
      callAnteil = wCall / tw;
      eqGegenCaller = callIn.length ? P.equityVsRange(hero, callIn, [], SIMS).eq : 0;
      vorneGegenCaller = null;
    } else {
      let eqSum = 0, cSum = 0, cEq = 0, cVorne = 0;
      for (const x of range) {
        const e = P.equityVsRange(hero, [{ c: x.c, w: 1 }], board).eq;
        const cls = P.classify(x.c, board);
        const pct = seinCall / Math.max(0.1, spot.pot + spot.toCall);
        let cw = P.continueWeight(cls, pct, board.length === 3 ? 'flop' : board.length === 4 ? 'turn' : 'river', profil);
        if (seinBedarf <= COMMITTED) cw = 1;
        eqSum += x.w * e;
        cSum += x.w * cw; cEq += x.w * cw * e;
        if (e >= 0.5) cVorne += x.w * cw;
        combos.push({ c: x.c, w: x.w, eq: e, cw, cls: cls.made });
      }
      eqGesamt = eqSum / tw;
      callAnteil = cSum / tw;
      eqGegenCaller = cSum ? cEq / cSum : 0;
      vorneGegenCaller = cSum ? cVorne / cSum : 0;
    }

    const evs = {};
    for (const o of spot.options) {
      if (o === 'FOLD') evs.FOLD = 0;
      else if (o === 'CHECK') evs.CHECK = eqGesamt * realize * spot.pot;
      else if (o === 'CALL') evs.CALL = eqGesamt * realize * (spot.pot + spot.toCall) - spot.toCall;
      else if (o === 'JAM') evs.JAM = (1 - callAnteil) * spot.pot + callAnteil * (eqGegenCaller * finalPot - A);
    }
    const liste = spot.options.map(k => ({ key: k, label: OPT_LABEL[k], ev: evs[k] }));
    const best = liste.slice().sort((a, b) => b.ev - a.ev)[0];

    /* Was ihn beim All-in bezahlt, nach Handklasse — die Antwort auf
       „welche schlechtere Hand callt?" */
    const zahler = {};
    for (const x of combos) if (x.cw > 0.3) {
      const k = (x.eq >= 0.5 ? 'schlechter: ' : 'besser: ') + x.cls;
      zahler[k] = (zahler[k] || 0) + x.w * x.cw;
    }

    return {
      hero, board, A, finalPot, seinCall, eqGesamt, callAnteil, eqGegenCaller, vorneGegenCaller,
      foldNoetig: A / (spot.pot + A),          // reiner Bluff: so oft muss er folden
      callNoetig: spot.toCall ? spot.toCall / (spot.pot + spot.toCall) : null,
      jamNoetig: A / finalPot,                 // Equity, die ein gecallter All-in braucht
      realize, evs, liste, best,
      zahler: Object.entries(zahler).sort((a, b) => b[1] - a[1]),
      nKombos: range.length, profil: profil.key
    };
  }

  function bewerte(spot, a, key) {
    const gewaehlt = a.evs[key];
    return { richtig: a.best.ev - gewaehlt <= TOLERANZ, knapp: key !== a.best.key && a.best.ev - gewaehlt <= TOLERANZ };
  }

  P.StackOff = { SPOTS, analyse, bewerte, OPT_LABEL, TOLERANZ, REALIZE, COMMITTED };
})();
