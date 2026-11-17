/* =========================================================================
   course.js — Kurs 16.11.2026–28.02.2027: 5 × 60 Minuten pro Woche

   Ziel (mit dem Spieler besprochen 16.11.2026): bis Februar bei der
   ENTSCHEIDUNGSQUALITÄT zur Spitze des eigenen Feldes (win2day, €10–50,
   Mystery Bounties) aufschließen. Gemessen nicht am Ergebnis — dafür sind
   60–100 Turniere Varianz —, sondern an:
     - klaren Fehlern je 100 Hände (Basis 11.10.: 64 in 4.572 ≈ 1,4/100),
     - Abweichung im Rate-Modus auf Solver-Flops (Ziel ≤ 8 Punkte),
     - keinen Stack-Bluffs > 50 % ohne Equity/Blocker.

   Aufbau jeder Einheit (60 min): Wiederholung 5 · Preflop-Drill 15 ·
   Lektion + Fragen 20 · Auftrag 15 · Check-in 5. Der Preflop-Drill
   (js/preflopdrill.js) kam am 17.11. dazu, nach der Auswertung der eigenen
   Opens und Calls (tools/preflop): fast überall zu loose. Die 15 Minuten
   gingen von der Wiederholung und den Trainer-Aufträgen ab. Die Blöcke folgen den Leaks aus den Reviews
   (siehe Coaching-Protokoll coach/protokoll.md). Block 1 ist ausformuliert;
   die späteren Blöcke schreibt der Coach nach dem jeweiligen Block-Review,
   damit sie auf die Ergebnisse reagieren können.

   Woher die Antworten kommen: Jede EV-Frage ist ein Spot im Format von
   js/stackoff.js und wird mit dessen analyse() gerechnet (Equity gegen die
   Range, Realisierung IP 1,04 / OOP 0,90, All-in mit Call-Anteil). Die
   Ranges stammen aus ranges.js oder aus den nachgerechneten echten Händen
   in stackoff.js; wo eine Range eine Annahme ist, steht das dabei.
   ========================================================================= */
(function () {
  const P = window.PT;

  const START = '2026-11-16';          // Montag (17.11. ist ein Dienstag)
  const END = '2027-02-28';
  const STORE = 'pt_course';

  /* ---------------- Ranges, auf die sich die Fragen stützen ---------------- */
  const R = {
    // Aus ranges.js
    BB3_vs_BTN: { s: () => P.THREEBET.BB_vs_BTN, src: 'ranges.js THREEBET.BB_vs_BTN' },
    BB3_vs_CO: { s: () => P.THREEBET.BB_vs_CO, src: 'ranges.js THREEBET.BB_vs_CO' },
    BTN3_vs_CO: { s: () => P.THREEBET.BTN_vs_CO, src: 'ranges.js THREEBET.BTN_vs_CO' },
    BTN3_vs_EP: { s: () => P.THREEBET.BTN_vs_EP, src: 'ranges.js THREEBET.BTN_vs_EP' },
    SB3_vs_BTN: { s: () => P.THREEBET.SB_vs_BTN, src: 'ranges.js THREEBET.SB_vs_BTN' },
    // Aus den nachgerechneten echten Händen (stackoff.js, Hand-Check 27./28.10.)
    IP3_vs_early: { s: () => 'TT+, AQ+, AJs, KQs, A5s:0.5, A4s:0.5, 99:0.5, AJo:0.3', src: 'Hand-Check KJo (27.10.): 3-Bet in Position gegen ein frühes Open' },
    // Annahmen — ausdrücklich so gekennzeichnet
    SQZ: { s: () => 'TT+, AQ+, AJs, KQs, A5s:0.5, A4s:0.5', src: 'Annahme: Squeeze aus den Blinds ist enger als eine 3-Bet (wie IP3_vs_early ohne 99/AJo)' },
    CALL_JAM_DEEP: { s: () => 'QQ+, AK, JJ:0.5', src: 'wie im Hand-Check: gegen einen 4-Bet-All-in > 30bb bleibt er mit QQ+, AK, halb JJ' },
    CALL_JAM_MID: { s: () => 'JJ+, AK, TT:0.5, AQs:0.5', src: 'Annahme: bei 20–30bb callt der 3-Bettor etwas weiter' },
    /* Wie weit ein Opener deinen Reshove callt, ist die unsicherste Annahme.
       Deshalb zwei Varianten aus der Handrangliste des ICM-Moduls; eine
       Frage zählt nur, wenn beide dieselbe Antwort geben (siehe solve). */
    OPEN_CALLS_JAM: { s: () => P.ICM.topPct(10).join(', '), src: 'Annahme, eng: er callt mit den besten 10 % (Handrangliste aus icm.js)' },
    OPEN_CALLS_JAM_WIDE: { s: () => P.ICM.topPct(20).join(', '), src: 'Annahme, weit: er callt mit den besten 20 %' }
  };
  const rng = s => R[s].s();

  /* ---------------- Spot-Bausteine ----------------
     Pot-Geometrie wie im Trainer (ranges.js STACKS): Open 2,2bb (mid) bzw.
     2,0bb (short), Ante 1bb, Blinds 1,5bb. 3-Bet in Position 3× Open, aus
     den Blinds 4× Open. Alle Beträge in bb. */
  const BLINDS = ['SB', 'BB'];
  function openSize(stack) { return stack <= 35 ? 2.0 : 2.2; }

  /** Du öffnest, er 3-bettet, alle anderen folden. */
  function vs3bet(o) {
    const op = openSize(o.stack);
    // Größe der 3-Bet: Standard 3× (IP) bzw. 4× (Blinds), in den Fragen variiert —
    // ob ein Call geht, hängt stark daran (Prüfung 16.11.: gegen 3× ist fast alles ein Call).
    const x = +(op * (o.mult || (BLINDS.includes(o.villPos) ? 4 : 3))).toFixed(1);
    const dead = 1 + 1.5 - (o.villPos === 'SB' ? 0.5 : o.villPos === 'BB' ? 1 : 0);
    return {
      kind: 'ev', hero: o.hero, board: '', preflop: true, ip: !BLINDS.includes(o.villPos) ? false : true,
      heroPos: o.heroPos, villPos: o.villPos,
      text: `Du öffnest aus ${o.heroPos} auf ${op}bb (${o.stack}bb Stack). ${o.villPos} 3-bettet auf ${x}bb, alle anderen folden.`,
      pot: +(op + x + dead).toFixed(2), toCall: +(x - op).toFixed(2),
      heroBehind: +(o.stack - op).toFixed(2), villBehind: +((o.villStack || o.stack) - x).toFixed(2),
      villRange: rng(o.range), villSrc: R[o.range].src,
      callRange: rng(o.call || (o.stack > 30 ? 'CALL_JAM_DEEP' : 'CALL_JAM_MID')),
      callSrc: R[o.call || (o.stack > 30 ? 'CALL_JAM_DEEP' : 'CALL_JAM_MID')].src,
      options: ['FOLD', 'CALL', 'JAM']
    };
  }

  /** Du öffnest, einer callt, er squeezt aus dem Big Blind. Der Caller foldet (Annahme). */
  function vsSqueeze(o) {
    const op = openSize(o.stack);
    const x = +(op * 4.5).toFixed(1);
    return {
      kind: 'ev', hero: o.hero, board: '', preflop: true, ip: true, heroPos: o.heroPos, villPos: 'BB',
      text: `Du öffnest aus ${o.heroPos} auf ${op}bb (${o.stack}bb), ${o.caller} callt. Der BB squeezt auf ${x}bb, der Caller foldet danach.`,
      pot: +(op * 2 + x + 0.5 + 1).toFixed(2), toCall: +(x - op).toFixed(2),
      heroBehind: +(o.stack - op).toFixed(2), villBehind: +((o.villStack || o.stack) - x).toFixed(2),
      villRange: rng('SQZ'), villSrc: R.SQZ.src,
      callRange: rng(o.stack > 30 ? 'CALL_JAM_DEEP' : 'CALL_JAM_MID'), callSrc: R[o.stack > 30 ? 'CALL_JAM_DEEP' : 'CALL_JAM_MID'].src,
      options: ['FOLD', 'CALL', 'JAM'],
      note: 'Vereinfacht: nach dem Squeeze ist es heads-up. Bleibt der Caller drin, wird ein Call noch schlechter.'
    };
  }

  /** Er öffnet, du bist dahinter mit kurzem Stack: Reshove oder Fold. */
  function reshove(o) {
    const op = 2.0;
    const posted = o.heroPos === 'SB' ? 0.5 : o.heroPos === 'BB' ? 1 : 0;
    return {
      kind: 'ev', hero: o.hero, board: '', preflop: true, ip: !BLINDS.includes(o.heroPos), heroPos: o.heroPos, villPos: o.villPos,
      text: `${o.villPos} öffnet auf ${op}bb (${o.villStack}bb Stack). Alle folden zu dir in ${o.heroPos} mit ${o.stack}bb.`,
      pot: +(op + 1.5 + 1).toFixed(2), toCall: +(op - posted).toFixed(2),
      heroBehind: +(o.stack - posted).toFixed(2), villBehind: +(o.villStack - op).toFixed(2),
      villRange: P.adjustForStack(P.RFI[o.villPos], 'short'), villSrc: `ranges.js RFI.${o.villPos} (Stackband 20–35bb)`,
      callRange: rng('OPEN_CALLS_JAM'), callSrc: R.OPEN_CALLS_JAM.src,
      callRangeAlt: rng('OPEN_CALLS_JAM_WIDE'), callSrcAlt: R.OPEN_CALLS_JAM_WIDE.src,
      options: ['FOLD', 'JAM'],
      note: 'Vereinfacht: Spieler hinter dir (z. B. der BB) wachen nicht auf.'
    };
  }

  /* ---------------- Fragengeneratoren ---------------- */
  const SUITS = 'cdhs';
  function withSuits(hc, r) {
    const a = hc[0], b = hc[1];
    const s1 = SUITS[Math.floor(r() * 4)];
    if (hc.length === 2 || hc[2] === 'o') {
      let s2; do { s2 = SUITS[Math.floor(r() * 4)]; } while (s2 === s1);
      return a + s1 + b + s2;
    }
    return a + s1 + b + s1;
  }
  const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

  /** Gehört die Hand in die Open-Range? (aus ranges.js, Stackband) */
  function openQuestion(o, r) {
    const pos = pick(o.positions, r), band = o.band || 'mid';
    const range = P.parseRange(P.adjustForStack(P.RFI[pos], band));
    const inR = new Set(range.map(x => P.handClassOf(x.c)));
    // Hälfte aus der Range, Hälfte knapp daneben — sonst wäre "Fold" fast immer richtig.
    const all = []; for (let i = 12; i >= 0; i--) for (let j = 12; j >= 0; j--) {
      const R_ = P.RANKS; all.push(i === j ? R_[i] + R_[j] : i > j ? R_[i] + R_[j] + 's' : R_[j] + R_[i] + 'o');
    }
    const near = all.filter(h => !inR.has(h) && (h.includes('A') || h.includes('K') || h[2] === 's' || h.length === 2));
    const hc = r() < 0.5 ? pick([...inR], r) : pick(near, r);
    return {
      kind: 'open', hc, pos, band, answer: inR.has(hc) ? 'OPEN' : 'FOLD',
      text: `Alle folden zu dir in ${pos} (${P.STACKS[band].label}). Du hast ${hc}. Öffnen?`,
      options: ['FOLD', 'OPEN'], range: P.adjustForStack(P.RFI[pos], band)
    };
  }

  /* ---------------- Block 1: Preflop gegen Aggression ---------------- */
  /* Hände aus deinen Reviews plus Hände, die man klar foldet — sonst wäre
     "Call" fast immer die Antwort. */
  const H3 = ['A7o', 'AJo', 'KQo', 'QJs', 'KJo', 'ATo', 'JTo', '77', '99', 'TT', 'AQo', 'A5s', 'KQs', 'JJ',
    'A9o', 'KTo', 'QTo', 'K9s', 'A4o', '55', 'J9s', 'T9o', 'Q9o', '66'];
  const gen3betEarly = r => vs3bet({ hero: withSuits(pick(H3, r), r), heroPos: pick(['EP', 'MP'], r), villPos: pick(['CO', 'BTN'], r), stack: pick([40, 50, 60], r), range: 'IP3_vs_early', mult: pick([3, 3.5, 4], r) });
  const gen3betCO = r => vs3bet({ hero: withSuits(pick(H3, r), r), heroPos: 'CO', villPos: 'BTN', stack: pick([40, 50, 60], r), range: 'BTN3_vs_CO', mult: pick([3, 3.5, 4], r) });
  const gen3betBlind = r => {
    const hp = pick(['CO', 'BTN'], r);
    return vs3bet({ hero: withSuits(pick(H3.concat(['K9s', 'Q9s', 'A8o', '66', 'K8o', 'J8s', 'T7s']), r), r), heroPos: hp, villPos: 'BB', stack: pick([40, 50], r), range: hp === 'BTN' ? 'BB3_vs_BTN' : 'BB3_vs_CO', mult: pick([4, 4.5, 5], r) });
  };
  const gen3betShort = r => vs3bet({ hero: withSuits(pick(H3, r), r), heroPos: pick(['MP', 'CO'], r), villPos: 'BTN', stack: pick([22, 25, 28], r), range: 'IP3_vs_early', call: 'CALL_JAM_MID', mult: pick([3, 3.5], r) });
  const genSqueeze = r => vsSqueeze({ hero: withSuits(pick(['AJo', 'JTo', 'KQo', 'A9s', '88', 'TT', 'AQo', 'KJs', '66'], r), r), heroPos: pick(['CO', 'BTN'], r), caller: 'SB', stack: pick([30, 45, 60], r) });
  /* Reshove: Hände von klar (A9o, 66) bis klar zu schwach (Q8o, J6s, 32s) —
     erste Prüfung hatte nur starke Hände, da war "All-in" immer richtig. */
  const RESHOVE_HANDS = ['A9o', 'A7s', 'KJo', 'K9s', '66', '55', 'QTs', 'A5o', 'K8s', 'JTs', '44', 'A3s',
    'K5o', 'Q8o', 'J7s', '86s', 'A2o', 'K4s', 'Q9o', 'T8s', '33', '22', 'J9o', '75s', 'Q6s', 'K7o'];
  const genReshoveBTN = r => {
    const villPos = pick(['CO', 'BTN'], r);
    const heroPos = pick(villPos === 'CO' ? ['BTN', 'SB', 'BB'] : ['SB', 'BB'], r);
    return reshove({ hero: withSuits(pick(RESHOVE_HANDS, r), r), heroPos, villPos, stack: pick([15, 18, 20, 22, 25, 30], r), villStack: 40 });
  };
  const genOpen = (positions, band) => r => openQuestion({ positions, band }, r);

  const B1 = {
    n: 1, title: 'Preflop gegen Aggression', from: '2026-11-16', to: '2026-12-04',
    why: 'Calls gegen 3-Bets, Squeezes und Shoves waren im Gesamt-Review vom 11.10. die Kategorie 4 (**−205bb**) — und tauchten danach in fast jeder Session wieder auf (A7o, AJo, KQo, KJo, QJs, JTo). Preflop-Fehler sind die billigsten zu beheben: dieselbe Entscheidung kommt jeden Abend mehrfach.',
    leaks: ['Calls gegen 3-Bet/Squeeze/Shove', 'SB-Flats', 'Cold-Calls aus früher Position']
  };

  /* Jede Einheit: Lektion (kurz, eine Kernaussage), Beispielspot (gerechnet),
     Fragen (Generatoren), Aufträge (Sprünge), Ziel. */
  const UNITS = [
    {
      id: 'b1-01', block: 1, title: 'Was kostet ein Call gegen die 3-Bet?',
      lesson: [
        'Willkommen. Heute zuerst eine **Baseline**: beantworte die Fragen ehrlich, ohne nachzuschlagen — sie zeigen, wo du startest.',
        'Gegen eine 3-Bet entscheiden drei Dinge: der **Preis** (wie groß die 3-Bet ist), deine **Equity** gegen seine Range und wie viel davon du **realisierst** — ohne Position im Schnitt etwa 90 %, mit dominierten Händen (AJo gegen AQ/AK, KQo gegen AK/KK) deutlich weniger.',
        'Ehrlich zu deinen Händen: Gegen eine **kleine** 3-Bet (3× dein Open) ist ein Call mit vielen Händen nach dieser Rechnung **kein klarer Fehler** — das hatte schon der Hand-Check vom 28.10. für JTo, KJo und QJs gezeigt. Teuer wird es bei **großen** 3-Bets, bei **kurzen** Stacks (dann All-in statt Call, Einheit 3) und **nach** dem Call: bei A7o am 15.11. kostete die Flop-Bet mit zweitem Paar die 20bb, nicht der Call.',
        'Darum wechselt die 3-Bet-Größe in den Fragen. Gefragt wird nur, was auch bei schlechter Realisierung (75 %) dieselbe Antwort hat — Grenzfälle werden neu gewürfelt.'
      ],
      example: () => vs3bet({ hero: 'Ac7d', heroPos: 'MP', villPos: 'CO', stack: 50, range: 'IP3_vs_early', mult: 4 }),
      quiz: { n: 6, gens: [gen3betEarly, gen3betCO].map(robust) },
      tasks: [
        { t: 'Wiederholung: fällige Fehler im Trainer abarbeiten (⟳ oben).', min: 5 },
        { t: 'Preflop-Drill (Tab *Range*), gemischt — so viele Fragen, wie in 15 Minuten gehen.', min: 15, jump: { preflop: 'mix' } },
        { t: 'Stack-off-Check im Tab *Rechnen*: die beiden 3-Bet-Spots (JTo, KJo, QJs) durchgehen und die EV-Tabelle lesen.', min: 10, jump: { view: 'rechnen' } },
        { t: 'Im Hand-Logbuch eine Hand aus den letzten Sessions suchen, in der du eine 3-Bet gecallt hast, und notieren.', min: 5, jump: { url: 'http://127.0.0.1:8139' } }
      ],
      target: 'In den Fragen mindestens 4 von 6 richtig. Viel wichtiger: bei jeder falschen Antwort verstehen, ob es an der Equity oder an der Realisierung lag.'
    },
    {
      id: 'b1-02', block: 1, title: 'Position: warum 35 % Equity nicht reichen',
      lesson: [
        'Gestern hast du gesehen: gegen eine 3-Bet zu callen braucht grob ein Drittel Equity. **Ohne Position reicht auch das nicht**, weil du die Equity nicht ausspielst — du checkst, er bettet, du foldest mit der Hand, die am River vorne gewesen wäre.',
        'Mit Position (wenn **er** aus den Blinds 3-bettet) sieht es anders aus: du realisierst mehr, und seine Range ist breiter. Deshalb sind dieselben Hände **am BTN gegen den BB** oft ein Call, **aus MP gegen den BTN** ein Fold.',
        'Vergleiche heute bewusst: gleiche Hand, anderer Spot.'
      ],
      example: () => vs3bet({ hero: 'Kh9h', heroPos: 'BTN', villPos: 'BB', stack: 50, range: 'BB3_vs_BTN' }),
      quiz: { n: 8, gens: [gen3betBlind, gen3betEarly].map(robust) },
      tasks: [
        { t: 'Wiederholung.', min: 5 },
        { t: 'Preflop-Drill (Tab *Range*).', min: 15, jump: { preflop: 'mix' } },
        { t: 'Trainer: 3-Bet-Pots (Tag 3BP), Stack 40–60bb, 10 Hände. Achte darauf, wer die Position hat.', min: 10, jump: { drill: { stacks: ['mid'], tags: ['3BP'], autoHint: false, profile: 'reg', multi: true } } },
        { t: 'Im Tab *Verlauf*: BB 3-bettet gegen deinen BTN-Open, du callst. Fünf Flops im Rate-Modus.', min: 5, jump: { verlauf: { heroPos: 'BTN', villPos: 'BB', line: 'hOpen_v3b', band: 'mid', quiz: true, solverFlop: true } } }
      ],
      target: 'Du kannst ohne nachzuschlagen sagen, warum KJo am BTN gegen den BB anders ist als KJo aus MP gegen den BTN.'
    },
    {
      id: 'b1-03', block: 1, title: '4-Bet-All-in statt Call bei 20–30bb',
      lesson: [
        'Mit 20–30bb ist Callen gegen eine 3-Bet meistens die **schlechteste** der drei Optionen: du zahlst ein Drittel deines Stacks, um ohne Position mit zu wenig Spielraum auf den Flop zu gehen.',
        'Der All-in hat zwei Vorteile: **Fold Equity** (er muss alles außer seinen besten Händen weglegen) und du **realisierst 100 %** deiner Equity, wenn er callt. Deshalb ist die Frage bei kurzen Stacks fast immer **All-in oder Fold**, kaum Call.',
        'Das war auch das Ergebnis bei JTo und KJo im Hand-Check (Tab *Rechnen*).'
      ],
      example: () => vs3bet({ hero: 'AhJc', heroPos: 'CO', villPos: 'BTN', stack: 25, range: 'IP3_vs_early', call: 'CALL_JAM_MID' }),
      quiz: { n: 8, gens: [gen3betShort].map(robust) },
      tasks: [
        { t: 'Wiederholung.', min: 5 },
        { t: 'Preflop-Drill (Tab *Range*).', min: 15, jump: { preflop: 'mix' } },
        { t: 'Stack-off-Check: alle sieben Spots einmal durch, beide Gegnertypen vergleichen.', min: 10, jump: { view: 'rechnen' } },
        { t: 'Trainer: Stackband 20–35bb, alle Spot-Typen, 8 Hände.', min: 5, jump: { drill: { stacks: ['short'], tags: ['SRP', 'DEF', '3BP', 'BvB'], autoHint: false, profile: 'reg', multi: true } } }
      ],
      target: 'Bei 20–30bb gegen eine 3-Bet antwortest du in den Fragen nie mit „Call“, ohne es begründen zu können.'
    },
    {
      id: 'b1-04', block: 1, title: 'Squeeze: zwei Gegner, eine Entscheidung',
      lesson: [
        'Ein Squeeze (3-Bet nach Open **und** Call) ist stärker als eine normale 3-Bet: er muss gegen zwei Ranges bestehen. Und du stehst schlechter da als gegen eine 3-Bet, weil hinter dir noch der Caller sitzt.',
        'Deine Leaks hier: JTo bei 100bb und AJo bei 47bb gegen Squeezes gecallt (28.10.). Die Rechnung trennt sauber: **Paare und starke Broadways** (88+, AQ) callen in Position gegen einen Squeeze aus dem BB oft profitabel, **dominierte Offsuit-Hände** wie JTo oder KJo nicht — sie treffen selten und wenn, oft das Zweitbeste.',
        'Die Squeeze-Range in den Fragen ist eine Annahme (enger als eine 3-Bet); sie steht bei jeder Frage dabei.'
      ],
      example: () => vsSqueeze({ hero: 'JdTc', heroPos: 'BTN', caller: 'SB', stack: 60 }),
      quiz: { n: 8, gens: [genSqueeze].map(robust) },
      tasks: [
        { t: 'Wiederholung.', min: 5 },
        { t: 'Preflop-Drill (Tab *Range*), nur „gegen ein Open“.', min: 15, jump: { preflop: 'vs' } },
        { t: 'Trainer: Mehrweg-Spots (Tag MW), 40–60bb, 10 Hände — Mehrweg-Pots sind die Folge von zu vielen Calls.', min: 10, jump: { drill: { stacks: ['mid'], tags: ['MW'], autoHint: false, profile: 'mix', multi: true } } },
        { t: 'Eine eigene Squeeze-Situation aus dem Hand-Logbuch heraussuchen und mit einem Satz kommentieren.', min: 5, jump: { url: 'http://127.0.0.1:8139' } }
      ],
      target: 'Du nennst die drei Hände aus den Fragen, bei denen du am meisten danebenlagst, und warum.'
    },
    {
      id: 'b1-05', block: 1, title: 'Wochenreview 1 und erster Coach-Termin',
      lesson: [
        'Keine neue Theorie. Heute schaust du zurück: Welche Fragen hast du diese Woche falsch beantwortet, und gibt es ein Muster (immer zu viele Calls? immer in Position zu eng?).',
        'Danach den **Coach-Bericht** unten herunterladen und in Claude Code `/coach` aufrufen. Ich lese den Bericht und deine neuen Hände und passe den Plan an.'
      ],
      example: null,
      quiz: { n: 8, gens: [gen3betEarly, gen3betCO, gen3betBlind, gen3betShort, genSqueeze].map(robust) },
      tasks: [
        { t: 'Wiederholung — alles Fällige.', min: 5 },
        { t: 'Preflop-Drill (Tab *Range*).', min: 15, jump: { preflop: 'mix' } },
        { t: 'Gemischte Fragen oben (alle Spot-Typen dieser Woche).', min: 10 },
        { t: 'Coach-Bericht herunterladen, `/coach` in Claude Code aufrufen.', min: 25, coach: true }
      ],
      target: 'Gemischte Fragen: mindestens 6 von 8. Der Coach-Termin hat stattgefunden.'
    },
    {
      id: 'b1-06', block: 1, title: 'Small Blind: 3-Bet oder Fold',
      lesson: [
        'Aus dem SB hat der Trainer bewusst **keine Flat-Range** — nur 3-Bet oder Fold (ranges.js SB_vs_BTN). Der Grund: wer im SB callt, spielt ohne Position gegen den Opener **und** lässt den BB billig dazukommen oder squeezen.',
        'Ehrlich zu deinen Zahlen: Am 08.10. waren deine 15 SB-Flats netto +23,9bb — kein Geldverlust in dieser Stichprobe. Die Kritik danach (K7o, 33, K8s, T6s, A8o, T8o) betraf vor allem die **Hände**, die du flattest, und die schwierigen Spots danach.',
        'Bei kurzen Stacks wird aus der 3-Bet ein **Reshove** — das übst du morgen im Tab *Range*, der mit ICM rechnet. Die Fragen heute sind die Grundlage davor: welche Hände du aus dem SB überhaupt **öffnest**, wenn alle zu dir folden (Open-Range SB aus ranges.js, 20–35bb und 40–60bb).'
      ],
      example: () => reshove({ hero: 'Kh8h', heroPos: 'SB', villPos: 'BTN', stack: 20, villStack: 40 }),
      quiz: { n: 10, gens: [genOpen(['SB'], 'mid'), genOpen(['SB'], 'short')].map(robust) },
      tasks: [
        { t: 'Wiederholung.', min: 5 },
        { t: 'Preflop-Drill (Tab *Range*), nur „gegen ein Open“ — achte auf jede Frage aus dem SB.', min: 15, jump: { preflop: 'vs' } },
        { t: 'Trainer: Blind vs Blind (Tag BvB), 20–60bb, 10 Hände.', min: 10, jump: { drill: { stacks: ['short', 'mid'], tags: ['BvB'], autoHint: false, profile: 'reg', multi: true } } },
        { t: 'Range-Designer (Tab *Range*): dein Stack 15bb, „Früh im Turnier“ — welche Hände shovst du aus dem SB?', min: 5, jump: { view: 'range' } }
      ],
      target: 'Du kannst für 20bb im SB gegen einen BTN-Open fünf Hände nennen, die du shovst, und fünf, die du foldest.'
    },
    {
      id: 'b1-07', block: 1, title: 'Reshove 15–25bb gegen Opens',
      lesson: [
        'Gegen einen Open vom CO oder BTN ist ein All-in mit 15–25bb eine der profitabelsten Waffen im Turnier: der Opener hat eine **breite** Range und muss mit fast allem folden.',
        'Entscheidend sind zwei Zahlen: **wie oft er foldet** (je breiter sein Open, desto öfter) und **wie viel Equity du hast, wenn er callt**. Darum sind A5s oder K9s oft bessere Reshoves als ein dominierter Broadway wie QJo.',
        'Ehrlich zur Rechnung: Ein einfaches Chip-Modell (wie im Beispiel unten) sagt bei 15–25bb fast immer All-in — es kennt die Spieler hinter dir und ICM nicht und hängt stark daran, wie weit er callt (unten zwei Varianten). Deshalb übst du Reshoves heute mit den Werkzeugen im Tab *Range*, die Feld und Auszahlung mitrechnen, statt mit eigenen Fragen.'
      ],
      example: () => reshove({ hero: 'As5s', heroPos: 'BTN', villPos: 'CO', stack: 22, villStack: 40 }),
      quiz: null,
      tasks: [
        { t: 'Wiederholung.', min: 5 },
        { t: 'Preflop-Drill (Tab *Range*).', min: 15, jump: { preflop: 'mix' } },
        { t: 'Range-Designer (Tab *Range*): die Presets „Früh im Turnier“ und „Bubble, andere sind kürzer“ bei 15 und 20bb rechnen und vergleichen.', min: 10, jump: { view: 'range' } },
        { t: 'Shove-Call-Trainer (Tab *Range*): 10 Fragen.', min: 5, jump: { view: 'range' } },
        { t: 'Trainer: 12–20bb, alle Spot-Typen, 10 Hände.', min: 15, jump: { drill: { stacks: ['push'], tags: ['SRP', 'DEF', '3BP', 'BvB'], autoHint: false, profile: 'reg', multi: true } } }
      ],
      target: 'Shove-Call-Trainer über 75 %, und du kannst sagen, warum dieselbe Hand im Range-Designer an der Bubble anders ausgeht als früh im Turnier.'
    },
    {
      id: 'b1-08', block: 1, title: 'Shoves callen: der Preis zählt, nicht das Gefühl',
      lesson: [
        'Callen gegen einen All-in ist die teuerste Entscheidung im Turnier — und die, bei der du in den Reviews am häufigsten zu weit warst (AJo gegen einen 4-Bet-Jam am 06.11., AQs gegen 3-Bet-Jam + Cold-Shove am 12.10.).',
        'Die Rechnung ist einfach und kalt: **Equity gegen seine Shove-Range** gegen **Pot Odds**. Keine Realisierung, kein „ich spüre einen Bluff“. Unter ICM (Block 4) wird es noch enger.',
        'Heute nur der Shove-Call-Trainer — er rechnet genau das, mit Feld und Stacks.'
      ],
      example: null,
      quiz: { n: 6, gens: [gen3betShort].map(robust) },
      tasks: [
        { t: 'Wiederholung.', min: 5 },
        { t: 'Preflop-Drill (Tab *Range*).', min: 15, jump: { preflop: 'mix' } },
        { t: 'Shove-Call-Trainer im Tab *Range*: 15 Fragen, Auszahlung „Turnier“.', min: 15, jump: { view: 'range' } },
        { t: 'Deine teuerste Call-Entscheidung gegen einen All-in aus den letzten Sessions im Hand-Logbuch suchen und nachrechnen: Equity gegen welche Range, welcher Preis?', min: 10, jump: { url: 'http://127.0.0.1:8139' } }
      ],
      target: 'Shove-Call-Trainer über 80 %.'
    },
    {
      id: 'b1-09', block: 1, title: 'Overcalls, Iso-Raises und Bounty-Limps',
      lesson: [
        'Zwei Muster aus deinen Reviews: der **Overcall** hinter einem kurzen All-in (K8s gegen einen 5bb-Shove, 28.10.) und der **Limp, um den Bounty eines Shortys zu holen** (23.10.: in keiner der drei Hände kam der Shorty in den Pot, zusammen −12bb).',
        'In beiden Fällen ist die stärkere Linie dieselbe: **isolieren** — All-in oder deutlich raisen, damit du allein gegen den Shorty bist. Ein Limp lädt alle anderen ein und gibt dem Shorty die Wahl.',
        'Bounty-Mathe kommt ausführlich in Block 4. Heute reicht die Regel: **Gegen einen Shorty raisen oder folden, nicht limpen.**'
      ],
      example: () => reshove({ hero: 'Ks8s', heroPos: 'BTN', villPos: 'CO', stack: 25, villStack: 40 }),
      quiz: { n: 8, gens: [gen3betShort].map(robust) },
      tasks: [
        { t: 'Wiederholung.', min: 5 },
        { t: 'Preflop-Drill (Tab *Range*), nur „gegen ein Open“.', min: 15, jump: { preflop: 'vs' } },
        { t: 'Trainer: Mehrweg (Tag MW), 20–35bb, 10 Hände.', min: 10, jump: { drill: { stacks: ['short'], tags: ['MW'], autoHint: false, profile: 'mix', multi: true } } },
        { t: 'Prozess-Tab lesen: „Wer sitzt da?“ (Isolieren gegen Recreationals) und „Mit jedem zusätzlichen Gegner stirbt zuerst der Bluff“.', min: 5, jump: { view: 'prozess' } }
      ],
      target: 'Du formulierst deine Regel für Shortys mit Bounty in einem Satz und schreibst sie in den Check-in.'
    },
    {
      id: 'b1-10', block: 1, title: 'Wochenreview 2',
      lesson: [
        'Rückblick auf die Blinds-Woche. Zwei Fragen an dich: Bei welchem Stack kippt für dich die Entscheidung von 3-Bet/Fold zu All-in/Fold? Und welche Hand hat dich diese Woche am meisten überrascht?',
        'Danach Coach-Bericht und `/coach`.'
      ],
      example: null,
      quiz: { n: 10, gens: [gen3betShort, genSqueeze, gen3betBlind, genOpen(['SB', 'BTN'], 'mid')].map(robust) },
      tasks: [
        { t: 'Wiederholung — alles Fällige.', min: 5 },
        { t: 'Preflop-Drill (Tab *Range*).', min: 15, jump: { preflop: 'mix' } },
        { t: 'Gemischte Fragen oben.', min: 10 },
        { t: 'Coach-Bericht herunterladen, `/coach` aufrufen.', min: 25, coach: true }
      ],
      target: 'Gemischte Fragen: mindestens 7 von 10.'
    },
    {
      id: 'b1-11', block: 1, title: 'Open-Ranges nach Position',
      lesson: [
        'Ein großer Teil der Calls gegen 3-Bets beginnt eine Aktion früher: mit einem **zu weiten Open** aus früher Position (K6s UTG, A7o/A8o/K8s aus UTG+1, QTo UTG am Peak).',
        'Je früher die Position, desto mehr Spieler kommen nach dir, und desto wahrscheinlicher ist eine 3-Bet. Die Open-Range wird deshalb von Position zu Position **breiter** — nicht linear, sondern am BTN sprunghaft.',
        'Die Fragen heute kommen direkt aus den Open-Ranges des Trainers (Stackband 40–60bb).'
      ],
      example: null,
      quiz: { n: 15, gens: [genOpen(['EP', 'MP'], 'mid'), genOpen(['CO', 'BTN', 'SB'], 'mid')].map(robust) },
      tasks: [
        { t: 'Wiederholung.', min: 5 },
        { t: 'Preflop-Drill (Tab *Range*), nur „Erster im Pot“.', min: 15, jump: { preflop: 'open' } },
        { t: 'Steckbrief-Tab (*Hände*): A8o, K8s, QTo, A5s ansehen — in welcher Position wird jede zur Open-Hand?', min: 10, jump: { view: 'haende' } },
        { t: 'Trainer: alle Spot-Typen 40–60bb, 8 Hände.', min: 5, jump: { drill: { stacks: ['mid'], tags: ['SRP', 'DEF', '3BP', 'BvB'], autoHint: false, profile: 'reg', multi: true } } }
      ],
      target: 'Mindestens 12 von 15 Open-Fragen richtig.'
    },
    {
      id: 'b1-12', block: 1, title: 'Cold-Calls: wann flatten in Position',
      lesson: [
        'Ein Cold-Call (jemand öffnet, du callst ohne vorher im Pot zu sein) ist nur in **Position** und mit Händen sinnvoll, die nicht dominiert werden: Paare, suited Broadways, suited Connectors. Der Trainer hat dafür eigene Ranges (ranges.js IP_FLAT, z. B. BTN gegen CO).',
        'Deine Ausreißer: ATo aus dem LJ, K9o am BTN gegen EP, 75s aus UTG+1. Offsuit-Hände mit schwachem Kicker sind die klassischen Dominierten.',
        'Heute vergleichst du im Tab *Verlauf*, wie eine Cold-Call-Range am Flop aussieht — sie ist **gecappt** (keine AA/KK), und genau das nutzt der Gegner aus.'
      ],
      example: null,
      quiz: { n: 10, gens: [genOpen(['CO', 'BTN'], 'mid'), gen3betCO].map(robust) },
      tasks: [
        { t: 'Wiederholung.', min: 5 },
        { t: 'Preflop-Drill (Tab *Range*), nur „gegen ein Open“.', min: 15, jump: { preflop: 'vs' } },
        { t: 'Verlauf: CO öffnet, du callst am BTN — drei Solver-Flops im Rate-Modus.', min: 10, jump: { verlauf: { heroPos: 'BTN', villPos: 'CO', line: 'vOpen_hCall', band: 'mid', quiz: true, solverFlop: true } } },
        { t: 'Trainer: CO öffnet, BTN callt (Defense in Position), 5 Hände.', min: 5, jump: { drill: { stacks: ['mid'], tags: ['DEF'], autoHint: false, profile: 'reg', multi: true } } }
      ],
      target: 'Rate-Modus: im Schnitt höchstens 15 Punkte daneben.'
    },
    {
      id: 'b1-13', block: 1, title: 'Alles gemischt',
      lesson: [
        'Heute kommt alles aus Block 1 durcheinander — so wie am Tisch. Erst lesen, dann **in einem Satz** begründen, bevor du klickst: Position, Stack, Range des Gegners.'
      ],
      example: null,
      quiz: { n: 15, gens: [gen3betEarly, gen3betCO, gen3betBlind, gen3betShort, genSqueeze, genOpen(['EP', 'MP', 'CO', 'BTN'], 'mid')].map(robust) },
      tasks: [
        { t: 'Wiederholung.', min: 5 },
        { t: 'Preflop-Drill (Tab *Range*).', min: 15, jump: { preflop: 'mix' } },
        { t: 'Gemischte Fragen oben.', min: 15 },
        { t: 'Trainer gemischt, 40–60bb, 10 Hände.', min: 10, jump: { drill: { stacks: ['short', 'mid'], tags: ['SRP', 'DEF', '3BP', 'BvB'], autoHint: false, profile: 'mix', multi: true } } }
      ],
      target: 'Mindestens 11 von 15.'
    },
    {
      id: 'b1-14', block: 1, title: 'Block-Test',
      lesson: [
        '20 Fragen über alle Themen von Block 1. Kein Nachschlagen, kein Zurückgehen. Das Ergebnis geht in den Coach-Bericht und entscheidet, ob Block 2 direkt startet oder ob es eine Zusatzwoche gibt.'
      ],
      example: null,
      quiz: { n: 20, test: true, gens: [gen3betEarly, gen3betCO, gen3betBlind, gen3betShort, genSqueeze, genOpen(['EP', 'MP', 'CO', 'BTN', 'SB'], 'mid')].map(robust) },
      tasks: [
        { t: 'Preflop-Drill (Tab *Range*), kurz — der Test ist heute wichtiger.', min: 10, jump: { preflop: 'mix' } },
        { t: 'Block-Test oben (20 Fragen).', min: 35 }
      ],
      target: 'Bestanden ab 16 von 20 (80 %).'
    },
    {
      id: 'b1-15', block: 1, title: 'Block-Review mit dem Coach',
      lesson: [
        'Ende von Block 1. Heute kein Drill, sondern Rückschau: Coach-Bericht herunterladen, `/coach` aufrufen. Ich vergleiche deine Ergebnisse mit der Baseline vom ersten Tag, sehe mir deine Hände der letzten drei Wochen an und schreibe Block 2 (Flop mit der Solver-Bibliothek) passend dazu.'
      ],
      example: null,
      quiz: null,
      tasks: [
        { t: 'Wiederholung — alles Fällige.', min: 5 },
        { t: 'Preflop-Drill (Tab *Range*) — danach die Preflop-Auswertung neu bauen: `node tools/preflop/preflop-report.js`.', min: 15, jump: { preflop: 'mix' } },
        { t: 'Coach-Bericht herunterladen, `/coach` aufrufen, Block-Review.', min: 40, coach: true }
      ],
      target: 'Block 2 ist freigeschaltet.'
    }
  ];

  /* Die späteren Blöcke — Gerüst; Einheiten schreibt der Coach nach dem
     jeweiligen Block-Review. */
  const BLOCKS = [
    B1,
    { n: 2, title: 'Flop mit der Solver-Bibliothek', from: '2026-12-07', to: '2026-12-31', why: 'Wer bettet wie oft womit — 5 Spots × 6 Board-Familien, Rate-Modus gegen Solver-Lösungen. Gegen den Leak „Bets in die Range des Callers“. Weihnachtswoche leichter.', leaks: ['Bets in Caller-Range'] },
    { n: 3, title: 'Turn & River: Call-downs und Stack-Bluffs', from: '2027-01-04', to: '2027-01-22', why: 'Ein Paar gegen Bets ≥ 40 % Pot (1 von 10 gewonnen), Bluffs, die mehr als den halben Stack riskieren (−327bb).', leaks: ['Call-down mit einem Paar', 'Stack-Bluffs'] },
    { n: 4, title: 'ICM, Bubble, Finaltisch, Bounties', from: '2027-01-25', to: '2027-02-12', why: 'Bust-Entscheidungen unter ICM, Bounty-Mathe für Mystery Bounties, Satellites.', leaks: ['Calls unter ICM', 'Bounty-Limps'] },
    { n: 5, title: 'Mischen, Gegnertypen, Tilt', from: '2027-02-15', to: '2027-02-28', why: 'Alles gemischt, Anpassung an Gegnertypen, Session-Regeln, Abschluss-Review gegen die Oktober-Baseline.', leaks: ['Re-Entry-Tilt'] }
  ];

  /* ---------------- Fortschritt ---------------- */
  function load() {
    try { return Object.assign({ units: {}, created: Date.now() }, JSON.parse(localStorage.getItem(STORE) || '{}')); }
    catch (e) { return { units: {}, created: Date.now() }; }
  }
  function save(st) { try { localStorage.setItem(STORE, JSON.stringify(st)); } catch (e) { /* voll/gesperrt */ } }
  function unitState(st, id) { return st.units[id] || (st.units[id] = {}); }

  /** Geplantes Datum der Einheit k (0-basiert): Mo–Fr ab START. */
  const DAY = 86400000;
  function toUTC(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function plannedDate(k) { return new Date(toUTC(START) + (Math.floor(k / 5) * 7 + (k % 5)) * DAY).toISOString().slice(0, 10); }
  function fmt(iso) { const [, m, d] = iso.split('-'); return `${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(toUTC(iso)).getUTCDay()]} ${d}.${m}.`; }
  function todayIso() { const t = new Date(); return new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())).toISOString().slice(0, 10); }

  /** Nächste offene Einheit (Kurs läuft nach Erledigung, nicht nach Datum). */
  function currentIndex(st) {
    const i = UNITS.findIndex(u => !(st.units[u.id] && st.units[u.id].done));
    return i < 0 ? UNITS.length : i;
  }

  /* ---------------- Rechnen und Robustheit ----------------
     Das Modell aus stackoff.js realisiert ohne Position pauschal 90 % der
     Equity. Für dominierte Hände ist das zu freundlich — mit 90 % kam z. B.
     A7o gegen eine BTN-3-Bet als "Call" heraus, genau die Hand aus deinem
     Review. Gefragt wird deshalb nur, was auch bei schlechterer Realisierung
     (OOP 75 %, IP 90 %) dieselbe beste Antwort hat und mindestens
     TOLERANZ vor der zweitbesten liegt. Grenzfälle werden neu gewürfelt,
     statt als sichere Antwort verkauft zu werden. */
  const SIMS = 12000;
  const LOW = { OOP: 0.75, IP: 0.90 };
  function solve(q) {
    if (q.a) return q.a;
    const a = P.StackOff.analyse(q, 'reg', { sims: SIMS });
    const low = q.ip ? LOW.IP : LOW.OOP;
    const evsLow = Object.assign({}, a.evs);
    if ('CALL' in evsLow) evsLow.CALL = a.eqGesamt * low * (q.pot + q.toCall) - q.toCall;
    const order = e => Object.keys(e).sort((x, y) => e[y] - e[x]);
    const T = P.StackOff.TOLERANZ;
    a.low = low; a.evsLow = evsLow;
    const sets = [a.evs, evsLow];
    // Zweite Call-Range für den All-in (Reshove-Fragen): nur der JAM-Wert ändert sich.
    if (q.callRangeAlt && 'JAM' in a.evs) {
      const alt = P.StackOff.analyse(Object.assign({}, q, { callRange: q.callRangeAlt }), 'reg', { sims: SIMS });
      a.jamAlt = alt.evs.JAM; a.callAnteilAlt = alt.callAnteil; a.eqGegenCallerAlt = alt.eqGegenCaller;
      sets.push(Object.assign({}, a.evs, { JAM: alt.evs.JAM }));
    }
    const firsts = sets.map(e => order(e));
    a.robust = firsts.every(o => o[0] === firsts[0][0]) && sets.every((e, i) => e[firsts[i][0]] - e[firsts[i][1]] > T);
    q.a = a;
    return a;
  }
  /** Generator, der nur robuste Fragen liefert (höchstens 8 Versuche). */
  function robust(gen) {
    return r => {
      let q;
      for (let i = 0; i < 8; i++) {
        q = gen(r);
        if (q.kind !== 'ev' || solve(q).robust) return q;
      }
      q.borderline = true;
      return q;
    };
  }

  /** Bewertung einer Antwort. EV-Fragen: richtig, wenn höchstens TOLERANZ hinter der besten Option. */
  function grade(q, key) {
    if (q.kind === 'open') return { right: key === q.answer, evLoss: 0 };
    const a = solve(q);
    const loss = Math.max(0, a.best.ev - a.evs[key]);
    let right = loss <= P.StackOff.TOLERANZ;
    // Grenzfall (kein robuster Spot gefunden): auch richtig, was bei schlechter Realisierung vorne liegt.
    if (q.borderline && !right) right = Math.max(...Object.values(a.evsLow)) - a.evsLow[key] <= P.StackOff.TOLERANZ;
    return { right, evLoss: loss, a };
  }

  /** Coach-Bericht: alles, was der Coach braucht, ohne dass er die App sieht. */
  function report(st, extra) {
    const units = UNITS.map((u, k) => {
      const s = st.units[u.id] || {};
      return {
        id: u.id, title: u.title, planned: plannedDate(k), started: s.started || null, done: s.done || null,
        quiz: s.quiz || null, note: s.note || '', confidence: s.conf || null, auto: s.auto || null,
        misses: (s.misses || []).slice(-8)
      };
    }).filter(u => u.started || u.done);
    return Object.assign({
      v: 1, generated: new Date().toISOString(), course: { start: START, end: END, current: (UNITS[currentIndex(st)] || {}).id || 'Block 1 fertig' },
      units
    }, extra || {});
  }

  P.Course = {
    START, END, UNITS, BLOCKS, R, plannedDate, currentIndex, grade, report, withSuits, solve, robust, LOW,
    vs3bet, vsSqueeze, reshove, openQuestion, load, save
  };
})();
