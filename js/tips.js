/* =========================================================================
   tips.js — ein Merksatz pro Trainingstag

   49 Sätze für 49 Tage, in derselben Reihenfolge wie die Wochen im Plan.
   Jeder Satz gehört zum Thema seiner Woche und ist so formuliert, dass er
   am Tisch abrufbar ist: eine Regel, ein fett markierter Kern, kein Absatz.

   Bewusst KEIN Quiz dazu. Ein Quiz nach Merksätzen prüft Wissen, Poker ist
   aber eine Handlungsfertigkeit — die Abfrage übernimmt der Drill selbst,
   und zwar an echten Spots statt an Formulierungen.
   ========================================================================= */
(function () {
  const P = window.PT;

  const TIPS = [
    /* ---------- Woche 1 · Prozess automatisieren ---------- */
    { k: 'Statisch oder dynamisch?', d: 'Stell dir bei jedem Flop eine Frage: **„Wenn ich jetzt die beste Hand habe — wie viele Karten machen mich zum Zweiten?"** Wenige Karten heißt statisch, viele heißt dynamisch. Alles Weitere folgt daraus.' },
    { k: 'Klein heißt breit', d: 'Auf statischen Boards ist die kleine Bet kein Zeichen von Schwäche, sondern von **Breite**: Du bettest fast deine ganze Range — deshalb darf jede einzelne Bet wenig kosten.' },
    { k: 'Hohe Boards gehören dem Raiser', d: 'A- und K-hohe Flops treffen die Range des Preflop-Raisers viel besser — er hat alle AK, AQ, AA, KK. **Auf hohen Boards darfst du fast immer betten**, aber klein.' },
    { k: 'Niedrige Boards gehören dem BB', d: 'Auf 765 oder 984 trifft die breite Call-Range des BB besser als deine Open-Range. **Hier gehört Checken zum Standard**, nicht zum Aufgeben.' },
    { k: 'Relativ, nicht absolut', d: '„Top Pair" heißt für sich genommen nichts. Die einzige Frage ist: **Wie viel Prozent seiner Range schlage ich gerade?** Gegen eine EP-Range ist dieselbe Hand ein Bluffcatcher, gegen eine BTN-Range eine Value-Hand.' },
    { k: 'Erst der Plan, dann die Bet', d: 'Bevor Chips reingehen, drei Fragen: **Was mache ich, wenn er raist? Was bette ich am Turn? Welche Karten stoppen mich?** Wer das nicht beantworten kann, sollte checken.' },
    { k: 'Drei Größen reichen', d: '33 % als Standard, 55 % wenn Draws zahlen sollen, 80 % wenn das Board dynamisch ist oder du im 3-Bet-Pot bist. **Mehr Größen brauchst du im Turnier nicht.**' },

    /* ---------- Woche 2 · Lernmodus aus, Defense ---------- */
    { k: 'Gegen die Bet-Range rechnen', d: 'Der häufigste Denkfehler bei Defense: Equity gegen seine **Preflop**-Range rechnen. Wenn er bettet, ist seine Range enger und stärker — rechne immer gegen das, **womit er bettet**.' },
    { k: 'MDF', d: 'Gegen 33 % verteidigst du 75 %, gegen 50 % → 67 %, gegen 75 % → 57 %, gegen Pot → 50 %. **Foldest du mehr, wird jeder seiner Bluffs automatisch profitabel.**' },
    { k: 'OOP realisierst du weniger', d: 'Ohne Position realisierst du rund **10 % weniger** deiner Equity — du kommst nicht billig zum Showdown. Ein Grenzfall auf den reinen Pot Odds ist OOP deshalb schon ein Fold.' },
    { k: 'Check-Raise ist die BB-Waffe', d: 'Als BB kannst du nicht billig zum Showdown. **Der Check-Raise ersetzt die Position** — er beendet die Hand sofort oder baut den Pot mit deinen besten Händen. Polarisiert einsetzen: Nuts und starke Draws.' },
    { k: 'Top Pair ist nicht gleich Top Pair', d: 'Gegen eine enge EP-Range, die drei Straßen bettet, ist Top Pair mit mittlerem Kicker fast immer geschlagen. **Absolute Handstärke täuscht hier am stärksten.**' },
    { k: 'Der Gegner entscheidet den Bluffcatch', d: 'Bei einem echten Bluffcatcher entscheidet nicht deine Hand, sondern **er**: gegen aggressive Gegner callen, gegen tighte folden. Ausgeglichen zu spielen ist gegen unausgeglichene Gegner ein Fehler.' },
    { k: 'Kleine Bet, breite Range', d: 'Je kleiner seine Bet, desto breiter seine Range. **Gegen kleine Bets weit verteidigen, gegen große eng** — dann aber mit den Händen, die seine Value-Kombos blocken.' },

    /* ---------- Woche 3 · Gemischt, 3-Bet-Pots und Mehrweg ---------- */
    { k: 'Erst die Frage erkennen', d: 'Bevor du an die Antwort denkst: **Welcher Spot-Typ ist das?** SRP, 3-Bet-Pot oder Mehrweg — jeder hat andere Regeln. Wer den Typ verwechselt, spielt die richtige Antwort auf die falsche Frage.' },
    { k: '3-Bet-Pot heißt niedriger SPR', d: 'Im 3-Bet-Pot liegt der SPR bei etwa 1–3. **Eine Bet committet dich.** Die Entscheidung über den Stack fällt am Flop, nicht am Turn.' },
    { k: 'Wie oft vs. wie groß', d: 'Zwei verschiedene Fragen: **Range-Advantage bestimmt, wie OFT du bettest. Nut-Advantage bestimmt, wie GROSS.** Große Sizings ohne Nut-Advantage laufen in seine stärksten Hände.' },
    { k: 'Zähl die Gegner zuerst', d: 'Im Mehrweg-Pot gilt eine Frage **vor** dem Blick auf die Karten: **„Wie viele sind noch drin?"** Ab drei Spielern ändert sich alles — nicht graduell, sondern grundsätzlich.' },
    { k: 'Mehrweg tötet den Bluff', d: 'Ein Bluff braucht, dass **alle** folden. Bei 60 % Foldrate je Gegner sind das heads-up 60 %, gegen zwei nur noch 36 %. **Im Dreiwege-Pot fällt Bluffen praktisch weg.**' },
    { k: 'Mehrweg tötet den dünnen Value', d: 'Value heißt im Mehrweg-Pot: **du musst ALLE schlagen, nicht einen.** Top Pair mit mittlerem Kicker ist gegen zwei Gegner oft schon ein Bluffcatcher — Pot klein halten.' },
    { k: 'Position wird mehr wert', d: 'Je mehr Spieler, desto wertvoller die Position — aber nicht zum Bluffen, sondern für **Information**. Du siehst zwei Entscheidungen, bevor du deine triffst.' },

    /* ---------- Woche 4 · Kurze Stacks & Push/Fold ---------- */
    { k: 'Unter 20bb endet das Postflopspiel', d: 'Mit weniger als 20bb gibt es keine drei Straßen mehr. **Die Entscheidung fällt präflop:** shoven oder nicht. Wer noch „Postflop spielen" will, verbrennt Fold-Equity.' },
    { k: 'Rechnen statt fühlen', d: 'Für Push/Fold gibt es echte Zahlen. **Sieh dir die Shove-EV an**, statt zu schätzen — viele Hände kippen zwischen 10 und 20bb von Shove auf Fold.' },
    { k: 'Fold-Equity ist der halbe Wert', d: 'Ein Shove gewinnt auf zwei Wegen: alle folden, oder du gewinnst den Showdown. **Der erste Weg trägt meist mehr** — deshalb shovst du weiter, je mehr tote Chips im Pot liegen.' },
    { k: 'Blocker schlagen Handstärke', d: 'Beim Shoven zählt, was du **blockst**. A5s shovt weiter als KJo, weil das Ass seine Call-Range blockiert — obwohl KJo „besser aussieht".' },
    { k: 'Position vor Handstärke', d: 'Deine Shove-Breite hängt stärker von der **Position** ab als von der Hand. Vom BTN müssen zwei Spieler folden, von UTG sieben.' },
    { k: 'Nicht openraisen und folden', d: 'Mit 12bb standard raisen und auf eine 3-Bet folden ist die teuerste Linie überhaupt: **Chips weg, Fold-Equity weg.** Bei dieser Tiefe gibt es nur zwei saubere Entscheidungen.' },
    { k: 'Antes senken den SPR', d: 'Antes machen den Pot präflop größer: **mehr Defense im BB, mehr Wert im Stehlen — und weniger Straßen**, bis der Stack drin ist. Zwei Bets reichen, wo vorher drei nötig waren.' },

    /* ---------- Woche 5 · ICM & Bubble ---------- */
    { k: 'Shoven und Callen sind gegensätzlich', d: 'Der wichtigste Satz der Woche: **Beim Shoven hilft dir der ICM-Druck der anderen, beim Callen wirkt er gegen dich.** Zwei völlig verschiedene Ranges.' },
    { k: 'Bin ich der Kürzeste?', d: 'Die eine Frage an der Bubble. **Wenn nein: Warten ist bares Geld.** Wenn ja: Warten hilft nicht, dich frisst der Blind — dann musst du Risiko nehmen.' },
    { k: 'Als Shorty callst du fast nichts', d: 'Als kurzer Stack an der Bubble callst du einen 8bb-Shove mit rund **8 %** deiner Hände. Ohne ICM wären es 28 %. **Wer die Chip-EV-Range benutzt, verliert genau dort das Turnier.**' },
    { k: 'Als Chipleader callst du weit', d: 'Umgekehrt: 8 von 60bb zu riskieren kostet dich kaum ICM. **Deine Schwelle liegt fast auf den Pot Odds** — rund 27 % statt 8 %. Derselbe Shove, gegensätzliche Antwort.' },
    { k: 'Je kürzer er ist, desto weiter callst du', d: 'Gegen einen 3bb-Shove callst du fast alles, gegen 15bb sehr wenig. **Nicht deine Hand entscheidet, sondern sein Stack** — er bestimmt Pot Odds und Risiko.' },
    { k: 'Druck erzeugen statt Druck spüren', d: 'An der Bubble ist der deckende Stack die stärkste Waffe. **Setz Mittelstacks unter Druck** — sie haben am meisten zu verlieren. Kurze Stacks sind committed und callen dich.' },
    { k: 'Zu früh ICM spielen ist auch ein Fehler', d: 'ICM wirkt nahe an Payjumps. **Am Tag 1 mit 300 von 400 Spielern ist es irrelevant** — wer dort schon vorsichtig spielt, sammelt nie den Stack, mit dem man ein Turnier gewinnt.' },

    /* ---------- Woche 6 · Kopfrechnen & Sizings ---------- */
    { k: 'Pot Odds in fünf Sekunden', d: 'Vier Werte decken fast alles ab: **33 % → 20 %, 50 % → 25 %, 75 % → 30 %, Pot → 33 %.** Auswendig, nicht ausgerechnet.' },
    { k: 'MDF läuft gegenläufig', d: '**Je größer seine Bet, desto mehr darfst du folden.** 33 % → 75 % verteidigen, Pot → 50 %. Das ist die Kehrseite der Pot Odds und rettet dich vor Über-Defense.' },
    { k: 'In Jetons denken, nicht in Prozent', d: 'Am Live-Tisch gibt es keine Prozentanzeige. **Lern die 33-%-Beträge deines Levels auswendig** — wer erst umrechnet, verrät sich über die Zeit, die er dafür braucht.' },
    { k: 'Bluff-Break-even', d: 'Ein Bluff muss durchgehen mit **Bet / (Pot + Bet)**: halber Pot → 33 %, Pot → 50 %. Rechne das, **bevor** du bluffst, nicht danach.' },
    { k: 'Gleiches Tempo bei jeder Entscheidung', d: 'Timing ist live eine Information. **Nimm dir überall ähnlich lange** — auch bei den einfachen Entscheidungen. Kostet nichts und schließt ein ganzes Leseraster.' },
    { k: 'Erst die Odds, dann die Hand', d: 'Die Pot Odds stehen fest, **bevor** du deine Hand bewertest. Wer die Hand zuerst ansieht, rationalisiert die Rechnung in die Richtung, die er ohnehin wollte.' },
    { k: 'Tempo vor Perfektion', d: 'Eine Entscheidung, die in fünf Sekunden zu 90 % richtig ist, schlägt eine, die nach zwei Minuten perfekt ist. **Über eine lange Session gewinnt der stabile Prozess.**' },

    /* ---------- Woche 7 · Simulation & Leak-Abbau ---------- */
    { k: 'Gegen die Station: Value, kein Bluff', d: 'Gegen jemanden, der zu viel callt, kommt dein Geld aus **dünnem Value und großen Sizings**. Bluffs sind verbrannte Chips — er foldet nicht.' },
    { k: 'Wenn die Station bettet, hat sie es', d: 'Die Kehrseite: Wer kaum blufft, blufft auch dann nicht, wenn du eine gute Hand hast. **Bettet oder raist er selbst, ist Folden richtig** — auch mit Top Pair.' },
    { k: 'Gegen den Nit: mehr bluffen, klein', d: 'Wer zu viel foldet, lädt zum Bluffen ein — und **kleine Sizings reichen**. Dünner Value bringt dagegen nichts, weil er nur mit besseren Händen callt.' },
    { k: 'Deine Fehler sind mehr wert als neue Hände', d: 'Ein Spot, den du falsch gespielt hast, lehrt dich mehr als zwanzig neue. **Arbeite die fälligen Wiederholungen ab, bevor du neue Hände spielst.**' },
    { k: 'Zweimal falsch heißt System', d: 'Ein Fehler ist Zufall, **derselbe Fehlertyp zweimal ist ein Leak.** Sieh in der Statistik nach, welcher Spot-Typ dauerhaft unter deinem Schnitt liegt — dort liegt das Geld.' },
    { k: 'Ein Satz pro Entscheidung', d: 'Live hast du keine Zeit für zehn Gedanken. **Fass jede Entscheidung in einen Satz:** „Trockenes Board, ich habe Range-Advantage, kleine Bet." Wer das nicht kann, hat keinen Plan.' },
    { k: 'Am Turniertag nichts Neues', d: 'Der letzte Tag vor dem Event ist zum **Wiederholen**, nicht zum Lernen. Neue Konzepte sind am nächsten Tag nicht abrufbar und verdrängen Vertrautes. **Schlaf ist die bessere Vorbereitung.**' }
  ];

  /** Merksatz für einen Tagesindex (0-basiert). Läuft der Plan über, bleibt er leer. */
  function tipFor(dayIdx) { return TIPS[dayIdx] || null; }
  /** Alle Merksätze einer Woche (1-basiert) — für die Wochenübersicht. */
  function tipsOfWeek(weekN) { return TIPS.slice((weekN - 1) * 7, weekN * 7); }

  P.Tips = { TIPS, tipFor, tipsOfWeek };
})();
