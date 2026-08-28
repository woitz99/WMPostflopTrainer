/* =========================================================================
   ownhands.js — eigene, echte Hände als feste Drill-Spots

   Die Spots in ranges.js sind Generatoren: Range gegen Range, Board zufällig.
   Das ist richtig fürs Frequenztraining, taugt aber nicht, um eine konkrete
   Hand noch einmal zu spielen — genau das braucht es nach einem Session-
   Review, wenn eine Entscheidung teuer war und man wissen will, ob man sie
   heute anders trifft.

   Deshalb hier das Gegenstück: FESTE Hände. Board, Karten, Positionen,
   Stacks und Bet-Größen stehen exakt so, wie sie in der Handhistorie stehen.
   Nur die eine Entscheidung ist offen.

   ---------------------------------------------------------------------
   WAS HIER BEHAUPTET WIRD UND WAS NICHT

   Die Empfehlung wird NICHT hier hingeschrieben, sondern zur Laufzeit
   gerechnet — sonst wäre sie nur meine Meinung mit Zahlen daneben:

     1. Nötige Equity aus den Pot Odds.  EXAKT, geschlossene Formel.
     2. Deine Equity gegen eine benannte Gegner-Range auf genau diesem
        Board.  Am Turn und River rechnet die Engine vollständig aus
        (<= 2 Karten offen) — also ebenfalls EXAKT, keine Stichprobe.
     3. Empfehlung = Vergleich der beiden.

   Was dabei GESETZT ist und nicht gerechnet: die Gegner-Range selbst. Sie
   steht je Entscheidung als `villRange` da, zusammen mit `rangeWhy` — der
   Begründung, warum genau diese Kombos. Wer die Range anders sieht, bekommt
   eine andere Empfehlung, und das ist auch richtig so. Die Range ist die
   Annahme, nicht das Ergebnis.

   Wichtig ist die Unterscheidung, an der die vier Kollaps-Hände hängen:
   modelliert wird immer die Range, mit der er DIESE LINE SPIELT — also
   dreimal barrelt oder dreimal leadet — nicht die, mit der er präflop
   mitgegangen ist. Die zweite ist immer deutlich breiter, und wer mit ihr
   rechnet, callt sich arm. Genau dieser Fehler steckt in H126 und H127.

   MEHRWEG. Wo noch ein dritter Spieler lebt, gibt es keine Referenz-
   strategie (siehe multiway.js). Solche Entscheidungen sind mit
   `headsUp: false` markiert; die Pot Odds stimmen weiter exakt, die Equity
   gilt aber nur gegen den Aggressor — die echte Hürde liegt höher. Das
   steht in der UI dann auch so da, statt eine Note zu erfinden.
   ========================================================================= */
(function () {
  const P = window.PT;

  /** "Js Ts 3d" -> Karten-Ints. Leerer String -> []. */
  function cards(str) {
    if (!str) return [];
    const m = String(str).match(/[2-9TJQKA][cdhs]/g);
    return m ? m.map(P.cardFromStr) : [];
  }

  /**
   * Nötige Equity für einen Call. EXAKT.
   * Du zahlst `toCall` in einen Pot, in dem seine Bet schon drin liegt.
   * @param {number} potWithBet Pot inkl. seiner Bet, bevor du callst
   * @param {number} toCall     Was du zahlst (bei All-in für weniger: dein Rest)
   */
  function requiredEquity(potWithBet, toCall) {
    return toCall / (potWithBet + toCall);
  }

  /**
   * Break-even einer Value-Bet: Wie oft muss die Hand vorne sein, damit
   * eine Bet besser ist als ein Check? Gegen eine reine CALL-Range ist die
   * Schwelle 50 % — darunter zahlt die Bet nur noch die besseren Hände aus.
   * Bewusst simpel gehalten: Raises des Gegners sind hier nicht modelliert,
   * das würde die Schwelle weiter nach oben schieben, nie nach unten.
   */
  const VALUE_BET_THRESHOLD = 0.5;

  /* ------------------------------------------------------------------ *
   * Die Hände. Alle Zahlen aus den XML-Historien, nicht gerundet
   * nachgerechnet: `potBB` ist der Pot VOR seiner Bet, `betBB` seine Bet,
   * `toCallBB` was du zahlst (kann kleiner sein als betBB, wenn du für
   * weniger all-in gehst).
   * ------------------------------------------------------------------ */
  const HANDS = [
    /* ================================================================ */
    {
      id: 'h126',
      title: 'T8s — drei Streets mit dem dritten Paar',
      src: { file: '4197566428.xml', hand: 126, time: '28.08.2026 21:04',
             tourney: '€30 BIG 30 Mystery Bounty' },
      sb: 350, bb: 700,
      heroPos: 'MP1', villPos: 'BTN', heroIP: false,
      heroStackBB: 103.4, villStackBB: 34.0,
      heroCards: 'Tc 8c',
      villCards: 'Qd Jh',
      costChips: -23520, costBB: -33.6,
      lead: 'Größter Einzelverlust des Turniers.',
      preflop: 'Du openst 2,3bb aus MP1. Der Button callt, die Blinds folden. ' +
               'Effektiv sind 34bb im Spiel — sein Stack.',
      asks: [
        {
          street: 'flop', board: 'Js Ts 3d', headsUp: true,
          potBB: 7.1, betBB: 3.6, toCallBB: 3.6,
          text: 'Du checkst, der Button bettet 3,6bb (50 % Pot).',
          villRange: '22-JJ, ATs-AJs, KTs+, QTs+, J9s+, T9s, 98s, 87s, ' +
                     'AJo-AQo, KJo+, QJo, JTo',
          rangeWhy: 'Sein Flop-Bet nach Cold-Call am Button: alles, was auf J-T-3 ' +
                    'weiterspielt — Jx, Tx, Überkarten mit Backdoor, Draws. ' +
                    'Auf dieser Straße noch breit, deshalb ist der Call hier auch ' +
                    'unstrittig.',
          options: ['FOLD', 'CALL', 'RAISE'],
          actual: 'CALL'
        },
        {
          street: 'turn', board: 'Js Ts 3d 4h', headsUp: true,
          potBB: 14.3, betBB: 7.1, toCallBB: 7.1,
          text: 'Blank am Turn. Du checkst wieder, er bettet 7,1bb (50 % Pot).',
          villRange: '22, 33, 44, TT, JJ, ATs-AJs, KJs+, QJs, J9s+, T9s, 98s, ' +
                     'AJo-AQo, KJo+, QJo, JTo',
          rangeWhy: 'Die zweite Bet siebt aus: reine Überkarten geben hier ' +
                    'überwiegend auf, Jx und Tx bleiben. Deine Zehn ist ab hier ' +
                    'gegen fast jedes Jx hinten.',
          options: ['FOLD', 'CALL', 'RAISE'],
          actual: 'CALL'
        },
        {
          street: 'river', board: 'Js Ts 3d 4h 4d', headsUp: true,
          potBB: 28.5, betBB: 20.5, toCallBB: 20.5,
          text: 'Das Board paart die Vier. Du checkst, er bettet 20,5bb — ' +
                '72 % Pot, die größte Bet der Hand.',
          villRange: 'JJ, TT, 44, AJs, KJs, QJs, JTs, J9s, T9s, AJo, KJo, QJo, JTo',
          rangeWhy: 'Die dritte Barrel in dieser Größe ist der engste Filter der ' +
                    'Hand: Jx und besser. Bluffs gibt es, aber eine 72-%-Bet auf ' +
                    'einem Board ohne verpasste Draws braucht Value. Deine T8 ' +
                    'schlägt davon nichts.',
          options: ['FOLD', 'CALL'],
          actual: 'CALL'
        }
      ],
      lesson: 'Du hast 31,2bb über drei Straßen bezahlt, ohne ein einziges Mal ' +
              'zu raisen oder zu leaden. Jede einzelne Bet war zu Pot Odds ' +
              'billig — der Fehler steckt nicht in einer Straße, sondern darin, ' +
              'dass es nie eine Straße gab, an der du die Frage gestellt hast: ' +
              'schlage ich überhaupt eine Hand, mit der er dreimal bettet?'
    },

    /* ================================================================ */
    {
      id: 'h127',
      title: 'ATo — dreimal Ass-hoch bezahlt',
      src: { file: '4197566428.xml', hand: 127, time: '28.08.2026 21:06',
             tourney: '€30 BIG 30 Mystery Bounty' },
      sb: 350, bb: 700,
      heroPos: 'MP', villPos: 'SB', heroIP: true,
      heroStackBB: 69.7, villStackBB: 33.0,
      heroCards: 'Ac Th',
      villCards: 'Ts Td',
      costChips: -8680, costBB: -12.4,
      lead: 'Kleine Bets, große Summe.',
      preflop: 'Du openst 2,3bb aus MP und bekommst drei Caller: LJ, SB und BB. ' +
               'Vierweg-Pot, 10,2bb.',
      asks: [
        {
          street: 'flop', board: '2h Qh 6d', headsUp: false,
          potBB: 10.2, betBB: 2.0, toCallBB: 2.0,
          text: 'Der SB leadet 2,0bb in den Vierweg-Pot (20 % Pot). Der BB foldet. ' +
                'Hinter dir sitzt noch der LJ.',
          villRange: '22, 66, QQ, AQs, KQs, QJs, QTs, Q9s, JTs, T9s, 98s, 87s, ' +
                     'AQo, KQo, QJo, AhKh, AhJh, KhJh, Jh9h, Th9h',
          rangeWhy: 'Ein Donk-Lead in einen Vierweg-Pot gegen den Preflop-Raiser ' +
                    'ist selten reine Luft: Qx, Sets, Herz-Draws. Ass-hoch ' +
                    'schlägt davon nur die Draws — und die haben Outs gegen dich.',
          options: ['FOLD', 'CALL', 'RAISE'],
          actual: 'CALL'
        },
        {
          street: 'turn', board: '2h Qh 6d 8d', headsUp: true,
          potBB: 14.2, betBB: 3.0, toCallBB: 3.0,
          text: 'Der LJ ist raus, ihr seid heads-up. Er leadet noch einmal, ' +
                '3,0bb (21 % Pot).',
          villRange: '22, 66, 88, QQ, AQs, KQs, QJs, QTs, Q9s, AQo, KQo, QJo, ' +
                     'JTs, T9s, AhKh, AhJh, KhJh, Jh9h',
          rangeWhy: 'Zweiter Lead. Qx bleibt fast vollständig drin, Sets sowieso. ' +
                    'Du hast weiterhin keine Hand, nur einen Ace-High-Bluffcatcher ' +
                    'ohne Draw.',
          options: ['FOLD', 'CALL', 'RAISE'],
          actual: 'CALL'
        },
        {
          street: 'river', board: '2h Qh 6d 8d Qs', headsUp: true,
          potBB: 20.2, betBB: 5.0, toCallBB: 5.0,
          text: 'Die Dame paart. Er leadet zum dritten Mal, 5,0bb (25 % Pot).',
          villRange: '22, 66, 88, QQ, AQs, KQs, QJs, QTs, Q9s, AQo, KQo, QJo, ' +
                     'AhKh, AhJh, KhJh',
          rangeWhy: 'Drei Leads, und die Dame paart — jedes Qx ist jetzt Trips. ' +
                    'Ass-hoch schlägt in dieser Range exakt die verpassten ' +
                    'Herz-Draws und sonst nichts.',
          options: ['FOLD', 'CALL'],
          actual: 'CALL'
        }
      ],
      lesson: 'Jeder Call einzeln war billig — 14, 15, 17 Prozent nötige Equity. ' +
              'Genau das ist die Falle: kleine Sizings machen die Pot Odds so ' +
              'gut, dass man aufhört, die andere Frage zu stellen. Ass-hoch ' +
              'schlägt in einer Bet-Range fast nie genug Kombos, egal wie ' +
              'günstig der Preis ist.'
    },

    /* ================================================================ */
    {
      id: 'h119',
      title: 'AJs — Call gegen eine Overbet',
      src: { file: '4197566428.xml', hand: 119, time: '28.08.2026 20:51',
             tourney: '€30 BIG 30 Mystery Bounty' },
      sb: 300, bb: 600,
      heroPos: 'MP', villPos: 'BB', heroIP: true,
      heroStackBB: 134.9, villStackBB: 22.0,
      heroCards: 'As Js',
      villCards: 'Kd Qh',
      costChips: -13080, costBB: -21.8,
      lead: 'Der knappste der vier — und trotzdem der falsche Pot.',
      preflop: 'Du openst 2,3bb aus MP, SB und BB callen. Dreiweg.',
      asks: [
        {
          street: 'turn', board: 'Qc Jc 7s 3s', headsUp: false,
          potBB: 13.8, betBB: 17.4, toCallBB: 17.4,
          text: 'Am Flop hat der SB klein geleadet, BB und du habt gecallt. ' +
                'Am Turn checkt der SB — und der BB bettet 17,4bb in einen ' +
                '13,8bb-Pot. Eine Overbet über 126 % Pot. Der SB lebt noch.',
          villRange: 'QQ, JJ, 77, 33, QJs, QTs, Q9s, JTs, AQs, KQs, AQo, KQo, ' +
                     'QJo, AcKc, AcTc, Kc9c, Tc9c, 9c8c',
          rangeWhy: 'Eine Overbet dieser Größe aus dem BB, nachdem der Aggressor ' +
                    'gecheckt hat, ist polarisiert: Zwei Paar und besser plus die ' +
                    'Club-Draws. Reine Bluffs gibt es hier kaum — er müsste eine ' +
                    'Hand ohne Equity über die teuerste Sizing spielen.',
          options: ['FOLD', 'CALL', 'RAISE'],
          actual: 'CALL'
        }
      ],
      lesson: 'Hier hattest du wirklich Equity — Flushdraw plus zweites Paar. ' +
              'Der Fehler ist feiner: die Overbet setzt den Preis so hoch, dass ' +
              'ein Draw allein nicht mehr reicht, und hinter dir lebt noch ein ' +
              'dritter Spieler. Du warst zu diesem Zeitpunkt Chipleader am Tisch ' +
              'mit 135bb. Diesen Pot musstest du nicht spielen.'
    },

    /* ================================================================ */
    {
      id: 'h118',
      title: '99 — die Bet in den fertigen Flush',
      src: { file: '4197566428.xml', hand: 118, time: '28.08.2026 20:49',
             tourney: '€30 BIG 30 Mystery Bounty' },
      sb: 300, bb: 600,
      heroPos: 'MP1', villPos: 'BTN', heroIP: false,
      heroStackBB: 152.8, villStackBB: 30.0,
      heroCards: '9c 9s',
      villCards: '7c 6c',
      costChips: -10680, costBB: -17.8,
      lead: 'Die einzige der vier, in der du selbst gesetzt hast.',
      preflop: 'MP openst 2,0bb, du callst aus MP1, der BTN callt hinter dir. ' +
               'Dreiweg.',
      asks: [
        {
          street: 'river', board: '5d Tc Kc 3d 8c', headsUp: false,
          mode: 'BET',
          potBB: 20.9, betBB: 11.5,
          text: 'Am Flop hat der BTN gesetzt, MP und du habt gecallt. Turn: alle ' +
                'checken. Am River kommt der dritte Club, MP checkt zu dir. ' +
                'Du bist am Zug — mit 99 auf K-T-8-5-3.',
          villRange: 'KQs, KJs, KTs, K9s, QTs, JTs, T9s, 98s, 87s, 76s, 66, 88, ' +
                     'TT, KK, AcQc, AcJc, Ac9c, Qc9c, Jc9c, 7c6c, 6c4c',
          rangeWhy: 'Modelliert ist hier bewusst seine CALL-Range gegen eine ' +
                    'Bet von 55 % Pot — nicht seine Gesamtrange. Das ist die ' +
                    'richtige Frage für eine Value-Bet: wer bezahlt dich? Auf ' +
                    'einem Board mit drittem Club callen Kx, Tx und jeder Club.',
          options: ['CHECK', 'BET'],
          actual: 'BET'
        }
      ],
      lesson: 'Eine Bet braucht eine schlechtere Hand, die callt. Auf der Straße, ' +
              'auf der der offensichtlichste Draw ankommt, gibt es die für ein ' +
              'drittes Paar nicht mehr. Check/Fold hätte 6,4bb gekostet statt ' +
              '17,8bb. Dieselbe Bet hattest du um 18:51 schon einmal gemacht ' +
              '(H21, zwei Paar in einen dritten Club) — es ist ein Reflex, kein ' +
              'Ausrutscher.'
    },

    /* ================================================================ */
    {
      id: 'h184',
      title: 'AJo — die Bust-Hand',
      src: { file: '4197566428.xml', hand: 184, time: '28.08.2026 22:02',
             tourney: '€30 BIG 30 Mystery Bounty' },
      sb: 800, bb: 1600,
      heroPos: 'UTG1', villPos: 'UTG', heroIP: true,
      heroStackBB: 30.9, villStackBB: 31.0,
      heroCards: 'Ac Jd',
      villCards: 'As Qd',
      costChips: -49380, costBB: -30.9,
      lead: 'Präflop verloren, nicht am River.',
      preflop: 'Der UTG-Spieler openst 2,0bb. Du sitzt in UTG+1 mit 30,9bb, ' +
               'fünf Spieler hinter dir.',
      asks: [
        {
          street: 'preflop', board: '', headsUp: true, mode: 'PREFLOP',
          potBB: 3.9, betBB: 2.0, toCallBB: 2.0,
          text: 'Deine Entscheidung gegen den UTG-Open — bei 31bb effektiv.',
          options: ['FOLD', 'CALL', 'RAISE'],
          actual: 'CALL',
          /* Keine Equity-Rechnung: präflop entscheidet nicht die Equity gegen
             eine Range, sondern was hinter dir noch passieren kann. Dafür gibt
             es keine ehrliche Zahl aus dieser Engine — deshalb steht hier
             ein begründetes Urteil und ist auch als solches markiert. */
          judgement: 'FOLD_OR_RAISE',
          judgementWhy: 'Der Flat ist die schlechteste der drei Optionen. Bei 31bb ' +
                        'gegen eine UTG-Range ist AJo dominiert (AQ, AK, AA-JJ), ' +
                        'und ein Call lädt die fünf Spieler hinter dir ein — genau ' +
                        'das ist passiert, es wurde 4-way. 3-Bet (bei diesen Stacks ' +
                        'faktisch ein Jam) oder Fold sind beide vertretbar; der Call ' +
                        'nimmt die Nachteile von beidem mit.'
        },
        {
          street: 'turn', board: '7h Ah 9d Ad', headsUp: true,
          potBB: 17.9, betBB: 8.9, toCallBB: 8.9,
          text: 'Du hast den Flop-Bet gecallt, die anderen sind raus. Das Ass am ' +
                'Turn gibt dir Trips. Er bettet 8,9bb (50 % Pot). ' +
                'Hinter dem Call blieben dir 25,3bb bei einem 35,8bb-Pot.',
          villRange: 'AsKc, AsKd, AsKh, AsKs, AsQc, AsQd, AsQh, AsQs, AsJs, AsTs, ' +
                     '99, 77, KhQh, KhJh, KhTh, QhJh, QhTh, JhTh',
          rangeWhy: 'Kartenentfernung: du hältst A♣, am Board liegen A♥ und A♦ — ' +
                    'jedes Ass von ihm enthält zwingend A♠, deshalb stehen die ' +
                    'Kombos hier einzeln. Dazu die Herz-Flushdraws und die ' +
                    'Boote 99/77.',
          options: ['FOLD', 'CALL', 'RAISE'],
          actual: 'CALL',
          note: 'Die Engine bewertet hier Call gegen Fold. Der eigentliche Punkt ' +
                'ist ein dritter: ein Raise nimmt ihm die Entscheidung ab, solange ' +
                'du noch Stack dafür hast.'
        },
        {
          street: 'river', board: '7h Ah 9d Ad 2d', headsUp: true,
          potBB: 35.8, betBB: 16.3, toCallBB: 15.8,
          text: 'Er bettet 16,3bb. Du hast noch 15,8bb — der Call wäre all-in ' +
                'für weniger.',
          villRange: 'AsKc, AsKd, AsKh, AsKs, AsQc, AsQd, AsQh, AsQs, AsJs, AsTs, ' +
                     '99, 77, KhQh, KhJh, KhTh, QhJh, QhTh, JhTh',
          rangeWhy: 'Dieselbe Range wie am Turn. Der Herz-Draw ist nicht ' +
                    'angekommen — diese sechs Kombos sind jetzt reine Bluffs, ' +
                    'und genau sie tragen den Call. HIER HÄNGT ALLES AN EINER ' +
                    'ANNAHME: unterstellt ist, dass er alle sechs verpassten ' +
                    'Draws auch abfeuert. Feuert er nur die Hälfte, kippt die ' +
                    'Empfehlung auf Fold. Das ist keine Schwäche der Rechnung, ' +
                    'sondern die ehrliche Antwort — der Call steht und fällt ' +
                    'mit seiner Bluff-Frequenz, nicht mit deiner Handstärke.',
          options: ['FOLD', 'CALL'],
          actual: 'CALL'
        }
      ],
      lesson: 'Diese Hand ist als Gegenprobe dabei: nicht jede große Bet ist ein ' +
              'Fold. Am River brauchst du nur rund 23 %, und mit Trips gegen eine ' +
              'Range, die auch verpasste Draws enthält, ist der Call richtig. ' +
              'Der Fehler lag präflop — und am Turn hättest du raisen sollen, ' +
              'statt dich mit einem Call in eine River-Entscheidung ohne Stack ' +
              'zu manövrieren.'
    }
  ];

  /* ------------------------------------------------------------------ *
   * Auswertung einer Entscheidung.
   * ------------------------------------------------------------------ */

  /**
   * Rechnet eine Entscheidung durch.
   *
   * @returns {{req, eq, exact, rec, basis, n}}
   *   req   nötige Equity (0..1) — bei Bet-Entscheidungen die 50-%-Schwelle
   *   eq    deine Equity gegen villRange auf diesem Board
   *   exact true, wenn die Engine vollständig ausgezählt hat (<= 2 Karten offen)
   *   rec   empfohlene Aktion
   *   basis 'gerechnet' | 'urteil' — woher die Empfehlung kommt
   */
  function evalAsk(hand, ask) {
    if (ask.judgement) {
      return { req: null, eq: null, exact: false, n: 0,
               rec: ask.judgement, basis: 'urteil' };
    }
    const hole = cards(hand.heroCards);
    const board = cards(ask.board);
    const range = P.parseRange(ask.villRange);
    const r = P.equityVsRange(hole, range, board, 250000);
    const toCome = 5 - board.length;

    if (ask.mode === 'BET') {
      return {
        req: VALUE_BET_THRESHOLD, eq: r.eq, exact: toCome <= 2, n: r.n,
        rec: r.eq >= VALUE_BET_THRESHOLD ? 'BET' : 'CHECK', basis: 'gerechnet'
      };
    }
    const potWithBet = ask.potBB + ask.betBB;
    const req = requiredEquity(potWithBet, ask.toCallBB);
    return {
      req, eq: r.eq, exact: toCome <= 2, n: r.n,
      rec: r.eq >= req ? 'CALL' : 'FOLD', basis: 'gerechnet'
    };
  }

  /**
   * Note für eine gewählte Aktion.
   *
   * Bewusst dreistufig statt richtig/falsch: ein Raise ist in den meisten
   * dieser Spots keine gute Wahl, aber er ist auch nicht derselbe Fehler wie
   * ein Call, der Geld verbrennt. Und wo die Empfehlung nur ein Urteil ist,
   * heißt das Ergebnis nicht "falsch", sondern "abweichend".
   */
  function grade(hand, ask, picked) {
    const ev = evalAsk(hand, ask);
    let level;
    if (ev.basis === 'urteil') {
      const okSet = ev.rec === 'FOLD_OR_RAISE' ? ['FOLD', 'RAISE'] : [ev.rec];
      level = okSet.includes(picked) ? 'ok' : 'abweichend';
    } else if (picked === ev.rec) {
      level = 'ok';
    } else if (picked === 'RAISE' && ev.rec === 'CALL') {
      level = 'vertretbar';
    } else {
      level = 'falsch';
    }
    return { ...ev, picked, level, matchedActual: picked === ask.actual };
  }

  /** Alle Entscheidungen einer Hand, für Tests und Übersichten. */
  function evalHand(hand) {
    return hand.asks.map(a => ({ ask: a, ...evalAsk(hand, a) }));
  }

  function byId(id) { return HANDS.find(h => h.id === id) || null; }

  /* ------------------------------------------------------------------ *
   * Selbstprüfung der Range-Strings.
   *
   * Beim Schreiben dieser Datei sind zwei Tokens still danebengegangen:
   * 'AsK' wurde als AKo gelesen (gemeint war "Pik-Ass plus irgendein
   * König" — dafür gibt es keine Notation), und 'Kh Th' verschwand wegen
   * des Leerzeichens komplett. Die Equity kam in beiden Fällen trotzdem,
   * sie war nur falsch.
   *
   * Inzwischen meldet `P.validateRange` genau das zentral. Hier bleibt nur
   * die Schleife über alle Hände, damit der Smoke-Test die Ranges dieser
   * Datei in einem Rutsch prüfen kann.
   * ------------------------------------------------------------------ */
  function validateRanges() {
    const problems = [];
    for (const h of HANDS) {
      for (const a of h.asks) {
        if (!a.villRange) continue;
        for (const msg of P.validateRange(a.villRange)) {
          problems.push(h.id + '/' + a.street + ': ' + msg);
        }
      }
    }
    return problems;
  }

  P.OwnHands = {
    HANDS, byId, cards, requiredEquity, evalAsk, evalHand, grade,
    validateRanges, VALUE_BET_THRESHOLD
  };
})();
