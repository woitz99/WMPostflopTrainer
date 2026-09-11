/* =========================================================================
   w2dpost.js — Postflop-Entscheidungen einer echten Session nachspielen

   Ich hatte zunächst behauptet, Postflop lasse sich nicht beurteilen, weil
   die Karten der Gegner verdeckt sind. Das war zu bequem gedacht: für ein
   Urteil braucht man nicht seine KARTEN, sondern seine RANGE — und genau
   darauf ist der Trainer ohnehin gebaut. Er benotet dich im Drill nie gegen
   bekannte Karten, sondern immer gegen eine Range.

   Also läuft hier jede echte Hand durch dieselbe Engine:

     1. Die Preflop-Range des Gegners wird aus Position und Aktion bestimmt
        (dieselben Referenzranges wie im Trainer).
     2. Nach jeder Aktion wird sie mit P.narrow verengt — genau wie im Drill.
     3. An jedem Entscheidungspunkt liefert recommendBetting/recommendFacing
        eine Bewertung 0–100 für die Aktion, die du tatsächlich gewählt hast.

   Dadurch ist die Note aus der Session direkt mit deinen Drill-Noten
   vergleichbar: es ist derselbe Maßstab.

   GRENZEN, die in der UI auch so stehen:
   - Die Engine ist eine Heuristik, kein Solver. Die README beziffert die
     Kalibrierung: Richtung und Größenordnung stimmen, die letzten
     Prozentpunkte nicht. Eine einzelne Note ist deshalb kein Urteil.
   - Die Note gilt nur für Heads-up-Pots. Für Mehrweg gibt es keine
     Referenzstrategie (siehe multiway.js), deshalb bekommen diese Hände
     keine Note — aber sehr wohl die beiden Prüfungen, die dort exakt
     entscheidbar sind: Equity gegen alle gegen die Pot Odds, und der
     Bluff-Break-even über alle Gegner. Siehe replayMultiway.
   - Die Range des Gegners ist eine Referenz, kein Wissen über ihn. Wer
     völlig anders spielt, wird falsch modelliert.

   Deshalb wird eine Einzelhand nie als Fehler bezeichnet. Erst wenn sich
   über viele Entscheidungen ein Muster zeigt, heißt es Leak.
   ========================================================================= */
(function () {
  const P = window.PT;

  /* Position -> Schlüssel der Referenzranges. */
  const RK = {
    UTG: 'EP', UTG1: 'EP', UTG2: 'EP', MP: 'MP', MP1: 'MP', MP2: 'MP',
    CO: 'CO', BTN: 'BTN', SB: 'SB', BB: 'BB'
  };
  /* Wenn keine passende Referenz existiert, wird NICHT geraten, sondern
     eine klar benannte Näherung benutzt und die Hand markiert. */
  const FALLBACK_CALL = '22-JJ, A2s-AJs, K7s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, ATo-AJo, KTo+, QJo, JTo';
  const FALLBACK_OPEN = '22+, A2s+, K7s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, A7o+, K9o+, QTo+, JTo';

  /**
   * Preflop-Ranges beider Spieler rekonstruieren.
   * @returns {hero, vill, potType, heroRole, approx} — approx = Näherung benutzt
   */
  function preflopRanges(info) {
    const { heroPos, villPos, heroIsPFR, threeBet, threeBettorIsHero } = info;
    const hk = RK[heroPos] || 'MP', vk = RK[villPos] || 'MP';
    let hero, vill, approx = false, heroRole, potType = threeBet ? '3BP' : 'SRP';

    if (threeBet) {
      const key3 = (threeBettorIsHero ? heroPos : villPos) + '_vs_' + (threeBettorIsHero ? villPos : heroPos);
      const tb = P.THREEBET[key3] || P.THREEBET['BB_vs_BTN'];
      const cl = P.CALL_3BET[(threeBettorIsHero ? villPos : heroPos) + '_vs_' + (threeBettorIsHero ? heroPos : villPos)]
        || P.CALL_3BET['BTN_vs_BB'];
      if (!P.THREEBET[key3]) approx = true;
      hero = threeBettorIsHero ? tb : cl;
      vill = threeBettorIsHero ? cl : tb;
      heroRole = threeBettorIsHero ? '3BET' : 'CALL3B';
    } else if (heroIsPFR) {
      hero = P.RFI[hk] || FALLBACK_OPEN;
      if (!P.RFI[hk]) approx = true;
      if (villPos === 'BB') { vill = P.BB_FLAT[hk] || FALLBACK_CALL; if (!P.BB_FLAT[hk]) approx = true; }
      else { vill = P.IP_FLAT[villPos + '_vs_' + heroPos] || FALLBACK_CALL; if (!P.IP_FLAT[villPos + '_vs_' + heroPos]) approx = true; }
      heroRole = 'PFR';
    } else {
      vill = P.RFI[vk] || FALLBACK_OPEN;
      if (!P.RFI[vk]) approx = true;
      if (heroPos === 'BB') { hero = P.BB_FLAT[vk] || FALLBACK_CALL; if (!P.BB_FLAT[vk]) approx = true; }
      else { hero = P.IP_FLAT[heroPos + '_vs_' + villPos] || FALLBACK_CALL; if (!P.IP_FLAT[heroPos + '_vs_' + villPos]) approx = true; }
      heroRole = 'CALLER';
    }
    return { hero, vill, potType, heroRole, approx };
  }

  /** Tatsächliche Aktion auf eine der Optionen der Engine abbilden. */
  function mapBet(kind, amount, pot) {
    if (kind === 'check') return 'CHECK';
    const frac = pot > 0 ? amount / pot : 1;
    let best = P.BET_OPTIONS[1];
    for (const o of P.BET_OPTIONS) {
      if (o.pct === 0) continue;
      if (Math.abs(o.pct - frac) < Math.abs(best.pct - frac)) best = o;
    }
    return best.key;
  }
  function mapFacing(kind, raiseTo, toCall) {
    if (kind === 'fold') return 'FOLD';
    if (kind === 'call') return 'CALL';
    const mult = toCall > 0 ? raiseTo / toCall : 3;
    return mult >= 3.0 ? 'RAISE_L' : 'RAISE_S';
  }

  /* ------------------------------------------------------------------ *
   * Eine Hand nachspielen.
   * ------------------------------------------------------------------ */
  const SIMS_EQ = 8000, SIMS_RVR = 4000;

  function replayHand(row) {
    const h = row.hand, hero = h.hero;
    if (h.board.flop.length !== 3 || !row.handClass) return { skip: 'kein Flop' };
    if (!row.posCertain) return { skip: 'Position unsicher' };

    // Wer war am Flop noch dabei?
    const folded = new Set();
    for (const a of h.streets.preflop) if (a.kind === 'fold') folded.add(a.player);
    const alive = h.players.filter(p => !folded.has(p.name)).map(p => p.name);
    if (!alive.includes(hero)) return { skip: 'präflop gefoldet' };
    if (alive.length > 2) return replayMultiway(row, alive);
    const villName = alive.find(n => n !== hero);

    const posMap = P.W2D.positionsOf(h).map;
    const raises = h.streets.preflop.filter(a => a.kind === 'raise' || a.kind === 'allin');
    if (!raises.length) return { skip: 'ungeraist (Limp-Pot)' };
    const info = {
      heroPos: posMap[hero], villPos: posMap[villName],
      heroIsPFR: raises[0].player === hero,
      threeBet: raises.length >= 2,
      threeBettorIsHero: raises.length >= 2 && raises[1].player === hero
    };
    const pr = preflopRanges(info);
    let heroRange = P.parseRange(pr.hero);
    let villRange = P.parseRange(pr.vill);

    // Pot und effektiver Stack am Flop aus den echten Beträgen.
    const inv = {};
    for (const st of ['blinds', 'preflop']) for (const a of h.streets[st]) inv[a.player] = (inv[a.player] || 0) + a.amount;
    const deadOthers = h.players.filter(p => p.name !== hero && p.name !== villName)
      .reduce((s, p) => s + (inv[p.name] || 0), 0);
    let pot = (inv[hero] || 0) + (inv[villName] || 0) + deadOthers;
    let eff = Math.min(h.heroChips - (inv[hero] || 0),
      (h.players.find(p => p.name === villName) || { chips: 0 }).chips - (inv[villName] || 0));

    const decisions = [];
    const streets = ['flop', 'turn', 'river'];
    const boards = {
      flop: h.board.flop,
      turn: h.board.flop.concat(h.board.turn),
      river: h.boardAll
    };

    for (const st of streets) {
      const board = boards[st];
      if (board.length < 3) break;
      if (st === 'turn' && h.board.turn.length === 0) break;
      if (st === 'river' && h.board.river.length === 0) break;
      const acts = h.streets[st];
      if (!acts.length) break;

      const cls = P.classify(row.cards, board);
      const hB = P.rangeBuckets(heroRange, board, row.cards);
      const vB = P.rangeBuckets(villRange, board, row.cards);
      const rEq = P.rangeVsRange(heroRange, villRange, board, SIMS_RVR);
      const hEq = P.equityVsRange(row.cards, villRange, board, SIMS_EQ).eq;
      const rel = P.relativeStrength(row.cards, villRange, board);
      const tex = P.boardTexture(board);
      const heroIP = isIP(info.heroPos, info.villPos);

      const ctx = Object.assign({
        street: st, tex, spr: +(eff / Math.max(1, pot)).toFixed(1), pot, eff,
        heroIP, role: pr.heroRole, potType: pr.potType,
        heroNut: hB.nuttedPct, villNut: vB.nuttedPct,
        heroEq: hEq, heroPct: rel.pct, heroBuckets: hB, villBuckets: vB, cls,
        rangeEq: rEq, profile: P.PROFILES.reg, actorIsProfiled: false
      }, P.advantage(hB, vB, rEq));

      // Straße durchgehen und bei jeder Hero-Aktion bewerten.
      const street = { potStart: pot };
      let facingAmt = 0, streetPot = pot;
      let lastAggressor = null, facingKind = null;
      for (const a of acts) {
        if (a.player !== hero) {
          if (a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin') {
            facingAmt = a.amount; lastAggressor = a.player; facingKind = a.kind;
          }
          streetPot += a.amount;
          continue;
        }
        let rec, picked, mode;
        if (facingAmt > 0 && lastAggressor && lastAggressor !== hero) {
          mode = 'FACE';
          /* Eine Erhöhung ist keine Bet. Gegen einen Check-Raise mit der
             Bet-Tabelle zu rechnen, setzt rund ein Drittel Luft in seiner
             Range an — die Equity fällt dadurch zu hoch aus und der Call
             zu gut. Gemessen an einer River-Hand aus der Session: 43,7 %
             statt 34,5 %. */
          const villBet = facingKind === 'raise'
            ? P.narrow(villRange, board, 'raise', { ctx })
            : P.bettingRangeOf(villRange, board, facingAmt / Math.max(1, streetPot - facingAmt), ctx, P.PROFILES.reg);
          const eqVsBet = P.equityVsRange(row.cards, villBet, board, SIMS_EQ).eq;
          const fctx = Object.assign({}, ctx, {
            facing: { toCall: facingAmt, potNow: streetPot, betPct: facingAmt / Math.max(1, streetPot - facingAmt) },
            eqVsBettingRange: eqVsBet
          });
          rec = P.recommendFacing(cls, fctx);
          picked = mapFacing(a.kind, a.amount + facingAmt, facingAmt);
        } else {
          mode = 'BET';
          rec = P.recommendBetting(cls, ctx);
          picked = mapBet(a.kind, a.amount, streetPot);
        }
        const score = rec.scores[picked] === undefined ? null : rec.scores[picked];
        if (score !== null) {
          decisions.push({
            handIdx: row.idx, street: st, mode, picked, best: rec.best, score,
            heroPos: info.heroPos, villPos: info.villPos, heroIP, role: pr.heroRole,
            potType: pr.potType, approx: pr.approx,
            texture: P.HandProfile.bucketOf(P.HandProfile.fastTex(h.board.flop)),
            tier: P.tierOf(cls), made: P.W2DLeaks.describeHolding(row.cards, board).label,
            madeRaw: cls.made, handClass: row.handClass,
            board: board.slice(), spr: ctx.spr, stackBB: row.stackBB,
            reason: rec.reasons[rec.reasons.length - 1]
          });
        }
        streetPot += a.amount;
        if (a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin') { facingAmt = a.amount; lastAggressor = hero; }
        if (a.kind === 'call' || a.kind === 'fold') facingAmt = 0;
      }

      // Ranges für die nächste Straße verengen.
      const hAct = summaryAction(acts, hero);
      const vAct = summaryAction(acts, villName);
      if (hAct) heroRange = P.narrow(heroRange, board, hAct, { ctx });
      if (vAct) villRange = P.narrow(villRange, board, vAct, { ctx });
      const added = acts.reduce((s, a) => s + a.amount, 0);
      pot += added;
      eff -= acts.filter(a => a.player === hero).reduce((s, a) => s + a.amount, 0);
      if (eff <= 0) break;
    }
    return { decisions, skip: null, approx: pr.approx };
  }

  function isIP(heroPos, villPos) {
    const ORD = ['SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'MP', 'MP1', 'MP2', 'CO', 'BTN'];
    return ORD.indexOf(heroPos) > ORD.indexOf(villPos);
  }
  /** Gröbste Aktion eines Spielers auf einer Straße, für das Verengen. */
  function summaryAction(acts, who) {
    const mine = acts.filter(a => a.player === who);
    if (!mine.length) return null;
    if (mine.some(a => a.kind === 'raise')) return 'raise';
    if (mine.some(a => a.kind === 'bet' || a.kind === 'allin')) return 'bet';
    if (mine.some(a => a.kind === 'call')) return 'call';
    if (mine.some(a => a.kind === 'check')) return 'check';
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Alle Hände nachspielen.
   * ------------------------------------------------------------------ */
  function replayAll(analysis, onProgress) {
    const decisions = [], multiway = [], skipped = {};
    analysis.rows.forEach((r, i) => {
      const res = replayHand(r);
      if (res.multiway) multiway.push(...res.multiway);
      if (res.skip) { skipped[res.skip] = (skipped[res.skip] || 0) + 1; return; }
      decisions.push(...(res.decisions || []));
      if (onProgress && i % 10 === 0) onProgress(i, analysis.rows.length);
    });
    return { decisions, multiway, skipped };
  }

  /* ------------------------------------------------------------------ *
   * Mehrweg-Pots.
   *
   * Hier gibt es keine Note, weil es keine Referenzstrategie gibt: mit dem
   * dritten Spieler explodiert der Baum, und ein Mehrweg-Gleichgewicht ist
   * nicht einmal eindeutig. Zwei Dinge sind aber trotzdem exakt entscheidbar
   * und werden deshalb geprüft:
   *
   *   FACING — deine Equity gegen ALLE verbliebenen Ranges gegen die Pot
   *   Odds. Reine Wahrscheinlichkeit, kein Gleichgewicht.
   *
   *   BLUFF — ein Bluff muss alle zum Folden bringen. Bei zwei Gegnern muss
   *   jeder Einzelne schon mit 63 % folden, damit sich eine 65-%-Bet
   *   rechnet; bei drei mit 73 %. So oft foldet niemand.
   * ------------------------------------------------------------------ */
  function replayMultiway(row, alive) {
    const h = row.hand, hero = h.hero, M = P.Multiway;
    // Ohne das Mehrweg-Modul lieber sauber aussteigen als die ganze
    // Auswertung mit einer Ausnahme abbrechen.
    if (!M) return { skip: 'Mehrweg (Modul fehlt)' };
    const posMap = P.W2D.positionsOf(h).map;
    const raises = h.streets.preflop.filter(a => a.kind === 'raise' || a.kind === 'allin');
    if (!raises.length) return { skip: 'Mehrweg, ungeraist' };

    // Jeder Gegner bekommt eine Range nach seiner Preflop-Rolle.
    const opps = alive.filter(n => n !== hero);
    const ranges = opps.map(n => {
      const isOpener = raises[0].player === n;
      const k = RK[posMap[n]] || 'MP';
      return P.parseRange(isOpener ? (P.RFI[k] || M.BB_MULTI) : M.CONTINUE);
    });

    const inv = {};
    for (const st of ['blinds', 'preflop']) for (const a of h.streets[st]) inv[a.player] = (inv[a.player] || 0) + a.amount;
    let pot = Object.keys(inv).reduce((x, k) => x + inv[k], 0);

    const out = [];
    for (const st of ['flop', 'turn', 'river']) {
      const board = st === 'flop' ? h.board.flop
        : st === 'turn' ? h.board.flop.concat(h.board.turn) : h.boardAll;
      if (board.length < 3) break;
      if (st === 'turn' && !h.board.turn.length) break;
      if (st === 'river' && !h.board.river.length) break;
      const acts = h.streets[st];
      if (!acts.length) break;

      let sp = pot, facing = 0, aggressor = null;
      for (const a of acts) {
        if (a.player === hero) {
          const cls = P.classify(row.cards, board);
          if (facing > 0 && aggressor !== hero) {
            // Entscheidbar: Equity gegen alle gegen die Pot Odds.
            const eq = M.equityMulti(row.cards, ranges, board, 12000).eq;
            const need = M.needEquity(sp - facing, facing);
            const called = a.kind === 'call' || a.kind === 'raise' || a.kind === 'allin';
            out.push({
              handIdx: row.idx, street: st, multiway: true, mode: 'FACE',
              opponents: opps.length, eq, need, picked: a.kind,
              verdict: called && eq < need - 0.04 ? 'mw-call-ohne-equity'
                : !called && eq > need + 0.06 ? 'mw-fold-mit-equity' : null,
              handClass: row.handClass, made: P.W2DLeaks.describeHolding(row.cards, board).label,
              board: board.slice(), pot: sp - facing, bet: facing
            });
          } else if (a.kind === 'bet' && P.tierOf(cls) <= 1) {
            // Entscheidbar: wie oft müsste JEDER folden?
            const be = M.bluffBreakEven(sp, a.amount, opps.length);
            out.push({
              handIdx: row.idx, street: st, multiway: true, mode: 'BLUFF',
              opponents: opps.length, needEach: be.needEach, picked: 'bet',
              verdict: be.needEach > 0.6 ? 'mw-bluff-aussichtslos' : null,
              handClass: row.handClass, made: P.W2DLeaks.describeHolding(row.cards, board).label,
              board: board.slice(), pot: sp, bet: a.amount
            });
          }
        }
        if (a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin') { facing = a.amount; aggressor = a.player; }
        if (a.kind === 'call') facing = 0;
        sp += a.amount;
      }
      pot = sp;
    }
    return { decisions: [], multiway: out, skip: out.length ? null : 'Mehrweg ohne pruefbare Entscheidung' };
  }

  P.W2DPost = {
    replayMultiway,
    RK, preflopRanges, mapBet, mapFacing, replayHand, replayAll, isIP, summaryAction,
    SIMS_EQ, SIMS_RVR
  };
})();
