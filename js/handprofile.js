/* =========================================================================
   handprofile.js — Hand-Steckbriefe: eine Starthand, alle Flops

   Die Tabelle beantwortet "welche Hände spiele ich". Sie beantwortet nie,
   *warum* die Grenze dort liegt und was nach dem Flop passiert. Dieses Modul
   dreht die Schleife um: nicht ein Board gegen alle Hände, sondern eine Hand
   gegen alle 19.600 Flops.

   Alles hier ist reine Rechnung ohne DOM — damit in node/test/smoke.js
   nachprüfbar. Die Anzeige liegt in app.js.

   Genauigkeit ist bewusst gestaffelt und wird in der UI auch so ausgewiesen:
     exakt      — Trefferverteilung, strukturelle Dominanz (volle Enumeration)
     Stichprobe — Gefahren-Landkarte (jeder k-te Flop, exakt pro Flop)
     Modell     — Push/Fold-EV (geschlossene Formel, feste Call-Ranges)
   Ein "EV eines Min-Raise in bb" fehlt hier absichtlich: den gibt es nur aus
   einem vollständigen Solve, alles andere wäre eine erfundene Zahl.
   ========================================================================= */
(function () {
  const P = window.PT;
  const RANKS = P.RANKS;

  /* ------------------------------------------------------------------ *
   * Archetypen — der eigentliche Lerninhalt.
   * 169 Steckbriefe lernt niemand. Der Transfer passiert auf Musterebene:
   * die einzelne Hand ist der Einstieg, die Erklärung gilt für die Klasse.
   * ------------------------------------------------------------------ */
  const ARCHETYPES = {
    pp_hi: {
      name: 'Premium-Pockets (QQ+)',
      kern: 'Vorne gegen praktisch alles, aber nur **ein Paar**. Der Wert steckt fast komplett darin, dass du preflop und am Flop groß setzen kannst — nicht darin, dass die Hand später noch besser wird.',
      fehler: 'Zu passiv spielen aus Angst vor Überkarten, und dann auf einem A-hohen Turn trotzdem nicht folden können.',
      spiel: 'Preflop maximal aggressiv. Postflop drei Straßen Value auf trockenen Boards; auf verbundenen Boards lieber zwei große Bets als drei kleine.'
    },
    pp_mid: {
      name: 'Mittlere Pockets (77–JJ)',
      kern: 'Die unangenehmste Klasse im Turnier. Meist vorne gegen die Gesamtrange, fast nie vorne gegen die Range, die dir große Bets bezahlt. ' +
        'Selbst **JJ sieht in 57 % der Flops mindestens eine Überkarte** — bei den kleineren Paaren der Klasse ist es noch öfter.',
      fehler: 'Sie wie Premium-Pockets spielen. Ein Overpair auf J-hoch ist gegen eine 3-Bet-Range ein Bluffcatcher, keine Value-Hand.',
      spiel: 'Pot klein halten, außer du triffst dein Set. Auf Boards mit einer Überkarte einmal klein betten und dann aufhören. SPR bestimmt alles.'
    },
    pp_low: {
      name: 'Kleine Pockets (22–66)',
      kern: '11,8 % der Flops geben dir ein Set, der Rest ein schwaches Paar unter Überkarten. Dazu die andere Hälfte des Werts: ' +
        'gegen zwei Overcards bist du ein **Flip** — 22 steht gegen 86 % aller Kombos ungefähr 50/50. Das ist der Grund, warum sie kurz gestackt shovbar sind.',
      fehler: 'Sie im Turnier als Set-Mining-Hände behandeln. **Unter ~40bb verschwinden die impliziten Odds:** ' +
        'Callst du 8bb von 40bb, bleiben 32bb — das zahlt die sieben Fehlversuche nicht mehr. Der Flat-Call ist dann schon der Fehler, nicht erst das Weiterspielen ohne Set.',
      spiel: 'Bei deinen Stackgrößen sind das **Jam-or-Fold-Hände**, keine Spekulationshände. Kurz gestackt shoven (Fold-Equity plus rohe Paar-Stärke), ' +
        'tief gespielt nur mit Position. Ohne Set ist der Showdown-Wert nahe null.'
    },
    bw_s: {
      name: 'Broadway suited (AKs, KQs, QJs …)',
      kern: 'Die beste Struktur im Deck: Top Pair mit bestem Kicker, Nut-Flushdraws und Straight-Potenzial in derselben Hand.',
      fehler: 'Nach dem Whiff aufgeben. Zwei Overcards plus Backdoors sind auf vielen Boards genug, um weiter Druck zu machen.',
      spiel: 'Aggressiv auf allen Straßen — das ist die Hand, mit der du Barrels balancierst. Nut-Flushdraw = großes Sizing.'
    },
    bw_o: {
      name: 'Broadway offsuit (AKo, AQo, KQo …)',
      kern: 'Dieselbe Trefferverteilung wie suited, aber ohne Flush-Ausweg. Der ganze Wert liegt im Top Pair — und das triffst du nur in rund einem Drittel der Flops.',
      fehler: 'Die Hand wie AKs behandeln. Ohne Flushdraw hast du bei einem Whiff nur Overcards, und die realisieren OOP schlecht.',
      spiel: 'Preflop stark, postflop disziplinierter als suited. Mit Position weiterballern, ohne Position nach dem Whiff öfter aufgeben.'
    },
    ax_s: {
      name: 'Suited Aces (A2s–ATs)',
      kern: 'Nut-Flushdraw plus Blocker — der Wert liegt fast nie im Paar. **A5s–A2s sind die 3-Bet-Bluff-Klasse schlechthin:** ' +
        'Dein Ass blockt seine AA und AK, also genau das, womit er weiterspielt. Und dein niedriger Kicker blockt *nicht*, ' +
        'was er wegwirft — beides zusammen macht die Hand besser als etwa A9s, das seine Folds mitblockt.',
      fehler: 'Sie als "Ass" spielen. Top Pair mit Kicker 4 ist gegen eine ernsthafte Range eine Falle, kein Value.',
      spiel: 'Als Bluff-Kandidat einplanen, nicht als Value-Hand. Bei 40bb sind Bluff-3-Bets praktisch nur noch diese Hände. ' +
        'Die Rad-Karten zusätzlich mit Straight-Backup.'
    },
    ax_o: {
      name: 'Offsuit Aces (A2o–ATo)',
      kern: 'Die klassische Dominanzfalle: Wenn du triffst, bist du oft gegen einen besseren Kicker hinten.',
      fehler: 'Nur den Rang sehen, nicht den Kicker. Genau diese Hände verlieren die großen Pots.',
      spiel: 'Fast nur als Steal aus später Position. Mit Top Pair schwachem Kicker maximal zwei kleine Bets, gegen Aggression aussteigen.'
    },
    sc: {
      name: 'Suited Connectors (JTs–54s)',
      kern: 'Selten stark, aber wenn dann getarnt: Straights, Flushes, Two Pair — genau die Hände, die deine Bets glaubwürdig machen.',
      fehler: 'Überbewerten. Du triffst nur selten wirklich etwas, und ein Gutshot ist noch kein Grund für einen dritten Barrel.',
      spiel: 'Der Wert steht und fällt mit der **Equity-Realisierung**, nicht mit impliziten Odds: OOP und kurz gestackt kommst du zu selten billig zum Showdown, ' +
        'um die vielen Whiffs zu bezahlen. Mit Position und ab 40bb aufwärts sind sie gut. Auf niedrigen verbundenen Boards ist das die Klasse, die dem BB das Nut-Advantage gibt.'
    },
    sg: {
      name: 'Suited Gapper (J9s, T8s, 97s …)',
      kern: 'Wie Suited Connectors, aber mit spürbar weniger Straight-Equity und häufiger dominiert.',
      fehler: 'Sie als vollwertige Connectors behandeln. Der Gap kostet mehr, als er intuitiv wirkt.',
      spiel: 'Nur aus später Position und gegen breite Ranges. Aus dem BB fast nur mit direkten Odds verteidigen.'
    },
    sx: {
      name: 'Suited Rest (K5s, Q7s, J6s …)',
      kern: 'Existieren wegen des Flushdraws und des Blockers, nicht wegen des Paars. Häufig dominiert, wenn sie treffen.',
      fehler: 'Mit Top Pair schwachem Kicker drei Straßen bezahlen.',
      spiel: 'Reine Steal- und Semibluff-Hände. Trifft der Flush nicht, ist die Hand meist am Turn vorbei.'
    },
    weak_o: {
      name: 'Offsuit ohne Broadway (T9o, 87o, J8o …)',
      kern: 'Der schwächste Teil jeder Open-Range: kein Flush-Ausweg, wenig Straight-Potenzial, oft dominiert.',
      fehler: 'Zu weit spielen, weil die Karten "verbunden aussehen".',
      spiel: 'Nur BTN/SB-Steals gegen tighte Blinds. Postflop nach dem ersten Widerstand aussteigen.'
    }
  };

  /** Ordnet eine Handklasse ("AKo", "77", "76s") einem Archetyp zu. */
  function archetypeOf(hc) {
    const a = RANKS.indexOf(hc[0]), b = RANKS.indexOf(hc[1]);
    const suited = hc[2] === 's';
    if (a === b) return a >= 10 ? 'pp_hi' : a >= 5 ? 'pp_mid' : 'pp_low';
    const hi = Math.max(a, b), lo = Math.min(a, b);
    if (hi === 12) {                                   // Ass-Hände
      if (lo >= 9) return suited ? 'bw_s' : 'bw_o';    // AJ+ zählt als Broadway
      return suited ? 'ax_s' : 'ax_o';
    }
    if (lo >= 8) return suited ? 'bw_s' : 'bw_o';      // beide Karten T+
    if (!suited) return 'weak_o';
    if (hi - lo === 1) return 'sc';
    if (hi - lo <= 3) return 'sg';
    return 'sx';
  }

  /* ------------------------------------------------------------------ *
   * Kanonische Kombo einer Handklasse.
   * Über die Farbsymmetrie ist die Flop-Verteilung für jede Kombo einer
   * Klasse identisch — eine Repräsentantin genügt und macht die volle
   * Enumeration exakt statt gesampelt.
   * ------------------------------------------------------------------ */
  function canonicalCombo(hc) {
    const a = RANKS.indexOf(hc[0]), b = RANKS.indexOf(hc[1]);
    if (a < 0 || b < 0) throw new Error('Unbekannte Handklasse: ' + hc);
    if (a === b) return [a * 4 + 2, a * 4 + 1];                 // Ah Ad
    const hi = Math.max(a, b), lo = Math.min(a, b);
    if (hc[2] === 's') return [hi * 4 + 2, lo * 4 + 2];         // Ah Kh
    return [hi * 4 + 2, lo * 4 + 1];                            // Ah Kd
  }

  /** Alle 169 Handklassen, stark → schwach ist NICHT sortiert (Grid-Reihenfolge). */
  function allHandClasses() {
    const out = [];
    for (let i = 12; i >= 0; i--) {
      for (let j = 12; j >= 0; j--) {
        if (i === j) out.push(RANKS[i] + RANKS[j]);
        else if (i > j) out.push(RANKS[i] + RANKS[j] + 's');
        else out.push(RANKS[j] + RANKS[i] + 'o');
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Board-Buckets für die Gefahren-Landkarte.
   * Erste passende Regel gewinnt, damit jeder Flop genau einmal zählt.
   * ------------------------------------------------------------------ */
  const BOARD_BUCKETS = [
    { key: 'paired', name: 'Gepaart', test: t => t.paired },
    { key: 'mono', name: 'Monotone', test: t => t.maxSuit >= 3 },
    { key: 'ace', name: 'Ass-hoch', test: t => t.highCard === 12 },
    { key: 'kq', name: 'K/Q-hoch, trocken', test: t => t.highCard >= 10 && !t.connected },
    { key: 'bwconn', name: 'Broadway verbunden', test: t => t.broadwayCount >= 2 && t.connected },
    { key: 'midconn', name: 'Mittel verbunden', test: t => t.connected && t.highCard >= 7 },
    { key: 'lowconn', name: 'Niedrig verbunden', test: t => t.connected },
    { key: 'mid', name: 'Mittel, trocken', test: t => t.highCard >= 7 },
    { key: 'low', name: 'Niedrig, trocken', test: () => true }
  ];
  function bucketOf(tex) {
    for (const b of BOARD_BUCKETS) if (b.test(tex)) return b.key;
    return 'low';
  }

  /* ---- Trefferklassen ------------------------------------------------
     Gezählt wird, was die EIGENEN zwei Karten beitragen — nicht die
     Handklasse am Showdown.

     Beide sind richtig, sie beantworten nur verschiedene Fragen. JJ auf
     7♦7♠2♣ ist am Showdown korrekt Two Pair (JJ + 77). Nur: die Siebenen
     hat auch der Gegner mit Q♠J♦. Das Board-Paar differenziert dich von
     niemandem, und die Hand gewinnt exakt die Pötte, die ein Overpair
     gewinnt. Als "Two Pair" gezählt läse sich die Verteilung so, als flope
     JJ in gut jedem vierten Fall eine große Hand — sie flopt ihr Set in
     11,8 %. Deshalb hier: Board-Paare zählen nicht als Treffer.
     -------------------------------------------------------------------- */
  const HIT_NOTE = 'Gezählt wird nur, was deine eigenen zwei Karten beitragen. ' +
    'Ein Board-Paar hat jeder am Tisch — JJ auf 7♦7♠2♣ steht hier als Overpair, ' +
    'obwohl es am Showdown Two Pair ist.';

  const HIT_ORDER = [
    { key: 'monster', name: 'Set / Two Pair / Straight / Flush' },
    { key: 'overpair', name: 'Overpair' },
    { key: 'tptk', name: 'Top Pair, bester Kicker' },
    { key: 'toppair', name: 'Top Pair, schwächerer Kicker' },
    { key: 'weakpair', name: 'schwächeres Paar / Underpair' },
    { key: 'draw', name: 'nur Draw (Flushdraw / OESD)' },
    { key: 'gutshot', name: 'nur Gutshot' },
    { key: 'air', name: 'kein eigener Treffer' }
  ];

  function drawOrAir(cls) {
    if (cls.hasFD || cls.hasOESD) return 'draw';
    if (cls.hasGutshot) return 'gutshot';
    return 'air';
  }

  /**
   * Trefferklasse einer Hand auf einem FLOP (genau 3 Board-Karten).
   * @param bRanks Board-Ränge absteigend, dedupliziert
   * @param bCount Anzahl je Board-Rang
   */
  function flopHit(hr, bRanks, bCount, cls) {
    const isPP = hr[0] === hr[1];
    const maxB = bRanks[0];
    // Straight/Flush und besser kann ein Drei-Karten-Board nie allein bilden.
    if (cls.cat >= 4) return 'monster';

    const matched = hr.filter(r => bCount[r]);
    const pairLabel = r => {
      if (r !== bRanks[0]) return 'weakpair';
      const kick = hr[0] === r ? hr[1] : hr[0];
      // Bester Kicker = Ass, oder König wenn kein Ass auf dem Board liegt.
      return (kick === 12 || (kick === 11 && maxB !== 12)) ? 'tptk' : 'toppair';
    };

    if (cls.cat === 3) {                                  // Trips-Kategorie
      if (isPP && bCount[hr[0]]) return 'monster';        // echtes Set
      if (matched.length && bCount[matched[0]] === 2) return 'monster'; // Trips über Board-Paar
      return drawOrAir(cls);                              // Board-Trips (555) — Hand trägt nichts bei
    }
    if (cls.cat === 2) {                                  // Two-Pair-Kategorie
      if (bRanks.length === 3) return 'monster';          // Board unpaired -> echte Two Pair
      if (isPP) return hr[0] > maxB ? 'overpair' : 'weakpair';
      if (matched.length) return pairLabel(matched[0]);
      return drawOrAir(cls);                              // nur das Board-Paar
    }
    if (cls.cat === 1) {                                  // ein Paar
      if (isPP) return hr[0] > maxB ? 'overpair' : 'weakpair';
      if (matched.length) return pairLabel(matched[0]);
      return drawOrAir(cls);
    }
    return drawOrAir(cls);
  }

  /**
   * Schlanke Board-Textur, nur für die Bucket-Zuordnung.
   * P.boardTexture rechnet zusätzlich einen Dynamik-Score über eine
   * 13×13-Schleife mit straightHigh — bei 19.600 Flops ist genau das
   * der Flaschenhals, und für das Bucket brauchen wir davon nichts.
   */
  function fastTex(board) {
    const rc = [], sc = [0, 0, 0, 0];
    for (let i = 0; i < 3; i++) { rc.push(board[i] >> 2); sc[board[i] & 3]++; }
    rc.sort((a, b) => b - a);
    const uniq = rc[0] === rc[1] && rc[1] === rc[2] ? 1 : (rc[0] === rc[1] || rc[1] === rc[2]) ? 2 : 3;
    return {
      highCard: rc[0],
      paired: uniq < 3,
      maxSuit: Math.max(sc[0], sc[1], sc[2], sc[3]),
      connected: uniq === 3 && rc[0] - rc[2] <= 4,
      broadwayCount: (rc[0] >= 8 ? 1 : 0) + (rc[1] >= 8 ? 1 : 0) + (rc[2] >= 8 ? 1 : 0)
    };
  }

  /* ------------------------------------------------------------------ *
   * Der Kern: eine Hand gegen alle 19.600 Flops.
   *
   * Die Trefferverteilung wird vollständig enumeriert (exakt). Die relative
   * Stärke gegen eine Gegner-Range ist pro Flop exakt, läuft aber nur auf
   * jedem k-ten Flop — die volle Rechnung wäre ~4 Mio. Evaluierungen und
   * damit im Browser spürbar. Der Stride ist deterministisch, dieselbe Hand
   * liefert also immer dieselben Zahlen.
   * ------------------------------------------------------------------ */
  const HIT_VALUE = {                      // grober Trefferwert 0..1
    monster: 1, overpair: 0.8, tptk: 0.75, toppair: 0.65,
    weakpair: 0.35, draw: 0.4, gutshot: 0.2, air: 0
  };

  /**
   * Relative Stärke gegen die ganze Range UND gegen ihr stärkstes Viertel.
   *
   * Gegen die *gesamte* Preflop-Range ist jede Made Hand fast immer vorne —
   * der Großteil dieser Range ist auf jedem Flop Luft und foldet sofort.
   * Die Zahl, die eine Hand tatsächlich gefährlich macht, ist die gegen den
   * Teil, der weiterspielt. Der wird hier über die Handstärke auf diesem
   * Board angenähert (kein Solver, aber die richtige Größenordnung).
   *
   * Beide Werte fallen bei derselben Enumeration ab, der zweite kostet nur
   * eine Sortierung.
   */
  const TOP_FRAC = 0.25;
  function strengthSplit(hole, vr, board, myScore) {
    const dead = new Set([hole[0], hole[1], board[0], board[1], board[2]]);
    const scores = [];
    for (let i = 0; i < vr.length; i++) {
      const c = vr[i].c;
      if (dead.has(c[0]) || dead.has(c[1])) continue;
      scores.push(P.evaluate([c[0], c[1], board[0], board[1], board[2]]));
    }
    if (!scores.length) return { all: 0.5, top: 0.5 };
    scores.sort((a, b) => b - a);                    // stark -> schwach
    const n = Math.max(1, Math.round(scores.length * TOP_FRAC));
    let beatAll = 0, tieAll = 0, beatTop = 0, tieTop = 0;
    for (let i = 0; i < scores.length; i++) {
      if (myScore > scores[i]) { beatAll++; if (i < n) beatTop++; }
      else if (myScore === scores[i]) { tieAll++; if (i < n) tieTop++; }
    }
    return {
      all: (beatAll + tieAll / 2) / scores.length,
      top: (beatTop + tieTop / 2) / n
    };
  }

  function flopStats(handClass, opts) {
    opts = opts || {};
    const villRange = opts.villRange || null;      // Array aus parseRange
    const sample = opts.sample || 900;             // Flops für die Gefahrenkarte
    const hole = canonicalCombo(handClass);
    const hr = [P.rankOf(hole[0]), P.rankOf(hole[1])].sort((a, b) => b - a);
    const dead = new Set(hole);
    const deck = P.fullDeck().filter(c => !dead.has(c));

    const hits = {}; HIT_ORDER.forEach(h => hits[h.key] = 0);
    const draws = { fd: 0, nutfd: 0, oesd: 0, gut: 0, bdfd: 0 };
    const buckets = {};
    BOARD_BUCKETS.forEach(b => buckets[b.key] = { n: 0, relSum: 0, topSum: 0, relN: 0, danger: 0, hitSum: 0 });

    const nFlops = deck.length * (deck.length - 1) * (deck.length - 2) / 6;
    const stride = villRange ? Math.max(1, Math.round(nFlops / sample)) : 0;
    const traps = [];
    const board = [0, 0, 0];
    const bCount = {};
    let total = 0, madeN = 0;

    for (let i = 0; i < deck.length; i++) {
      board[0] = deck[i];
      for (let j = i + 1; j < deck.length; j++) {
        board[1] = deck[j];
        for (let k = j + 1; k < deck.length; k++) {
          board[2] = deck[k];
          const cls = P.classify(hole, board);

          const r0 = board[0] >> 2, r1 = board[1] >> 2, r2 = board[2] >> 2;
          bCount[r0] = 0; bCount[r1] = 0; bCount[r2] = 0;
          bCount[r0]++; bCount[r1]++; bCount[r2]++;
          const bRanks = [...new Set([r0, r1, r2])].sort((a, b) => b - a);

          const hit = flopHit(hr, bRanks, bCount, cls);
          hits[hit]++;
          if (cls.hasFD) { draws.fd++; if (cls.hasNutFD) draws.nutfd++; }
          if (cls.hasOESD) draws.oesd++;
          if (cls.hasGutshot) draws.gut++;
          if (cls.hasBDFD) draws.bdfd++;

          const bk = buckets[bucketOf(fastTex(board))];
          bk.n++;
          bk.hitSum += HIT_VALUE[hit];

          if (stride && total % stride === 0) {
            const sp = strengthSplit(hole, villRange, board, P.evaluate(hole.concat(board)));
            const rel = sp.all, top = sp.top;
            bk.relSum += rel; bk.relN++;
            bk.topSum += top;
            if (top < 0.4) bk.danger++;
            // Fallen: getroffen UND trotzdem hinten. Der Schwellenwert bleibt
            // absolut, auch wenn die Liste dann für AK leer bleibt — "kommt
            // praktisch nicht vor" ist bei dieser Hand die richtige Antwort.
            // Die sechs schwächsten Top-Pair-Flops zu zeigen und sie
            // "gefährlich" zu nennen, wäre bei 84 % relativer Stärke gelogen.
            if (hit === 'monster' || hit === 'overpair' || hit === 'tptk' || hit === 'toppair') {
              madeN++;
              if (top < 0.5) traps.push({ board: board.slice(), hit, made: cls.made, rel, top });
            }
          }
          total++;
          delete bCount[r0]; delete bCount[r1]; delete bCount[r2];
        }
      }
    }

    const list = HIT_ORDER.map(h => ({ key: h.key, name: h.name, n: hits[h.key], pct: hits[h.key] / total }));
    const bucketList = BOARD_BUCKETS.map(b => {
      const x = buckets[b.key];
      return {
        key: b.key, name: b.name, n: x.n, freq: x.n / total,
        hitAvg: x.n ? x.hitSum / x.n : 0,
        relAvg: x.relN ? x.relSum / x.relN : null,
        topAvg: x.relN ? x.topSum / x.relN : null,
        dangerPct: x.relN ? x.danger / x.relN : null,
        sampled: x.relN
      };
    }).filter(b => b.n > 0);

    traps.sort((a, b) => a.rel - b.rel);
    return {
      handClass, hole, total,
      pairPlus: (hits.monster + hits.overpair + hits.tptk + hits.toppair + hits.weakpair) / total,
      strongPlus: (hits.monster + hits.overpair + hits.tptk + hits.toppair) / total,
      hits: list,
      draws: {
        fd: draws.fd / total, nutfd: draws.nutfd / total, oesd: draws.oesd / total,
        gut: draws.gut / total, bdfd: draws.bdfd / total
      },
      buckets: bucketList,
      // trapPct bezieht sich auf die getroffenen Flops, nicht auf alle:
      // "wenn du triffst, wie oft bist du trotzdem hinten".
      traps: traps.slice(0, 6),
      trapPct: madeN ? traps.length / madeN : null,
      madeSampled: madeN,
      sampled: stride ? Math.round(total / stride) : 0
    };
  }

  /* ------------------------------------------------------------------ *
   * Strukturelle Dominanz — exakt über alle 1.326 Kombos.
   *
   * "AK dominiert 90 % aller Hände" ist gegen 1.326 Zufallskombos ungefähr
   * wahr und gegen jede echte Range irreführend. Deshalb wird beides
   * ausgegeben: die strukturelle Zahl UND die Equity gegen benannte Ranges.
   * ------------------------------------------------------------------ */
  function dominance(handClass) {
    const hole = canonicalCombo(handClass);
    const hr = [P.rankOf(hole[0]), P.rankOf(hole[1])].sort((a, b) => b - a);
    const isPair = hr[0] === hr[1];
    const dead = new Set(hole);
    const deck = P.fullDeck().filter(c => !dead.has(c));
    let dom = 0, domBy = 0, twoOver = 0, tot = 0;

    for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) {
        const a = P.rankOf(deck[i]), b = P.rankOf(deck[j]);
        const vr = a >= b ? [a, b] : [b, a];
        const vPair = vr[0] === vr[1];
        tot++;
        if (isPair) {
          // Gleiche Paare sind ein Split, keine Dominanz — AA gegen die
          // beiden verbliebenen Asse darf nicht als "dominiert" zählen.
          if (vPair) { if (hr[0] > vr[0]) dom++; else if (hr[0] < vr[0]) domBy++; continue; }
          // Ein Paar dominiert jede ungepaarte Hand, die eine Karte seines
          // Rangs hält — die hat nur noch zwei Outs.
          if (vr[0] === hr[0] || vr[1] === hr[0]) dom++;
          else if (vr[1] > hr[0]) twoOver++;      // zwei Overcards = Flip, keine Dominanz
          continue;
        }
        if (vPair) {
          // Ein Paar, das eine unserer Karten hält, dominiert uns.
          if (vr[0] === hr[0] || vr[0] === hr[1]) domBy++;
          continue;
        }
        // beide ungepaart: Dominanz nur bei genau einem gemeinsamen Rang
        const shareHi = vr[0] === hr[0] || vr[1] === hr[0];
        const shareLo = vr[0] === hr[1] || vr[1] === hr[1];
        if (shareHi && shareLo) continue;                    // dieselben Ränge
        if (!shareHi && !shareLo) continue;                  // kein Bezug
        const s = shareHi ? hr[0] : hr[1];
        const mine = s === hr[0] ? hr[1] : hr[0];
        const his = vr[0] === s ? vr[1] : vr[0];
        if (mine > his) dom++; else domBy++;
      }
    }
    return {
      tot, dom, domBy, twoOver, isPair,
      domPct: dom / tot, domByPct: domBy / tot, twoOverPct: twoOver / tot
    };
  }

  /* ------------------------------------------------------------------ *
   * Preflop-Equity (Monte Carlo). Die Engine-Funktion equityVsRange rechnet
   * ab dem Flop; preflop sind fünf Karten zu ziehen.
   * ------------------------------------------------------------------ */
  function preflopEquity(hole, range, N) {
    N = N || 12000;
    const dead = new Set(hole);
    const vr = range.filter(x => !dead.has(x.c[0]) && !dead.has(x.c[1]));
    if (!vr.length) return 0.5;
    const totW = vr.reduce((a, x) => a + x.w, 0);
    const deckBase = P.fullDeck().filter(c => !dead.has(c));
    let sum = 0, n = 0;
    for (let s = 0; s < N; s++) {
      let pick = P.rng() * totW, v = vr[0];
      for (const x of vr) { pick -= x.w; if (pick <= 0) { v = x; break; } }
      const d = deckBase.filter(c => c !== v.c[0] && c !== v.c[1]);
      const board = [];
      for (let k = 0; k < 5; k++) board.push(d.splice((P.rng() * d.length) | 0, 1)[0]);
      const a = P.evaluate(hole.concat(board)), b = P.evaluate(v.c.concat(board));
      if (a > b) sum += 1; else if (a === b) sum += 0.5;
      n++;
    }
    return n ? sum / n : 0.5;
  }

  const ALL_HANDS = 'AA-22, AKs-A2s, KQs-K2s, QJs-Q2s, JTs-J2s, T9s-T2s, 98s-92s, ' +
    '87s-82s, 76s-72s, 65s-62s, 54s-52s, 43s-42s, 32s, ' +
    'AKo-A2o, KQo-K2o, QJo-Q2o, JTo-J2o, T9o-T2o, 98o-92o, 87o-82o, ' +
    '76o-72o, 65o-62o, 54o-52o, 43o-42o, 32o';

  /* ------------------------------------------------------------------ *
   * Push/Fold-EV — das einzige EV in bb, das ohne Solver ehrlich rechenbar
   * ist. Geschlossene Formel: Fold-Equity plus Equity gegen die Call-Range.
   *
   * Modell (bewusst simpel, wird in der UI so beschriftet):
   *   - Ante = 1bb (BB-Ante), wie in ranges.js
   *   - Spieler hinter dir callen unabhängig voneinander mit fester Range
   *   - Mehrfach-Calls werden dem ersten Caller zugeschlagen (kein Multiway)
   *   - kein ICM
   * EV ist relativ zum Folden gerechnet: 0 = Folden, positiv = Shove besser.
   * ------------------------------------------------------------------ */
  /* Die angenommene Shove-Range des Gegners — Modellannahme, wird in der UI
     ausgewiesen. Größenordnung aus Nash-Charts mit BB-Ante: aus dem SB shovt
     man weit (nur einer hinter dir), aus dem CO deutlich enger. */
  const ASSUMED_SHOVE_PCT = {
    10: { BB: 55, SB: 40, OTHER: 28 },
    15: { BB: 40, SB: 28, OTHER: 19 },
    20: { BB: 30, SB: 20, OTHER: 13 }
  };

  /* Die Call-Ranges sind NICHT von Hand gesetzt, sondern hergeleitet:
     callen genau dann, wenn die Equity gegen die oben angenommene
     Shove-Range die Pot Odds schlägt. Erzeugt mit scratchpad/derive.js,
     Monotonie im Kicker erzwungen (ein Loch in der Reihe wäre MC-Rauschen).

     Eine handgeschriebene Version stand hier vorher und war falsch: sie
     enthielt Suited Connectors (76s, 87s, 98s) und ließ schwache Ax/Kx weg.
     Das ist eine Postflop-Intuition an der falschen Stelle — im All-in gibt
     es kein Postflop, implizite Odds existieren nicht, und rohes A-hoch
     schlägt Verbundenheit. Die alten Ranges waren dadurch 6–8 Punkte zu eng,
     was die Fold-Equity und damit jede Shove-EV zu hoch ausgewiesen hat. */
  const CALL_VS_SHOVE = {
    10: {
      BB: '22+, A2s+, K2s+, Q4s+, J8s+, T9s+, 98s+, A2o+, K2o+, Q8o+, J9o+',
      SB: '22+, A2s+, K6s+, Q9s+, JTs+, A2o+, K9o+, QJo+',
      OTHER: '22+, A2s+, KTs+, QJs+, A6o+, KTo+'
    },
    15: {
      BB: '22+, A2s+, K7s+, QTs+, A2o+, K9o+, QJo+',
      SB: '33+, A2s+, KTs+, QJs+, A7o+, KJo+',
      OTHER: '66+, A9s+, KQs+, ATo+'
    },
    20: {
      BB: '33+, A3s+, KTs+, QJs+, A7o+, KJo+',
      SB: '66+, A8s+, KQs+, A9o+',
      OTHER: '88+, AJs+, AJo+'
    }
  };

  /** Spots, für die ein Shove-EV überhaupt sinnvoll ist. */
  const SHOVE_SPOTS = [
    { key: 'sb', name: 'SB shovt', posted: 0.5, behind: ['BB'] },
    { key: 'btn', name: 'BTN shovt', posted: 0, behind: ['SB', 'BB'] },
    { key: 'co', name: 'CO shovt', posted: 0, behind: ['OTHER', 'SB', 'BB'] }
  ];
  const SHOVE_STACKS = [10, 15, 20];
  const ANTE = 1.0;
  const BLIND = { SB: 0.5, BB: 1.0, OTHER: 0 };

  /**
   * @returns {ev, foldPct, eqs} — ev in bb relativ zum Folden.
   */
  function shoveEV(handClass, spot, stack, cache) {
    const hole = canonicalCombo(handClass);
    const tbl = CALL_VS_SHOVE[stack];
    const s = stack;
    // Blinds der Spieler hinter dir. Dein eigener Blind steckt bereits in s
    // (du shovst deinen ganzen Stack), taucht im Pot also nicht extra auf —
    // er kommt nur als Basiskorrektur zurück: Folden kostet ihn, Shoven nicht.
    const blindsBehind = spot.behind.reduce((a, p) => a + BLIND[p], 0);

    let pSurvive = 1, ev = 0;
    const eqs = {}, freqs = {};
    for (const p of spot.behind) {
      const key = p + '|' + stack;
      let entry = cache && cache[key];
      if (!entry) {
        entry = { range: P.parseRange(tbl[p]) };
        if (cache) cache[key] = entry;
      }
      const callFreq = entry.range.length / 1326;
      const eqKey = handClass + '|' + key;
      let eq = cache && cache[eqKey];
      if (eq === undefined) {
        eq = preflopEquity(hole, entry.range, 9000);
        if (cache) cache[eqKey] = eq;
      }
      eqs[p] = eq; freqs[p] = callFreq;
      // Callt genau dieser Spieler, folden alle übrigen — deren Blinds sind
      // totes Geld. Seinen eigenen bringt der Caller in seinem Stack mit.
      const pot = 2 * s + ANTE + (blindsBehind - BLIND[p]);
      ev += pSurvive * callFreq * (eq * pot - s + spot.posted);
      pSurvive *= (1 - callFreq);
    }
    // Alle folden: du kassierst Ante und fremde Blinds und bekommst deinen
    // eigenen geposteten Blind zurück.
    ev += pSurvive * (ANTE + blindsBehind + spot.posted);
    return { ev, foldPct: pSurvive, eqs, freqs };
  }

  /** Volle EV-Tabelle: alle Shove-Spots × Stackgrößen. */
  function shoveTable(handClass, cache) {
    return SHOVE_SPOTS.map(spot => ({
      key: spot.key, name: spot.name,
      cells: SHOVE_STACKS.map(st => Object.assign({ stack: st }, shoveEV(handClass, spot, st, cache)))
    }));
  }

  /* ------------------------------------------------------------------ */
  P.HandProfile = {
    ARCHETYPES, archetypeOf, canonicalCombo, allHandClasses,
    BOARD_BUCKETS, HIT_ORDER, HIT_NOTE, bucketOf, flopHit, fastTex,
    flopStats, dominance, preflopEquity, strengthSplit, TOP_FRAC, ALL_HANDS,
    CALL_VS_SHOVE, ASSUMED_SHOVE_PCT, SHOVE_SPOTS, SHOVE_STACKS, shoveEV, shoveTable
  };
})();
