/* =========================================================================
   plan.js — 35-Tage-Trainingsplan bis zur CAPT Million

   Ziel: CAPT Million (Casinos Austria Poker Tour), €550, €1.000.000 GTD.
   Zwei Termine in derselben Woche:
     - Di 10.11.2026, 19:00 — Satellite-Starttag Graz (€50+10, Tickets à €550)
     - Sa 14.11.2026, 16:00 — CAPT-Million-Starttag Graz (€500+50)
   Wer im Flight unter die besten 10 % kommt, spielt das Finale in Baden
   (Day 2 am 28.11.). Planstart 08.10.2026, fünf Wochen à 30 Minuten bis
   zum Tag nach dem Satellite.

   Der Aufbau folgt dem, was die beiden Turniere tatsächlich verlangen:

   1. SCHNELLE LEVEL HEISSEN KURZE STACKS. 20 Minuten im Satellite, 30 im
      Flight: der Großteil beider Abende wird unter 25bb gespielt. Deshalb
      beginnt der Plan dort, wo der King's-Plan aufgehört hat — Push/Fold
      in Woche 1, nicht in Woche 4.

   2. DREI VERSCHIEDENE BUBBLES. Ein normales Turnier (Auszahlungskurve),
      der Flight (Top 10 % weiter, mind. €1.500, aber der Stack zählt für
      Day 2 weiter) und der Satellite (gleiche Tickets — Chips über der
      Ticketgrenze sind wertlos). Woche 3 und 4 trennen sie bewusst, weil
      die Call-Grenzen weit auseinanderliegen (siehe js/tips.js, Woche 4).

   3. ERST BLOCKEN, DANN MISCHEN, ABRUF STATT WIEDERLESEN. Unverändert aus
      dem King's-Plan: jede Einheit beginnt mit der Wiederholungsqueue, und
      die letzte Woche mischt alles, so wie es am Tisch auch kommt.
   ========================================================================= */
(function () {
  const P = window.PT;

  /* Gegengeprüft am 08.10.2026 an casinos.at (Flight und Satellite) sowie
     pokerexklusiv.com und hochgepokert.com (Finale, Best Stack Forward). */
  const TARGET = {
    name: 'CAPT Million',
    venue: 'Casinos Austria · Starttage in Graz, Finale im Casino Baden',
    start: '2026-11-14',                 // dein Flight — darauf zählt der Countdown
    buyIn: 550, gtd: 1000000, gtdText: '€1.000.000'
  };

  /* Die drei Termine, um die es geht. "stack" ist das, womit du wirklich
     startest — beim Satellite inklusive Gold Bonus, den laut Spieler jeder
     bekommt, auch bei jedem Re-Entry. */
  const EVENTS = [
    {
      key: 'sat', date: '2026-11-10', time: '19:00', name: 'Satellite-Starttag Graz',
      venue: 'Casino Graz', buyIn: '€50+10', stack: 18000, stackText: '15.000 + 3.000 Gold Bonus',
      levelMin: 20, reentry: 'unbegrenzt', prize: 'garantiert 5 Tickets à €550, meist mehr'
    },
    {
      key: 'flight', date: '2026-11-14', time: '16:00', name: 'CAPT-Million-Starttag Graz',
      venue: 'Casino Graz', buyIn: '€500+50', stack: 100000, stackText: '100.000',
      levelMin: 30, reentry: '1 (Nachmelden bis Ende Level 10)',
      prize: 'Top 10 % weiter, mind. €1.500 · Best Stack Forward, je weitere Qualifikation €4.000'
    },
    {
      key: 'final', date: '2026-11-28', end: '2026-11-30', time: '', name: 'Finale (Day 2 bis Finaltisch)',
      venue: 'Casino Baden', buyIn: '—', stack: null, stackText: 'dein Flight-Stack',
      levelMin: null, reentry: '—', prize: '€1.000.000 GTD'
    }
  ];
  function eventOn(iso) { return EVENTS.find(e => e.date === iso) || null; }

  /* Re-Entry-Regel für den Satellite. Vorher festgelegt, weil man sie
     nach einem Bust am schlechtesten trifft. Die 25bb sind eine Faustregel
     (darunter ist ein frischer Stack sofort im Push/Fold), keine Rechnung;
     die Grenze in Chips folgt daraus exakt: 18.000 / 25 = 720. */
  const REENTRY = {
    maxShots: 3, minBB: 25, startChips: 18000,
    get maxBigBlind() { return this.startChips / this.minBB; },
    rakeSat: 10 / 60, rakeMain: 50 / 550
  };

  const PLAN_START = '2026-10-08';
  const DAYS = 35;                       // fünf Wochen bis 11.11., Tag nach dem Satellite

  /* ---------------- Referenzstruktur: King's Million ----------------
     Die Blindstrukturen von Satellite und Flight liegen noch nicht vor.
     Bis dahin rechnet der Tab *Rechnen* mit der letzten echten Struktur,
     die der Spieler geliefert hat (King's Million, Tag 1–4) — damit die
     Aufgaben in glatten, legbaren Jetonbeträgen kommen. Für Stacktiefen
     des CAPT taugt sie NICHT; deshalb zeigt der Plan keine Tiefentabelle.

     1. Die Ante entspricht dem Big Blind (BB-Ante). Genau das nimmt das
        ICM-Modell an — totes Geld vor dem Flop = SB + BB + Ante = 2,5bb.
     2. 50.000 Startchips bei BB 300, 47 Level über vier Tage.             */
  const STRUCTURE_NAME = "King's Million (Referenz, bis die CAPT-Struktur vorliegt)";
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

  /** Stelle(n), an denen die Blinds unplausibel springen. */
  function structureAnomalies() {
    const out = [];
    for (let i = 1; i < LEVELS.length; i++) {
      const f = LEVELS[i].bb / LEVELS[i - 1].bb;
      if (f > 2.2) out.push({ lvl: LEVELS[i].lvl, day: LEVELS[i].day, factor: f, prev: LEVELS[i - 1], cur: LEVELS[i] });
    }
    return out;
  }

  /* ---------------- Wochen ---------------- */
  const WEEKS = [
    {
      n: 1, title: 'Push/Fold unter 20bb',
      why: 'Bei 20-Minuten-Leveln im Satellite und 30 im Flight ist **unter 20bb der Normalfall**, ' +
        'nicht die Ausnahme. Unter 20bb gibt es keine drei Straßen mehr, nur noch shove oder nicht. ' +
        'Das Werkzeug ist die Shove-EV-Tabelle im Steckbrief: **echte bb, keine Heuristik.** ' +
        'Geblockt — nur dieses Band, damit die Grenzen sitzen, bevor es gemischt wird.',
      cfg: { stacks: ['push'], tags: ['SRP', 'DEF', '3BP', 'BvB'], autoHint: false, profile: 'reg', multi: true },
      cfgText: 'Alle Spot-Typen außer Mehrweg · **12–20bb** · Lernmodus AUS · Gegner: Reg',
      hands: ['AJo', 'KQo', 'A9s', '55', '22', 'KTs', 'QJs', 'A2s'],
      goal: 'Für jede Hand des Tages die Shove-EV bei 10/15/20bb ansehen und die Grenze merken, ab der sie negativ wird.',
      check: 'Du weißt aus dem Kopf, welche Hände du mit 12bb vom BTN shovst und welche nicht.'
    },
    {
      n: 2, title: 'Kurze Stacks & das Live-Feld',
      why: 'Jetzt 12–35bb gemischt und gegen **gemischte Gegner** — an einem Dienstagabend in Graz ' +
        'sitzen Recreationals, und gegen die kommt das Geld aus **dünnem Value**, nicht aus Bluffs. ' +
        'Mehrweg-Pots sind dabei, weil live gelimpt und mitgegangen wird: dort fällt Bluffen ' +
        'praktisch weg. Die Frage vor jeder Entscheidung: **Wie tief bin ich, und wer sitzt mir gegenüber?**',
      cfg: { stacks: ['push', 'short'], tags: ['SRP', 'DEF', '3BP', 'BvB', 'MW'], autoHint: false, profile: 'mix', multi: true },
      cfgText: 'Alle Spot-Typen inkl. Mehrweg · 12–35bb · Gegner: **gemischt**',
      hands: ['AQo', 'KJs', 'T9s', '66', 'A8s', 'QTo', '55', 'J9s'],
      goal: 'Gegen die Calling Station dünner Value, gegen den Nit Bluffs. Vor jedem Mehrweg-Pot zählen, wie viele noch drin sind.',
      check: 'Du weißt bei jeder Hand, ob du shovst, openst oder foldest, bevor du die Gegnerinfo liest — und passt dann nur noch das Sizing an.'
    },
    {
      n: 3, title: 'ICM & die Bubble im Flight',
      why: 'Bis hier war alles in Chips gerechnet. An der Bubble ist das falsch: die Chips, die du ' +
        'gewinnst, sind weniger wert als die, die du verlierst. Im Flight kommen die besten **10 %** ' +
        'weiter, mit mindestens **€1.500** — fast das Dreifache des Buy-ins. Das ist ein großer Sprung, ' +
        'aber anders als im Satellite zählt dein Stack danach weiter (Best Stack Forward, Day 2). ' +
        'Die Woche dreht sich um **eine** Unterscheidung: **Shoven und Callen sind an der Bubble ' +
        'gegensätzlich.** Im Tab *Range* siehst du beide Ranges nebeneinander.',
      cfg: { stacks: ['push', 'short'], tags: ['SRP', 'DEF', '3BP', 'BvB'], autoHint: false, profile: 'reg', multi: true },
      cfgText: 'Alle Spot-Typen · 12–35bb · dazu täglich der **Range-Designer** (Auszahlung: Turnier)',
      hands: ['AJo', 'KQo', '99', '77', 'A5s', 'KTs', 'QJs', '44'],
      goal: 'Vor jedem Spot an der Bubble: **Bin ich der Kürzeste?** Wenn nein, ist Warten bares Geld wert. Wenn ja, hilft Warten nichts. Und getrennt davon: **Shove ich hier, oder calle ich?**',
      check: 'Du nennst aus dem Kopf die drei Zahlen gegen einen 8bb-Shove an der Bubble: als **kurzer Stack callst du ~8 %**, als **Chipleader ~27 %**, ohne ICM wären es in beiden Fällen ~28 %.',
      tool: 'range'
    },
    {
      n: 4, title: 'Satellite: nur das Ticket zählt',
      why: 'Im Satellite sind alle Ticketplätze gleich viel wert. **Platz 1 bekommt dasselbe wie der ' +
        'letzte Ticketplatz** — jeder Chip darüber ist wertlos. Weit weg von der Bubble ändert das ' +
        'fast nichts, du sammelst Chips wie immer. Nahe an der Bubble ändert es alles: ' +
        'die Call-Grenze steigt viel stärker als im normalen Turnier. Im Range-Designer jetzt ' +
        '**Auszahlung: Satellite** einstellen und die Presets durchgehen.',
      cfg: { stacks: ['push', 'short'], tags: ['SRP', 'DEF', 'BvB'], autoHint: false, profile: 'mix', multi: true },
      cfgText: 'Steals, Defense, BvB · 12–35bb · dazu täglich der **Range-Designer (Satellite)** und der Shove-Call-Trainer',
      hands: ['AKo', 'AQo', 'TT', '88', 'A9s', 'KQs', 'A5s', 'KJo'],
      goal: 'Vor jeder Entscheidung an der Satellite-Bubble: **Wie viele müssen noch raus, und wie viele sind kürzer als ich?** Wenn genug kürzer sind, ist Folden fast immer richtig — auch mit Händen, die sich stark anfühlen.',
      check: 'Im Shove-Call-Trainer mit Auszahlung Satellite liegst du über 85 % — und kannst sagen, warum dieselbe Hand im normalen Turnier ein Call wäre.',
      tool: 'range'
    },
    {
      n: 5, title: 'Generalprobe — Satellite am Dienstag',
      why: 'Keine neuen Themen mehr. Alles läuft gemischt, und die Hände kommen aus **deiner eigenen ' +
        'Fehlerliste**. Am Dienstag ist der Satellite: die Einheit an dem Tag ist kurz und dreht sich ' +
        'nur um die Re-Entry-Regel und die Bubble. Danach bis zum Flight am Samstag: Wiederholen, ' +
        'nicht Lernen.',
      cfg: { stacks: ['push', 'short', 'mid'], tags: ['SRP', 'DEF', '3BP', 'BvB', 'MW'], autoHint: false, profile: 'mix', multi: true },
      cfgText: 'Alles · 12–60bb · Mehrweg an · Lernmodus AUS · Gegner: **gemischt**',
      hands: null,
      goal: 'Jede Entscheidung in einem Satz: Tiefe, Gegner, Plan. Wer das nicht in einem Satz sagen kann, hat keinen Plan.',
      check: 'Dein Score liegt über alle Spot-Typen hinweg im gleichen Bereich, und die Re-Entry-Regel steht auf Papier.'
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
        ['10 min', 'Die beiden Hand-Steckbriefe des Tages lesen — vor allem die Shove-EV-Tabelle.'],
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

  /* Turniertage ersetzen die normale Tagesform: kurz, nichts Neues. */
  const EVENTDAY = {
    sat: {
      key: 'event', name: 'Satellite-Tag',
      blocks: [
        ['5 min', 'Fällige Wiederholungen — nur das, nichts Neues.'],
        ['10 min', 'Range-Designer, Auszahlung Satellite: einmal „Satellite-Bubble" und einmal „Satellite früh" rechnen lassen und den Unterschied ansehen.'],
        ['5 min', `Die Re-Entry-Regel auf Papier: höchstens ${REENTRY.maxShots} Shots, Re-Entry nur bis Big Blind ${REENTRY.startChips / REENTRY.minBB} (${REENTRY.minBB}bb mit ${REENTRY.startChips.toLocaleString('de-DE')} Chips). Und vorher entscheiden: Spielst du den Flight am Samstag auch ohne Ticket?`]
      ]
    }
  };

  /* ---------------- Datums-Helfer ----------------
     Bewusst über UTC-Mitternacht gerechnet: Sommerzeit-Wechsel würden bei
     lokaler Zeit einen 23- oder 25-Stunden-Tag erzeugen und den Index um
     einen Tag verschieben. Genau im Plan liegt der 25.10. — der Fehler
     würde also auftreten.                                                 */
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
  function daysUntil(iso, now) {
    return Math.round((toUTC(iso) - todayUTC(now)) / DAY_MS);
  }
  function daysUntilTarget(now) { return daysUntil(TARGET.start, now); }
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
    const ev = eventOn(iso);
    const type = (ev && EVENTDAY[ev.key]) || DAYTYPES.find(t => t.dow === dow) || DAYTYPES[1];
    // Zwei Handklassen pro Tag, über die Woche rotierend. Der Pool aus der
    // eigenen Fehlerstatistik kann kurz sein — dann mit Standardhänden
    // auffüllen, damit an einem Tag nie zweimal dieselbe Hand steht.
    const FALLBACK = ['AKo', 'A5s', 'KQo', 'TT', 'A9s', 'KJs'];
    let pool = week.hands || (worstHands || []).slice();
    if (pool.length < 2) pool = pool.concat(FALLBACK.filter(h => !pool.includes(h)));
    const k = (i % 7) * 2;
    const hands = [pool[k % pool.length], pool[(k + 1) % pool.length]];
    return { i, iso, date: fmtDate(iso), week, type, hands, dayOfWeek: i % 7, event: ev };
  }

  /** Die schlechtesten Handklassen (mind. 3 Entscheidungen), schlechteste zuerst. */
  function worstHandsFrom(byHand) {
    return Object.keys(byHand || {})
      .filter(h => byHand[h].max >= 9)
      .sort((a, b) => (byHand[a].pts / byHand[a].max) - (byHand[b].pts / byHand[b].max))
      .slice(0, 6);
  }

  P.Plan = {
    TARGET, EVENTS, REENTRY, eventOn, PLAN_START, DAYS, WEEKS, DAYTYPES, EVENTDAY,
    STRUCTURE_NAME, LEVELS, START_CHIPS, structureAnomalies, DAY1, DAY2, DAY3, DAY4,
    dayIndex, daysUntil, daysUntilTarget, dateOf, fmtDate, sessionFor, worstHandsFrom, toUTC, todayUTC
  };
})();
