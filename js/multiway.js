/* =========================================================================
   multiway.js — Mehrweg-Pots

   WARUM ES DAFÜR KAUM THEORIE GIBT. Mit dem dritten Spieler wächst der
   Spielbaum nicht linear, sondern explodiert: jede Aktion muss gegen zwei
   Gegner beantwortet werden, die wiederum aufeinander reagieren. Klassische
   Solver rechnen Zwei-Spieler-Gleichgewichte; Mehrweg-Gleichgewichte sind
   nicht einmal eindeutig, weil zwei Gegner sich implizit koordinieren
   können. Deshalb existiert für Mehrweg keine Referenz, wie es sie für
   Heads-up gibt.

   WAS TROTZDEM EXAKT RECHENBAR IST — und genau darum geht es hier:

   1. EQUITY gegen mehrere Ranges. Das ist kein Gleichgewichtsproblem,
      sondern eine Wahrscheinlichkeit: Monte Carlo über alle Gegner
      gleichzeitig. Keine Näherung im Modell, nur im Stichprobenfehler.
      Wichtig: Equity gegen zwei Gegner ist NICHT das Produkt der beiden
      Einzel-Equities — die Gegnerhände schließen sich gegenseitig aus und
      teilen sich dieselben Board-Karten.

   2. BLUFF-BREAK-EVEN. Ein Bluff muss ALLE zum Folden bringen. Foldet
      jeder Einzelne mit 60 %, folden zwei zusammen nur in 36 % der Fälle.
      Das ist reine Kombinatorik und der Grund, warum Mehrweg-Bluffs
      fast immer verlieren.

   3. POT ODDS. Der Pot ist größer (mehr totes Geld), aber du musst alle
      schlagen. Beide Effekte sind exakt, und sie ziehen in verschiedene
      Richtungen — welcher überwiegt, hängt vom Spot ab und lässt sich
      ausrechnen statt schätzen.

   Die Faustregeln am Ende dieser Datei sind nicht aus Büchern übernommen,
   sondern aus genau diesen Rechnungen abgeleitet; die Herleitung steht in
   den Tests.
   ========================================================================= */
(function () {
  const P = window.PT;

  /* ------------------------------------------------------------------ *
   * Equity gegen mehrere Ranges gleichzeitig.
   *
   * Je Simulation wird für jeden Gegner eine Hand gezogen, die weder mit
   * dem Board noch mit einer schon gezogenen Hand kollidiert. Passt eine
   * Ziehung nicht, wird die Simulation verworfen statt verzerrt — sonst
   * würden enge Ranges systematisch falsch gewichtet.
   * ------------------------------------------------------------------ */
  function equityMulti(hole, ranges, board, sims) {
    sims = sims || 20000;
    const dead0 = new Set(hole.concat(board));
    const pre = ranges.map(r => r.filter(x => !dead0.has(x.c[0]) && !dead0.has(x.c[1])));
    if (pre.some(r => !r.length)) return { eq: 0, win: 0, tie: 0, n: 0 };
    const totW = pre.map(r => r.reduce((a, x) => a + x.w, 0));
    const toCome = 5 - board.length;
    let sum = 0, win = 0, n = 0, tries = 0;

    while (n < sims && tries < sims * 12) {
      tries++;
      const used = new Set(dead0);
      const hands = [];
      let ok = true;
      for (let i = 0; i < pre.length && ok; i++) {
        let pick = P.rng() * totW[i], chosen = null;
        for (const x of pre[i]) { pick -= x.w; if (pick <= 0) { chosen = x; break; } }
        if (!chosen) chosen = pre[i][pre[i].length - 1];
        if (used.has(chosen.c[0]) || used.has(chosen.c[1])) { ok = false; break; }
        used.add(chosen.c[0]); used.add(chosen.c[1]);
        hands.push(chosen.c);
      }
      if (!ok) continue;
      const deck = [];
      for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
      const extra = [];
      for (let k = 0; k < toCome; k++) {
        const i = (P.rng() * deck.length) | 0;
        extra.push(deck[i]); deck.splice(i, 1);
      }
      const full = board.concat(extra);
      const mine = P.evaluate(hole.concat(full));
      let best = mine, tied = 1, better = false;
      for (const hh of hands) {
        const s = P.evaluate(hh.concat(full));
        if (s > best) { better = true; break; }
        if (s === best) tied++;
      }
      n++;
      if (!better) { sum += 1 / tied; if (tied === 1) win++; }
    }
    return { eq: n ? sum / n : 0, win: n ? win / n : 0, n, discarded: tries - n };
  }

  /* ------------------------------------------------------------------ *
   * Bluff-Break-even mehrweg.
   *
   * Du riskierst `bet`, um `pot` zu gewinnen — aber nur, wenn ALLE folden.
   * Bei n Gegnern mit je gleicher Fold-Rate f muss f^n über der Schwelle
   * liegen, also f >= (bet/(pot+bet))^(1/n).
   * ------------------------------------------------------------------ */
  function bluffBreakEven(pot, bet, opponents) {
    const need = bet / (pot + bet);              // wie oft der Bluff durchgehen muss
    return {
      needTotal: need,
      needEach: Math.pow(need, 1 / Math.max(1, opponents)),
      opponents
    };
  }

  /**
   * Wie oft alle folden, wenn jeder Einzelne mit `f` foldet.
   * Zeigt, wie schnell Fold-Equity mehrweg verschwindet.
   */
  function allFold(f, opponents) { return Math.pow(f, opponents); }

  /* ------------------------------------------------------------------ *
   * Benötigte Equity zum Callen.
   *
   * Zwei gegenläufige Effekte: mehr totes Geld im Pot senkt die Schwelle,
   * aber die Equity selbst fällt, weil du alle schlagen musst. Die Formel
   * hier liefert nur den Pot-Odds-Teil — den Equity-Teil rechnet
   * equityMulti. Genau deshalb ist Mehrweg mit Kopfrechnen nicht zu machen.
   * ------------------------------------------------------------------ */
  function needEquity(pot, bet) { return bet / (pot + 2 * bet); }

  /* ------------------------------------------------------------------ *
   * Referenzranges für n Gegner: was callt gegen einen Open, wenn schon
   * jemand gecallt hat? Bewusst grob und benannt.
   * ------------------------------------------------------------------ */
  const COLD_CALL = '22-JJ, A2s-AJs, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s, ATo-AJo, KQo';
  /* Die Range, mit der ein Gegner postflop WEITERSPIELT — nicht die, mit
     der er präflop mitgeht. Sie ist deutlich stärker, und nur sie gehört in
     eine Postflop-Rechnung. Die Tabelle im Prozess-Tab ist mit genau dieser
     Range entstanden; der Rechner benutzt sie ebenfalls, damit beide Zahlen
     zusammenpassen. Eine Zwischenfassung rechnete mit COLD_CALL und lieferte
     für dieselbe Hand 48 % statt 42 %. */
  const CONTINUE = '22+, A2s+, K8s+, Q9s+, J9s+, T9s, 98s, 87s, 76s, A9o+, KTo+, QJo';
  const BB_MULTI = '22+, A2s+, K5s+, Q7s+, J8s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A7o+, K9o+, QTo+, JTo';

  P.Multiway = {
    equityMulti, bluffBreakEven, allFold, needEquity, COLD_CALL, CONTINUE, BB_MULTI
  };
})();
