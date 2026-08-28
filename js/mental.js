/* =========================================================================
   mental.js — Kopfrechnen für den Live-Tisch

   Am Onlinetisch rechnet das Tool mit. Live hast du 30 Sekunden, keinen
   HUD und Chips statt Prozente. Zwei Dinge trainiert dieses Modul:

   1. POT ODDS und MDF als Aufgaben mit echten Chipbeträgen aus der
      Turnierstruktur, nicht mit runden Lehrbuchzahlen.
   2. SIZINGS: welcher Betrag ist auf diesem Level ein 33-%-Bet? Live musst
      du das in Jetons abzählen können, nicht in Prozent denken.

   Alles hier ist reine Rechnung ohne DOM.
   ========================================================================= */
(function () {
  const P = window.PT;

  /* ------------------------------------------------------------------ *
   * Die vier Formeln, um die es geht.
   * ------------------------------------------------------------------ */

  /** Benötigte Equity zum Callen: du legst `bet` nach in einen Pot `pot`. */
  function needEquity(pot, bet) { return bet / (pot + 2 * bet); }

  /** Minimum Defence Frequency: wie viel du gegen eine Bet halten musst. */
  function mdf(pot, bet) { return pot / (pot + bet); }

  /** Wie oft ein Bluff durchgehen muss, um sich zu rechnen. */
  function bluffBreakEven(pot, bet) { return bet / (pot + bet); }

  /** Bet als Anteil des Pots. */
  function betPct(pot, bet) { return bet / pot; }

  const TYPES = [
    {
      key: 'need', name: 'Benötigte Equity',
      ask: q => `Pot <b>${fmt(q.pot)}</b>, er setzt <b>${fmt(q.bet)}</b>.<br>Wie viel Equity brauchst du zum Callen?`,
      calc: q => needEquity(q.pot, q.bet),
      why: q => `Du legst ${fmt(q.bet)} nach und spielst um ${fmt(q.pot + 2 * q.bet)}. ` +
        `${fmt(q.bet)} ÷ ${fmt(q.pot + 2 * q.bet)} = <b>${(needEquity(q.pot, q.bet) * 100).toFixed(1)}%</b>.`
    },
    {
      key: 'mdf', name: 'MDF',
      ask: q => `Pot <b>${fmt(q.pot)}</b>, er setzt <b>${fmt(q.bet)}</b>.<br>Wie viel Prozent musst du mindestens verteidigen?`,
      calc: q => mdf(q.pot, q.bet),
      why: q => `MDF = Pot ÷ (Pot + Bet) = ${fmt(q.pot)} ÷ ${fmt(q.pot + q.bet)} = ` +
        `<b>${(mdf(q.pot, q.bet) * 100).toFixed(1)}%</b>. Foldest du mehr, wird sein Bluff automatisch profitabel.`
    },
    {
      key: 'bluff', name: 'Bluff-Break-even',
      ask: q => `Pot <b>${fmt(q.pot)}</b>, du willst <b>${fmt(q.bet)}</b> bluffen.<br>Wie oft muss er folden, damit sich das rechnet?`,
      calc: q => bluffBreakEven(q.pot, q.bet),
      why: q => `Du riskierst ${fmt(q.bet)}, um ${fmt(q.pot)} zu gewinnen: ` +
        `${fmt(q.bet)} ÷ ${fmt(q.pot + q.bet)} = <b>${(bluffBreakEven(q.pot, q.bet) * 100).toFixed(1)}%</b>.`
    },
    {
      key: 'pct', name: 'Bet-Größe',
      ask: q => `Pot <b>${fmt(q.pot)}</b>, er setzt <b>${fmt(q.bet)}</b>.<br>Wie viel Prozent des Pots ist das?`,
      calc: q => betPct(q.pot, q.bet),
      why: q => `${fmt(q.bet)} ÷ ${fmt(q.pot)} = <b>${(betPct(q.pot, q.bet) * 100).toFixed(0)}%</b>. ` +
        `Faustregel: halber Pot ist ${fmt(Math.round(q.pot / 2))}, ein Drittel ${fmt(Math.round(q.pot / 3))}.`
    }
  ];

  function fmt(n) { return Math.round(n).toLocaleString('de-DE'); }

  /* ------------------------------------------------------------------ *
   * Aufgaben erzeugen. Die Beträge stammen aus der echten Struktur,
   * damit die Zahlen so aussehen wie am Tisch — 12.500 statt 100.
   * ------------------------------------------------------------------ */
  const SIZES = [0.25, 0.33, 0.4, 0.5, 0.66, 0.75, 1.0, 1.25];

  function makeQuestion(rng, opts) {
    opts = opts || {};
    const levels = (P.Plan && P.Plan.LEVELS) || [{ sb: 100, bb: 200, ante: 200 }];
    const lv = levels[(rng() * Math.min(levels.length, opts.maxLevel || levels.length)) | 0];
    const type = TYPES[(rng() * TYPES.length) | 0];
    // Pot und Bet auf dasselbe Raster legen wie am echten Tisch: glatte
    // halbe Blinds, aus den Jetons legbar, die auf dem Level im Spiel sind.
    const unit = chipUnit(lv.sb, lv.bb);
    const pot = roundBet((2 + rng() * 14) * lv.bb, lv.bb, unit);
    const size = SIZES[(rng() * SIZES.length) | 0];
    const bet = roundBet(pot * size, lv.bb, unit);
    const q = { pot, bet, lv, type: type.key };
    q.answer = type.calc(q);
    q.text = type.ask(q);
    q.explain = type.why(q);
    q.name = type.name;
    q.options = makeOptions(q.answer, rng);
    return q;
  }

  /**
   * Vier Antworten: die richtige plus drei plausible Verwechslungen.
   *
   * Die Antwort darf über 100 % liegen — bei einer Overbet ist "125 % des
   * Pots" die richtige Lösung. Eine frühere Fassung hat genau solche Werte
   * herausgefiltert und damit die richtige Antwort aus den Optionen
   * entfernt. Deshalb wird sie hier zuerst gesetzt und nie verworfen, und
   * es wird garantiert auf vier verschiedene Optionen aufgefüllt.
   */
  function makeOptions(ans, rng) {
    const r2 = v => Math.round(v * 100) / 100;          // auf ganze Prozent
    const correct = r2(ans);
    const out = [correct];
    const tryAdd = v => {
      const x = r2(v);
      if (x > 0.01 && x < 1.99 && !out.some(y => Math.abs(y - x) < 0.005)) { out.push(x); return true; }
      return false;
    };
    // Typische Denkfehler zuerst: Kehrwert, Bet/Pot statt Bet/(Pot+2·Bet), Faktor 1,5
    const cands = [1 - ans, ans * 1.5, ans / 1.5, ans + 0.12, ans - 0.12, ans * 2, ans / 2];
    for (let i = cands.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = cands[i]; cands[i] = cands[j]; cands[j] = t; }
    for (const c of cands) { if (out.length >= 4) break; tryAdd(c); }
    // Notnagel, falls die Kandidaten kollidieren: in festen Schritten weg.
    for (let d = 0.05; out.length < 4 && d < 1; d += 0.05) { tryAdd(ans + d) || tryAdd(ans - d); }
    for (let i = out.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = out[i]; out[i] = out[j]; out[j] = t; }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Sizings in echten Jetons.
   *
   * Eine erste Fassung hat schlicht Prozente ausgerechnet und 568 als
   * 33-%-Bet ausgegeben. Das legt niemand hin. Live gilt zweierlei:
   *
   * 1. Es gibt nur bestimmte Stückelungen, und die kleinen werden im Lauf
   *    des Turniers ausgetauscht. Der kleinste noch im Spiel befindliche
   *    Jeton muss beide Blinds genau legen können und liegt praktisch bei
   *    rund einem Achtel des Big Blinds — kleinere werden herausgetauscht,
   *    weil sie niemand mehr braucht.
   * 2. Gerundet wird auf dieses Raster, nicht auf glatte Big Blinds. Eine
   *    Zwischenfassung hat auf halbe Blinds gerundet; bei einem Pot von nur
   *    fünf Blinds ist das so grob, dass aus jedem 33-%-Bet ein 38-%-Bet
   *    wurde. Mit dem Chipraster liegt die Abweichung unter zwei Punkten.
   *
   * Weil auch das Runden die Größe leicht verschiebt, wird immer der
   * Prozentsatz mitgeliefert, der dabei tatsächlich herauskommt.
   * ------------------------------------------------------------------ */
  const DENOMS = [25, 100, 500, 1000, 5000, 25000, 100000, 500000, 1000000, 5000000];

  /**
   * Kleinster Jeton, der auf diesem Level noch im Spiel ist: die größte
   * Stückelung, die beide Blinds genau legt und höchstens ein Achtel des
   * Big Blinds beträgt. Gibt es keine so kleine, wird die kleinste
   * passende genommen.
   */
  function chipUnit(sb, bb) {
    const fits = DENOMS.filter(d => sb % d === 0 && bb % d === 0);
    if (!fits.length) return DENOMS[0];
    const small = fits.filter(d => d <= bb / 8);
    return small.length ? small[small.length - 1] : fits[0];
  }

  /** Auf das Chipraster runden — was man nicht legen kann, gibt es nicht. */
  function roundBet(amount, bb, unit) {
    return Math.max(unit, Math.round(amount / unit) * unit);
  }

  /**
   * Für Beträge, die du frei WÄHLST (Open, 3-Bet), statt sie aus dem Pot
   * abzuleiten. Die werden glatt gelegt: niemand öffnet auf 875 oder 1.325.
   * Gerundet wird auf die größte Stückelung, die noch etwa ein Viertel des
   * Betrags ausmacht — daraus werden 700, 900, 1.300 statt krummer Zahlen.
   */
  function roundClean(amount, unit) {
    let step = unit;
    for (const d of DENOMS) if (d <= amount / 4) step = Math.max(step, d);
    return Math.max(step, Math.round(amount / step) * step);
  }

  function sizingTable(day) {
    const levels = P.Plan.LEVELS.filter(l => !day || l.day === day);
    return levels.map(l => {
      const unit = chipUnit(l.sb, l.bb);
      const dead = l.sb + l.bb + l.ante;           // Pot, wenn alle folden
      const open = roundClean(l.bb * 2.2, unit);
      const pot = open * 2 + l.sb + l.ante;        // Open + ein Call
      const mk = frac => {
        const chips = roundBet(pot * frac, l.bb, unit);
        return { chips, real: chips / pot, bb: chips / l.bb };
      };
      return {
        lvl: l.lvl, day: l.day, sb: l.sb, bb: l.bb, ante: l.ante, dead, unit,
        open, openBB: open / l.bb, potSRP: pot,
        threeBet: roundClean(open * 3.2, unit),
        threeBetBB: roundClean(open * 3.2, unit) / l.bb,
        s33: mk(0.33), s55: mk(0.55), s80: mk(0.80)
      };
    });
  }

  P.Mental = {
    needEquity, mdf, bluffBreakEven, betPct, TYPES, SIZES,
    DENOMS, chipUnit, roundBet, roundClean, makeQuestion, makeOptions, sizingTable, fmt
  };
})();
