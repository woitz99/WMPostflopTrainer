/* =========================================================================
   rangeflow.js — Range-Verlauf: wie sich die Range EINES Gegners von
   Preflop zum Flop verengt (Stufe 1: Preflop + Flop, Heads-up).

   Woher die Zahlen kommen — und wie belastbar sie sind:
   - Preflop: die Ranges aus ranges.js (RFI, BB-Defense, IP-Flats, 3-Bets,
     Calls gegen 3-Bets), inklusive adjustForStack. Das sind dieselben
     Näherungen, mit denen der Trainer rechnet, keine Solver-Ranges. Ist für
     eine Positions-Kombination nichts hinterlegt, wird die nächstliegende
     hinterlegte Range genommen und als "angenähert" markiert. Gibt es gar
     nichts Passendes, bleibt die Range leer und muss eingetragen werden —
     lieber eine sichtbare Lücke als eine erfundene Range.
   - Flop: dasselbe Aktionsmodell wie im Trainer, unverändert übernommen:
       bettet      -> bettingRangeOf (Sizing + Gegnertyp)
       checkt      -> narrow('check') mit handDrive aus SEINER Sicht
       callt       -> narrow('call') (continueWeight, Gegnertyp)
       raist       -> narrow('raise')
     Das ist eine erklärbare Heuristik, keine GTO-Frequenz.
   - Kartenentfernung: deine Hole Cards und das Board werden aus seiner
     Range genommen. Was er über DEINE Range annimmt, geht nur über das
     Range-Advantage in seine Check/Bet-Entscheidung ein.
   ========================================================================= */
(function () {
  const P = window.PT;

  /* Preflop-Reihenfolge (wer handelt zuerst). EP entspricht UTG. */
  const POS = ['EP', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  const POS_LABEL = { EP: 'EP (UTG)', MP: 'MP', CO: 'CO', BTN: 'BTN', SB: 'SB', BB: 'BB' };
  const pfIdx = p => POS.indexOf(p);
  /* POSTFLOP_ORDER aus ranges.js kennt 'UTG' statt 'EP'. */
  const pfKey = p => (p === 'EP' ? 'UTG' : p);

  /** Ist der Gegner postflop in Position gegen dich? */
  function villIP(heroPos, villPos) {
    return P.actsBefore(pfKey(heroPos), pfKey(villPos));
  }

  /* ---------------- Preflop-Linien ----------------
     Jede Linie legt fest, welche Rolle beide Spieler preflop hatten.
     opener: wer zuerst raist ('hero' | 'vill'). */
  const LINES = {
    vOpen_hCall: { label: 'Er öffnet, du callst', opener: 'vill', potType: 'SRP', villRole: 'PFR', villAct: 'Open-Raise' },
    hOpen_vCall: { label: 'Du öffnest, er callt', opener: 'hero', potType: 'SRP', villRole: 'CALLER', villAct: 'Call gegen dein Open' },
    hOpen_v3b: { label: 'Du öffnest, er 3-bettet, du callst', opener: 'hero', potType: '3BP', villRole: '3BET', villAct: '3-Bet gegen dein Open' },
    vOpen_h3b: { label: 'Er öffnet, du 3-bettest, er callt', opener: 'vill', potType: '3BP', villRole: 'CALL3B', villAct: 'Call gegen deine 3-Bet' }
  };

  /** Welche Linien sind mit diesen Positionen möglich? Der Opener sitzt preflop vorne. */
  function linesFor(heroPos, villPos) {
    if (heroPos === villPos) return [];
    const heroFirst = pfIdx(heroPos) < pfIdx(villPos);
    return Object.keys(LINES).filter(k => {
      const L = LINES[k];
      if (L.opener === 'hero' && (!heroFirst || heroPos === 'BB')) return false;
      if (L.opener === 'vill' && (heroFirst || villPos === 'BB')) return false;
      return true;
    });
  }

  /**
   * Range aus einer Tabelle "A_vs_B". Exakter Treffer, sonst dieselbe
   * erste Position mit dem nächstliegenden Gegner. Liefert null, wenn es
   * für die erste Position gar nichts gibt.
   */
  function lookupVs(table, a, b, tableName) {
    const key = a + '_vs_' + b;
    if (table[key]) return { str: table[key], src: tableName + ' ' + key, approx: false };
    const cands = Object.keys(table).filter(k => k.split('_vs_')[0] === a);
    if (!cands.length) return null;
    cands.sort((x, y) => Math.abs(pfIdx(x.split('_vs_')[1]) - pfIdx(b)) - Math.abs(pfIdx(y.split('_vs_')[1]) - pfIdx(b)));
    return {
      str: table[cands[0]], src: tableName + ' ' + cands[0], approx: true,
      note: `Für ${a} gegen ${b} ist keine Range hinterlegt — angenähert über ${cands[0].replace('_vs_', ' gegen ')}.`
    };
  }

  function rfi(pos, band) {
    if (!P.RFI[pos]) return null;
    return { str: P.adjustForStack(P.RFI[pos], band), src: 'RFI ' + pos, approx: false };
  }
  /** Call gegen ein Open: BB verteidigt aus BB_FLAT, sonst Cold-Call (IP_FLAT). */
  function flat(caller, opener, band) {
    if (caller === 'BB') {
      return P.BB_FLAT[opener]
        ? { str: P.adjustForStack(P.BB_FLAT[opener], band), src: 'BB-Defense vs ' + opener, approx: false }
        : null;
    }
    return lookupVs(P.IP_FLAT, caller, opener, 'Cold-Call');
  }

  /** Beide Preflop-Ranges für eine Linie. Fehlende Ranges kommen als null. */
  function preflopRanges(lineKey, heroPos, villPos, band) {
    const L = LINES[lineKey];
    let vill, hero;
    if (lineKey === 'vOpen_hCall') { vill = rfi(villPos, band); hero = flat(heroPos, villPos, band); }
    else if (lineKey === 'hOpen_vCall') { hero = rfi(heroPos, band); vill = flat(villPos, heroPos, band); }
    else if (lineKey === 'hOpen_v3b') {
      vill = lookupVs(P.THREEBET, villPos, heroPos, '3-Bet');
      hero = lookupVs(P.CALL_3BET, heroPos, villPos, 'Call vs 3-Bet');
    } else {
      vill = lookupVs(P.CALL_3BET, villPos, heroPos, 'Call vs 3-Bet');
      hero = lookupVs(P.THREEBET, heroPos, villPos, '3-Bet');
    }
    return { line: L, vill, hero, villIP: villIP(heroPos, villPos) };
  }

  /* ---------------- Flop-Aktionen ----------------
     Was er tun kann, hängt davon ab, wer zuerst dran ist. */
  const ACTIONS_OOP = [
    { key: 'x', label: 'checkt, du checkst zurück', steps: ['check'] },
    { key: 'b', label: 'bettet', steps: ['bet'], sized: true },
    { key: 'xc', label: 'checkt, callt deine Bet', steps: ['check', 'call'], sized: true },
    { key: 'xr', label: 'checkt, raist deine Bet (Check-Raise)', steps: ['check', 'raise'] }
  ];
  const ACTIONS_IP = [
    { key: 'x', label: 'checkt hinter deinem Check', steps: ['check'] },
    { key: 'b', label: 'bettet nach deinem Check', steps: ['bet'], sized: true },
    { key: 'c', label: 'callt deine Bet', steps: ['call'], sized: true },
    { key: 'r', label: 'raist deine Bet', steps: ['raise'] }
  ];
  const SIZES = [
    { pct: 0.33, label: '33% Pot' }, { pct: 0.55, label: '55% Pot' },
    { pct: 0.80, label: '80% Pot' }, { pct: 1.30, label: '130% / All-in' }
  ];
  function flopActions(isVillIP) { return isVillIP ? ACTIONS_IP : ACTIONS_OOP; }

  /** Kontext aus SEINER Sicht — so wie villCtx() im Trainer. */
  function villainCtx(villRange, heroRange, board, opts) {
    const vB = P.rangeBuckets(villRange, board, opts.dead || []);
    const hB = P.rangeBuckets(heroRange, board, []);
    const rEq = P.rangeVsRange(villRange, heroRange, board, 6000);
    const geo = P.geometry({ potType: opts.potType, opponents: 1, id: '' }, opts.band);
    return Object.assign({
      street: 'flop', tex: P.boardTexture(board),
      spr: geo.spr, pot: geo.pot, eff: geo.eff,
      heroIP: opts.villIP, role: opts.villRole, potType: opts.potType, opponents: 1,
      heroNut: vB.nuttedPct, villNut: hB.nuttedPct, heroBuckets: vB, villBuckets: hB,
      rangeEq: rEq, profile: opts.profile, actorIsProfiled: true
    }, P.advantage(vB, hB, rEq));
  }

  /**
   * Seine Range nach der Flop-Aktion.
   * @returns {{range, ctx}}  range hat Gewichte relativ zur Preflop-Range
   */
  function flopNarrow(villRange, heroRange, board, opts) {
    const dead = new Set((opts.dead || []).concat(board));
    let r = villRange.filter(x => !dead.has(x.c[0]) && !dead.has(x.c[1]));
    const ctx = villainCtx(r, heroRange, board, opts);
    const act = flopActions(opts.villIP).find(a => a.key === opts.action) || flopActions(opts.villIP)[0];
    const betPct = opts.betPct || 0.55;
    for (const st of act.steps) {
      if (st === 'check') r = P.narrow(r, board, 'check', { ctx });
      else if (st === 'bet') r = betRange(r, board, betPct, ctx, opts.profile);
      else if (st === 'call') r = P.narrow(r, board, 'call', { betPct, street: 'flop', profile: opts.profile });
      else if (st === 'raise') r = P.narrow(r, board, 'raise', { ctx });
    }
    return { range: r, ctx, action: act };
  }

  /**
   * Seine Bet-Range in zwei Schritten — WIE OFT und WOMIT getrennt:
   * 1. Wie oft er überhaupt bettet: narrow('bet') mit handDrive aus seiner
   *    Sicht (Position, Rolle, Range-/Nut-Advantage, SPR). Das ist dieselbe
   *    Bet-Neigung, mit der der Trainer deine eigene Bet-Range bildet.
   * 2. Womit bei DIESER Größe: bettingRangeOf formt die Zusammensetzung,
   *    wird aber auf die Summe aus Schritt 1 zurückskaliert.
   * Vorher stand hier nur bettingRangeOf. Das kennt weder Position noch Rolle
   * und ließ den BB-Caller auf Q♠8♥4♥ gegen den BTN 42 % donken —
   * Desktop Postflop sagt 0,7 % (Abgleich 16.11.2026). Mit Schritt 1: 5,9 %.
   */
  function betRange(range, board, betPct, ctx, profile) {
    const freq = P.narrow(range, board, 'bet', { ctx });
    const shaped = P.bettingRangeOf(freq, board, betPct, ctx, profile);
    const W = r => r.reduce((a, x) => a + x.w, 0);
    const k = W(shaped) > 0 ? W(freq) / W(shaped) : 0;
    return shaped.map(x => ({ c: x.c, w: x.w * k }));
  }

  /* ---------------- Solver-Bibliothek ----------------
     Vorgerechnete Flops aus tools/solver (postflop-solver, über Nacht).
     data/solver/index.json listet, was es gibt; je Spot×Board eine Datei
     mit den Flop-Strategien beider Spieler, je Hand in Promille.
     Wo ein Eintrag passt, ersetzt er die Heuristik — aber nur für den
     Gegnertyp "Reg": einen Nit oder eine Station kennt der Solver nicht. */

  /** Passt ein Bibliotheks-Eintrag zu Positionen, Linie, Stackband und Board? */
  function solverEntryFor(index, o) {
    if (!index || !index.spots || !o.board || o.board.length !== 3) return null;
    const L = LINES[o.line];
    if (!L) return null;
    const vIP = villIP(o.heroPos, o.villPos);
    const oopPos = vIP ? o.heroPos : o.villPos, ipPos = vIP ? o.villPos : o.heroPos;
    const openerPos = L.opener === 'hero' ? o.heroPos : o.villPos;
    const key = cs => cs.slice().sort((a, b) => a - b).join(',');
    const want = key(o.board);
    return index.spots.find(e => e.band === o.band && e.potType === L.potType
      && e.oopPos === oopPos && e.ipPos === ipPos && e.openerPos === openerPos
      && key(parseCards(e.board).cards) === want) || null;
  }

  const comboKey = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  /** Bet-Größe einer Solver-Aktion in Prozent des Pots vor der Bet. */
  function actPct(a, pot) { return +a.slice(1) / pot; }
  const isBet = a => a[0] === 'B' || a[0] === 'A';
  const isRaise = a => a[0] === 'R' || a[0] === 'A';

  /** Index der Bet, deren Größe der gewünschten am nächsten liegt. */
  function nearestBet(actions, pot, pct) {
    let best = -1, d = Infinity;
    actions.forEach((a, i) => {
      if (!isBet(a)) return;
      const dd = Math.abs(actPct(a, pot) - pct);
      if (dd < d) { d = dd; best = i; }
    });
    return best;
  }

  /**
   * Seine Range nach der Flop-Aktion, aus den Solver-Strategien.
   * Gewichte = seine Preflop-Range (ohne deine Karten) × Häufigkeit je Hand.
   * @returns {{range, sizeNote, used}} oder null, wenn der Baum die Linie nicht hat
   */
  function solverNarrow(data, villRange, board, o) {
    const p = o.villIsOop ? 0 : 1, side = data[p === 0 ? 'oop' : 'ip'];
    const idx = new Map();
    side.cards.forEach((s, i) => { const c = s.match(/../g).map(P.cardFromStr); idx.set(comboKey(c[0], c[1]), i); });
    const N = data.nodes, pot = data.pot;
    const root = N[''];
    if (!root) return null;
    const chk = root.a.indexOf('X');
    const freqs = [];            // Liste von [knoten, aktionsindizes] — Produkt je Hand
    let used = null;
    const pctOf = (node, i, base) => Math.round(actPct(node.a[i], base) * 100);
    if (p === 0) {
      if (o.action === 'x') freqs.push([root, [chk]]);
      else if (o.action === 'b') {
        const i = nearestBet(root.a, pot, o.betPct); if (i < 0) return null;
        freqs.push([root, [i]]); used = pctOf(root, i, pot);
      } else {
        const n0 = N[String(chk)]; if (!n0) return null;
        const k = nearestBet(n0.a, pot, o.betPct); if (k < 0) return null;
        const resp = N[chk + '-' + k]; if (!resp) return null;
        freqs.push([root, [chk]]);
        if (o.action === 'xc') freqs.push([resp, [resp.a.indexOf('C')]]);
        else freqs.push([resp, resp.a.map((a, i) => (isRaise(a) ? i : -1)).filter(i => i >= 0)]);
        used = pctOf(n0, k, pot);
      }
    } else {
      if (o.action === 'x' || o.action === 'b') {
        const n0 = N[String(chk)]; if (!n0) return null;
        if (o.action === 'x') freqs.push([n0, [n0.a.indexOf('X')]]);
        else { const i = nearestBet(n0.a, pot, o.betPct); if (i < 0) return null; freqs.push([n0, [i]]); used = pctOf(n0, i, pot); }
      } else {
        const k = nearestBet(root.a, pot, o.betPct); if (k < 0) return null;
        const resp = N[String(k)]; if (!resp) return null;
        if (o.action === 'c') freqs.push([resp, [resp.a.indexOf('C')]]);
        else freqs.push([resp, resp.a.map((a, i) => (isRaise(a) ? i : -1)).filter(i => i >= 0)]);
        used = pctOf(root, k, pot);
      }
    }
    if (freqs.some(([, ix]) => !ix.length || ix.some(i => i < 0))) return null;
    const blocked = new Set((o.dead || []).concat(board));
    const out = [];
    for (const x of villRange) {
      if (blocked.has(x.c[0]) || blocked.has(x.c[1])) continue;
      const j = idx.get(comboKey(x.c[0], x.c[1]));
      if (j == null) continue;
      let f = 1;
      for (const [node, ix] of freqs) f *= ix.reduce((a, i) => a + node.s[i][j], 0) / 1000;
      if (f > 0.001) out.push({ c: x.c, w: x.w * f });
    }
    const want = Math.round(o.betPct * 100);
    const sizeNote = used != null && Math.abs(used - want) > 4
      ? `Der Solver-Baum hat diese Größe nicht — genommen wurde die nächstliegende, ${used} % Pot.` : '';
    return { range: out, sizeNote, used };
  }

  /* ---------------- Einordnung: Value / Draws / Luft ---------------- */
  const GROUPS = [
    { key: 'strong', name: 'Stark', hint: 'Two Pair+, Set, Overpair, Top Pair Top Kicker', color: '#3fbf7f' },
    { key: 'medium', name: 'Top Pair', hint: 'Top Pair ohne Top Kicker — dünner Value oder Bluffcatcher', color: '#7fc9a0' },
    { key: 'draw', name: 'Draws', hint: 'Flushdraw, OESD oder Gutshot ohne starkes Paar', color: '#5aa9e6' },
    { key: 'weak', name: 'Schwache Paare', hint: 'Second Pair und schlechter, Pocket Pairs unter Top Pair', color: '#e0a23c' },
    { key: 'air', name: 'Luft', hint: 'kein Paar, kein nennenswerter Draw', color: '#e4635a' }
  ];
  function groupOf(cls) {
    const t = P.tierOf(cls);
    if (t >= 4) return 'strong';
    if (t === 3) return 'medium';
    if (cls.hasFD || cls.hasOESD || cls.hasGutshot) return 'draw';
    if (t >= 1) return 'weak';
    return 'air';
  }

  /**
   * Zerlegt eine (gewichtete) Range auf dem Board.
   * w = Summe der Gewichte = "effektive Kombos".
   */
  function analyse(range, board, dead) {
    const blocked = new Set((dead || []).concat(board));
    const g = {}; GROUPS.forEach(x => { g[x.key] = { w: 0, classes: {} }; });
    const byClass = {};
    let tot = 0;
    for (const x of range) {
      if (blocked.has(x.c[0]) || blocked.has(x.c[1])) continue;
      const hc = P.handClassOf(x.c);
      let k = null, made = null;
      if (board.length) {
        const cls = P.classify(x.c, board);
        k = groupOf(cls); made = cls.made + (cls.draws.length ? ' + ' + cls.draws[0] : '');
        g[k].w += x.w;
        const gc = g[k].classes[hc] || (g[k].classes[hc] = { w: 0, made: {} });
        gc.w += x.w; gc.made[made] = (gc.made[made] || 0) + x.w;
      }
      const bc = byClass[hc] || (byClass[hc] = { w: 0, groups: {} });
      bc.w += x.w;
      if (k) bc.groups[k] = (bc.groups[k] || 0) + x.w;
      tot += x.w;
    }
    return { tot, groups: g, byClass };
  }

  /** Wie viele Kombos hat eine Hand-Klasse nach Kartenentfernung höchstens? */
  function classMax(hc, blocked) {
    return P.handToCombos(hc.length === 2 ? hc + 'o' : hc)
      .filter(c => !blocked.has(c[0]) && !blocked.has(c[1])).length;
  }

  function parseCards(str) {
    const s = String(str || '').replace(/[\s,]/g, '');
    if (!s) return { cards: [] };
    if (!/^([2-9TJQKA][cdhs])+$/i.test(s)) return { error: 'Karten bitte als z. B. AhKd bzw. Kh7d2c eingeben (Farben c d h s).' };
    const cards = s.match(/../g).map(P.cardFromStr);
    if (new Set(cards).size !== cards.length) return { error: 'Eine Karte kommt doppelt vor.' };
    return { cards };
  }

  /* ---------------- Export für einen Solver ----------------
     Format: Hand-Klassen mit Komma getrennt, Gewicht 0..1 als ":0.5" —
     die übliche Notation (PioSOLVER, GTO+, WASM Postflop, TexasSolver).
     Bewusst ohne "+"/"-"-Kurzformen: jede Klasse steht einzeln da, damit
     es keine Lesart-Unterschiede zwischen den Programmen gibt.
     Gewicht einer Klasse = Summe der Kombo-Gewichte / Kombos der Klasse,
     OHNE Kartenentfernung: der Solver entfernt Board-Karten selbst. */
  function solverRangeStr(range) {
    const by = {};
    for (const x of range) {
      const hc = P.handClassOf(x.c);
      by[hc] = (by[hc] || 0) + x.w;
    }
    const R = P.RANKS, out = [];
    for (let i = 12; i >= 0; i--) for (let j = 12; j >= 0; j--) {
      const hc = i === j ? R[i] + R[j] : i > j ? R[i] + R[j] + 's' : R[j] + R[i] + 'o';
      if (!by[hc]) continue;
      const n = hc.length === 2 ? 6 : hc[2] === 's' ? 4 : 12;
      const w = Math.min(1, by[hc] / n);
      if (w < 0.005) continue;
      out.push(w >= 0.995 ? hc : hc + ':' + (+w.toFixed(2)));
    }
    return out.join(',');
  }

  /**
   * Alles, was ein Postflop-Solver für den Flop braucht. Pot und Stack aus
   * der Geometrie des Trainers (bb, inkl. 1bb Ante), OOP/IP aus den Positionen.
   *
   * Abgeglichen mit dem Quellcode von WASM Postflop (RangeEditor.vue,
   * BoardSelector.vue, TreeConfig.vue, 11/2026):
   * - Ranges: Komma-getrennt, Gewicht 0..1 nach ":" — passt so.
   * - Board: das Eingabefeld trennt NUR an Leerzeichen/Kommas; "Qs8h4h" am
   *   Stück wird verworfen. Deshalb mit Leerzeichen.
   * - Pot und Stack: nur ganze Zahlen. Deshalb zusätzlich in Zehntel-bb
   *   (×10), damit 6,9bb nicht auf 7 gerundet werden muss.
   */
  const CHIPS_PER_BB = 10;
  function solverExport(o) {
    const geo = P.geometry({ potType: o.potType, opponents: 1, id: '' }, o.band);
    const vill = solverRangeStr(o.villRange), hero = solverRangeStr(o.heroRange);
    const oop = o.villIP ? hero : vill, ip = o.villIP ? vill : hero;
    const board = (o.board || []).map(P.cardToStr).join(' ');
    const potChips = Math.round(geo.pot * CHIPS_PER_BB), effChips = Math.round(geo.eff * CHIPS_PER_BB);
    const spotName = `${o.villIP ? o.heroPos : o.villPos} vs ${o.villIP ? o.villPos : o.heroPos} · ${o.potType} · ${P.STACKS[o.band].label}`;
    return {
      oop, ip, board, pot: geo.pot, eff: geo.eff, potChips: String(potChips), effChips: String(effChips),
      oopPos: o.villIP ? o.heroPos : o.villPos, ipPos: o.villIP ? o.villPos : o.heroPos,
      files: desktopPostflopFiles(spotName, oop, ip, potChips, effChips,
        o.villIP ? o.heroPos : o.villPos, o.villIP ? o.villPos : o.heroPos),
      text: [
        `OOP-Range (${o.villIP ? 'du, ' + o.heroPos : 'Gegner, ' + o.villPos}):`, oop, '',
        `IP-Range (${o.villIP ? 'Gegner, ' + o.villPos : 'du, ' + o.heroPos}):`, ip, '',
        'Board: ' + (board || '(noch kein Flop)'),
        `Startpot: ${potChips} · effektiver Stack: ${effChips} (in Zehntel-bb, also ${geo.pot} bb / ${geo.eff} bb; ${o.potType}, Stack ${P.STACKS[o.band].label})`
      ].join('\n')
    };
  }

  /* ---------------- Import-Dateien für Desktop/WASM Postflop ----------------
     Das Format ist das der Bibliothek ("Import JSON") in DbItemPicker.vue:
       { version: 2, name: <store>, data: [ {path, isGroup, value?} ] }
     name muss exakt "ranges" bzw. "configurations" heißen, Gruppen stehen vor
     ihren Einträgen. Abgeglichen mit dem Quellcode und einer echten
     Export-Datei aus Desktop Postflop v0.2.7 (16.11.2026).
     Das Board kennt der Import nicht — das bleibt Handarbeit.

     Bet-Größen: die Sizings des Trainers (BET_OPTIONS 33/55/80/130 %, Raise
     ≈2.7x), auf je zwei pro Straße gekürzt, damit der Baum klein und die
     Rechnung schnell bleibt. Im Solver jederzeit änderbar. Alle-in-Schwellen
     wie in der Export-Datei des Users (Programm-Standard). */
  const GROUP = 'Postflop Trainer';
  const TREE_SIZES = { flop: '33, 80', turn: '55, 130', river: '55, 130', raise: '2.7x' };
  /* Die Liste in Desktop Postflop sortiert alphabetisch: "IP · …" stand
     dadurch VOR "OOP · …", und beim ersten Test landete die BTN-Range im
     OOP-Slot. Deshalb Nummer vorn und die Position im Namen — dann ist
     auch im Raster sofort zu prüfen, ob die richtige Range geladen ist. */
  function desktopPostflopFiles(spotName, oop, ip, potChips, effChips, oopPos, ipPos) {
    const ranges = {
      version: 2, name: 'ranges', data: [
        { path: [GROUP], isGroup: true },
        { path: [GROUP, `1 OOP = ${oopPos || '?'} · ${spotName}`], isGroup: false, value: oop },
        { path: [GROUP, `2 IP = ${ipPos || '?'} · ${spotName}`], isGroup: false, value: ip }
      ]
    };
    const S = TREE_SIZES;
    const configurations = {
      version: 2, name: 'configurations', data: [
        { path: [GROUP], isGroup: true },
        {
          path: [GROUP, spotName], isGroup: false, value: {
            startingPot: potChips, effectiveStack: effChips, rakePercent: 0, rakeCap: 0, donkOption: 0,
            oopFlopBet: S.flop, oopFlopRaise: S.raise, oopTurnBet: S.turn, oopTurnRaise: S.raise, oopTurnDonk: '',
            oopRiverBet: S.river, oopRiverRaise: S.raise, oopRiverDonk: '',
            ipFlopBet: S.flop, ipFlopRaise: S.raise, ipTurnBet: S.turn, ipTurnRaise: S.raise,
            ipRiverBet: S.river, ipRiverRaise: S.raise,
            addAllInThreshold: 150, forceAllInThreshold: 20, mergingThreshold: 10,
            expectedBoardLength: 0, addedLines: '', removedLines: ''
          }
        }
      ]
    };
    return { ranges, configurations };
  }

  /* ---------------- Rate-Modus: Schätzung gegen Modell ----------------
     Erst schätzen, dann aufdecken — aktives Abrufen statt Ablesen. Gefragt
     wird nach genau den Größen, die am Tisch zählen: wie viel seiner Range
     diese Linie überhaupt nimmt, wie viel davon Value ist, wie viel Draws.
     Der Rest (schwache Paare + Luft) ergibt sich. Abweichung in
     Prozentpunkten, Bewertung über den Mittelwert der Beträge. */
  const QUIZ_FIELDS = [
    { key: 'take', label: 'Diese Linie nimmt … seiner Range' },
    { key: 'value', label: 'Value (Stark + Top Pair)' },
    { key: 'draws', label: 'Draws' },
    { key: 'rest', label: 'Schwache Paare + Luft' },
    { key: 'eq', label: 'Deine Equity dagegen' }
  ];
  const QUIZ_RATING = [
    { max: 5, label: 'Sehr gut', cls: 'ok' }, { max: 10, label: 'Gut', cls: 'ok2' },
    { max: 20, label: 'Daneben', cls: 'warn' }, { max: Infinity, label: 'Weit daneben', cls: 'bad' }
  ];
  /** truth und guess in Prozent (0..100); fehlende Schätzungen zählen nicht. */
  function quizScore(guess, truth) {
    const rows = [];
    for (const f of QUIZ_FIELDS) {
      if (truth[f.key] == null) continue;
      const g = guess[f.key];
      const has = g != null && g !== '' && isFinite(g);
      rows.push({ key: f.key, label: f.label, guess: has ? +g : null, truth: truth[f.key], diff: has ? +g - truth[f.key] : null });
    }
    const scored = rows.filter(r => r.diff != null);
    const meanAbs = scored.length ? scored.reduce((a, r) => a + Math.abs(r.diff), 0) / scored.length : null;
    const worst = scored.slice().sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0] || null;
    const rating = meanAbs == null ? null : QUIZ_RATING.find(r => meanAbs <= r.max);
    return { rows, meanAbs, worst, rating, n: scored.length };
  }

  P.RangeFlow = {
    quizScore, QUIZ_FIELDS, solverEntryFor, solverNarrow,
    POS, POS_LABEL, LINES, SIZES, GROUPS, TREE_SIZES,
    linesFor, preflopRanges, villIP, flopActions, flopNarrow, villainCtx, analyse, groupOf, parseCards, classMax,
    solverRangeStr, solverExport
  };

  /* =================================================================== *
   * UI
   * =================================================================== */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (x, d) => (x * 100).toFixed(d == null ? 0 : d) + '%';
  const prettyCards = cards => cards.map(c => {
    const s = P.cardToStr(c);
    const red = s[1] === 'h' || s[1] === 'd';
    return `<span class="rfcard${red ? ' red' : ''}">${s[0]}${P.SUIT_SYM[s[1]]}</span>`;
  }).join('');

  const U = {
    heroPos: 'BB', villPos: 'BTN', line: 'vOpen_hCall', band: 'mid', profile: 'reg',
    hero: '', villStr: null, villSrc: null, board: '', action: null, size: 0.55,
    quiz: store('pt.rf.quiz') === '1', revealedKey: null, guess: {}
  };

  /* Browser-Speicher nur für Bequemlichkeit (Schalter, Verlauf der Abweichung);
     ohne ihn funktioniert alles, es merkt sich nur nichts. */
  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) { /* privat / gesperrt */ }
    return null;
  }
  function quizHistory() {
    try { return JSON.parse(store('pt.rf.quizHist') || '[]'); } catch (e) { return []; }
  }

  function sel(id, opts, val) {
    return `<select id="${id}">${opts.map(o => `<option value="${esc(o.v)}"${o.v === val ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`;
  }

  function mount(root) {
    root.innerHTML = `
      <section class="panel wide">
        <h3>Range-Verlauf — was hat er, und wie wird es enger?</h3>
        <p class="muted hpintro">Lern- und Review-Werkzeug, nicht für den Einsatz während einer laufenden
          Hand (Echtzeit-Hilfen sind bei den meisten Anbietern verboten). Preflop rechnet mit den
          Näherungs-Ranges des Trainers, am Flop mit seinem Aktionsmodell. Das ist eine erklärbare
          Heuristik, kein Solver.</p>
        <div class="rdgrid" id="rfSetup"></div>
        <p class="rfwarn" id="rfSetupNote" hidden></p>
      </section>
      <section class="panel wide" id="rfPre"></section>
      <section class="panel wide">
        <h3>Flop</h3>
        <div class="rdgrid" id="rfFlopSetup"></div>
        <p class="rfwarn" id="rfFlopNote" hidden></p>
      </section>
      <section class="panel wide" id="rfFlop" hidden></section>
      <section class="panel wide" id="rfExport" hidden></section>`;
    renderSetup();
    recompute();
    loadSolverIndex();
  }

  function renderSetup() {
    const lines = linesFor(U.heroPos, U.villPos);
    if (!lines.includes(U.line)) U.line = lines[0] || null;
    const posOpts = POS.map(p => ({ v: p, l: POS_LABEL[p] }));
    $('#rfSetup').innerHTML = `
      <label>Deine Position ${sel('rfHeroPos', posOpts, U.heroPos)}</label>
      <label>Deine Hand <input id="rfHero" placeholder="z. B. AhQd" value="${esc(U.hero)}" autocomplete="off"></label>
      <label>Gegner-Position ${sel('rfVillPos', posOpts.filter(o => o.v !== U.heroPos), U.villPos)}</label>
      <label>Preflop ${lines.length ? sel('rfLine', lines.map(k => ({ v: k, l: LINES[k].label })), U.line) : '<select disabled><option>—</option></select>'}</label>
      <label>Stack ${sel('rfBand', Object.keys(P.STACKS).map(k => ({ v: k, l: P.STACKS[k].label })), U.band)}</label>
      <label>Gegnertyp ${sel('rfProf', P.PROFILE_LIST.map(k => ({ v: k, l: P.PROFILES[k].name })), U.profile)}</label>`;
    const on = (id, f) => { const e = $('#' + id); if (e) e.onchange = f; };
    on('rfHeroPos', e => {
      U.heroPos = e.target.value;
      if (U.villPos === U.heroPos) U.villPos = POS.find(p => p !== U.heroPos);
      U.villStr = null; renderSetup(); recompute();
    });
    on('rfVillPos', e => { U.villPos = e.target.value; U.villStr = null; renderSetup(); recompute(); });
    on('rfLine', e => { U.line = e.target.value; U.villStr = null; recompute(); });
    on('rfBand', e => { U.band = e.target.value; U.villStr = null; recompute(); });
    on('rfProf', e => { U.profile = e.target.value; recompute(); });
    $('#rfHero').oninput = e => { U.hero = e.target.value; recompute(); };
    renderFlopSetup();
  }

  function renderFlopSetup() {
    const acts = flopActions(villIP(U.heroPos, U.villPos));
    if (!acts.some(a => a.key === U.action)) U.action = acts[0].key;
    const act = acts.find(a => a.key === U.action);
    $('#rfFlopSetup').innerHTML = `
      <label>Flop <input id="rfBoard" placeholder="z. B. Kh7d2c" value="${esc(U.board)}" autocomplete="off"></label>
      <label>Er … ${sel('rfAct', acts.map(a => ({ v: a.key, l: a.label })), U.action)}</label>
      <label${act.sized ? '' : ' hidden'}>Bet-Größe ${sel('rfSize', SIZES.map(s => ({ v: String(s.pct), l: s.label })), String(U.size))}</label>
      <div class="rfquizctl">
        <label class="rfcheck"><input type="checkbox" id="rfQuiz"${U.quiz ? ' checked' : ''}> Rate-Modus: erst schätzen, dann aufdecken</label>
        <button class="ghost" id="rfRandFlop">Zufälliger Flop</button>
        <button class="ghost" id="rfSolverFlop" title="Ein Flop, für den es eine Solver-Lösung gibt">Solver-Flop</button>
        <span class="muted" id="rfSolverCount"></span>
      </div>`;
    const sb = solverBoardsForSpot();
    $('#rfSolverFlop').hidden = !sb.length;
    $('#rfSolverCount').textContent = sb.length ? `${sb.length} Solver-Flops für diesen Spot` : '';
    $('#rfSolverFlop').onclick = () => {
      // Flops, die mit deiner Hand kollidieren, fallen raus.
      const ok = sb.filter(e => !parseCards(e.board).cards.some(c => PF && PF.heroCards.includes(c)));
      const pool = ok.filter(e => e.board !== U.board);
      const e = (pool.length ? pool : ok)[Math.floor(Math.random() * (pool.length || ok.length))];
      if (!e) return;
      U.board = e.board;
      $('#rfBoard').value = U.board;
      recomputeFlop();
    };
    $('#rfBoard').oninput = e => { U.board = e.target.value; recomputeFlop(); };
    $('#rfQuiz').onchange = e => { U.quiz = e.target.checked; store('pt.rf.quiz', U.quiz ? '1' : '0'); recomputeFlop(); };
    $('#rfRandFlop').onclick = () => {
      const dead = new Set(PF ? PF.heroCards : []);
      const deck = P.fullDeck().filter(c => !dead.has(c));
      const pick = [];
      while (pick.length < 3) {
        const c = deck.splice(Math.floor(Math.random() * deck.length), 1)[0];
        pick.push(c);
      }
      pick.sort((a, b) => b - a);
      U.board = pick.map(P.cardToStr).join('');
      $('#rfBoard').value = U.board;
      recomputeFlop();
    };
    $('#rfAct').onchange = e => { U.action = e.target.value; renderFlopSetup(); recomputeFlop(); };
    const sz = $('#rfSize'); if (sz) sz.onchange = e => { U.size = +e.target.value; recomputeFlop(); };
  }

  function $(s) { return document.querySelector(s); }
  function note(id, txt) { const e = $(id); e.hidden = !txt; e.textContent = txt || ''; }

  /* Zustand der letzten Preflop-Rechnung, damit der Flop darauf aufbaut. */
  let PF = null;

  function recompute() {
    renderFlopSetup();
    const hero = parseCards(U.hero);
    const errs = [];
    if (hero.error) errs.push('Deine Hand: ' + hero.error);
    else if (hero.cards.length && hero.cards.length !== 2) errs.push('Deine Hand braucht genau zwei Karten.');
    const heroCards = hero.cards && hero.cards.length === 2 ? hero.cards : [];

    if (!U.line) {
      note('#rfSetupNote', 'Mit diesen Positionen gibt es keine sinnvolle Linie (der BB öffnet nie).');
      PF = null; $('#rfPre').innerHTML = ''; recomputeFlop(); return;
    }
    const pr = preflopRanges(U.line, U.heroPos, U.villPos, U.band);
    if (U.villStr == null) { U.villStr = pr.vill ? pr.vill.str : ''; U.villSrc = pr.vill; }
    const notes = errs.slice();
    if (U.villSrc && U.villSrc.approx) notes.push(U.villSrc.note);
    if (!U.villSrc) notes.push(`Für „${pr.line.villAct}" von ${U.villPos} gegen ${U.heroPos} ist keine Range hinterlegt. Trag seine Range unten selbst ein.`);
    if (pr.hero && pr.hero.approx) notes.push('Deine Range: ' + pr.hero.note);
    if (!pr.hero) notes.push('Deine eigene Range ist für diese Linie nicht hinterlegt — am Flop wird ersatzweise seine Range als Gegenstück angenommen.');
    note('#rfSetupNote', notes.join(' '));

    const parsed = P.parseRangeStrict(U.villStr);
    const villRange = parsed.range;
    const heroRange = pr.hero ? P.parseRange(pr.hero.str) : villRange;
    PF = { pr, villRange, heroRange, heroCards, profile: P.PROFILES[U.profile] };

    const A = analyse(villRange, [], heroCards);
    const all = villRange.filter(x => !heroCards.includes(x.c[0]) && !heroCards.includes(x.c[1])).length;
    let eqTxt = '';
    if (heroCards.length && villRange.length) {
      const eq = P.equityVsRange(heroCards, villRange, [], 30000).eq;
      eqTxt = `<div class="rfstat"><b>${pct(eq)}</b><span>deine Equity preflop (Monte Carlo)</span></div>`;
    }
    const src = U.villSrc ? esc(U.villSrc.src) + (U.villSrc.approx ? ' · angenähert' : '') : 'eigene Eingabe';
    $('#rfPre').innerHTML = `
      <h3>Preflop — ${esc(POS_LABEL[U.villPos])}: ${esc(pr.line.villAct)}</h3>
      <div class="rfstats">
        <div class="rfstat"><b>${A.tot.toFixed(0)}</b><span>Kombos${heroCards.length ? ' (ohne deine Karten)' : ''}</span></div>
        <div class="rfstat"><b>${pct(all / 1326, 1)}</b><span>aller Starthände</span></div>
        <div class="rfstat"><b>${pr.villIP ? 'IP' : 'OOP'}</b><span>er postflop ${pr.villIP ? 'in Position' : 'ohne Position'}</span></div>
        ${eqTxt}
      </div>
      ${gridHtml(A, [], heroCards, null)}
      <details class="rfrange"><summary>Seine Range als Text (${src}) — bearbeiten</summary>
        <textarea id="rfVillStr" rows="3" spellcheck="false">${esc(U.villStr)}</textarea>
        <div class="planactions"><button class="ghost" id="rfReset">Zurück auf hinterlegte Range</button>
        <span class="muted" id="rfParse">${parsed.unknown.length ? 'Nicht lesbar: ' + esc(parsed.unknown.map(u => u.token).join(', ')) : ''}</span></div>
      </details>`;
    $('#rfVillStr').onchange = e => { U.villStr = e.target.value; U.villSrc = null; recompute(); };
    $('#rfReset').onclick = () => { U.villStr = null; recompute(); };
    recomputeFlop();
  }

  function renderExport() {
    const box = $('#rfExport');
    if (!PF || !PF.villRange.length) { box.hidden = true; return; }
    const b = parseCards(U.board);
    const board = b.cards && b.cards.length === 3 ? b.cards : [];
    const ex = solverExport({
      villRange: PF.villRange, heroRange: PF.heroRange, board, villIP: villIP(U.heroPos, U.villPos),
      heroPos: U.heroPos, villPos: U.villPos, potType: PF.pr.line.potType, band: U.band
    });
    const field = (label, val, key) => `<label class="rfexrow"><span>${label}</span>
      <input readonly value="${esc(val)}"><button class="ghost" data-copy="${key}">Kopieren</button></label>`;
    box.hidden = false;
    box.innerHTML = `
      <h3>An einen Solver übergeben</h3>
      <p class="muted hpintro">Für den Vergleich mit Desktop Postflop oder WASM Postflop am PC. Die Ranges
        sind die <b>Preflop</b>-Ranges, der Solver rechnet den Flop selbst. Pot und Stack nimmt der Solver nur
        als ganze Zahlen — deshalb in Zehntel-bb.${PF.pr.hero ? '' : ' <b>Deine Range ist nicht hinterlegt</b> — als Ersatz steht seine Range drin; trag deine im Solver selbst ein.'}</p>
      <div class="planactions">
        <button class="primary" data-file="ranges">ranges.json laden</button>
        <button class="primary" data-file="configurations">configurations.json laden</button>
      </div>
      <ol class="muted rfsteps">
        <li><b>OOP Range</b> → rechts „Import JSON“ → <code>ranges.json</code>. Dann in der Liste unter
          „${esc(GROUP)}“ den Eintrag <b>„1 OOP = ${esc(ex.oopPos)} …“</b> wählen → „Load“. Unter <b>IP Range</b>
          den Eintrag <b>„2 IP = ${esc(ex.ipPos)} …“</b> → „Load“
          (einmal importieren reicht, beide Seiten teilen sich die Liste).</li>
        <li><b>Tree Configuration</b> → „Import JSON“ → <code>configurations.json</code> → Eintrag wählen → „Load“.
          Bet-Größen: Flop ${esc(TREE_SIZES.flop)}, Turn/River ${esc(TREE_SIZES.turn)} % Pot, Raise ${esc(TREE_SIZES.raise)} — dort änderbar.</li>
        <li><b>Board</b> kennt der Import nicht: unten kopieren und ins Board-Feld einfügen.</li>
      </ol>
      <details class="rfrange"><summary>Einzelwerte zum Kopieren</summary>
      <div class="rfex">
        ${field('OOP-Range (' + (villIP(U.heroPos, U.villPos) ? 'du' : 'Gegner') + ')', ex.oop, 'oop')}
        ${field('IP-Range (' + (villIP(U.heroPos, U.villPos) ? 'Gegner' : 'du') + ')', ex.ip, 'ip')}
        ${field('Board', ex.board || '— erst Flop eingeben', 'board')}
        ${field(`Startpot (${ex.pot} bb × 10)`, ex.potChips, 'potChips')}
        ${field(`Eff. Stack (${ex.eff} bb × 10)`, ex.effChips, 'effChips')}
      </div>
      <div class="planactions"><button class="ghost" data-copy="text">Alles als Text kopieren</button></div>
      </details>
      <p class="muted" id="rfCopied"></p>`;
    box.querySelectorAll('[data-copy]').forEach(btn => {
      btn.onclick = e => { e.preventDefault(); copy(ex[btn.dataset.copy] || '', btn.dataset.copy); };
    });
    box.querySelectorAll('[data-file]').forEach(btn => {
      btn.onclick = () => download(btn.dataset.file + '.json', JSON.stringify(ex.files[btn.dataset.file], null, 2));
    });
  }

  function download(name, txt) {
    const url = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const s = $('#rfCopied'); if (s) s.textContent = name + ' heruntergeladen.';
  }

  function copy(txt, key) {
    const done = ok => { const s = $('#rfCopied'); if (s) s.textContent = ok ? `Kopiert (${{ text: 'alles', oop: 'OOP-Range', ip: 'IP-Range', board: 'Board', potChips: 'Startpot', effChips: 'Stack' }[key]}).` : 'Kopieren ging nicht — Feld markieren und Strg+C.'; };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(() => done(true), () => done(false));
    else {
      const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignorieren */ }
      t.remove(); done(ok);
    }
  }

  function recomputeFlop() {
    renderExport();
    const out = $('#rfFlop');
    if (!PF || !PF.villRange.length) { out.hidden = true; note('#rfFlopNote', ''); return; }
    const b = parseCards(U.board);
    if (b.error) { note('#rfFlopNote', b.error); out.hidden = true; return; }
    if (!b.cards.length) { note('#rfFlopNote', ''); out.hidden = true; return; }
    if (b.cards.length !== 3) { note('#rfFlopNote', 'Der Flop hat genau drei Karten.'); out.hidden = true; return; }
    if (b.cards.some(c => PF.heroCards.includes(c))) { note('#rfFlopNote', 'Eine Flop-Karte steckt schon in deiner Hand.'); out.hidden = true; return; }
    note('#rfFlopNote', '');
    const board = b.cards;
    const isVillIP = villIP(U.heroPos, U.villPos);
    const res = flopNarrow(PF.villRange, PF.heroRange, board, {
      dead: PF.heroCards, villIP: isVillIP, villRole: PF.pr.line.villRole, potType: PF.pr.line.potType,
      band: U.band, profile: PF.profile, action: U.action, betPct: U.size
    });

    /* Solver statt Heuristik, wo die Bibliothek den Spot hat — nur mit der
       hinterlegten Range (nicht selbst bearbeitet) und Gegnertyp Reg. */
    let source = 'heur', solverInfo = null;
    const entry = U.profile === 'reg' && U.villSrc ? solverEntryFor(SOLVER.index, {
      heroPos: U.heroPos, villPos: U.villPos, line: U.line, band: U.band, board
    }) : null;
    if (entry) {
      const d = SOLVER.data[entry.id];
      if (d === undefined || d === 'loading') {
        loadSolverFile(entry.id);
        out.hidden = false;
        out.innerHTML = '<p class="muted">Lade Solver-Ergebnis für diesen Flop …</p>';
        return;
      }
      if (d !== 'error') {
        const sr = solverNarrow(d, PF.villRange, board, { villIsOop: !isVillIP, action: U.action, betPct: U.size, dead: PF.heroCards });
        if (sr) {
          res.range = sr.range; source = 'solver';
          solverInfo = { entry, d, sizeNote: sr.sizeNote };
        }
      }
    }
    const before = analyse(PF.villRange, board, PF.heroCards);
    const after = analyse(res.range, board, PF.heroCards);
    const aggressive = res.action.steps.includes('bet') || res.action.steps.includes('raise');
    const share = k => after.tot ? after.groups[k].w / after.tot : 0;
    const valueShare = share('strong') + share('medium');

    const key = [U.heroPos, U.villPos, U.line, U.band, U.profile, U.hero, U.villStr, U.board, U.action, U.size, source].join('|');
    let heroTxt = '', heroEq = null;
    if (PF.heroCards.length === 2 && res.range.length) {
      /* Monte Carlo: dieselbe Frage zweimal gerechnet gäbe zwei leicht
         verschiedene Zahlen — im Rate-Modus stünden dann in Tabelle und
         Kachel 56 % und 55 %. Deshalb je Spot nur einmal rechnen. */
      if (!U.eqCache || U.eqCache.key !== key) U.eqCache = { key, eq: P.equityVsRange(PF.heroCards, res.range, board, 60000).eq };
      const eq = heroEq = U.eqCache.eq;
      const rel = P.relativeStrength(PF.heroCards, res.range, board);
      const cls = P.classify(PF.heroCards, board);
      heroTxt = `
        <div class="rfstat"><b>${pct(eq)}</b><span>deine Equity gegen diese Range</span></div>
        <div class="rfstat"><b>${pct(rel.pct)}</b><span>davon schlägst du jetzt</span></div>
        <p class="muted rfhero">Deine Hand ${prettyCards(PF.heroCards)}: <b>${esc(cls.made)}</b>${cls.draws.length ? ' + ' + esc(cls.draws.join(', ')) : ''}.</p>`;
    }
    const actTxt = res.action.label + (res.action.sized ? ' (' + SIZES.find(s => s.pct === U.size).label + ')' : '');
    const sumLine = aggressive
      ? `Seine ${res.action.steps.includes('raise') ? 'Raise' : 'Bet'}-Range: <b>${pct(valueShare)} Value</b> (Stark + Top Pair), <b>${pct(share('draw'))} Semibluffs</b>, <b>${pct(share('air'))} reine Bluffs</b> (Luft) und ${pct(share('weak'))} schwache Paare.`
      : `Stark ${pct(share('strong'))} · Top Pair ${pct(share('medium'))} · Draws ${pct(share('draw'))} · Schwach/Luft ${pct(share('weak') + share('air'))}.`;

    const head = `
      <h3>Flop ${prettyCards(board)} — er ${esc(actTxt)}</h3>
      <p class="muted">${esc(P.boardTexture(board).label)}${PF.heroCards.length === 2 ? ' · deine Hand ' + prettyCards(PF.heroCards) : ''}</p>
      ${sourceBadge(source, solverInfo)}`;
    const truth = {
      take: 100 * (before.tot ? after.tot / before.tot : 0),
      value: 100 * valueShare, draws: 100 * share('draw'), rest: 100 * (share('weak') + share('air')),
      eq: heroEq == null ? null : 100 * heroEq
    };

    /* Rate-Modus: dieselbe Rechnung, nur verdeckt. Jede Änderung an Spot,
       Board oder Aktion ist eine neue Frage. */
    if (U.quiz && U.revealedKey !== key) {
      out.hidden = false;
      out.innerHTML = head + quizForm(truth.eq != null, actTxt);
      wireQuiz(key, truth);
      return;
    }
    const quizBox = U.quiz && U.lastScore && U.lastScore.key === key ? quizResult(U.lastScore.s) : '';

    out.hidden = false;
    out.innerHTML = head + quizBox + `
      <div class="rfstats">
        <div class="rfstat"><b>${before.tot.toFixed(0)} → ${after.tot.toFixed(1)}</b><span>Kombos (gewichtet)</span></div>
        <div class="rfstat"><b>${pct(before.tot ? after.tot / before.tot : 0)}</b><span>seiner Range nimmt diese Linie</span></div>
        ${heroTxt}
      </div>
      <p>${sumLine}</p>
      ${groupBars(before, after)}
      ${gridHtml(after, board, PF.heroCards, before)}
      <div class="rfgroups">${GROUPS.map(g => groupList(g, after)).join('')}</div>
      <p class="muted rfmodel">${source === 'solver'
        ? `Quelle: Solver-Lösung (postflop-solver, ${esc(solverInfo.d.exploitPct.toFixed(2))} % Pot Exploitability; Flop-Größen ${esc(solverInfo.d.sizes.flop)}, Raise ${esc(solverInfo.d.sizes.raise)}). Der Solver nimmt einen ausgeglichenen Gegner an.`
        : `Modell: ${esc(modelText(res.action))} Gegnertyp <b>${esc(PF.profile.name)}</b>.`}
        Die Prozente sind Anteile an gewichteten Kombos — eine Hand, die die Aktion nur manchmal wählt,
        zählt anteilig.</p>`;
  }

  /* ---------------- Solver-Bibliothek laden ---------------- */
  const SOLVER = { index: null, data: {} };
  function loadSolverIndex() {
    if (SOLVER.index || SOLVER.indexLoading || typeof fetch !== 'function') return;
    SOLVER.indexLoading = true;
    fetch('data/solver/index.json').then(r => (r.ok ? r.json() : null)).then(j => {
      SOLVER.index = j || { spots: [] };
      // Nur Einträge, deren Datei es auch gibt, sind wirklich verfügbar —
      // das prüft loadSolverFile beim ersten Zugriff.
      renderFlopSetup();   // Knopf "Solver-Flop" und Zähler erst jetzt möglich
      recomputeFlop();
    }).catch(() => { SOLVER.index = { spots: [] }; });
  }
  function loadSolverFile(id) {
    if (SOLVER.data[id] !== undefined) return;
    SOLVER.data[id] = 'loading';
    fetch('data/solver/' + id + '.json').then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(j => { SOLVER.data[id] = j; })
      .catch(() => { SOLVER.data[id] = 'error'; })
      .then(() => recomputeFlop());
  }
  /** Solver-Flops, die zum eingestellten Spot passen und schon gerechnet sind. */
  function solverBoardsForSpot() {
    if (!SOLVER.index) return [];
    return SOLVER.index.spots.filter(e => {
      const b = parseCards(e.board).cards;
      return solverEntryFor({ spots: [e] }, { heroPos: U.heroPos, villPos: U.villPos, line: U.line, band: U.band, board: b })
        && SOLVER.data[e.id] !== 'error';
    });
  }
  function sourceBadge(source, info) {
    if (source === 'solver') {
      return `<p class="rfsrc solver">Solver-Lösung · ${esc(info.entry.fam)}${info.sizeNote ? ' · ' + esc(info.sizeNote) : ''}</p>`;
    }
    const why = U.profile !== 'reg' ? 'Gegnertyp ' + P.PROFILES[U.profile].name + ' — den kennt der Solver nicht'
      : !U.villSrc ? 'eigene Range — der Solver hat mit der hinterlegten gerechnet'
      : 'für diesen Spot/Flop gibt es keine Solver-Lösung';
    return `<p class="rfsrc heur">Heuristik des Trainers (${esc(why)})</p>`;
  }

  function quizForm(withEq, actTxt) {
    const inp = (k, lbl, ph) => `<label>${lbl}<span class="rfpct"><input type="number" min="0" max="100" step="1"
      id="rfG_${k}" value="${U.guess[k] != null ? esc(U.guess[k]) : ''}" placeholder="${ph}" inputmode="numeric"> %</span></label>`;
    return `
      <div class="rfquiz">
        <p><b>Schätz zuerst:</b> Er ${esc(actTxt)}. Mit welchen Händen?</p>
        <div class="rdgrid">
          ${inp('take', 'Wie viel seiner Range nimmt diese Linie?', 'z. B. 40')}
          ${inp('value', 'Davon Value (Stark + Top Pair)', 'z. B. 35')}
          ${inp('draws', 'Davon Draws', 'z. B. 20')}
          <label>Schwache Paare + Luft<span class="rfpct"><b id="rfG_rest">—</b></span></label>
          ${withEq ? inp('eq', 'Deine Equity gegen diese Range', 'z. B. 55') : ''}
        </div>
        <div class="planactions"><button class="primary" id="rfReveal">Aufdecken ▸</button>
          <span class="muted" id="rfQuizNote"></span></div>
        ${quizHistoryLine()}
      </div>`;
  }

  function wireQuiz(key, truth) {
    const val = k => { const e = $('#rfG_' + k); return e && e.value !== '' ? +e.value : null; };
    const upd = () => {
      ['take', 'value', 'draws', 'eq'].forEach(k => { U.guess[k] = val(k); });
      const v = val('value'), d = val('draws');
      const r = $('#rfG_rest');
      if (v == null || d == null) r.textContent = '—';
      else r.textContent = (100 - v - d) + ' %';
      r.className = v != null && d != null && v + d > 100 ? 'bad' : '';
    };
    document.querySelectorAll('.rfquiz input').forEach(e => { e.oninput = upd; });
    upd();
    // Nach Board-Eingabe oder Zufalls-Flop direkt ins erste Feld — aber nie
    // mitten aus einem anderen Eingabefeld (Hand, Range) herausreißen.
    const ae = document.activeElement, first = $('#rfG_take');
    if (first && !first.value && (!ae || ae === document.body || ae.id === 'rfBoard' || ae.id === 'rfRandFlop' || ae.id === 'rfSolverFlop')) first.focus({ preventScroll: true });
    $('#rfReveal').onclick = () => {
      upd();
      const g = Object.assign({}, U.guess);
      if (g.take == null || g.value == null || g.draws == null) {
        $('#rfQuizNote').textContent = 'Bitte mindestens die ersten drei Felder schätzen.'; return;
      }
      if (g.value + g.draws > 100) { $('#rfQuizNote').textContent = 'Value + Draws können zusammen nicht über 100 % liegen.'; return; }
      g.rest = 100 - g.value - g.draws;
      const s = quizScore(g, truth);
      const h = quizHistory();
      h.push({ t: Date.now(), m: +s.meanAbs.toFixed(1), spot: U.villPos + ' ' + U.action });
      store('pt.rf.quizHist', JSON.stringify(h.slice(-100)));
      U.lastScore = { key, s };
      U.revealedKey = key;
      U.guess = {};
      recomputeFlop();
    };
  }

  function quizHistoryLine() {
    const h = quizHistory();
    if (!h.length) return '';
    const last = h.slice(-10);
    const avg = last.reduce((a, x) => a + x.m, 0) / last.length;
    return `<p class="muted rfquizhist">Deine letzten ${last.length} Schätzungen: im Schnitt <b>${avg.toFixed(1)} Prozentpunkte</b> daneben
      (insgesamt ${h.length}).</p>`;
  }

  function quizResult(s) {
    const f = x => x == null ? '—' : x.toFixed(0) + ' %';
    const d = x => x == null ? '' : (x > 0 ? '+' : '') + x.toFixed(0);
    const rows = s.rows.map(r => `<tr><td>${esc(r.label)}</td><td>${f(r.guess)}</td><td>${f(r.truth)}</td>
      <td class="${r.diff == null ? '' : Math.abs(r.diff) <= 5 ? 'ok' : Math.abs(r.diff) <= 10 ? 'ok2' : Math.abs(r.diff) <= 20 ? 'warn' : 'bad'}">${d(r.diff)}</td></tr>`).join('');
    const w = s.worst && Math.abs(s.worst.diff) > 5
      ? `Am weitesten daneben: <b>${esc(s.worst.label)}</b> — du lagst ${Math.abs(s.worst.diff).toFixed(0)} Punkte ${s.worst.diff > 0 ? 'zu hoch' : 'zu niedrig'}.`
      : 'Alles innerhalb von 5 Punkten.';
    return `<div class="rfquiz rfquizres ${s.rating.cls}">
      <p><b>${esc(s.rating.label)}</b> — im Schnitt ${s.meanAbs.toFixed(1)} Prozentpunkte daneben. ${w}</p>
      <table class="rfquiztab"><thead><tr><th></th><th>Du</th><th>Modell</th><th>Abw.</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="muted">Verglichen wird mit dem Aktionsmodell des Trainers, nicht mit einem Solver.</p>
      ${quizHistoryLine()}
    </div>`;
  }

  function modelText(act) {
    const m = {
      check: 'Check aus der Bet-Neigung des Trainers (handDrive aus seiner Sicht: Handstärke, Draws, Range- und Nut-Advantage, Position, SPR).',
      bet: 'Wie oft er bettet, aus der Bet-Neigung des Trainers (handDrive: Position, Rolle, Range-/Nut-Advantage, SPR); womit, aus der Bet-Range bei dieser Größe (bettingRangeOf, reine Bluffs nach Gegnertyp skaliert).',
      call: 'Call-Range wie im Trainer (continueWeight: Anteil je Handstärke, Draws, Sizing, Gegnertyp; Monster callen nur teilweise, der Rest raist).',
      raise: 'Raise-Range wie im Trainer (Nuts fast immer, starke Hände und starke Draws teilweise, wenige Bluffs).'
    };
    return act.steps.map(s => m[s]).join(' ');
  }

  function groupBars(before, after) {
    const rows = GROUPS.map(g => {
      const b = before.tot ? before.groups[g.key].w / before.tot : 0;
      const a = after.tot ? after.groups[g.key].w / after.tot : 0;
      const kept = before.groups[g.key].w ? after.groups[g.key].w / before.groups[g.key].w : 0;
      return `<div class="rfbar"><span class="rfbarname" title="${esc(g.hint)}"><i style="background:${g.color}"></i>${g.name}</span>
        <span class="rfbartrack"><span class="rfbarpre" style="width:${(b * 100).toFixed(1)}%"></span>
        <span class="rfbarnow" style="width:${(a * 100).toFixed(1)}%;background:${g.color}"></span></span>
        <span class="rfbarnum">${pct(a)} <small>vorher ${pct(b)} · ${pct(kept)} bleiben</small></span></div>`;
    }).join('');
    return `<div class="rfbars">${rows}</div>`;
  }

  function groupList(g, A) {
    const gr = A.groups[g.key];
    if (gr.w < 0.05) return '';
    const list = Object.keys(gr.classes).map(hc => ({ hc, ...gr.classes[hc] }))
      .sort((a, b) => b.w - a.w).slice(0, 12);
    return `<div class="rfgroup"><h4><i style="background:${g.color}"></i>${g.name} <small>${pct(A.tot ? gr.w / A.tot : 0)} · ${gr.w.toFixed(1)} Kombos</small></h4>
      <ul>${list.map(x => {
        const made = Object.keys(x.made).sort((a, b) => x.made[b] - x.made[a])[0];
        return `<li><b>${x.hc}</b> <span class="muted">${esc(made)}</span> <small>${x.w.toFixed(1)}</small></li>`;
      }).join('')}</ul></div>`;
  }

  /**
   * 13x13-Raster. Deckkraft = welcher Anteil der möglichen Kombos dieser
   * Hand-Klasse noch in der Range ist; Farbe = häufigste Gruppe.
   */
  function gridHtml(A, board, heroCards, before) {
    const blocked = new Set(board.concat(heroCards));
    const R = P.RANKS;
    let cells = '';
    for (let i = 12; i >= 0; i--) {
      for (let j = 12; j >= 0; j--) {
        const hc = i === j ? R[i] + R[j] : i > j ? R[i] + R[j] + 's' : R[j] + R[i] + 'o';
        const c = A.byClass[hc];
        const max = classMax(hc, blocked);
        const fill = c && max ? Math.min(1, c.w / max) : 0;
        let color = '#3fbf7f';
        if (c && board.length) {
          const top = Object.keys(c.groups).sort((a, b) => c.groups[b] - c.groups[a])[0];
          color = GROUPS.find(g => g.key === top).color;
        }
        const bg = fill > 0.005 ? `background:${color};opacity:${(0.25 + 0.75 * fill).toFixed(2)}` : 'background:#16211d;color:#4d6158';
        const tip = `${hc}: ${c ? c.w.toFixed(1) : 0} von ${max} Kombos` +
          (before && before.byClass[hc] ? ` (vorher ${before.byClass[hc].w.toFixed(1)})` : '');
        cells += `<div class="hpcell rfcell${i === j ? ' pp' : ''}" style="${bg}" title="${esc(tip)}">${hc}</div>`;
      }
    }
    return `<div class="hpgridwrap rfgridwrap"><div class="hpgrid">${cells}</div></div>`;
  }

  P.RangeFlow.mount = mount;

  /**
   * Für den Kurs: Spot einstellen und optional Rate-Modus / Solver-Flop.
   * o = { heroPos, villPos, line, band, profile, quiz, solverFlop }
   */
  P.RangeFlow.preset = function (root, o) {
    if (!root.children.length) mount(root);
    Object.assign(U, {
      heroPos: o.heroPos || U.heroPos, villPos: o.villPos || U.villPos, band: o.band || U.band,
      profile: o.profile || 'reg', villStr: null, board: '', revealedKey: null
    });
    if (o.line) U.line = o.line;
    if (o.quiz != null) { U.quiz = !!o.quiz; store('pt.rf.quiz', U.quiz ? '1' : '0'); }
    renderSetup(); recompute();
    if (o.solverFlop) {
      const pick = () => { const b = $('#rfSolverFlop'); if (b && !b.hidden) b.click(); else if (!SOLVER.index) setTimeout(pick, 300); };
      pick();
    }
  };
})();
