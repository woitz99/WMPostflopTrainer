# Pokertrainer (MTT)

Ein offline lauffähiger Turnier-Trainer für Preflop und Postflop. Kein Server, keine
Installation, keine Internetverbindung nötig: `index.html` doppelklicken.

Die Spots sind **nicht** vorgefertigte Karteikarten. Die App enthält eine eigene
Poker-Engine (7-Karten-Evaluator, Range-Parser, Kombinatorik, Monte-Carlo-Equity)
und rechnet jeden Spot live durch — im Prinzip ein eingebautes Mini-Flopzilla.
Dadurch bekommst du auf jedem Board frische Zahlen statt auswendig gelernter
Antworten.

---

## Starten

```bash
start index.html
```

Tests (optional, braucht Node):

```bash
node test/smoke.js
```

---

## Aufs Handy — offline nutzbar

Die App ist eine PWA: einmal geladen, laeuft sie vollstaendig ohne Netz.
Genau dafuer gedacht, dass sie im Turniersaal in der Pause funktioniert.

**Voraussetzung:** ein Service Worker braucht **HTTPS** (oder `localhost`).
Von `file://` oder aus der Dateien-App heraus geht es nicht — dafuer gibt es
den Einzeldatei-Build unten.

**Auf GitHub Pages veroeffentlichen**

1. Repository auf GitHub anlegen und pushen (siehe `.github/workflows/pages.yml`).
2. Im Repo unter *Settings -> Pages* als Quelle **GitHub Actions** waehlen.
3. Der Workflow laeuft bei jedem Push auf `main`: erst `node test/smoke.js`,
   dann Deployment. Schlaegt der Test fehl, wird nicht deployt — sonst koennte
   eine luckenhafte Precache-Liste unbemerkt online gehen und die App waere
   auf dem Handy still nicht mehr offline-faehig.

**Auf dem iPhone installieren**

1. Die Pages-Adresse **in Safari** oeffnen (nicht Chrome — nur Safari darf
   auf iOS zum Home-Bildschirm hinzufuegen).
2. Teilen-Symbol -> *Zum Home-Bildschirm*.
3. Einmal aus dem Home-Bildschirm starten, solange noch Netz da ist: dabei
   legt der Service Worker die App in den Cache. Danach laeuft sie offline.

**Wichtig zu den eigenen Daten:** Statistik, Fehlerliste und Notizen liegen im
`localStorage` — also pro Geraet und pro Adresse, nie auf einem Server. Handy
und Rechner fuehren getrennte Staende, und wer die Website-Daten loescht,
loescht sie. Ein Export ist nicht eingebaut.

**Neue Version ausspielen:** `CACHE_VERSION` in `sw.js` hochzaehlen. Ohne das
behaelt ein Geraet, das die App einmal installiert hat, den alten Stand.

**Ohne Hosting:** `dist/postflop-trainer.html` ist die komplette App in einer
einzigen Datei (CSS und JS eingebettet, keine externen Abhaengigkeiten).
Neu bauen mit `node build/build-single.js`. Auf dem iPhone braucht es dafuer
allerdings eine App mit eigenem Browser (z.B. Documents) — die Vorschau der
Dateien-App fuehrt kein JavaScript zuverlaessig aus, und der `localStorage`
ueberlebt das nicht.

---

## Eigene Haende — Tab *Eigene Haende*

Feste Spots aus der eigenen Historie: Board, Karten, Positionen und
Bet-Groessen stehen exakt so, wie sie gespielt wurden, nur die Entscheidung ist
offen. Gedacht fuer die Haende, die nach einem Session-Review wehtun.

Der Unterschied zu den Drill-Spots in `js/ranges.js`: dort ist das Board
zufaellig, hier ist alles fix. Der Unterschied zur Session-Auswertung: dort
wird bewertet, was du gespielt hast, hier spielst du es noch einmal.

Die Empfehlung ist **gerechnet, nicht gesetzt** (`js/ownhands.js`):

- Noetige Equity aus den Pot Odds — geschlossene Formel, exakt.
- Deine Equity gegen eine **benannte** Gegner-Range auf genau diesem Board.
  Am Turn und River zaehlt die Engine vollstaendig aus (hoechstens zwei
  Karten offen), das ist also ebenfalls exakt und keine Stichprobe.
- Empfehlung = Vergleich der beiden.

Gesetzt ist allein die Gegner-Range. Sie steht unter jeder Entscheidung
aufklappbar da, mitsamt Begruendung, warum genau diese Kombos. Wer sie anders
sieht, bekommt eine andere Empfehlung — sie ist die Annahme, nicht das
Ergebnis. Modelliert wird dabei immer die Range, mit der der Gegner **diese
Line spielt** (dreimal barrelt, dreimal leadet), nicht die, mit der er
praeflop mitgegangen ist. Die zweite ist deutlich breiter, und wer mit ihr
rechnet, callt sich arm.

Wo noch ein dritter Spieler lebt, gibt es keine Referenzstrategie (siehe
`js/multiway.js`). Solche Entscheidungen sind markiert: die Pot Odds stimmen
weiter exakt, die Equity gilt aber nur gegen den Aggressor — die echte Huerde
liegt hoeher.

---

## Was die App dir bei jeder Entscheidung zeigt

Genau die vier Dinge, die du wissen wolltest — jedes davon live berechnet:

| Frage | Wo | Wie berechnet |
|---|---|---|
| **Was sind die Nuts?** | Panel 4 | Alle 1.326 Kombos werden auf dem Board evaluiert und sortiert; die Top-5-Hände werden angezeigt |
| **Was kann der Gegner haben?** | Panel 2 | Seine Preflop-Range wird board-gefiltert und in Made-Hand-Buckets zerlegt (Set, Two Pair, Top Pair, Draw, Air …) mit Kombo-Anzahl und Prozent |
| **Wie stark ist meine Hand *relativ*?** | Panel 3 | „Du schlägst X% seiner Kombos" (Showdown jetzt) plus Equity gegen seine Range (Monte Carlo) |
| **Welches Sizing?** | Score-Balken | Jede Option bekommt 0–100 Punkte statt einer einzigen „richtigen" Antwort — Poker ist eine Mix-Strategie |

Dazu kommt Panel 1: Board-Textur, Range-Advantage und Nut-Advantage, und Panel 5
die ausformulierte Begründung.

---

## Der Prozess (der eigentliche Lerninhalt)

Im Tab **Prozess** steht der vollständige 5-Schritte-Ablauf. Kurzfassung:

1. **Board** — statisch oder dynamisch? Statisch → klein und breit betten. Dynamisch → polarisieren und groß betten.
2. **Wem gehört das Board?** — Range-Advantage bestimmt **wie oft** du bettest, Nut-Advantage bestimmt **wie groß**.
3. **Relative Handstärke** — nicht „Top Pair", sondern „ich schlage 72 % seiner Range".
4. **SPR & Plan** — bevor du bettest, kennst du schon Turn und River.
5. **Sizing** — drei Größen reichen: 33 % / 55 % / 80 %.

Diese Trennung ist auch im Code umgesetzt: `rangeAdv` steuert die Aggression `A`
(Frequenz), `nutAdv` steuert die Polarität `Pol` (Sizing). Siehe `js/strategy.js`.

---

## Trainingsplan — Tab *Plan*

49 Tage à 30 Minuten bis zum **Super Main Event** des King's Million
(€1.150, **€5.000.000 GTD**, 30.09.–06.10.2026, King's Resort Rozvadov). Das
Festival startet schon am 16.09., der Plan zielt aber auf das Main Event — das
sind zwei Wochen mehr Vorbereitung. Der Tab zeigt die heutige Einheit, den
Countdown und die Serie; **„Setup übernehmen & starten"** schreibt die
Wochen-Konfiguration in die Einstellungen und teilt sofort aus.

| Woche | Thema | Setup |
|---|---|---|
| 1 | Prozess automatisieren | nur SRP · 40–60bb · Lernmodus **an** |
| 2 | Lernmodus aus, Defense dazu | SRP + DEF · 40–100bb |
| 3 | Alles gemischt, 3-Bet-Pots | alle Spot-Typen |
| 4 | Kurze Stacks & Push/Fold | 12–35bb |
| 5 | **ICM & Bubble** | 12–35bb + täglich Tab *Range* |
| 6 | **Kopfrechnen & Sizings** | 20–60bb + täglich Tab *Rechnen* |
| 7 | Simulation & Leak-Abbau | alles + gemischte Gegnertypen |

Der Aufbau folgt drei Befunden, nicht dem Bauchgefühl:

1. **Erst blocken, dann mischen.** Geblocktes Üben lernt schneller und behält
   schlechter; Interleaving ist unangenehmer und gewinnt bei Behalten und
   Transfer — besonders dort, wo ähnliche Kategorien unterschieden werden
   müssen. Postflop ist zuerst Regelanwendung, danach Unterscheidung. Deshalb
   Woche 1 geblockt, ab Woche 3 alles gemischt. Dein Score sinkt in Woche 3
   kurzzeitig; das ist der Effekt, nicht ein Rückschritt.
2. **Abruf statt Wiederlesen.** Jede Einheit beginnt mit der fälligen
   Wiederholungsqueue, nicht mit Theorie. Der Lernmodus geht ab Woche 2 aus.
3. **Live endet im Push/Fold.** Aus der echten Struktur: 50.000 Startchips bei
   BB 300 sind 167bb. Aber **ab Level 11 von 19** ist ein Stack, der nichts
   gewinnt, unter 20bb — die letzten neun Level von Tag 1 sind Push/Fold.
   Woche 4 geht deshalb komplett auf kurze Stacks. Die vollständige
   Tiefentabelle steht im Tab *Plan*.

Woche 7 hat keine feste Handliste: sie zieht die Handklassen mit deinem
schlechtesten Score aus der eigenen Statistik.

**Laufend:** Tab *Statistik* → „Deine Fehler". Dort stehen die letzten 40 Fehler
mit Board, Hand und Baseline, jeweils mit Sprung in den Steckbrief der Hand.

---

## Hand-Steckbriefe — Tab *Hände*

Die Umkehrung des Trainers: nicht ein Board gegen alle Hände, sondern **eine Hand
gegen alle 19.600 Flops**. Das 13×13-Raster bleibt als Einstieg erhalten — es ist
nach Archetypen eingefärbt und markiert Hände, mit denen du Fehler gemacht hast.

Pro Hand:

| Panel | Inhalt | Genauigkeit |
|---|---|---|
| Trefferverteilung | was du am Flop triffst, plus Draw-Anteile | **exakt** (alle 19.600 Flops) |
| Dominanz | wie viele der 1.326 Kombos du dominierst | **exakt** |
| Gefahren-Landkarte | Stärke je Board-Textur, gegen die ganze Range *und* gegen ihr stärkstes Viertel | Stichprobe, pro Flop exakt |
| Getroffen und trotzdem hinten | konkrete Flops, auf denen dein Treffer nicht reicht | Stichprobe |
| Shove-EV | bb relativ zum Folden, 3 Positionen × 10/15/20bb | Modell (hergeleitete Call-Ranges, kein ICM) |
| Deine Fehler | Score und Fehlertexturen mit dieser Hand aus dem Trainer | deine Daten |
| Live-Hände | eigene Notizen mit Board/Spot, dauerhaft gespeichert | — |
| Archetyp | was die Klasse ausmacht, häufigster Fehler, wie du sie spielst | Text |

Zwei Konventionen, die man kennen muss:

**Board-Paare zählen nicht als Treffer.** JJ auf 7♦7♠2♣ ist am Showdown korrekt
Two Pair — aber die Siebenen hat auch der Gegner mit Q♠J♦. Gezählt wird nur, was
deine eigenen zwei Karten beitragen, sonst läse sich die Verteilung so, als flope
JJ in jedem vierten Fall eine große Hand. Sie flopt ihr Set in 11,8 %.

**Alle Zahlen sind auf deine Blocker konditioniert.** Karten in deiner Hand kann
er nicht haben. Deshalb steht AA auf K72 gegen sein stärkstes Viertel
*schlechter* da als AK — der König blockt seine K7 und K2. Zwischen zwei Händen
sind die Werte darum nur eingeschränkt vergleichbar.

Was der Steckbrief **nicht** liefert: ein EV in bb für Min-Raise oder 3-Bet. Das
gibt es nur aus einem vollständigen Solve über den ganzen Baum; eine erfundene
Zahl wäre dort schlimmer als keine. Push/Fold ist die Ausnahme — das ist eine
geschlossene Formel und wird deshalb als einzige EV-Größe ausgewiesen.

---

Tastatur: **1–5** wählen die Optionen direkt an, **Enter** blättert weiter
(Feedback → nächste Straße → nächste Hand). Damit sind 100 Hände in ~20 Minuten
machbar, ohne die Maus anzufassen. **Esc** schließt die Einstellungen.

Die Einstellungen teilen nur dann eine neue Hand aus, wenn du wirklich etwas
geändert hast — reinschauen kostet dich also nicht die laufende Hand.

---

## Range-Designer — Tab *Range*

Push/Fold **mit ICM**. Bis hierher rechnete alles in Chips; das ist an der Bubble
falsch, weil die Chips, die du gewinnst, weniger wert sind als die, die du
verlierst. Du gibst die Situation ein, wie du sie am Tisch siehst — Stack,
Spieler übrig, Plätze bis zur Bubble, Durchschnittsstack, Zahl der Shorties,
Spieler hinter dir — und bekommst das 13×13-Raster in drei Farben: shoven,
folden, und **gelb** für die Hände, die in Chips gewinnen und in Geld verlieren.

Beispiel (5bb, 100 übrig, 3 bis zur Bubble, 10 Shorties, 4 Gegner hinter dir):

| | |
|---|---|
| Bubble-Faktor | **1,56** |
| Flip braucht statt 50 % | **60,9 %** |
| Push ohne ICM | 100 % aller Hände |
| Push **mit** ICM | **33 %** |

**Wie es rechnet.** Malmuth-Harville über alle verbliebenen Spieler, per Monte
Carlo geschätzt — exakt aufzählen ließen sich 100! Reihenfolgen nicht. Das
Modell ist identisch zu einem Exponential-Rennen, was den Aufwand auf eine
Zufallszahl pro Spieler drückt. Gegen den Lehrbuchfall (3 Spieler 50/30/20)
trifft es die von Hand gerechneten 38,39 / 32,75 / 28,86 auf zwei Stellen.

Die Call-Range des Gegners ist nicht gesetzt, sondern aus **seiner** ICM-Rechnung
hergeleitet und mit deiner Shove-Range bis zum Stillstand iteriert. Damit das in
Millisekunden geht, liegt die Equity aller 14.196 Handpaare vorberechnet in
`js/eqtable.js`.

**Shoven und Callen laufen gegensätzlich.** Der Tab zeigt beide Raster. An der
Bubble hilft dir beim Shoven der ICM-Druck der anderen — sie müssen folden, deine
Fold-Equity steigt. Beim Callen gibt es keine Fold-Equity, der ganze Druck wirkt
gegen dich. Mit 5bb und einem Spieler bis zur Bubble shovst du **26 %**, callst
aber nur **5,4 %** (AA–99, AK, AQ, AJs) und brauchst dafür 58 % Equity statt der
reinen 40 % Pot Odds. Wer die beiden verwechselt, spielt die Bubble falsch.

**Bist du selbst der Kürzeste, hilft Warten nicht.** Mit 12bb und zehn Gegnern à
3bb shovst du nur 7,8 % — deren Bustout ist bares Geld. Mit 5bb gegen Shorties à
8bb sind es 26 %, weil niemand vor dir ausscheidet. Die App sagt dir, welcher
Fall vorliegt.

**Was fehlt:** kein Skill, keine Reads, keine Blindstruktur — und vor allem
**Folden kostet im Modell nichts**. In Wirklichkeit fressen dich die Blinds auf:
bei 5bb postest du 2,5bb pro Umlauf, bist also nach zwei Umläufen weg. Die echte
Shove-Range ist deshalb *weiter* als die gezeigte. Nimm Grün als Untergrenze.

---

## Kopfrechnen — Tab *Rechnen*

Online rechnet das Tool mit, live hast du 30 Sekunden und Jetons. Vier
Aufgabentypen (benötigte Equity, MDF, Bluff-Break-even, Bet-Größe) mit echten
Chipbeträgen aus **deiner** Turnierstruktur — 12.500 statt 100. Dazu eine
Sizing-Tabelle: was ein 33-%-C-Bet auf Level 8 konkret in Chips bedeutet.

---

## Die Turnierstruktur

Im Tab *Plan* steht die echte Struktur: 50.000 Startchips, **47 Level über vier
Tage**, Ante = Big Blind durchgehend. Zwei Dinge fallen daran auf:

- **Ab Level 11 von 19** ist ein Stack, der nichts gewinnt, unter 20bb. Tief
  (über 60bb) bist du nur bis Level 5. Wer nur 40–100bb übt, trainiert das erste
  Viertel von Tag 1.
- Weil die Ante dem Big Blind entspricht, liegt das tote Geld vor dem Flop
  konstant bei **2,5bb** (SB + BB + Ante). Genau mit diesem Wert rechnen der
  Range-Designer und die Shove-EV.

`P.Plan.structureAnomalies()` prüft die Progression auf Lücken — das hat einen
echten Fehler gefunden, als in einer Zwischenfassung ein ganzer Turniertag
fehlte und der Big Blind von 150.000 auf 2.000.000 sprang.

---

## Fehler-Wiederholung (Spaced Repetition)

Jede Fehlentscheidung wird als vollständiger Schnappschuss gespeichert — Board,
deine Hand, beide **verengten** Ranges, Pot, SPR, Gegnertyp und die Frage. Der
Spot lässt sich damit exakt so wiederherstellen, wie er beim ersten Mal stand.

Oben rechts erscheint **⟳ Wiederholen** mit der Zahl der fälligen Spots.

Die Intervalle folgen Leitner-Boxen:

| Box | nächste Wiederholung |
|-----|----------------------|
| 1   | ~4 Minuten (noch in derselben Session) |
| 2   | 1 Tag |
| 3   | 3 Tage |
| 4   | 7 Tage |
| 5   | 21 Tage |

Richtig → eine Box hoch. Falsch → zurück auf Box 1. Wer einen Spot in Box 5
nochmal richtig löst, hat ihn **gemeistert**; er fliegt aus der Liste.

Box 1 ist bewusst nicht auf „sofort" gesetzt: nach vier Minuten musst du den
Spot wirklich neu durchdenken, statt nur die eben gelesene Antwort zu erinnern.

Die Liste fasst **500 Spots** (~2,2 MB im localStorage), die ältesten fallen
raus. Die Ranges werden dafür kompakt kodiert — Kartenschlüssel mit fester
Breite in Base36, Gewichte nur wo sie unter 1 liegen. Das ist rund 66% kleiner
als eine naive Liste, ohne dass sich am Spot etwas ändert: die Equity gegen
eine rekonstruierte Range weicht um weniger als 0,1 Punkte ab.

Läuft der Speicher trotzdem voll, werden gezielt die ältesten Einträge
verworfen und der Vorgang wiederholt — die Statistik zeigt dann an, wie viele
weggefallen sind. Ein stilles Scheitern gibt es nicht.

Die Regeln stehen isoliert in [`js/review.js`](js/review.js) und sind in den
Tests vollständig abgedeckt.

---

## Gegnertypen

In den Einstellungen wählbar — der Typ wird dir immer angezeigt, du übst die
**Anpassung**, nicht das Erraten.

| Typ | Verhalten | Deine Anpassung |
|-----|-----------|-----------------|
| **Reg** | ausgeglichen | Baseline |
| **Calling Station** | callt zu viel, blufft fast nie | dünner Value und **größer** betten, Bluffs streichen; seine Aggression ernst nehmen |
| **Nit** | foldet zu viel | mehr bluffen, kleine Sizings reichen; dünner Value bringt nichts |
| **Aggro / Maniac** | blufft zu viel, raist zu oft | mehr checken/callen, ihn bluffen lassen; eigene Bluffs runterfahren |

Der Effekt läuft **nicht** über einen pauschalen Zuschlag auf die Empfehlung,
sondern über seine tatsächliche Bet-Range: eine Station bekommt fast alle
Bluff-Kombos entfernt, ein Maniac deutlich mehr. Dass du gegen die Station
öfter folden musst, fällt dann aus der Equity-Rechnung heraus statt aus einer
Faustregel. Konkret gemessen — dieselbe Hand (QJ) gegen dieselbe Bet:

```
Equity gegen seine Bet-Range:   Reg 32%  |  Station 20%  |  Maniac 38%
Empfehlung:                     CALL     |  FOLD         |  CALL
```

„Gemischt" wechselt den Typ pro Hand.

---

## Merksätze — einer pro Tag

Jeder der 49 Plantage hat einen **Merksatz**, der oben in der Tageseinheit
steht: eine Regel, ein fett markierter Kern, kein Absatz. Er gehört jeweils
zum Thema der Woche und ist so formuliert, dass er am Tisch abrufbar ist —
„Zähl die Gegner, bevor du die Karten ansiehst" statt einer Erklärung.

In der Wochenübersicht stehen alle sieben Sätze der Woche untereinander, der
heutige ist hervorgehoben. So siehst du, was noch kommt und was schon war.

Die Sätze stehen in [`js/tips.js`](js/tips.js) und lassen sich dort direkt
umschreiben — Reihenfolge = Tagesindex im Plan.

**Bewusst ohne Quiz.** Ein Quiz auf die Merksätze würde Wissen abfragen, aber
Poker ist eine Handlungsfertigkeit: Man kann jede Regel korrekt aufsagen und
am Tisch trotzdem falsch spielen. Die Abfrage übernimmt der Drill selbst — an
echten Spots statt an Formulierungen. Rechenaufgaben deckt der Tab *Rechnen*
ab.

## Multiway (3-Wege-Pots)

Vier Spots mit dem Tag **MW** — CO gegen BTN+BB, eingeklemmt im BB, mit
Position gegen zwei, und ein Limped Pot. Bewusst als **Flop-Drill**: die eine
Entscheidung, die im 3-Wege-Pot fast alles entscheidet. Turn und River werden
nicht simuliert, weil dafür eine echte Mehrspieler-Aktionslogik nötig wäre —
und so getan als ob wird nicht.

**Der Ansatz.** Das Feld wird *nicht* zu einem Durchschnittsgegner
verschmolzen. Jeder Gegner behält seine eigene Range, und die drei Größen, auf
die es ankommt, werden getrennt gerechnet:

| Größe | Rechnung |
|---|---|
| Equity | `equityMulti` gegen alle Ranges gleichzeitig — exakt, keine Näherung |
| relative Stärke | Produkt der Einzelwerte → P(du schlägst **alle**) |
| Gefahr | 1 − Π(1 − stark‍ᵢ) → P(**mindestens einer** hat Two-Pair+) |
| Fold-Equity | fⁿ statt f — bei 60 % je Gegner 3-way nur noch 36 % |

**Die Näherung** liegt in der Unabhängigkeitsannahme: Kartenentfernung
*zwischen* den Gegnern wird ignoriert. Für Trainingszwecke ist der Fehler
klein, mathematisch sauber wäre es nicht.

Was dabei herauskommt, entspricht dem, was Multiway-Solves zeigen — dieselbe
Range auf demselben Board:

| Board | heads-up | 3-way | 4-way |
|---|---|---|---|
| K72r | 100 % | 22 % | 22 % |
| JT8hh | 89 % | 57 % | 57 % |
| 765r | 48 % | 33 % | 30 % |

Der Grund steht in jeder Rückmeldung: Bluffs sterben (alle müssen folden),
dünner Value stirbt (du musst alle schlagen), Nut-Hände werden mehr wert
(mehr Zahler, größere Sizings).

## Calling-Ranges gegen Shorty-Shoves — Tab *Range*

Unter der Push-Range steht die **Defend-Range**: womit du callst, wenn ein
Shorty all-in geht. Das ist die andere Hälfte des ICM-Effekts und die, an der
mehr Turniere verloren werden.

Beim Shoven hilft dir der ICM-Druck der anderen — sie müssen folden, deine
Fold-Equity steigt. Beim Callen gibt es **keine Fold-Equity**, der ganze Druck
wirkt gegen dich. Die beiden Ranges sind deshalb völlig verschieden:

| Situation | ICM-Call | ohne ICM (Chip-EV) |
|---|---|---|
| weit vor der Bubble, du 20bb | 18 % | 25 % |
| an der Bubble, du 20bb | 22 % | 28 % |
| Bubble, du Chipleader 60bb | 27 % | 28 % |
| Bubble, du selbst kurz 9bb | **8 %** | 28 % |
| Chipleader gegen 3bb-Shove | 97 % | 95 % |

Die Zeile, auf die es ankommt: **als kurzer Stack an der Bubble callst du 8 %
statt 28 %.** Wer dort die Push-Range benutzt, verliert Turniere.

Gerechnet wird gegen die **Shove-Range des Shorties**, die aus derselben
ICM-Rechnung mit *seinem* Stack entsteht (bei 8bb rund 31–37 %). Je kürzer er
ist, desto weiter shovt er und desto weiter darfst du callen.

## Auf dem iPhone

Die App ist als private Web-Seite veröffentlicht:

**https://claude.ai/code/artifact/df389a85-74e7-47e6-82a3-b88b30d9c69c**

1. Link am iPhone in **Safari** öffnen (mit demselben Konto angemeldet).
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Ab dann startet sie wie eine echte App, im Vollbild, ohne Safari-Leisten.

Die Seite ist standardmäßig **privat** — nur du siehst sie, bis du sie aktiv teilst.

**Statistik ist pro Gerät getrennt.** Sie liegt im localStorage des jeweiligen
Browsers, es gibt keine Synchronisation zwischen iPhone und Desktop.

### Nach Änderungen neu bauen

Die iPhone-Version wird aus denselben Quelldateien erzeugt, damit nichts
auseinanderläuft:

```bash
node build/build-single.js
```

Das schreibt `dist/postflop-trainer.html` (eine Datei, alles inline, keine
externen Abhängigkeiten) und prüft dabei, dass keine externen URLs oder lokalen
Datei-Referenzen übrig sind — beides würde die Content-Security-Policy der
veröffentlichten Seite blockieren. Danach die Datei erneut veröffentlichen, dann
bleibt die URL gleich.

---

## Genauigkeit — was die App kann und was nicht

**Exakt gerechnet** (keine Näherung):
- Hand-Evaluierung, Nuts-Bestimmung, Kombinatorik, Range-Parsing
- Relative Handstärke, Bucket-Verteilungen, Pot Odds, MDF
- Equity: exakte Enumeration wo möglich, sonst Monte Carlo (Fehler < 0,5 %)
- Steckbriefe: Trefferverteilung über alle 19.600 Flops, Dominanz über alle
  1.326 Kombos. Gegen bekannte Referenzwerte geprüft — AKs floppt in 10,9 %
  einen Flushdraw, JJ in 11,8 % ein Set, AK dominiert 264 von 1.225 Kombos
  (21,6 %, nicht die gefühlten 90 %).

**Approximiert** (bewusst — „nicht 100 % akkurat, aber besser als jetzt"):
- Die Preflop-Ranges sind Standard-Näherungen, keine gelösten MTT-Ranges
- Die Strategie-Empfehlung ist eine **Heuristik**, kein Solver. Sie kombiniert
  Range-Advantage, Nut-Advantage, Board-Dynamik, SPR und Position nach denselben
  Prinzipien, die ein Solver benutzt — trifft aber nicht dessen exakte Frequenzen.
- Die Gefahren-Landkarte läuft auf einer Stichprobe von ~900 Flops (pro Flop
  exakt). „Sein stärkstes Viertel" nähert die weiterspielende Range über die
  Handstärke auf dem Board an, nicht über einen Solve.
- Der Shove-EV nimmt **einen** Caller an und **kein ICM**. Nahe der Bubble sind
  die echten Grenzen enger. Die Call-Ranges sind nicht gesetzt, sondern aus den
  Pot Odds gegen eine angenommene Shove-Range hergeleitet (55/40/30 % bei
  10/15/20bb aus dem SB, aus früher Position enger). Kontrolle: 72o aus dem SB
  bei 10bb landet bei ±0,05bb — genau auf der Nash-Grenze, wo die schlechteste
  Hand des Decks liegen muss.
- Kein ICM, keine Gegner-Modellierung (Reg vs Recreational)

Zur Kalibrierung: `test/smoke.js` prüft am Ende die C-Bet-Frequenz über die
**ganze** Range gegen bekannte Solver-Größenordnungen, z. B. BTN vs BB:

| Board | App | Solver-Richtwert |
|---|---|---|
| K72 rainbow (IP) | 94 %, fast alles klein | ~90 %, klein |
| 765 rainbow (IP) | 61 % | ~50 % |
| JT8 monotone (IP) | 51 %, 90 % davon groß | ~50 %, groß |
| K72r als CO **OOP** vs BTN-Flat | 22 % | ~35 % |

Die Richtung und Größenordnung stimmen; die letzten Prozentpunkte nicht. Für den
Zweck („mein Spiel besser machen") ist das ausreichend — der Lernwert steckt im
Prozess, nicht in der dritten Nachkommastelle.

---

## Mit Flopzilla / HRC / Equilab kombinieren

Die App ersetzt diese Tools nicht, sie macht sie schneller nutzbar. Die Ranges
stehen als reine Strings in `js/ranges.js` und lassen sich direkt austauschen:

```js
const RFI = {
  BTN: '22+, A2s+, K2s+, ...',   // <- hier deine eigene Range einsetzen
```

**Welche Notation der Parser liest:** `AA`, `AKs`, `AKo`, `AK` (= s + o),
`77+`, `A9s+`, `KTo+`, `55-22`, `A5s-A2s`, `T9s-76s`, einzelne Kombos wie `AhKd`
und Gewichte wie `AKs:0.5`. Alles andere wird **gemeldet, nicht stillschweigend
umgedeutet** — `parseRange` liefert weiter nur die Kombos, `P.parseRangeStrict`
gibt zusätzlich die unlesbaren Tokens zurück und `P.validateRange` fertige
Meldungen. Im Analyse-Tab erscheinen sie als Warnung über dem Ergebnis; für die
Ranges in `js/ranges.js` prüft `node test/smoke.js` sie mit. Das war früher der
gefährlichste Fall: `AsK` wurde still als `AKo` gelesen, `Kh Th` verschwand
komplett — und die Equity kam trotzdem, nur falsch.

**Workflow, der sich lohnt:**

1. **HRC / GTO-Wizard** → exportiere deine tatsächlichen Preflop-Ranges für die
   Stackgröße, die du spielst. In `js/ranges.js` einsetzen. Ab da rechnet die App
   mit *deinen* Ranges.
2. **Flopzilla** → wenn dich im Feedback eine Bucket-Verteilung überrascht, baue
   das Board dort nach und schau dir die Details an. Der Analyse-Tab der App macht
   dasselbe, aber Flopzilla zeigt mehr Zwischenstufen.
3. **Equilab** → für Equity gegen eine *einzelne* Hand. Die App rechnet immer
   gegen Ranges, was für Entscheidungen fast immer das Richtige ist.

Der **Analyse-Tab** ist der Flopzilla-Modus: Board und Ranges eintippen (oder ein
Preset laden), und du bekommst Textur, Nuts, beide Bucket-Verteilungen,
Range-Advantage und — falls du eine Hand angibst — relative Stärke und Empfehlung.
Damit kannst du auch echte Hände aus deinen Turnieren nachanalysieren.

Range-Syntax: `AA`, `AKs`, `AQo+`, `77+`, `55-22`, `A5s-A2s`, `T9s-76s`, `KQ`
(= s und o), `AhKd` (konkrete Kombo), `AKs:0.5` (Gewicht).

---

## Dateien

```
index.html          Oberfläche
css/style.css       Styling
js/engine.js        Evaluator, Range-Parser, Equity, Board-Analyse, Nuts
js/ranges.js        MTT-Preflop-Ranges + Spot-Bibliothek (13 Spots)  <- hier anpassen
js/strategy.js      Heuristik: Aktion, Sizing, Bewertung, Range-Narrowing
js/review.js        Leitner-Boxen für die Fehler-Wiederholung
js/handprofile.js   Steckbriefe: Flop-Enumeration, Dominanz, Shove-EV, Archetypen
js/plan.js          Trainingsplan + die echte Blindstruktur (47 Level, 4 Tage)
js/mental.js        Pot Odds, MDF, Bluff-Break-even, Sizing-Tabellen
js/eqtable.js       vorberechnete Equity aller 14.196 Handpaare (generiert)
js/icm.js           Independent Chip Model, Bubble-Faktor, ICM-Push/Fold
js/app.js           Drill-Ablauf und sämtliche Ansichten
test/smoke.js       346 Checks: Engine, Steckbriefe, ICM, Plan, Kopfrechnen
```

`js/eqtable.js` ist erzeugt, nicht von Hand geschrieben: 14.196 Handpaare à 8.000
Simulationen, als 28-kB-Tabelle abgelegt. Zur Laufzeit gerechnet kostete das 7,4
Sekunden und war trotzdem ungenauer.

Die Rechenteile (`engine`, `handprofile`, `plan`, `review`) sind DOM-frei und
laufen im Test unter node. Was in `app.js` steht, ist nur Darstellung.

Wenn du JS-Dateien änderst und der Browser alte Versionen cacht: in `index.html`
den Parameter `?v=` an den `<script>`-Tags hochzählen.

## Spot-Bibliothek

13 Spots, gewichtet nach Häufigkeit im Turnier. Die drei häufigsten (BTN vs BB als
Aggressor, BB-Defense vs BTN, CO vs BB) kommen am öftesten — sie machen den
Großteil deiner realen Postflop-Situationen aus.

- **SRP als Aggressor:** BTN/CO/MP vs BB, CO vs BTN (OOP), SB vs BB
- **Defense:** BB vs BTN/CO/MP, BTN vs CO (IP)
- **3-Bet-Pots:** BB 3-bettet vs BTN (OOP), BTN callt 3-Bet (IP), BTN 3-bettet vs CO, EP callt 3-Bet (OOP)
