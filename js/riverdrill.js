/* =========================================================================
   riverdrill.js — River-Filter: ein Paar, zweimal gecallt, und jetzt?

   Der Spot, der in Manuels Session vom 11.09.2026 zwei Drittel des Stacks
   gekostet hat: QQ auf 6c6s3s/4h/Jh, zweimal gebettet, zweimal gecallt
   worden — und dann am River noch einmal. Der Leak sitzt nicht im Sizing
   (das war gegen den Flushdraw begründet), sondern in der dritten Straße.

   Warum dieser Drill NICHT mit recommendBetting arbeitet:
   Die Heuristik bewertet eine Hand nach Stärke und Range-Advantage. Sie
   kennt keine Check-Raises und rechnet nicht aus, WER eine Bet bezahlt —
   sie empfiehlt hier BET_M mit Score 100. Gerechnet wird deshalb explizit:
   welcher Teil seiner Range schlägt dich, was zahlt eine Bet, und was
   bringt der Check am Showdown. Das sind vier Zeilen Arithmetik, und sie
   sind das, was am Tisch im Kopf laufen soll.

   Die eine Annahme, die drinsteckt: seine Call-Frequenzen kommen aus
   continueWeight, und in EV(Bet) ist KEIN Check-Raise modelliert. Die
   Bet wird dadurch eher zu gut als zu schlecht gerechnet — wenn der Check
   trotzdem vorne liegt, liegt er sicher vorne.
   ========================================================================= */
(function () {
  const P = window.PT;

  /* Nur Spots, in denen du der Aggressor und in Position bist: sonst checkt
     er nicht zu dir, und die Frage lautet anders. */
  const SPOT_IDS = ['btn_vs_bb_ip', 'co_vs_bb_ip', 'ep_vs_bb_ip'];
  const SIZES = [0.33, 0.55];
  const BET_OPTIONS = [
    { key: 'CHECK', label: 'Check', pct: 0 },
    { key: 'BET_S', label: 'Bet 33%', pct: 0.33 },
    { key: 'BET_M', label: 'Bet 55%', pct: 0.55 },
    { key: 'BET_L', label: 'Bet 80%', pct: 0.80 }
  ];
  /* Ein Paar heißt: ein Paar. Zwei Paare und besser spielen sich anders,
     Ass-hoch auch — beides gehört nicht in diesen Drill. */
  const EIN_PAAR = [P.MADE.OVERPAIR, P.MADE.TPTK, P.MADE.TP, P.MADE.PP_MID, P.MADE.SECOND];

  const sumW = r => r.reduce((a, x) => a + x.w, 0) || 1;

  function pickCombo(range, dead) {
    const d = new Set(dead);
    const ok = range.filter(x => !d.has(x.c[0]) && !d.has(x.c[1]));
    if (!ok.length) return null;
    let r = P.rng() * sumW(ok);
    for (const x of ok) { r -= x.w; if (r <= 0) return x.c.slice(); }
    return ok[ok.length - 1].c.slice();
  }

  /**
   * Ein Szenario bauen: Board, Hände, zwei Straßen Action, verengte Range.
   * Gibt null zurück, wenn in den Versuchen keine Ein-Paar-Hand entsteht —
   * der Aufrufer probiert dann einen anderen Spot.
   */
  function make(band) {
    /* Die Zufallszahl MUSS vor find() gezogen werden: im Rückruf würde sie
       für jedes Element neu gewürfelt, und die Suche liefe ins Leere. */
    const spotId = SPOT_IDS[(P.rng() * SPOT_IDS.length) | 0];
    const spot = P.SPOTS.find(s => s.id === spotId);
    if (!spot) return null;
    const geo = P.geometry(spot, band);
    const heroRange0 = P.parseRange(spot.heroRange(band));
    const villRange0 = P.parseRange(spot.villRange(band));

    for (let versuch = 0; versuch < 60; versuch++) {
      const hero = pickCombo(heroRange0, []);
      if (!hero) return null;
      const vill = pickCombo(villRange0, hero);
      if (!vill) continue;
      const deck = P.fullDeck().filter(c => !hero.includes(c) && !vill.includes(c));
      const board = [];
      for (let i = 0; i < 5; i++) board.push(deck.splice((P.rng() * deck.length) | 0, 1)[0]);

      const cls = P.classify(hero, board);
      if (EIN_PAAR.indexOf(cls.made) < 0) continue;

      const flop = board.slice(0, 3), turn = board.slice(0, 4);
      const sf = SIZES[(P.rng() * SIZES.length) | 0];
      const st = SIZES[(P.rng() * SIZES.length) | 0];

      /* Er muss die beiden Bets auch plausibel gecallt haben können —
         sonst erzählt der Spot eine Geschichte, die nicht passiert wäre. */
      const cwF = P.continueWeight(P.classify(vill, flop), sf, 'flop', P.PROFILES.reg);
      const cwT = P.continueWeight(P.classify(vill, turn), st, 'turn', P.PROFILES.reg);
      if (cwF < 0.25 || cwT < 0.25) continue;

      const pot0 = geo.pot;
      const bf = +(pot0 * sf).toFixed(1), pot1 = +(pot0 + 2 * bf).toFixed(1);
      const bt = +(pot1 * st).toFixed(1), pot2 = +(pot1 + 2 * bt).toFixed(1);
      const eff = +(geo.eff - bf - bt).toFixed(1);
      if (eff < pot2 * 0.35) continue;          // sonst ist am River nichts mehr zu entscheiden

      let villRange = P.narrow(villRange0, flop, 'call', { betPct: sf, street: 'flop' });
      villRange = P.narrow(villRange, turn, 'call', { betPct: st, street: 'turn' });
      const tot = new Set(hero.concat(board));
      villRange = villRange.filter(x => !tot.has(x.c[0]) && !tot.has(x.c[1]));
      if (villRange.length < 12) continue;

      return {
        spot, band, geo, board, hero, vill, cls,
        sizes: { flop: sf, turn: st }, bets: { flop: bf, turn: bt },
        pot: pot2, eff, villRange,
        log: [
          `Preflop: du openst auf ${P.STACKS[band].open}bb aus dem ${spot.heroPos} — ${spot.villPos} callt.`,
          `Flop: er checkt, du bettest ${bf.toFixed(1)}bb (${(sf * 100).toFixed(0)}%) — er callt.`,
          `Turn: er checkt, du bettest ${bt.toFixed(1)}bb (${(st * 100).toFixed(0)}%) — er callt.`,
          'River: er checkt zum dritten Mal.'
        ]
      };
    }
    return null;
  }

  /** Wie steht deine Hand am River gegen seine verbliebene Range? */
  function split(q) {
    const my = P.evaluate(q.hero.concat(q.board));
    let vorne = 0, hinten = 0, gleich = 0, nVorne = 0, nHinten = 0;
    const schlaegtDich = {};
    for (const x of q.villRange) {
      const s = P.evaluate(x.c.concat(q.board));
      if (s < my) { vorne += x.w; nVorne++; }
      else if (s > my) {
        hinten += x.w; nHinten++;
        const k = P.handClassOf(x.c);
        schlaegtDich[k] = (schlaegtDich[k] || 0) + 1;
      } else gleich += x.w;
    }
    const t = sumW(q.villRange);
    return {
      anteilVorne: vorne / t, anteilHinten: hinten / t, anteilGleich: gleich / t,
      komboVorne: nVorne, komboHinten: nHinten,
      schlaegtDich: Object.entries(schlaegtDich).sort((a, b) => b[1] - a[1])
    };
  }

  /**
   * EV jeder Option in bb. Der Check geht an den Showdown, die Bet wird
   * gegen seine Call-Frequenzen gerechnet — ohne Check-Raise, siehe oben.
   */
  function evs(q) {
    const my = P.evaluate(q.hero.concat(q.board));
    const sp = split(q);
    const t = sumW(q.villRange);
    const out = [];
    for (const o of BET_OPTIONS) {
      if (o.pct === 0) { out.push({ key: o.key, label: o.label, bet: 0, ev: sp.anteilVorne * q.pot + sp.anteilGleich * q.pot / 2 }); continue; }
      const bet = Math.min(+(q.pot * o.pct).toFixed(1), q.eff);
      if (bet < 0.2) continue;
      let ev = 0, zahltBesser = 0, zahltSchlechter = 0;
      for (const x of q.villRange) {
        const cw = P.continueWeight(P.classify(x.c, q.board), o.pct, 'river', P.PROFILES.reg);
        const p = x.w / t;
        const s = P.evaluate(x.c.concat(q.board));
        ev += p * ((1 - cw) * q.pot + cw * (s > my ? -bet : (s < my ? q.pot + bet : q.pot / 2)));
        if (s > my) zahltBesser += p * cw; else if (s < my) zahltSchlechter += p * cw;
      }
      out.push({
        key: o.key, label: o.label, bet, ev,
        zahler: zahltBesser + zahltSchlechter,
        anteilBesserUnterZahlern: (zahltBesser + zahltSchlechter) > 0 ? zahltBesser / (zahltBesser + zahltSchlechter) : 0
      });
    }
    out.sort((a, b) => b.ev - a.ev);
    return { list: out, best: out[0], split: sp };
  }

  /**
   * Seine Antwort auf deine Bet — aus seiner ECHTEN Hand, nicht aus einer
   * Zufallszahl auf die Range: so passt der Showdown später zur Geschichte.
   */
  function villainReply(q, bet) {
    const my = P.evaluate(q.hero.concat(q.board));
    const cls = P.classify(q.vill, q.board);
    const s = P.evaluate(q.vill.concat(q.board));
    const pct = bet / q.pot;
    if (s > my) return P.rng() < 0.45 ? 'RAISE' : 'CALL';
    if (P.tierOf(cls) <= 1) return P.rng() < 0.12 ? 'RAISE' : 'FOLD';
    return P.rng() < P.continueWeight(cls, pct, 'river', P.PROFILES.reg) ? 'CALL' : 'FOLD';
  }

  /**
   * Der teure Teil: er hat check-geraist. Was brauchst du, damit der Call
   * sich rechnet? Die Zahl, die zählt, ist der Bluff-Anteil — nicht deine
   * Handstärke.
   */
  /* Die Größe seiner Erhöhung wird mit ausgewürfelt, und zwar aus gutem
     Grund: sie bestimmt den Breakeven-Bluffanteil. Bei 2x brauchst du rund
     14 % Bluffs, bei einem Shove über 25 % — mit fester Größe wäre die
     Antwort immer dieselbe, und der Drill würde eine Faustregel einüben
     statt der Rechnung. */
  const RAISE_MULT = [2, 2.7, 4];

  function raiseSpot(q, bet, mult) {
    const raiseTo = Math.min(q.eff, +(bet * (mult || 3)).toFixed(1));
    const toCall = +(raiseTo - bet).toFixed(1);
    const potNow = +(q.pot + bet + raiseTo).toFixed(1);
    const breakeven = toCall / (potNow + toCall);

    /* Seine Raise-Range aus derselben Logik, die der Trainer benutzt —
       eine Erhöhung ist eben keine Bet: Nuts fast immer, Paare praktisch
       nie, Luft nur als Bluff. */
    const rr = P.narrow(q.villRange, q.board, 'raise', {});
    const my = P.evaluate(q.hero.concat(q.board));
    let value = 0, bluff = 0, nValue = 0, nBluff = 0;
    for (const x of rr) {
      const s = P.evaluate(x.c.concat(q.board));
      if (s > my) { value += x.w; nValue++; } else { bluff += x.w; nBluff++; }
    }
    const t = value + bluff || 1;
    const bluffAnteil = bluff / t;
    return {
      raiseTo, toCall, potNow, breakeven, bluffAnteil,
      nValue, nBluff,
      evCall: bluffAnteil * potNow - (1 - bluffAnteil) * toCall,
      lohnt: bluffAnteil > breakeven
    };
  }

  P.RiverDrill = { make, evs, split, villainReply, raiseSpot, BET_OPTIONS, SPOT_IDS, RAISE_MULT };
})();
