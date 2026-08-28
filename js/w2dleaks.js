/* =========================================================================
   w2dleaks.js — aus Einzelentscheidungen Muster machen

   Eine einzelne Note der Engine ist kein Urteil: die Engine ist eine
   Heuristik, und die Range des Gegners ist eine Referenz, kein Wissen über
   ihn. Ein Leak ist erst dann einer, wenn derselbe Fehlertyp über viele
   Entscheidungen hinweg wiederkehrt — dann mitteln sich die Modellfehler
   heraus und die Richtung bleibt stehen.

   Deshalb zwei Ebenen:

   BENANNTE MUSTER — "zu passiv mit starken Händen", "zu weit gecallt".
   Das sind Fehlertypen, die man abstellen kann. Jedes Muster zählt, wie oft
   es vorkam, und wie viele Notenpunkte es gekostet hat.

   DIMENSIONEN — Durchschnittsnote nach Straße, Position, Rolle, Textur.
   Zeigt, WO die Schwäche sitzt, auch wenn kein einzelnes Muster heraussticht.

   Beides bekommt eine Mindestzahl an Fällen, unter der nichts gemeldet wird.
   ========================================================================= */
(function () {
  const P = window.PT;

  const MIN_CASES = 6;        // darunter ist ein "Muster" nur Zufall
  const BET_ORDER = ['CHECK', 'BET_S', 'BET_M', 'BET_L', 'BET_XL'];

  /**
   * Etikett für das, was du wirklich hältst.
   *
   * Das war einmal ein Workaround: die Engine gab auf gepaarten Boards
   * "Two Pair" aus, auch wenn eines der Paare am Board lag. Inzwischen
   * unterscheidet `classify` selbst, ob die eigenen Karten überhaupt etwas
   * beitragen — der Workaround ist damit überflüssig. Die Funktion bleibt
   * als eine Stelle bestehen, an der die Beschriftung sitzt, gibt aber
   * einfach das Engine-Etikett zurück.
   */
  function describeHolding(cards, board) {
    const cls = P.classify(cards, board);
    return { label: cls.made, raw: cls.made, corrected: false, cls };
  }

  /* ------------------------------------------------------------------ *
   * Benannte Muster.
   * ------------------------------------------------------------------ */
  const PATTERNS = [
    {
      key: 'passiv-value',
      test: d => d.mode === 'BET' && d.tier >= 4 && d.picked === 'CHECK' && d.best !== 'CHECK',
      title: 'Zu passiv mit starken Händen',
      why: 'Du checkst Hände, mit denen die Engine setzen würde. Value kommt nicht von selbst — ' +
        'jede Straße, die du checkst, ist eine Straße, die der Gegner geschenkt bekommt. ' +
        'Auf statischen Boards ist eine kleine Bet fast immer besser als ein Check.',
      fix: 'Frage vor jedem Check mit Top Pair oder besser: „Welche schlechtere Hand callt mich hier?" ' +
        'Fällt dir eine ein, gehört eine Bet hin.'
    },
    {
      key: 'bluff-ohne-equity',
      test: d => d.mode === 'BET' && d.tier <= 1 && d.picked !== 'CHECK' && d.best === 'CHECK',
      title: 'Gebettet ohne Hand und ohne Equity',
      why: 'Bluffs brauchen entweder Equity (Draw) oder Blocker. Reines „nichts getroffen" ist ' +
        'kein Grund zu setzen — der Gegner foldet die Hände, die du ohnehin schlägst, und callt ' +
        'die, gegen die du keine Outs hast.',
      fix: 'Bluff nur mit einem Plan für die nächste Straße. Ohne Draw und ohne Blocker: checken.'
    },
    {
      key: 'call-statt-fold',
      test: d => d.mode === 'FACE' && d.picked === 'CALL' && d.best === 'FOLD',
      title: 'Zu weit gecallt',
      why: 'Der häufigste teure Fehler. Ein Call braucht Equity gegen seine <b>Bet-Range</b>, ' +
        'nicht gegen seine Preflop-Range — und die Bet-Range ist immer deutlich stärker.',
      fix: 'Rechne vor dem Call die Pot Odds und schätze, wie viele seiner Bet-Kombos du schlägst. ' +
        'Liegt das darunter, ist es ein Fold, auch wenn die Hand „zu gut zum Wegwerfen" aussieht.'
    },
    {
      key: 'fold-statt-weiter',
      test: d => d.mode === 'FACE' && d.picked === 'FOLD' && d.best !== 'FOLD',
      title: 'Zu viel gefoldet',
      why: 'Gegen kleine Bets musst du breit verteidigen, sonst wird jeder Bluff des Gegners ' +
        'automatisch profitabel (MDF). Zu diszipliniert ist auch ein Leak.',
      fix: 'Gegen eine 33-%-Bet musst du rund 75 % deiner Range halten. Prüfe die Pot Odds, ' +
        'bevor du eine Hand mit Showdown-Wert wegwirfst.'
    },
    {
      key: 'sizing-zu-klein',
      test: d => d.mode === 'BET' && d.picked !== 'CHECK' && d.best !== 'CHECK' &&
        BET_ORDER.indexOf(d.picked) < BET_ORDER.indexOf(d.best),
      title: 'Sizing zu klein',
      why: 'Richtige Aktion, zu wenig Geld. Auf dynamischen Boards und mit Nut-Advantage lässt ' +
        'ein kleines Sizing Value liegen und gibt Draws gute Odds.',
      fix: 'Board dynamisch oder 3-Bet-Pot? Dann 75–80 % statt 33 %.'
    },
    {
      key: 'sizing-zu-gross',
      test: d => d.mode === 'BET' && d.picked !== 'CHECK' && d.best !== 'CHECK' &&
        BET_ORDER.indexOf(d.picked) > BET_ORDER.indexOf(d.best),
      title: 'Sizing zu groß',
      why: 'Auf statischen Boards mit Range-Advantage ist die kleine Bet stärker: sie hält ' +
        'seine schwachen Hände drin und lässt dich häufiger setzen.',
      fix: 'Trockenes Board, du hast Range-Advantage? Dann 33 % über die ganze Range.'
    },
    {
      key: 'raise-statt-call',
      test: d => d.mode === 'FACE' && d.picked.startsWith('RAISE') && d.best === 'CALL',
      title: 'Geraist statt gecallt',
      why: 'Ein Raise verwandelt eine Hand mit Showdown-Wert in einen Bluff: alles Schlechtere ' +
        'foldet, alles Bessere spielt weiter.',
      fix: 'Raise nur mit Value, das gecallt wird, oder als Bluff mit Equity — nicht mit Hänger.'
    }
  ];

  /* ------------------------------------------------------------------ *
   * Dimensionen für die Ortsbestimmung.
   * ------------------------------------------------------------------ */
  const DIMS = [
    { key: 'street', label: 'Straße', of: d => d.street },
    { key: 'pos', label: 'Position', of: d => d.heroIP ? 'in Position' : 'ohne Position' },
    { key: 'role', label: 'Rolle', of: d => ({ PFR: 'Aggressor', CALLER: 'Caller', '3BET': '3-Bettor', CALL3B: '3-Bet gecallt' }[d.role] || d.role) },
    { key: 'potType', label: 'Pot-Typ', of: d => d.potType === '3BP' ? '3-Bet-Pot' : 'Single Raised' },
    { key: 'mode', label: 'Situation', of: d => d.mode === 'BET' ? 'du bist am Zug' : 'du stehst vor einer Bet' },
    { key: 'texture', label: 'Flop-Textur', of: d => (P.HandProfile.BOARD_BUCKETS.find(b => b.key === d.texture) || { name: d.texture }).name }
  ];

  function aggregate(decisions) {
    const n = decisions.length;
    const mean = n ? decisions.reduce((a, d) => a + d.score, 0) / n : 0;

    const patterns = PATTERNS.map(p => {
      const hits = decisions.filter(p.test);
      const lost = hits.reduce((a, d) => a + (100 - d.score), 0);
      return {
        key: p.key, title: p.title, why: p.why, fix: p.fix,
        n: hits.length, lost,
        share: n ? hits.length / n : 0,
        examples: hits.slice().sort((a, b) => a.score - b.score).slice(0, 5)
      };
    }).filter(p => p.n > 0).sort((a, b) => b.lost - a.lost);

    const dims = DIMS.map(dim => {
      const groups = {};
      for (const d of decisions) {
        const k = dim.of(d);
        const g = groups[k] || (groups[k] = { n: 0, sum: 0 });
        g.n++; g.sum += d.score;
      }
      const rows = Object.keys(groups).map(k => ({
        key: k, n: groups[k].n, mean: groups[k].sum / groups[k].n,
        lost: groups[k].n * (100 - groups[k].sum / groups[k].n)
      })).sort((a, b) => a.mean - b.mean);
      return { key: dim.key, label: dim.label, rows };
    });

    return { n, mean, patterns, dims, enough: n >= 30 };
  }

  /** Kompakte Zähler für den Speicher, damit sich Sessions addieren. */
  function summarisePost(decisions) {
    const pat = {};
    for (const p of PATTERNS) {
      const hits = decisions.filter(p.test);
      if (hits.length) pat[p.key] = { n: hits.length, lost: hits.reduce((a, d) => a + (100 - d.score), 0) };
    }
    const dims = {};
    for (const dim of DIMS) {
      const g = {};
      for (const d of decisions) {
        const k = dim.of(d);
        g[k] = g[k] || { n: 0, sum: 0 };
        g[k].n++; g[k].sum += d.score;
      }
      dims[dim.key] = g;
    }
    return {
      n: decisions.length,
      sum: decisions.reduce((a, d) => a + d.score, 0),
      patterns: pat, dims
    };
  }

  /** Gespeicherte Zähler mehrerer Sessions zusammenführen. */
  function combinePost(list) {
    const n = list.reduce((a, x) => a + (x ? x.n : 0), 0);
    const sum = list.reduce((a, x) => a + (x ? x.sum : 0), 0);
    const pat = {};
    for (const x of list) for (const k of Object.keys((x && x.patterns) || {})) {
      pat[k] = pat[k] || { n: 0, lost: 0 };
      pat[k].n += x.patterns[k].n; pat[k].lost += x.patterns[k].lost;
    }
    const dims = {};
    for (const x of list) for (const dk of Object.keys((x && x.dims) || {})) {
      dims[dk] = dims[dk] || {};
      for (const gk of Object.keys(x.dims[dk])) {
        dims[dk][gk] = dims[dk][gk] || { n: 0, sum: 0 };
        dims[dk][gk].n += x.dims[dk][gk].n;
        dims[dk][gk].sum += x.dims[dk][gk].sum;
      }
    }
    const patterns = PATTERNS.filter(p => pat[p.key]).map(p => Object.assign({}, p, pat[p.key],
      { share: n ? pat[p.key].n / n : 0 })).sort((a, b) => b.lost - a.lost);
    const dimRows = DIMS.map(dim => ({
      key: dim.key, label: dim.label,
      rows: Object.keys(dims[dim.key] || {}).map(k => ({
        key: k, n: dims[dim.key][k].n, mean: dims[dim.key][k].sum / dims[dim.key][k].n
      })).sort((a, b) => a.mean - b.mean)
    }));
    return { n, mean: n ? sum / n : 0, patterns, dims: dimRows, enough: n >= 30 };
  }

  /* ------------------------------------------------------------------ *
   * Sizing-Repertoire.
   *
   * In der Beispielsession sind 18 von 19 Bets exakt 33 % oder exakt 65 %
   * des Pots — das sind die Voreinstellungsknöpfe des Clients. Wer nur zwei
   * Knöpfe benutzt, wählt seine Größe nicht, sondern lässt sie sich
   * vorgeben: 65 % ist auf trockenen Boards zu groß und auf dynamischen zu
   * klein, also fast nie die beste Wahl.
   *
   * Das ist kein Artefakt der Rundung auf die vier Engine-Größen, sondern
   * lässt sich direkt an den Rohbeträgen ablesen — deshalb steht es hier
   * getrennt von den Notenmustern.
   * ------------------------------------------------------------------ */
  function sizingProfile(fractions) {
    if (!fractions.length) return null;
    // Auf ganze 5 % bündeln und zählen, wie stark sich die Größen häufen.
    const bins = {};
    for (const f of fractions) {
      const k = Math.round(f * 20) * 5;
      bins[k] = (bins[k] || 0) + 1;
    }
    const rows = Object.keys(bins).map(k => ({ pct: +k, n: bins[k] }))
      .sort((a, b) => b.n - a.n);
    const top2 = rows.slice(0, 2).reduce((a, r) => a + r.n, 0);
    const concentration = top2 / fractions.length;
    const sorted = fractions.slice().sort((a, b) => a - b);
    return {
      n: fractions.length,
      rows: rows.sort((a, b) => a.pct - b.pct),
      distinct: rows.length,
      concentration,
      median: sorted[Math.floor(sorted.length / 2)],
      mean: fractions.reduce((a, b) => a + b, 0) / fractions.length,
      overHalf: fractions.filter(f => f > 0.5).length / fractions.length,
      // Ab zwei Dritteln auf zwei Größen ist es ein Knopfdruck-Muster.
      flagged: fractions.length >= 8 && concentration >= 0.66
    };
  }

  /** Alle echten Bet-Größen des Helden aus den Händen ziehen. */
  function betFractions(rows) {
    const out = [];
    for (const r of rows) {
      const h = r.hand;
      if (h.board.flop.length !== 3) continue;
      const inv = {};
      for (const st of ['blinds', 'preflop'])
        for (const a of h.streets[st]) inv[a.player] = (inv[a.player] || 0) + a.amount;
      let pot = Object.keys(inv).reduce((x, k) => x + inv[k], 0);
      for (const st of ['flop', 'turn', 'river']) {
        const acts = h.streets[st];
        if (!acts.length) break;
        let sp = pot, facing = 0;
        for (const a of acts) {
          if (a.player === h.hero && a.kind === 'bet' && facing === 0 && sp > 0)
            out.push({ f: a.amount / sp, street: st, amount: a.amount, pot: sp, idx: r.idx });
          if (a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin') facing = a.amount;
          sp += a.amount;
        }
        pot = sp;
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Mehrweg — keine Noten, nur die exakt entscheidbaren Fälle.
   * ------------------------------------------------------------------ */
  const MW_TEXT = {
    'mw-call-ohne-equity': {
      title: 'Mehrweg gecallt ohne die nötige Equity',
      why: 'Gegen zwei oder drei Gegner musst du sie <b>alle</b> schlagen. Die Equity fällt ' +
        'dabei viel stärker, als es sich anfühlt: Top Pair mit schwachem Kicker hat heads-up ' +
        '73 %, gegen drei nur noch 42 %. Der größere Pot gleicht das nicht aus.',
      fix: 'Mehrweg gilt: Ass-hoch, schwache Paare und blanke Overcards sind Fold. ' +
        'Weiter geht es nur mit Nut-Potenzial oder echten Odds.'
    },
    'mw-fold-mit-equity': {
      title: 'Mehrweg gefoldet, obwohl die Odds da waren',
      why: 'Der Pot ist mehrweg größer, die Pot Odds also besser. Wenn deine Equity gegen ' +
        'alle Gegner trotzdem darüber liegt, ist der Call richtig — auch wenn die Hand klein aussieht.',
      fix: 'Vor dem Fold kurz rechnen: großer Pot, kleine Bet und ein Draw mit Nut-Potenzial ' +
        'rechtfertigen mehrweg oft einen Call.'
    },
    'mw-bluff-aussichtslos': {
      title: 'Mehrweg geblufft',
      why: 'Ein Bluff muss <b>alle</b> zum Folden bringen, und Fold-Equity potenziert sich ' +
        'nach unten: foldet jeder Einzelne mit 60 %, folden zwei zusammen nur in 36 % der Fälle, ' +
        'drei in 22 %. Bei zwei Gegnern und einer 65-%-Bet müsste jeder schon mit 63 % folden.',
      fix: 'Mehrweg ohne Hand: checken. Bluffs erst wieder, wenn nur noch einer übrig ist.'
    }
  };

  /** Mehrweg-Funde zu Mustern bündeln. */
  function aggregateMultiway(list) {
    const byKey = {};
    for (const m of list) {
      if (!m.verdict) continue;
      (byKey[m.verdict] = byKey[m.verdict] || []).push(m);
    }
    return Object.keys(byKey).map(k => Object.assign({ key: k, n: byKey[k].length,
      examples: byKey[k].slice(0, 5) }, MW_TEXT[k])).sort((a, b) => b.n - a.n);
  }

  function summariseMultiway(list) {
    const c = {};
    for (const m of list) if (m.verdict) c[m.verdict] = (c[m.verdict] || 0) + 1;
    return { n: list.length, verdicts: c };
  }
  function combineMultiway(sums) {
    const c = {};
    let n = 0;
    for (const s of sums) {
      if (!s) continue;
      n += s.n;
      for (const k of Object.keys(s.verdicts || {})) c[k] = (c[k] || 0) + s.verdicts[k];
    }
    return {
      n, rows: Object.keys(c).map(k => Object.assign({ key: k, n: c[k] }, MW_TEXT[k]))
        .sort((a, b) => b.n - a.n)
    };
  }

  P.W2DLeaks = {
    sizingProfile, betFractions,
    MW_TEXT, aggregateMultiway, summariseMultiway, combineMultiway,
    MIN_CASES, PATTERNS, DIMS, BET_ORDER,
    describeHolding, aggregate, summarisePost, combinePost
  };
})();
