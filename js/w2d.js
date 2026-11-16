/* =========================================================================
   w2d.js — win2day / Boss-Media Handhistorien lesen und auswerten

   Die exportierte XML ist eine Session (= ein Turnier) mit einem <game> je
   Hand. Alles hier ist reine Rechnung ohne DOM, damit es in node prüfbar
   bleibt.

   AKTIONS-CODES. Die XML nennt nur Zahlen. Sie sind hier nicht geraten,
   sondern aus 3.790 Aktionen der Beispieldatei abgeleitet — über die Runde,
   in der sie vorkommen, den Betrag und den Abgleich mit Blinds und Stack:

     0  Fold      Betrag immer 0, alle Setzrunden
     1  Small Blind   nur Runde 0, Betrag = SB
     2  Big Blind     nur Runde 0, Betrag = BB
     3  Call
     4  Check     Betrag immer 0
     5  Bet       kommt nie präflop vor — dort ist alles ein Raise
     7  All-in    in 14 von 16 Fällen exakt der komplette Stack
    15  Ante      nur Runde 0, Betrag = Ante
    23  Raise     überwiegend präflop

   Unbekannte Codes werden NICHT stillschweigend verworfen, sondern in
   `unknownTypes` gemeldet — sonst würde eine spätere Formatänderung die
   Statistik still verfälschen.

   BETRÄGE. `sum` ist der zusätzlich eingezahlte Betrag, nicht der Gesamtbetrag
   ("raise to"). Das ist an den Daten belegbar: auf ein Raise auf 440 und ein
   Reraise auf 1.200 folgt ein Call über 760 — also 1.200 minus 440.

   ERGEBNIS JE HAND. Nicht `win` minus `bet` rechnen. Das Attribut `bet`
   enthält auch Beträge, die nie gecallt und zurückgegeben wurden. In der
   ersten Hand der Beispieldatei ergäbe das −218 Chips für eine gewonnene
   Hand. Richtig ist die Differenz der Stackstände zweier aufeinander-
   folgender Hände; für die letzte Hand wird der zurückgegebene Betrag
   explizit berechnet.
   ========================================================================= */
(function () {
  const P = window.PT;

  const ACT = {
    0: 'fold', 1: 'sb', 2: 'bb', 3: 'call', 4: 'check',
    5: 'bet', 7: 'allin', 15: 'ante', 23: 'raise'
  };
  const STREETS = { 0: 'blinds', 1: 'preflop', 2: 'flop', 3: 'turn', 4: 'river' };

  /** "1.234,50" -> 1234.5   (Punkt = Tausender, Komma = Dezimal) */
  function num(s) {
    if (s === undefined || s === null || s === '') return 0;
    const v = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
    return isFinite(v) ? v : 0;
  }

  /** "S8" -> 8♠ als Karten-Int, "H10" -> T♥, "HA" -> A♥. */
  const SUIT_MAP = { C: 'c', D: 'd', H: 'h', S: 's' };
  function parseCard(tok) {
    if (!tok || tok === 'X' || tok[0] === 'X') return null;
    const suit = SUIT_MAP[tok[0].toUpperCase()];
    let rank = tok.slice(1).toUpperCase();
    if (rank === '10') rank = 'T';
    if (!suit || P.RANKS.indexOf(rank) < 0) return null;
    return P.cardFromStr(rank + suit);
  }
  function parseCards(str) {
    if (!str) return [];
    return String(str).trim().split(/\s+/).map(parseCard).filter(c => c !== null);
  }

  /* ------------------------------------------------------------------ *
   * Parser. Bewusst regexbasiert statt DOMParser, damit dasselbe Modul
   * im Browser und in node läuft.
   * ------------------------------------------------------------------ */
  function attr(tag, name) {
    const m = tag.match(new RegExp(name + '="([^"]*)"'));
    return m ? m[1] : '';
  }
  function tagText(xml, name) {
    const m = xml.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'));
    return m ? m[1].trim() : '';
  }

  function parseSession(xml) {
    const sessionCode = (xml.match(/sessioncode="(\d+)"/) || [])[1] || '';
    const head = xml.slice(0, xml.indexOf('<game ') >= 0 ? xml.indexOf('<game ') : xml.length);
    const meta = {
      sessionCode,
      nickname: tagText(head, 'nickname'),
      gameType: tagText(head, 'gametype'),
      tableName: tagText(head, 'tablename'),
      tournamentName: tagText(head, 'tournamentname'),
      tournamentCode: tagText(head, 'tournamentcode'),
      startDate: tagText(head, 'startdate'),
      duration: tagText(head, 'duration'),
      gameCount: num(tagText(head, 'gamecount')),
      tableSize: num(tagText(head, 'tablesize')),
      place: num(tagText(head, 'place')),
      buyIn: tagText(head, 'totalbuyin'),
      win: tagText(head, 'win'),
      currency: tagText(head, 'currency')
    };

    const unknownTypes = {};
    const chunks = xml.split('<game ').slice(1);
    const hands = [];

    for (let gi = 0; gi < chunks.length; gi++) {
      const g = chunks[gi];
      const gamecode = (g.match(/^gamecode="(\d+)"/) || [])[1] || '';
      const sb = num(tagText(g, 'smallblind'));
      const bb = num(tagText(g, 'bigblind'));
      const ante = num(tagText(g, 'ante'));

      // WICHTIG: <player> ist meist selbstschließend, hat aber bei einem
      // Knockout ein Kind-Element <knockout .../> und endet dann auf ">".
      // Ein Regex, der nur "/>" akzeptiert, überspringt genau die Hände, in
      // denen du jemanden rausgeworfen hast — also die interessantesten.
      const players = [];
      for (const pm of g.matchAll(/<player\s([^>]*?)(\/>|>([\s\S]*?)<\/player>)/g)) {
        const t = pm[1], inner = pm[3] || '';
        const ko = [];
        for (const km of inner.matchAll(/<knockout\s([^>]*?)\/>/g)) {
          ko.push({
            kicked: attr(km[1], 'kicked'),
            toBalance: attr(km[1], 'tobalance'),
            toBounty: attr(km[1], 'tobounty')
          });
        }
        players.push({
          name: attr(t, 'name'), seat: num(attr(t, 'seat')),
          chips: num(attr(t, 'chips')), bet: num(attr(t, 'bet')),
          win: num(attr(t, 'win')), dealer: attr(t, 'dealer') === '1',
          regCode: attr(t, 'reg_code'), knockouts: ko
        });
      }
      // Hero: der Spieler, dessen reg_code die Session ist. Fällt das aus,
      // greift der Nickname aus dem Kopf der Datei.
      let hero = players.find(p => p.regCode && p.regCode === sessionCode);
      if (!hero) hero = players.find(p => p.name === meta.nickname);

      const streets = { blinds: [], preflop: [], flop: [], turn: [], river: [] };
      const board = { flop: [], turn: [], river: [] };
      const holeCards = {};
      let heroCards = [];

      /* Raise (Typ 23) steht im XML als Betrag AUF — Gesamteinsatz der
         Straße, preflop inklusive Blind. Call, Bet und All-in (Typ 7) sind
         dagegen Zusatzbeträge. Hier wird der Raise auf den Zusatzbetrag
         umgerechnet (`to` behält den Originalwert), damit sich `amount` überall
         aufsummieren lässt. Geprüft an 2.414 Händen: so geht der Pot in jeder
         Hand exakt auf die Gewinne auf; vorher scheiterten Hände, in denen
         jemand aus dem Blind oder zweimal in einer Straße raist. */
      let streetIn = {};
      for (const rm of g.matchAll(/<round no="(\d+)">([\s\S]*?)(?=<round no="|<\/game>|$)/g)) {
        const street = STREETS[+rm[1]];
        const body = rm[2];
        if (+rm[1] >= 2) streetIn = {};   // Blinds zählen in die Preflop-Straße
        for (const cm of body.matchAll(/<cards player="([^"]*)" type="Pocket">([^<]*)<\/cards>/g)) {
          const cs = parseCards(cm[2]);
          if (cs.length === 2) holeCards[cm[1]] = cs;
        }
        for (const cm of body.matchAll(/<cards type="(Flop|Turn|River)">([^<]*)<\/cards>/g)) {
          board[cm[1].toLowerCase()] = parseCards(cm[2]);
        }
        if (!street) continue;
        for (const am of body.matchAll(/<action no="(\d+)" player="([^"]*)" sum="([^"]*)" type="(\d+)"\s*\/>/g)) {
          const code = +am[4];
          const kind = ACT[code];
          if (!kind) { unknownTypes[code] = (unknownTypes[code] || 0) + 1; continue; }
          const player = am[2], sum = num(am[3]), before = streetIn[player] || 0;
          const act = { no: +am[1], player, amount: sum, kind, code };
          if (kind === 'raise' && sum > before) { act.amount = sum - before; act.to = sum; }
          if (kind !== 'ante') streetIn[player] = before + act.amount;
          streets[street].push(act);
        }
      }
      if (hero && holeCards[hero.name]) heroCards = holeCards[hero.name];

      const boardAll = board.flop.concat(board.turn, board.river);
      // Eigener Einsatz aus den Aktionen aufsummiert. Das Attribut `bet`
      // ist nicht überall vollständig — in der letzten Hand der Beispiel-
      // datei fehlt darin der Ante von 3.000, und die Bilanz ginge um genau
      // diesen Betrag nicht auf.
      const invested = {};
      for (const st of Object.keys(streets))
        for (const a of streets[st]) invested[a.player] = (invested[a.player] || 0) + a.amount;

      hands.push({
        idx: gi, gamecode, sb, bb, ante, players, invested,
        hasHero: !!hero, hero: hero ? hero.name : meta.nickname,
        heroSeat: hero ? hero.seat : 0, heroChips: hero ? hero.chips : 0,
        knockouts: hero ? hero.knockouts : [],
        heroCards, holeCards, board, boardAll, streets,
        startDate: tagText(g, 'startdate')
      });
    }

    /* Ergebnis je Hand über die Stackdifferenz zur nächsten Hand, in der
       der Held wieder sitzt. Nicht einfach die Folgehand nehmen: die Datei
       enthält vereinzelt Hände von einem anderen Tisch, an dem er gar nicht
       saß — über die hinweg bleibt sein Stack unverändert. */
    for (let i = 0; i < hands.length; i++) {
      const h = hands[i];
      h.heroNetBB = 0; h.heroStackBB = h.bb ? h.heroChips / h.bb : 0;
      if (!h.hasHero) { h.heroNet = 0; continue; }
      let nxt = null;
      for (let j = i + 1; j < hands.length; j++) {
        if (hands[j].hasHero) { nxt = hands[j]; break; }
      }
      const heroNext = nxt && nxt.players.find(p => p.name === h.hero);
      h.heroNet = heroNext ? heroNext.chips - h.heroChips : netFromUncalled(h);
      h.heroNetBB = h.bb ? h.heroNet / h.bb : 0;
    }

    const heroHands = hands.filter(h => h.hasHero);
    const bounties = [];
    for (const h of heroHands) for (const k of h.knockouts) bounties.push({ hand: h.idx, ...k });

    return {
      meta, hands, heroHands, bounties, unknownTypes, actionMap: ACT,
      skipped: hands.length - heroHands.length
    };
  }

  /**
   * Fallback für die letzte Hand: `bet` enthält auch nicht gecallte Beträge.
   * Der zurückgegebene Teil ist die Differenz zwischen dem höchsten und dem
   * zweithöchsten Gesamteinsatz der Hand.
   */
  function netFromUncalled(h) {
    const hero = h.players.find(p => p.name === h.hero);
    if (!hero) return 0;
    const mine = h.invested[h.hero] || 0;
    const all = h.players.map(p => h.invested[p.name] || 0).sort((a, b) => b - a);
    const uncalled = all.length > 1 ? all[0] - all[1] : 0;
    const isTop = mine === all[0] && (all.length < 2 || all[0] > all[1]);
    return hero.win - mine + (isTop ? uncalled : 0);
  }

  /* ------------------------------------------------------------------ *
   * Positionen. Die Sitzplätze sind nicht lückenlos (1,2,4,5,6,7,9),
   * deshalb wird ab dem Dealer im Kreis gezählt.
   * ------------------------------------------------------------------ */
  const POS_NAMES = {
    2: ['BTN', 'BB'],
    3: ['BTN', 'SB', 'BB'],
    4: ['BTN', 'SB', 'BB', 'CO'],
    5: ['BTN', 'SB', 'BB', 'MP', 'CO'],
    6: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'],
    7: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'MP', 'CO'],
    8: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'MP', 'MP1', 'CO'],
    9: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'MP', 'MP1', 'CO'],
    10: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'MP', 'MP1', 'MP2', 'CO']
  };

  /**
   * Positionen bestimmen.
   *
   * Zwei Sonderfälle, die in der Beispieldatei beide vorkommen:
   *
   * TOTER BUTTON — dealer="1" fehlt ganz, weil der Button auf einem
   * inzwischen leeren Sitz liegt (8 von 194 Händen).
   * TOTER SMALL BLIND — der Button ist gesetzt, aber niemand postet den SB
   * (3 Hände). Dann ist der Sitz zwischen Button und BB übersprungen.
   *
   * Deshalb ist das Dealer-Flag die erste Wahl: es überlebt den toten SB.
   * Nur wenn es fehlt, wird am Big Blind verankert — und weil dabei nicht
   * entscheidbar ist, welcher Sitz in der Rotation übersprungen wurde, wird
   * das Ergebnis als unsicher markiert. Positionsbezogene Auswertungen
   * lassen diese Hände aus, statt sie falsch einzusortieren.
   *
   * @returns {map, certain}
   */
  function positionsOf(hand) {
    const seated = hand.players.slice().sort((a, b) => a.seat - b.seat);
    const n = seated.length;
    const names = POS_NAMES[n] || POS_NAMES[9];
    const map = {};

    const di = seated.findIndex(p => p.dealer);
    if (di >= 0) {
      for (let k = 0; k < n; k++) map[seated[(di + k) % n].name] = names[k] || 'MP';
      return { map, certain: true };
    }

    const bbAct = (hand.streets.blinds || []).find(a => a.kind === 'bb');
    const anchor = bbAct ? seated.findIndex(p => p.name === bbAct.player) : -1;
    if (anchor < 0) return { map, certain: false };
    // names[] beginnt beim Button, der BB steht dort an Index 2.
    for (let k = 0; k < n; k++) map[seated[(anchor + k) % n].name] = names[(k + 2) % n] || 'MP';
    // BB und SB stehen fest (beide gepostet), alles davor ist eine Annahme.
    const sbAct = (hand.streets.blinds || []).find(a => a.kind === 'sb');
    return { map, certain: false, sbPosted: !!sbAct };
  }

  /** Bequemer Zugriff, wenn die Sicherheit nicht interessiert. */
  function positions(hand) { return positionsOf(hand).map; }

  /** Grobe Zusammenfassung: IP/OOP und früh/spät, für die Auswertung. */
  const LATE = ['BTN', 'CO'];
  const BLINDS = ['SB', 'BB'];

  P.W2D = {
    ACT, STREETS, num, parseCard, parseCards, parseSession,
    positions, positionsOf, POS_NAMES, LATE, BLINDS, netFromUncalled
  };
})();
