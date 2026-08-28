/* =========================================================================
   plan.js — 35-Tage-Trainingsplan bis zum King's Million

   Zieltermin: King's Million European Poker Championship,
   16.09.2026 – 06.10.2026, King's Resort Rozvadov (€10M GTD).
   Planstart 12.08.2026, also genau fünf Wochen à 30 Minuten.

   Der Aufbau folgt drei Befunden, nicht dem Bauchgefühl:

   1. ERST BLOCKEN, DANN MISCHEN. Geblocktes Üben (immer derselbe Spot-Typ)
      lernt schneller, behält aber schlechter. Interleaving (gemischt) ist
      anfangs unangenehmer und gewinnt bei Behalten und Transfer — vor allem
      dort, wo ähnliche Kategorien unterschieden werden müssen. Postflop ist
      zuerst Regelanwendung (der 5-Schritte-Prozess) und danach Unterscheidung
      ("welcher Spot ist das überhaupt?"). Deshalb Woche 1 geblockt, ab
      Woche 3 alles gemischt.

   2. ABRUF STATT WIEDERLESEN. Jede Einheit beginnt mit der fälligen
      Wiederholungsqueue, nicht mit Theorie. Und der Lernmodus geht ab
      Woche 2 aus: selbst schätzen und danach prüfen schlägt vorgesagt
      bekommen, auch wenn es sich schlechter anfühlt.

   3. LIVE ENDET IM PUSH/FOLD. Aus der echten Struktur (unten): 50.000
      Startchips bei BB 300 sind 167bb — sehr tief. Aber ab Level 11 von 19
      ist ein Stack, der nichts gewinnt, unter 20bb. Die letzten neun Level
      von Tag 1 sind Push/Fold. Woche 4 geht komplett dorthin — das Band,
      das im Profil bisher ausgeklammert war.
   ========================================================================= */
(function () {
  const P = window.PT;

  /* Zielturnier: das Super Main Event (€5M GTD), nicht der Festivalstart.
     Das Festival läuft ab 16.09., das Main Event erst ab 30.09. — dadurch
     bleiben zwei Wochen mehr Vorbereitung als zunächst angenommen. */
  const TARGET = {
    name: "King's Million — Super Main Event",
    festival: "King's Million European Poker Championship",
    venue: "King's Resort Rozvadov",
    festivalStart: '2026-09-16', festivalEnd: '2026-10-06',
    start: '2026-09-30', end: '2026-10-06',
    buyIn: 1150, gtd: 5000000, gtdText: '€5.000.000'
  };
  /* Aus Buy-in und Garantie geschätzt: bei rund €1.000 je Eintritt in den
     Pool braucht die Garantie etwa 5.000 Einträge, bezahlt werden davon
     üblicherweise ~15 %. Wird für die Voreinstellung des Range-Designers
     benutzt, nicht für harte Aussagen. */
  const FIELD = { entriesForGtd: 5000, paidShare: 0.15 };
  function estimatedPaid() { return Math.round(FIELD.entriesForGtd * FIELD.paidShare); }

  const PLAN_START = '2026-08-12';
  const DAYS = 49;                       // sieben Wochen bis zum 29.09.

  /* ---------------- Die echte Blindstruktur ----------------
     Vom Spieler geliefert (Tag 1–3). Zwei Dinge daran sind wichtig:

     1. Die Ante entspricht dem Big Blind (BB-Ante). Genau das nimmt das
        ICM-Modell an — totes Geld vor dem Flop = SB + BB + Ante = 2,5bb.
        Level 1 ist die Ausnahme: 100/300 macht 2,33bb.
     2. Der Startstack sind 50.000 bei BB 300, also **167bb**. Damit läuft
        ein Stack, der nichts gewinnt, durch jedes Stackband nach unten —
        die Tabelle zeigt, ab welchem Level welche Phase dran ist.
        (Eine frühere Angabe von 60.000 stammte aus einem Nachrichtenartikel
        und war falsch; maßgeblich ist die Strukturübersicht.)               */
  const START_CHIPS = 50000;
  const DAY1 = [
    [100, 300], [200, 400], [200, 500], [300, 600], [400, 800], [500, 1000],
    [600, 1200], [1000, 1500], [1000, 2000], [1000, 2500], [1500, 3000],
    [2000, 4000], [2000, 5000], [3000, 6000], [4000, 8000], [5000, 10000],
    [6000, 12000], [10000, 15000], [10000, 20000]
  ];
  const DAY2 = [
    [10000, 20000], [10000, 25000], [15000, 30000], [20000, 40000], [25000, 50000],
    [30000, 60000], [40000, 80000], [50000, 100000], [60000, 120000], [100000, 150000]
  ];
  const DAY3 = [
    [100000, 200000], [100000, 250000], [150000, 300000], [200000, 400000],
    [250000, 500000], [300000, 600000], [400000, 800000], [500000, 1000000],
    [600000, 1200000], [1000000, 1500000]
  ];
  const DAY4 = [
    [1000000, 2000000], [1000000, 2500000], [1500000, 3000000], [2000000, 4000000],
    [2500000, 5000000], [3000000, 6000000], [4000000, 8000000], [5000000, 10000000]
  ];
  const DAYS_ALL = [DAY1, DAY2, DAY3, DAY4];
  const LEVELS = [].concat(...DAYS_ALL.map((d, i) =>
    d.map(l => ({ day: i + 1, sb: l[0], bb: l[1], ante: l[1] }))
  )).map((l, i) => Object.assign({ lvl: i + 1 }, l));

  /* Prüft die Struktur auf Lücken. Genau das hat einen echten Fehler
     gefunden: in der ersten Fassung fehlte Tag 3 komplett, wodurch der
     Big Blind von 150.000 auf 2.000.000 sprang (Faktor 13,3). Mit dem
     vollständigen Plan liegt der größte Sprung bei 1,33. */
  /** Stelle(n), an denen die Blinds unplausibel springen. */
  function structureAnomalies() {
    const out = [];
    for (let i = 1; i < LEVELS.length; i++) {
      const f = LEVELS[i].bb / LEVELS[i - 1].bb;
      if (f > 2.2) out.push({ lvl: LEVELS[i].lvl, day: LEVELS[i].day, factor: f, prev: LEVELS[i - 1], cur: LEVELS[i] });
    }
    return out;
  }

  /** Stacktiefe in bb je Level, für einen gegebenen Chipstand. */
  function depthTable(chips) {
    chips = chips || START_CHIPS;
    return LEVELS.map(l => {
      const bb = chips / l.bb;
      return {
        lvl: l.lvl, day: l.day, sb: l.sb, bb: l.bb, ante: l.ante, depth: bb,
        band: bb >= 60 ? 'deep' : bb >= 35 ? 'mid' : bb >= 20 ? 'short' : 'push',
        dead: (l.sb + l.bb + l.ante) / l.bb        // totes Geld in bb
      };
    });
  }
  /** Erstes Level, ab dem ein unveränderter Stack in dieses Band fällt. */
  function firstLevelOf(band, chips) {
    const t = depthTable(chips).find(x => x.band === band);
    return t ? t.lvl : null;
  }

  /* ---------------- Wochen ---------------- */
  const WEEKS = [
    {
      n: 1, title: 'Prozess automatisieren',
      why: 'Geblockt: **immer derselbe Spot-Typ**, damit sich der 5-Schritte-Ablauf einschleift. ' +
        'Der Lernmodus bleibt an — du siehst Board- und Range-Info schon bei der Frage. ' +
        'Das ist bewusst die einfachste Woche: erst die Regel, dann die Schwierigkeit.',
      cfg: { stacks: ['mid'], tags: ['SRP'], autoHint: true, profile: 'reg', multi: true },
      cfgText: 'Nur Single Raised Pots als Aggressor · 40–60bb · Lernmodus AN · Gegner: Reg',
      hands: ['AKo', 'AKs', 'AQo', 'KQs', 'TT', '88', 'A5s', 'KJo'],
      goal: 'Die fünf Schritte laut durchgehen, bevor du klickst. Tempo ist egal.',
      check: 'Du kannst zu jedem Board sagen, ob es statisch oder dynamisch ist, ohne nachzudenken.'
    },
    {
      n: 2, title: 'Lernmodus aus, Defense dazu',
      why: 'Zwei Änderungen: Du schätzt Board-Textur und Range-Advantage jetzt **selbst** und prüfst ' +
        'erst danach — das fühlt sich schlechter an und behält besser. Und Defense kommt dazu, ' +
        'damit du beide Rollen unterscheiden lernst statt nur eine zu beherrschen.',
      cfg: { stacks: ['mid', 'deep'], tags: ['SRP', 'DEF'], autoHint: false, profile: 'reg', multi: true },
      cfgText: 'SRP + Defense · 40–100bb · Lernmodus AUS · Gegner: Reg',
      hands: ['76s', '65s', 'T9s', 'J9s', 'KTo', 'A7o', '44', 'Q9s'],
      goal: 'Equity gegen seine **Bet-Range** rechnen, nicht gegen seine Preflop-Range.',
      check: 'Bei jeder Bet gegen dich kennst du Pot Odds und MDF, bevor du das Feedback aufklappst.'
    },
    {
      n: 3, title: 'Alles gemischt — 3-Bet-Pots und Mehrweg',
      why: 'Jetzt wird interleaved: Jede Hand kann ein anderer Spot-Typ sein. Dein Score wird ' +
        'kurzfristig sinken — genau das ist der Effekt. Du trainierst nicht mehr die Antwort, ' +
        'sondern das **Erkennen der Frage**. 3-Bet-Pots bringen niedrigen SPR dazu, Mehrweg-Pots ' +
        'das Gegenteil von allem, was du bisher gelernt hast: **weniger betten, kaum bluffen.** ' +
        'Am Live-Tisch ist der Dreiwege-Pot der Normalfall, nicht die Ausnahme — im Day-1-Feld ' +
        'wird gelimpt und mitgegangen. Genau deshalb kommt er hier und nicht erst am Ende.',
      cfg: { stacks: ['mid', 'deep'], tags: ['SRP', 'DEF', '3BP', 'BvB', 'MW'], autoHint: false, profile: 'reg', multi: true },
      cfgText: 'Alle Spot-Typen inkl. **Mehrweg** · 40–100bb · Lernmodus AUS · Gegner: Reg',
      hands: ['QQ', 'JJ', 'AQs', 'A5s', 'KQs', '99', 'AJs', 'KJs'],
      goal: 'Vor jeder Bet: „Was mache ich, wenn er raist?" Bei SPR unter 2 entscheidest du **jetzt** über den Stack. Im Mehrweg-Pot vorher zählen, **wie viele** noch drin sind.',
      check: 'Du erkennst in zwei Sekunden, ob du im SRP, im 3-Bet-Pot oder im Dreiwege-Pot bist — und dass im letzten Fall fast alles außer Value in den Check gehört.'
    },
    {
      n: 4, title: 'Kurze Stacks & Push/Fold',
      why: 'Das Band, das du bisher ausgelassen hast — und das, in dem sich das Turnier entscheidet. ' +
        'Das Main Event startet zwar sehr tief (60.000 Chips, 40-Minuten-Level), aber die Blinds ' +
        'holen auf: Unter 20bb gibt es keine drei Straßen mehr, nur noch shove oder nicht. ' +
        'Die Shove-EV-Tabelle im Steckbrief ist hier das Werkzeug: **echte bb, keine Heuristik.**',
      cfg: { stacks: ['push', 'short'], tags: ['SRP', 'DEF', '3BP', 'BvB'], autoHint: false, profile: 'reg', multi: true },
      cfgText: 'Alle Spot-Typen · **12–35bb** · Lernmodus AUS · Gegner: Reg',
      hands: ['AJo', 'KQo', 'A9s', '55', '22', 'KTs', 'QJs', 'A2s'],
      goal: 'Für jede Hand des Tages die Shove-EV bei 10/15/20bb ansehen und die Grenze merken, ab der sie negativ wird.',
      check: 'Du weißt aus dem Kopf, welche Hände du mit 12bb vom BTN shovst und welche nicht.'
    },
    {
      n: 5, title: 'ICM & Bubble',
      why: 'Bis hier war alles in Chips gerechnet. An der Bubble ist das falsch: die Chips, die du ' +
        'gewinnst, sind weniger wert als die, die du verlierst. Die Woche dreht sich um **eine** ' +
        'Unterscheidung, und es ist die, an der die meisten scheitern — **Shoven und Callen sind an ' +
        'der Bubble gegensätzlich.** Beim Shoven hilft dir der Druck der anderen, beim Callen wirkt ' +
        'er gegen dich. Im Tab *Range* siehst du beide Ranges nebeneinander.',
      cfg: { stacks: ['push', 'short'], tags: ['SRP', 'DEF', '3BP', 'BvB'], autoHint: false, profile: 'reg', multi: true },
      cfgText: 'Alle Spot-Typen · 12–35bb · Lernmodus AUS · dazu täglich der **Range-Designer**',
      hands: ['AJo', 'KQo', '99', '77', 'A5s', 'KTs', 'QJs', '44'],
      goal: 'Vor jedem Spot an der Bubble: **Bin ich der Kürzeste?** Wenn nein, ist Warten bares Geld wert. Wenn ja, hilft Warten nichts — dich frisst der Blind. Und getrennt davon: **Shove ich hier, oder calle ich?** Das sind zwei Fragen, nicht eine.',
      check: 'Du nennst aus dem Kopf die drei Zahlen gegen einen 8bb-Shove an der Bubble: als **kurzer Stack callst du ~8 %**, als **Chipleader ~27 %**, ohne ICM wären es in beiden Fällen ~28 %. Wer als Shorty die 28 % benutzt, verliert das Turnier genau dort.',
      tool: 'range'
    },
    {
      n: 6, title: 'Kopfrechnen & Sizings',
      why: 'Live rechnet niemand für dich, und du hast 30 Sekunden. Diese Woche geht auf Tempo statt ' +
        'auf neue Theorie: Pot Odds, MDF und Bluff-Break-even so oft, bis sie ohne Nachdenken kommen — ' +
        'und die Sizings deines Turniers in **Jetons**, nicht in Prozent. Wer am Tisch erst umrechnen ' +
        'muss, verrät sich über die Zeit, die er braucht.',
      cfg: { stacks: ['short', 'mid'], tags: ['SRP', 'DEF', '3BP', 'BvB', 'MW'], autoHint: false, profile: 'mix', multi: true },
      cfgText: 'Alle Spot-Typen inkl. Mehrweg · 20–60bb · Gegner: gemischt · dazu täglich der Tab **Rechnen**',
      hands: ['AQo', 'KJs', 'T9s', '66', 'A8s', 'QTo', '55', 'J9s'],
      goal: '20 Rechenaufgaben pro Tag, Ziel über 85 % richtig. Dazu die 33-%-Spalte deines Levels auswendig.',
      check: 'Du nennst zu „Pot 24.000, er setzt 8.000" die nötige Equity in unter fünf Sekunden.',
      tool: 'rechnen'
    },
    {
      n: 7, title: 'Simulation & Leak-Abbau',
      why: 'Letzte Woche vor Rozvadov. Keine neuen Themen mehr — Konsolidierung. Gegnertypen ' +
        '(im Day-1-Feld sitzen Recreationals, und gegen die kommt dein Geld aus **dünnem Value**, ' +
        'nicht aus Bluffs) und deine eigene Fehlerliste. Dazu einmal die Fehlertabelle im Tab ' +
        '*Prozess* durchgehen und ehrlich abhaken, welche drei davon deine sind. ' +
        'Diese Woche läuft **alles** mit: alle Stacks, alle Spot-Typen, Mehrweg inklusive — ' +
        'so, wie es am Tisch auch kommt.',
      cfg: { stacks: ['push', 'short', 'mid', 'deep'], tags: ['SRP', 'DEF', '3BP', 'BvB', 'MW'], autoHint: false, profile: 'mix', multi: true },
      cfgText: 'Alles · alle Stacks · Mehrweg an · Lernmodus AUS · Gegner: **gemischt**',
      hands: null,
      goal: 'Gegen die Calling Station dünner Value betten und Bluffs streichen. Gegen den Nit umgekehrt. Im Mehrweg-Pot gegen beide: Bluffs komplett weg.',
      check: 'Dein Score liegt über alle Spot-Typen hinweg im gleichen Bereich — kein Ausreißer nach unten mehr, auch nicht bei MW.'
    }
  ];

  /* ---------------- Tagesformen ----------------
     Immer 30 Minuten, immer dieselbe Dreiteilung:
     Aufwärmen (Abruf) — Fokus — ein Satz aufschreiben.
     Der Sonntag ist bewusst kurz: Pausen konsolidieren, und ein Plan, den
     man an einem schlechten Tag reißt, wird danach ganz abgebrochen.      */
  const DAYTYPES = [
    {
      dow: 1, key: 'steck', name: 'Steckbrief-Tag',
      blocks: [
        ['5 min', 'Fällige Wiederholungen abarbeiten (⟳ oben rechts).'],
        ['10 min', 'Die beiden Hand-Steckbriefe des Tages lesen — Trefferverteilung, Gefahren-Landkarte, Archetyp-Text.'],
        ['15 min', 'Drill mit dem Wochen-Setup. Achte auf genau die beiden Hände, wenn sie kommen.']
      ]
    },
    {
      dow: 2, key: 'drill', name: 'Drill',
      blocks: [
        ['5 min', 'Fällige Wiederholungen.'],
        ['20 min', 'Drill mit dem Wochen-Setup, Tastatur 1–5 und Enter. Ziel: 60–80 Entscheidungen.'],
        ['5 min', 'Statistik ansehen: Welcher Spot-Typ liegt am tiefsten?']
      ]
    },
    {
      dow: 3, key: 'eigen', name: 'Eigene Hand',
      blocks: [
        ['5 min', 'Fällige Wiederholungen.'],
        ['15 min', 'Drill mit dem Wochen-Setup.'],
        ['10 min', 'Eine eigene Hand im Analyse-Tab nachbauen und im Steckbrief unter „Deine Live-Hände" notieren.']
      ]
    },
    {
      dow: 4, key: 'drill', name: 'Drill',
      blocks: [
        ['5 min', 'Fällige Wiederholungen.'],
        ['20 min', 'Drill mit dem Wochen-Setup. Heute ohne Feedback-Panel lesen: erst raten, dann aufklappen.'],
        ['5 min', 'Den teuersten Fehler des Tages in einem Satz notieren.']
      ]
    },
    {
      dow: 5, key: 'fehler', name: 'Fehler-Tag',
      blocks: [
        ['10 min', 'Nur Wiederholungsqueue — alles abarbeiten, was fällig ist.'],
        ['5 min', '15 Aufgaben im Tab *Rechnen* — Pot Odds bleiben nur mit Wiederholung schnell.'],
        ['10 min', 'Statistik → „Deine Fehler". Bei jedem Eintrag auf „Steckbrief" klicken und nachsehen, ob es ein Handmuster ist.'],
        ['5 min', 'Ein Satz: Welches Muster wiederholt sich?']
      ]
    },
    {
      dow: 6, key: 'lang', name: 'Langer Drill',
      blocks: [
        ['5 min', 'Fällige Wiederholungen.'],
        ['25 min', 'Drill am Stück, Tempo. Ziel: unter 8 Sekunden pro Entscheidung, ohne dass der Score einbricht.']
      ]
    },
    {
      dow: 0, key: 'kurz', name: 'Kurztag',
      blocks: [
        ['10 min', 'Nur Wiederholungen. Wenn nichts fällig ist: den Prozess-Tab einmal durchlesen.'],
        ['5 min', 'Wochenrückblick: Was sitzt jetzt, was nicht?']
      ]
    }
  ];

  /* ---------------- Datums-Helfer ----------------
     Bewusst über UTC-Mitternacht gerechnet: Sommerzeit-Wechsel würden bei
     lokaler Zeit einen 23- oder 25-Stunden-Tag erzeugen und den Index um
     einen Tag verschieben. Genau zwischen Planstart und Turnier liegt der
     26.10. — der Fehler wäre also aufgetreten.                            */
  const DAY_MS = 86400000;
  function toUTC(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }
  function todayUTC(now) {
    const t = now ? new Date(now) : new Date();
    return Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  }
  function isoOf(utc) { return new Date(utc).toISOString().slice(0, 10); }
  /** Tagesindex 0..34, oder null wenn heute außerhalb des Plans liegt. */
  function dayIndex(now) {
    const i = Math.round((todayUTC(now) - toUTC(PLAN_START)) / DAY_MS);
    return i >= 0 && i < DAYS ? i : null;
  }
  function daysUntilTarget(now) {
    return Math.round((toUTC(TARGET.start) - todayUTC(now)) / DAY_MS);
  }
  function dateOf(i) { return isoOf(toUTC(PLAN_START) + i * DAY_MS); }
  function fmtDate(iso) {
    const [y, m, d] = iso.split('-');
    const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(toUTC(iso)).getUTCDay()];
    return `${wd}, ${d}.${m}.`;
  }

  /**
   * Die Einheit für Tagesindex i.
   * @param worstHands Handklassen aus der eigenen Fehlerstatistik (Woche 5).
   */
  function sessionFor(i, worstHands) {
    const week = WEEKS[Math.floor(i / 7)];
    const iso = dateOf(i);
    const dow = new Date(toUTC(iso)).getUTCDay();
    const type = DAYTYPES.find(t => t.dow === dow) || DAYTYPES[1];
    // Zwei Handklassen pro Tag, über die Woche rotierend. Der Pool aus der
    // eigenen Fehlerstatistik kann kurz sein — dann mit Standardhänden
    // auffüllen, damit an einem Tag nie zweimal dieselbe Hand steht.
    const FALLBACK = ['AKo', 'A5s', '76s', 'JJ', 'KQo', 'T9s'];
    let pool = week.hands || (worstHands || []).slice();
    if (pool.length < 2) pool = pool.concat(FALLBACK.filter(h => !pool.includes(h)));
    const k = (i % 7) * 2;
    const hands = [pool[k % pool.length], pool[(k + 1) % pool.length]];
    return { i, iso, date: fmtDate(iso), week, type, hands, dayOfWeek: i % 7 };
  }

  /** Die drei Handklassen mit dem schlechtesten Score (mind. 3 Entscheidungen). */
  function worstHandsFrom(byHand) {
    return Object.keys(byHand || {})
      .filter(h => byHand[h].max >= 9)
      .sort((a, b) => (byHand[a].pts / byHand[a].max) - (byHand[b].pts / byHand[b].max))
      .slice(0, 6);
  }

  P.Plan = {
    TARGET, PLAN_START, DAYS, WEEKS, DAYTYPES, LEVELS, START_CHIPS,
    depthTable, firstLevelOf, structureAnomalies, DAY1, DAY2, DAY3, DAY4,
    dayIndex, daysUntilTarget, dateOf, fmtDate, sessionFor, worstHandsFrom, toUTC, todayUTC
  };
})();
