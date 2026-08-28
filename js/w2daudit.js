/* =========================================================================
   w2daudit.js — Einzelentscheidungen einer Session nachrechnen

   Frequenzen brauchen tausende Hände. Eine einzelne Entscheidung nicht:
   ob ein Fold mit A8s und 9bb im Cutoff richtig war, ist eine Rechnung,
   kein Stichprobenproblem. Genau darauf zielt dieses Modul.

   Drei Prüfungen, geordnet nach Belastbarkeit:

   1. PUSH/FOLD  — mit kurzem Stack und ungeöffnetem Pot ist Shove-oder-Fold
      eine geschlossene Formel (Fold-Equity plus Equity gegen die Call-Range).
      Das ist die härteste Aussage hier.
   2. LIMPEN / MIN-RAISE bei kurzem Stack — strukturell, unabhängig von der
      Hand: unter 12bb gibt es keinen sinnvollen Nicht-All-in-Einsatz mehr,
      weil jede kleinere Erhöhung dich ohnehin committet.
   3. OPEN-RANGE  — Abgleich mit den Referenzranges der App. Die sind
      "gut genug"-Näherungen, keine Solver-Ausgabe. Deshalb wird hier von
      ABWEICHUNG gesprochen, nicht von Fehler, und nur bei deutlichen
      Ausreißern gemeldet.

   Was hier bewusst FEHLT: eine Bewertung der Postflop-Straßen. Dafür
   müssten die Karten der Gegner bekannt sein, und sie sind in 1.106 von
   1.414 Fällen verdeckt. Eine Postflop-Note wäre geraten.
   ========================================================================= */
(function () {
  const P = window.PT;

  const SHOVE_MAX_BB = 15;      // darüber ist Shove/Fold nicht mehr die ganze Strategie
  const EV_THRESHOLD = 0.5;     // bb, ab der eine Abweichung gemeldet wird

  /** Position -> Schlüssel der Call-Range-Tabelle. */
  function callKey(pos) {
    if (pos === 'BB') return 'BB';
    if (pos === 'SB') return 'SB';
    return 'OTHER';
  }
  /** Reihenfolge der Positionen ab dem Button. */
  const ORDER = ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'MP', 'MP1', 'MP2', 'CO'];

  /** Wer sitzt nach dir und kann noch callen? */
  function behindOf(hand, heroName, posMap) {
    const pf = hand.streets.preflop;
    const i = pf.findIndex(a => a.player === heroName);
    if (i < 0) return [];
    const seen = [];
    for (const a of pf.slice(i + 1)) {
      if (!seen.includes(a.player)) seen.push(a.player);
    }
    return seen.map(n => callKey(posMap[n] || 'OTHER'));
  }

  /**
   * Push/Fold einer Hand nachrechnen.
   * @returns null, wenn es kein Push/Fold-Spot war
   */
  function auditShove(row, cache) {
    const H = P.HandProfile;
    if (!row.handClass || !row.foldedToHero) return null;
    if (row.stackBB > SHOVE_MAX_BB || row.stackBB < 2) return null;
    if (row.pos === 'BB') return null;                 // im BB gibt es nichts zu öffnen

    const hand = row.hand;
    const posMap = P.W2D.positionsOf(hand).map;
    const behind = behindOf(hand, hand.hero, posMap);
    if (!behind.length) return null;

    // Die Call-Ranges liegen für 10/15/20bb vor — auf die nächste stützen.
    const stacks = H.SHOVE_STACKS;
    let snap = stacks[0];
    for (const s of stacks) if (Math.abs(s - row.stackBB) < Math.abs(snap - row.stackBB)) snap = s;

    const spot = {
      key: 'live', name: row.pos,
      posted: row.pos === 'SB' ? 0.5 : row.pos === 'BB' ? 1 : 0,
      behind
    };
    let ev;
    try { ev = H.shoveEV(row.handClass, spot, snap, cache).ev; }
    catch (e) { return null; }

    const shoved = row.allIn && row.pfr;
    const folded = row.heroPF === 'fold';
    const limped = row.heroPF === 'call';
    const smallRaise = row.pfr && !row.allIn;

    let verdict = null;
    if (folded && ev > EV_THRESHOLD) verdict = 'fold-statt-push';
    else if (shoved && ev < -EV_THRESHOLD) verdict = 'push-war-schlecht';
    else if (limped) verdict = 'limp-bei-kurzem-stack';
    else if (smallRaise && row.stackBB <= 12) verdict = 'minraise-bei-kurzem-stack';

    return {
      row, ev, snap, behind: behind.length, verdict,
      action: shoved ? 'All-in' : folded ? 'Fold' : limped ? 'Limp' : smallRaise ? 'Raise' : row.heroPF
    };
  }

  /* ------------------------------------------------------------------ *
   * Open-Range: Abgleich mit den Referenzranges.
   * ------------------------------------------------------------------ */
  const RFI_KEY = {
    UTG: 'EP', UTG1: 'EP', UTG2: 'EP', MP: 'MP', MP1: 'MP', MP2: 'MP',
    CO: 'CO', BTN: 'BTN', SB: 'SB'
  };
  let _rfiSets = null;
  function rfiSet(key) {
    if (!_rfiSets) {
      _rfiSets = {};
      for (const k of Object.keys(P.RFI)) {
        const s = new Set();
        for (const c of P.parseRange(P.RFI[k])) s.add(P.handClassOf(c.c));
        _rfiSets[k] = s;
      }
    }
    return _rfiSets[key];
  }

  function auditOpen(row) {
    if (!row.handClass || !row.foldedToHero || !row.posCertain) return null;
    if (row.stackBB <= SHOVE_MAX_BB) return null;      // dort gilt Push/Fold
    if (row.pos === 'BB') return null;
    const key = RFI_KEY[row.pos];
    const set = key && rfiSet(key);
    if (!set) return null;
    const inRange = set.has(row.handClass);
    const opened = row.pfr;
    if (opened === inRange) return null;               // stimmt überein
    return {
      row, inRange, opened, refKey: key,
      verdict: opened ? 'open-ausserhalb-referenz' : 'fold-innerhalb-referenz'
    };
  }

  /* ------------------------------------------------------------------ */
  function auditAll(analysis) {
    const cache = {};
    const shoves = [], opens = [];
    for (const row of analysis.rows) {
      const s = auditShove(row, cache);
      if (s && s.verdict) shoves.push(s);
      const o = auditOpen(row);
      if (o) opens.push(o);
    }
    // Nach Gewicht sortieren: was am meisten gekostet hat, zuerst.
    shoves.sort((a, b) => Math.abs(b.ev) - Math.abs(a.ev));

    const byVerdict = {};
    for (const s of shoves) (byVerdict[s.verdict] = byVerdict[s.verdict] || []).push(s);
    const openTooWide = opens.filter(o => o.verdict === 'open-ausserhalb-referenz');
    const openTooTight = opens.filter(o => o.verdict === 'fold-innerhalb-referenz');

    // Summe der verschenkten bb aus den klaren Push/Fold-Fehlern
    const lostBB = (byVerdict['fold-statt-push'] || []).reduce((a, s) => a + s.ev, 0)
      + (byVerdict['push-war-schlecht'] || []).reduce((a, s) => a - s.ev, 0);

    return { shoves, byVerdict, opens, openTooWide, openTooTight, lostBB };
  }

  const VERDICT_TEXT = {
    'fold-statt-push': {
      title: 'Gefoldet, obwohl der Shove klar +EV war',
      why: 'Mit kurzem Stack ist totes Geld im Pot der größte Teil des Werts. Wer hier foldet, ' +
        'verschenkt Blinds und Ante und wird eine Runde später mit noch weniger Chips gezwungen zu handeln.'
    },
    'push-war-schlecht': {
      title: 'Geshovt, obwohl es -EV war',
      why: 'Zu weit gepusht gegen zu viele Spieler hinter dir. Je mehr hinter dir sitzen, desto ' +
        'öfter wacht einer mit einer echten Hand auf.'
    },
    'limp-bei-kurzem-stack': {
      title: 'Gelimpt statt zu shoven',
      why: 'Unter 15bb gibt es keinen Pot, den du noch klein halten kannst. Der Limp verschenkt ' +
        'die Fold-Equity, die dein einziger echter Vorteil ist.'
    },
    'minraise-bei-kurzem-stack': {
      title: 'Klein erhöht statt all-in',
      why: 'Unter 12bb committet dich jede Erhöhung ohnehin. Ein Min-Raise gibt dem Gegner ' +
        'nur bessere Odds für dieselbe Entscheidung.'
    }
  };

  P.W2DAudit = {
    SHOVE_MAX_BB, EV_THRESHOLD, auditShove, auditOpen, auditAll,
    VERDICT_TEXT, RFI_KEY, behindOf
  };
})();
