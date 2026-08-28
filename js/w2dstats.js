/* =========================================================================
   w2dstats.js — Auswertung einer eingelesenen win2day-Session

   Zwei Sorten Aussagen, die streng getrennt bleiben:

   HÄUFIGKEITEN (VPIP, PFR, C-Bet …) sind Statistik. Eine Session hat rund
   200 Hände, das ist für Frequenzen sehr wenig: bei 25 % liegt der
   Standardfehler schon bei ±3 Punkten, das 95-%-Intervall bei ±6. Deshalb
   liefert jede Frequenz ihr Intervall gleich mit, und alles unter 20
   Gelegenheiten wird als nicht belastbar markiert statt ausgewiesen.

   EINZELENTSCHEIDUNGEN sind kein Statistikproblem. Ob ein Fold mit 9bb und
   A8s im Cutoff richtig war, hängt nicht von der Stichprobe ab — das lässt
   sich Hand für Hand ausrechnen. Da liegt der eigentliche Nutzen einer
   einzelnen Session, und genau darauf zielt der Leak-Teil.
   ========================================================================= */
(function () {
  const P = window.PT;
  const W = P.W2D;

  /* ------------------------------------------------------------------ *
   * Wilson-Intervall. Bei kleinen Stichproben und Anteilen nahe 0 oder 1
   * ist die Normalnäherung unbrauchbar (sie liefert Grenzen unter 0 oder
   * über 1), Wilson bleibt dort korrekt.
   * ------------------------------------------------------------------ */
  function wilson(k, n, z) {
    if (!n) return { p: 0, lo: 0, hi: 1, n: 0 };
    z = z || 1.96;
    const p = k / n, z2 = z * z;
    const d = 1 + z2 / n;
    const c = p + z2 / (2 * n);
    const s = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
    return { p, lo: Math.max(0, (c - s) / d), hi: Math.min(1, (c + s) / d), n, k };
  }
  const MIN_N = 20;          // darunter wird eine Frequenz nicht ausgewiesen

  /* ------------------------------------------------------------------ *
   * Eine Hand aus Heldensicht aufschlüsseln.
   * ------------------------------------------------------------------ */
  function annotate(hand) {
    const pos = W.positionsOf(hand);
    const hero = hand.hero;
    const a = {
      idx: hand.idx, hand, pos: pos.map[hero] || '?', posCertain: pos.certain,
      stackBB: hand.heroStackBB, netBB: hand.heroNetBB, net: hand.heroNet,
      cards: hand.heroCards,
      handClass: hand.heroCards.length === 2 ? P.handClassOf(hand.heroCards) : null
    };

    const pf = hand.streets.preflop;
    const heroActs = pf.filter(x => x.player === hero);
    a.heroPF = heroActs.length ? heroActs[0].kind : null;
    a.heroPFAll = heroActs.map(x => x.kind);

    // Wer hat zuerst freiwillig erhöht?
    const firstAgg = pf.find(x => x.kind === 'raise' || x.kind === 'allin');
    a.opener = firstAgg ? firstAgg.player : null;
    a.heroIsOpener = a.opener === hero;
    a.openerPos = firstAgg ? (pos.map[firstAgg.player] || '?') : null;

    // Kam es ungeöffnet zu dir? (alle vor dir haben gefoldet)
    const myFirst = pf.findIndex(x => x.player === hero);
    a.foldedToHero = myFirst >= 0 && pf.slice(0, myFirst).every(x => x.kind === 'fold');
    a.playersBehind = myFirst >= 0
      ? new Set(pf.slice(myFirst + 1).map(x => x.player)).size
      : 0;

    // 3-Bet: zweite Erhöhung präflop
    const raises = pf.filter(x => x.kind === 'raise' || x.kind === 'allin');
    a.hero3Bet = raises.length >= 2 && raises[1].player === hero;
    a.faced3Bet = a.heroIsOpener && raises.length >= 2 && raises[1].player !== hero;
    if (a.faced3Bet) {
      const after = pf.slice(pf.indexOf(raises[1])).filter(x => x.player === hero);
      a.vs3BetAction = after.length ? after[0].kind : 'fold';
    }

    a.vpip = heroActs.some(x => ['call', 'raise', 'allin'].includes(x.kind));
    a.pfr = heroActs.some(x => ['raise', 'allin'].includes(x.kind));

    // Postflop
    a.sawFlop = hand.board.flop.length === 3 &&
      (hand.streets.flop.some(x => x.player === hero) || heroActs.some(x => x.kind === 'allin'));
    a.heroWasPFR = a.heroIsOpener || (raises.length && raises[raises.length - 1].player === hero);
    const fl = hand.streets.flop;
    const heroFlop = fl.filter(x => x.player === hero);
    a.flopActions = heroFlop.map(x => x.kind);
    const firstFlopAgg = fl.find(x => x.kind === 'bet' || x.kind === 'allin');
    a.cbetMade = a.heroWasPFR && firstFlopAgg && firstFlopAgg.player === hero;
    a.cbetChance = a.heroWasPFR && a.sawFlop && heroFlop.length > 0;
    a.facedCbet = !a.heroWasPFR && firstFlopAgg && firstFlopAgg.player !== hero && heroFlop.length > 0;
    a.foldedToCbet = a.facedCbet && heroFlop.some(x => x.kind === 'fold');

    // Showdown: kam es zu einem und hat der Held gewonnen?
    const anyRiver = hand.board.river.length > 0;
    const heroFolded = ['preflop', 'flop', 'turn', 'river']
      .some(st => hand.streets[st].some(x => x.player === hero && x.kind === 'fold'));
    const shown = Object.keys(hand.holeCards).filter(nm => nm !== hero).length > 0;
    a.wtsd = !heroFolded && (anyRiver || shown) && a.sawFlop;
    a.wonHand = hand.heroNet > 0;
    /* All-in NICHT über den Aktionstyp bestimmen. Typ 7 kommt in der
       Beispieldatei nur 16-mal vor, während der Held tatsächlich viel
       häufiger seinen ganzen Stack investiert — die letzte Hand etwa steht
       als gewöhnliches Raise über 138.350 bei einem Stack von 141.350.
       Verlässlich ist der Vergleich mit dem Startstack. */
    a.invested = hand.invested[hero] || 0;
    a.allIn = hand.heroChips > 0 && a.invested >= hand.heroChips - 0.5;
    return a;
  }

  /* ------------------------------------------------------------------ *
   * Stackbänder — dieselben wie im Trainer.
   * ------------------------------------------------------------------ */
  function band(bb) {
    if (bb <= 12) return 'push';
    if (bb <= 25) return 'kurz';
    if (bb <= 45) return 'mittel';
    return 'tief';
  }
  const BANDS = ['tief', 'mittel', 'kurz', 'push'];
  const BAND_LABEL = {
    tief: 'über 45bb', mittel: '25–45bb', kurz: '12–25bb', push: 'unter 12bb'
  };

  /* ------------------------------------------------------------------ *
   * Gesamtauswertung.
   * ------------------------------------------------------------------ */
  /** Frequenzen aus einer beliebigen Menge annotierter Hände. */
  function statsFromRows(rows) {
    const cnt = (list, f) => list.filter(f).length;
    // Der Zähler muss innerhalb der Gelegenheiten gezählt werden. Eine
    // frühere Fassung zählte ihn über die ganze Liste — dabei kamen
    // Frequenzen wie "Steal 177 %" heraus, was sofort auffällt; bei
    // Kennzahlen mit ähnlich grossem Nenner wäre es still falsch gewesen.
    const freq = (list, opp, act) => wilson(cnt(list, r => opp(r) && act(r)), cnt(list, opp));

    const stats = {
      hands: rows.length,
      vpip: wilson(cnt(rows, r => r.vpip), rows.length),
      pfr: wilson(cnt(rows, r => r.pfr), rows.length),
      threeBet: freq(rows, r => r.opener && !r.heroIsOpener && r.heroPF, r => r.hero3Bet),
      foldTo3Bet: freq(rows, r => r.faced3Bet, r => r.vs3BetAction === 'fold'),
      steal: freq(rows,
        r => r.foldedToHero && ['BTN', 'CO', 'SB'].includes(r.pos) && r.posCertain,
        r => r.pfr),
      bbDefend: freq(rows,
        r => r.pos === 'BB' && r.posCertain && r.opener && !r.heroIsOpener,
        r => r.vpip),
      cbet: freq(rows, r => r.cbetChance, r => r.cbetMade),
      foldToCbet: freq(rows, r => r.facedCbet, r => r.foldedToCbet),
      wtsd: freq(rows, r => r.sawFlop, r => r.wtsd),
      wsd: freq(rows, r => r.wtsd, r => r.wonHand),
      allIns: cnt(rows, r => r.allIn)
    };
    return stats;
  }

  function analyse(session) {
    const rows = session.heroHands.map(annotate);
    const withCards = rows.filter(r => r.handClass);
    const stats = statsFromRows(rows);

    // Nach Position (nur sichere Positionen)
    const byPos = {};
    for (const r of rows) {
      if (!r.posCertain) continue;
      const b = byPos[r.pos] || (byPos[r.pos] = { n: 0, vpip: 0, pfr: 0, net: 0, opens: 0, openChance: 0 });
      b.n++; b.net += r.netBB;
      if (r.vpip) b.vpip++;
      if (r.pfr) b.pfr++;
      if (r.foldedToHero) { b.openChance++; if (r.pfr) b.opens++; }
    }

    // Nach Stackband
    const byBand = {};
    for (const r of rows) {
      const k = band(r.stackBB);
      const b = byBand[k] || (byBand[k] = { n: 0, net: 0, vpip: 0, allIn: 0 });
      b.n++; b.net += r.netBB; if (r.vpip) b.vpip++; if (r.allIn) b.allIn++;
    }

    const sorted = rows.slice().sort((a, b) => b.net - a.net);

    /* Stackverlauf. Der Höchststand ist die aussagekräftigste Einzelzahl
       einer Turniersession: er trennt "nie Chips gehabt" von "Chips gehabt
       und wieder abgegeben". */
    const curve = rows.map(r => ({ idx: r.idx, chips: r.hand.heroChips, bb: r.stackBB }));
    let peak = curve[0] || { chips: 0, bb: 0, idx: 0 };
    for (const c of curve) if (c.chips > peak.chips) peak = c;

    /* All-in-Ausgang gegen Equity. Nur wo die Karten des Gegners aufgedeckt
       wurden — sonst ist nichts zu rechnen. Das trennt Spielfehler von
       Varianz: wer mit 70 % Equity all-in geht und verliert, hat nichts
       falsch gemacht. */
    const allIns = [];
    for (const r of rows) {
      if (!r.allIn || !r.handClass) continue;
      const opp = Object.keys(r.hand.holeCards).filter(n => n !== r.hand.hero);
      if (!opp.length) continue;
      const villain = r.hand.holeCards[opp[0]];
      if (!villain || villain.length !== 2) continue;

      /* Entscheidend: die Equity gilt für den Moment, in dem das Geld
         reinging — nicht für das fertige Board. Mit fünf Board-Karten
         gerechnet kommt immer 0 % oder 100 % heraus, also nur das Ergebnis
         noch einmal. Deshalb wird die Straße gesucht, auf der der Stack
         voll investiert war, und nur das bis dahin bekannte Board benutzt. */
      const h = r.hand;
      let cum = 0, street = 'river';
      for (const st of ['blinds', 'preflop', 'flop', 'turn', 'river']) {
        for (const a of h.streets[st]) if (a.player === h.hero) cum += a.amount;
        if (cum >= h.heroChips - 0.5) { street = st === 'blinds' ? 'preflop' : st; break; }
      }
      const known = street === 'preflop' ? []
        : street === 'flop' ? h.board.flop
          : street === 'turn' ? h.board.flop.concat(h.board.turn)
            : h.boardAll;
      const eq = P.equityVsRange(r.cards, [{ c: villain, w: 1 }], known, 60000).eq;
      allIns.push({ row: r, villain, villainName: opp[0], eq, won: r.net > 0, street, known });
    }
    const eqSum = allIns.reduce((a, x) => a + x.eq, 0);
    const wonSum = allIns.filter(x => x.won).length;

    return {
      session, rows, withCards, stats, byPos, byBand, curve, peak,
      allIns, allInExpected: eqSum, allInActual: wonSum,
      biggestWins: sorted.slice(0, 5).filter(r => r.net > 0),
      biggestLosses: sorted.slice(-5).reverse().filter(r => r.net < 0),
      byChips: rows.slice().sort((a, b) => a.net - b.net),
      netChips: rows.reduce((a, r) => a + r.net, 0),
      /* Bewusst NICHT als Kennzahl ausgewiesen: die Summe der bb-Ergebnisse.
         Sie ist über Blindstufen hinweg nicht addierbar — in der
         Beispielsession ergibt sie +112,9bb, obwohl der Held ausgeschieden
         ist. Ein Pot von 5.000 Chips ist auf Level 1 eben +25bb, ein
         Verlust von 88.500 auf Level 26 nur -3,7bb. */
      netBBMisleading: rows.reduce((a, r) => a + r.netBB, 0)
    };
  }

  /** Mehrere Sessions zusammenfassen — Frequenzen brauchen Masse. */
  function combine(analyses) {
    const rows = analyses.reduce((a, x) => a.concat(x.rows), []);
    const byPos = {}, byBand = {};
    for (const a of analyses) {
      for (const k of Object.keys(a.byPos)) {
        const t = byPos[k] || (byPos[k] = { n: 0, vpip: 0, pfr: 0, net: 0, opens: 0, openChance: 0 });
        for (const f of ['n', 'vpip', 'pfr', 'net', 'opens', 'openChance']) t[f] += a.byPos[k][f];
      }
      for (const k of Object.keys(a.byBand)) {
        const t = byBand[k] || (byBand[k] = { n: 0, net: 0, vpip: 0, allIn: 0 });
        for (const f of ['n', 'net', 'vpip', 'allIn']) t[f] += a.byBand[k][f];
      }
    }
    const allIns = analyses.reduce((a, x) => a.concat(x.allIns), []);
    return {
      rows, stats: statsFromRows(rows), byPos, byBand, allIns,
      sessions: analyses.length,
      allInExpected: allIns.reduce((a, x) => a + x.eq, 0),
      allInActual: allIns.filter(x => x.won).length
    };
  }

  /* ------------------------------------------------------------------ *
   * Kompakte Zusammenfassung für den Speicher.
   * Die vollen Hände wären pro Session einige hundert Kilobyte. Für die
   * Frequenzen genügen Zähler und Nenner — daraus lässt sich alles wieder
   * ausrechnen, und beliebig viele Sessions passen in den localStorage.
   * ------------------------------------------------------------------ */
  const STAT_KEYS = ['vpip', 'pfr', 'threeBet', 'foldTo3Bet', 'steal', 'bbDefend',
    'cbet', 'foldToCbet', 'wtsd', 'wsd'];

  function summarise(a) {
    const c = {};
    for (const k of STAT_KEYS) c[k] = { k: a.stats[k].k || 0, n: a.stats[k].n || 0 };
    const m = a.session.meta;
    return {
      code: m.sessionCode, name: m.tournamentName || m.tableName, date: m.startDate,
      hands: a.stats.hands, place: m.place, buyIn: m.buyIn, win: m.win,
      netChips: a.netChips, peakChips: a.peak.chips, startChips: a.rows[0] ? a.rows[0].hand.heroChips : 0,
      knockouts: a.session.bounties.length,
      allInExp: a.allInExpected, allInAct: a.allInActual, allInN: a.allIns.length,
      counters: c, byPos: a.byPos, byBand: a.byBand
    };
  }

  /** Frequenzen aus gespeicherten Zusammenfassungen zurückrechnen. */
  function statsFromSummaries(list) {
    const out = { hands: list.reduce((a, s) => a + s.hands, 0) };
    for (const key of STAT_KEYS) {
      let k = 0, n = 0;
      for (const s of list) { k += s.counters[key].k; n += s.counters[key].n; }
      out[key] = wilson(k, n);
    }
    const byPos = {}, byBand = {};
    for (const s of list) {
      for (const p of Object.keys(s.byPos || {})) {
        const t = byPos[p] || (byPos[p] = { n: 0, vpip: 0, pfr: 0, net: 0, opens: 0, openChance: 0 });
        for (const f of ['n', 'vpip', 'pfr', 'net', 'opens', 'openChance']) t[f] += s.byPos[p][f] || 0;
      }
      for (const b of Object.keys(s.byBand || {})) {
        const t = byBand[b] || (byBand[b] = { n: 0, net: 0, vpip: 0, allIn: 0 });
        for (const f of ['n', 'net', 'vpip', 'allIn']) t[f] += s.byBand[b][f] || 0;
      }
    }
    return {
      stats: out, byPos, byBand,
      allInExp: list.reduce((a, s) => a + s.allInExp, 0),
      allInAct: list.reduce((a, s) => a + s.allInAct, 0),
      allInN: list.reduce((a, s) => a + s.allInN, 0)
    };
  }

  P.W2DStats = {
    wilson, MIN_N, annotate, analyse, statsFromRows, combine, band, BANDS, BAND_LABEL,
    STAT_KEYS, summarise, statsFromSummaries
  };
})();
