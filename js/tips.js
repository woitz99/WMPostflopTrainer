/* =========================================================================
   tips.js — ein Merksatz pro Trainingstag

   35 Sätze für 35 Tage, in derselben Reihenfolge wie die Wochen im Plan.
   Jeder Satz gehört zum Thema seiner Woche und ist so formuliert, dass er
   am Tisch abrufbar ist: eine Regel, ein fett markierter Kern, kein Absatz.

   Die Zahlen in Woche 4 (Satellite) stammen aus js/icm.js mit
   flatPayoutsForField, gerechnet am 08.10.2026 mit 40.000 Simulationen —
   dieselbe Rechnung, die der Range-Designer mit den Satellite-Presets
   zeigt. Sie schwanken je Lauf um rund einen Punkt.

   Bewusst KEIN Quiz dazu. Ein Quiz nach Merksätzen prüft Wissen, Poker ist
   aber eine Handlungsfertigkeit — die Abfrage übernimmt der Drill selbst,
   und zwar an echten Spots statt an Formulierungen.
   ========================================================================= */
(function () {
  const P = window.PT;

  const TIPS = [
    /* ---------- Woche 1 · Push/Fold unter 20bb ---------- */
    { k: 'Unter 20bb endet das Postflopspiel', d: 'Mit weniger als 20bb gibt es keine drei Straßen mehr. **Die Entscheidung fällt präflop:** shoven oder nicht. Wer noch „Postflop spielen" will, verbrennt Fold-Equity.' },
    { k: 'Rechnen statt fühlen', d: 'Für Push/Fold gibt es echte Zahlen. **Sieh dir die Shove-EV an**, statt zu schätzen — viele Hände kippen zwischen 10 und 20bb von Shove auf Fold.' },
    { k: 'Fold-Equity ist der halbe Wert', d: 'Ein Shove gewinnt auf zwei Wegen: alle folden, oder du gewinnst den Showdown. **Der erste Weg trägt meist mehr** — deshalb shovst du weiter, je mehr tote Chips im Pot liegen.' },
    { k: 'Blocker schlagen Handstärke', d: 'Beim Shoven zählt, was du **blockst**. A5s shovt weiter als KJo, weil das Ass seine Call-Range blockiert — obwohl KJo „besser aussieht".' },
    { k: 'Position vor Handstärke', d: 'Deine Shove-Breite hängt stärker von der **Position** ab als von der Hand. Vom BTN müssen zwei Spieler folden, von UTG sieben.' },
    { k: 'Nicht openraisen und folden', d: 'Mit 12bb standard raisen und auf eine 3-Bet folden ist die teuerste Linie überhaupt: **Chips weg, Fold-Equity weg.** Bei dieser Tiefe gibt es nur zwei saubere Entscheidungen.' },
    { k: 'Antes senken den SPR', d: 'Antes machen den Pot präflop größer: **mehr Defense im BB, mehr Wert im Stehlen — und weniger Straßen**, bis der Stack drin ist. Zwei Bets reichen, wo vorher drei nötig waren.' },

    /* ---------- Woche 2 · Kurze Stacks & das Live-Feld ---------- */
    { k: 'Gegen die Station: Value, kein Bluff', d: 'Gegen jemanden, der zu viel callt, kommt dein Geld aus **dünnem Value und großen Sizings**. Bluffs sind verbrannte Chips — er foldet nicht.' },
    { k: 'Wenn die Station bettet, hat sie es', d: 'Die Kehrseite: Wer kaum blufft, blufft auch dann nicht, wenn du eine gute Hand hast. **Bettet oder raist er selbst, ist Folden richtig** — auch mit Top Pair.' },
    { k: 'Gegen den Nit: mehr bluffen, klein', d: 'Wer zu viel foldet, lädt zum Bluffen ein — und **kleine Sizings reichen**. Dünner Value bringt dagegen nichts, weil er nur mit besseren Händen callt.' },
    { k: 'Zähl die Gegner zuerst', d: 'Im Mehrweg-Pot gilt eine Frage **vor** dem Blick auf die Karten: **„Wie viele sind noch drin?"** Ab drei Spielern ändert sich alles — nicht graduell, sondern grundsätzlich.' },
    { k: 'Mehrweg tötet den Bluff', d: 'Ein Bluff braucht, dass **alle** folden. Bei 60 % Foldrate je Gegner sind das heads-up 60 %, gegen zwei nur noch 36 %. **Im Dreiwege-Pot fällt Bluffen praktisch weg.**' },
    { k: 'Mehrweg tötet den dünnen Value', d: 'Value heißt im Mehrweg-Pot: **du musst ALLE schlagen, nicht einen.** Top Pair mit mittlerem Kicker ist gegen zwei Gegner oft schon ein Bluffcatcher — Pot klein halten.' },
    { k: 'In Jetons denken, nicht in Prozent', d: 'Am Live-Tisch gibt es keine Prozentanzeige. **Lern die 33-%-Beträge deines Levels auswendig** — wer erst umrechnet, verrät sich über die Zeit, die er dafür braucht.' },

    /* ---------- Woche 3 · ICM & die Bubble im Flight ---------- */
    { k: 'Shoven und Callen sind gegensätzlich', d: 'Der wichtigste Satz der Woche: **Beim Shoven hilft dir der ICM-Druck der anderen, beim Callen wirkt er gegen dich.** Zwei völlig verschiedene Ranges.' },
    { k: 'Bin ich der Kürzeste?', d: 'Die eine Frage an der Bubble. **Wenn nein: Warten ist bares Geld.** Wenn ja: Warten hilft nicht, dich frisst der Blind — dann musst du Risiko nehmen.' },
    { k: 'Als Shorty callst du fast nichts', d: 'Als kurzer Stack an der Bubble callst du einen 8bb-Shove mit rund **8 %** deiner Hände. Ohne ICM wären es 28 %. **Wer die Chip-EV-Range benutzt, verliert genau dort das Turnier.**' },
    { k: 'Als Chipleader callst du weit', d: 'Umgekehrt: 8 von 60bb zu riskieren kostet dich kaum ICM. **Deine Schwelle liegt fast auf den Pot Odds** — rund 27 % statt 8 %. Derselbe Shove, gegensätzliche Antwort.' },
    { k: 'Je kürzer er ist, desto weiter callst du', d: 'Gegen einen 3bb-Shove callst du fast alles, gegen 15bb sehr wenig. **Nicht deine Hand entscheidet, sondern sein Stack** — er bestimmt Pot Odds und Risiko.' },
    { k: 'Druck erzeugen statt Druck spüren', d: 'An der Bubble ist der deckende Stack die stärkste Waffe. **Setz Mittelstacks unter Druck** — sie haben am meisten zu verlieren. Kurze Stacks sind committed und callen dich.' },
    { k: 'Die Flight-Bubble ist ein Zwitter', d: 'Im Flight kommen die besten 10 % weiter, mit mindestens €1.500. **Bis dahin wirkt sie wie ein Satellite** — überleben zählt. Danach aber zählt dein Stack für Day 2 weiter. **Sicher drin heißt also nicht: Chips egal.**' },

    /* ---------- Woche 4 · Satellite: nur das Ticket zählt ---------- */
    { k: 'Platz 1 = letzter Ticketplatz', d: 'Im Satellite bekommt jeder Ticketplatz dasselbe. **Jeder Chip über der Ticketgrenze ist wertlos** — du spielst nicht um den Sieg, sondern darum, nicht unter die Linie zu fallen.' },
    { k: 'Weit weg von der Bubble: normal spielen', d: 'Bei 30 Spielern und 5 Tickets ist der Unterschied zum normalen Turnier **fast null** (Call gegen 6bb-Shove: 35 % statt 36 %). **Früh Chips sammeln** — wer schon da auf Ticket spielt, kommt zu kurz an die Bubble.' },
    { k: 'An der Bubble kippt alles', d: 'Bei 12 Spielern und 10 Tickets callst du mit 15bb einen 5bb-Shove nur noch mit rund **13 %** deiner Hände. Im normalen Turnier wären es **31 %**, nach reinen Pot Odds noch mehr. **Dieselbe Hand, gegensätzliche Antwort.**' },
    { k: 'Ein Flip braucht 93 %', d: 'An derselben Bubble liegt der Bubble-Faktor bei rund **12,6** statt 2,6 im Turnier. Für ein reines Doppel-oder-raus brauchst du damit **rund 93 %** Equity. **Ein Coinflip ist dort kein Spot, sondern ein Geschenk an die anderen.**' },
    { k: 'Zähl die Tickets, nicht die Chips', d: 'Die einzige Rechnung an der Satellite-Bubble: **Wie viele müssen noch raus, und wie viele davon sind kürzer als ich?** Sind genug kürzer, foldest du dich ins Ticket — auch mit Händen, die sich stark anfühlen.' },
    { k: 'Den Shorty rauszunehmen hilft allen', d: 'Shovt ein sehr kurzer Stack, riskierst du als großer Stack kaum etwas: mit 25bb gegen einen 4bb-Shove liegt deine Schwelle praktisch auf den Pot Odds (**38,6 % statt 38,1 %**). **Hier callen ist kein Risiko, sondern Bubble-Arbeit.**' },
    { k: 'Shoven bleibt stark', d: 'Callen wird im Satellite viel enger — **für alle am Tisch.** Genau deshalb hat dein Shove mehr Fold-Equity als im Turnier. Als mittlerer Stack mit Shorties am Tisch ist der Shove die Waffe, der Call die Falle.' },

    /* ---------- Woche 5 · Generalprobe ---------- */
    { k: 'Pot Odds in fünf Sekunden', d: 'Vier Werte decken fast alles ab: **33 % → 20 %, 50 % → 25 %, 75 % → 30 %, Pot → 33 %.** Auswendig, nicht ausgerechnet.' },
    { k: 'Gleiches Tempo bei jeder Entscheidung', d: 'Timing ist live eine Information. **Nimm dir überall ähnlich lange** — auch bei den einfachen Entscheidungen. Kostet nichts und schließt ein ganzes Leseraster.' },
    { k: 'Deine Fehler sind mehr wert als neue Hände', d: 'Ein Spot, den du falsch gespielt hast, lehrt dich mehr als zwanzig neue. **Arbeite die fälligen Wiederholungen ab, bevor du neue Hände spielst.**' },
    { k: 'Zweimal falsch heißt System', d: 'Ein Fehler ist Zufall, **derselbe Fehlertyp zweimal ist ein Leak.** Sieh in der Statistik nach, welcher Spot-Typ dauerhaft unter deinem Schnitt liegt — dort liegt das Geld.' },
    { k: 'Ein Satz pro Entscheidung', d: 'Live hast du keine Zeit für zehn Gedanken. **Fass jede Entscheidung in einen Satz:** „12bb, BTN, zwei Shorties am Tisch — Shove." Wer das nicht kann, hat keinen Plan.' },
    { k: 'Die Re-Entry-Regel steht vorher fest', d: 'Höchstens **drei Shots**, und ein Re-Entry nur, solange ein frischer Stack noch **25bb** hat — mit 18.000 Chips also bis **Big Blind 720**. Danach ist er reines Push/Fold mit 16,7 % Rake. **Nach einem Bust entscheidest du nichts neu.**' },
    { k: 'Vor dem Flight nichts Neues', d: 'Die Tage vor dem Flight sind zum **Wiederholen**, nicht zum Lernen. Neue Konzepte sind am nächsten Tag nicht abrufbar und verdrängen Vertrautes. **Schlaf ist die bessere Vorbereitung.**' }
  ];

  /** Merksatz für einen Tagesindex (0-basiert). Läuft der Plan über, bleibt er leer. */
  function tipFor(dayIdx) { return TIPS[dayIdx] || null; }
  /** Alle Merksätze einer Woche (1-basiert) — für die Wochenübersicht. */
  function tipsOfWeek(weekN) { return TIPS.slice((weekN - 1) * 7, weekN * 7); }

  P.Tips = { TIPS, tipFor, tipsOfWeek };
})();
