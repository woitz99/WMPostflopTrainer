# Hand-Logbuch

Liest die Handhistorien mit, die der win2day-Client während eines Turniers schreibt. Jede fertige Hand erscheint ein paar Sekunden nach Handende. Du kannst zu jeder Hand einen Kommentar speichern.

## Starten

Doppelklick auf **`Hand-Logbuch starten.cmd`**. Das öffnet http://127.0.0.1:8139 im Browser. Lass das schwarze Fenster offen, solange du spielst.

Alternativ im Terminal:

```bash
node tools/handlog/server.js
```

## Was es zeigt

- **Abend** (beginnt um 05:00): Einsatz gegen Budget, Entries, Hände und Netto. Darunter jedes Turnier mit Status (läuft, Bust mit Uhrzeit, Re-Entry) und Cash.
- **Hinweise:** 15 Minuten Pause nach einem Bust, die Re-Entry-Phase, eine Warnung bei zwei laufenden Tischen und der Budgetstand.
- **Hände:** Neueste oben, mit Karten, Board, Position, Stack und Ergebnis in bb. Ein Klick öffnet den Ablauf pro Straße und das Kommentarfeld mit Tags, Leak-Kategorien und Stimmung. <kbd>Strg</kbd>+<kbd>Enter</kbd> speichert.

## Was es nicht tut

- Es zeigt **nur abgeschlossene Hände**, also genau das, was der Client schon gespeichert hat. Es liest nichts vom Bildschirm und gibt während einer Hand keine Hinweise.
- Es läuft nur auf deinem Rechner (127.0.0.1). Nichts verlässt den PC.
- Es funktioniert nur mit **win2day**. GGPoker speichert keine Handhistorien lokal.
- Ein Day 2 zählt ohne Buy-in, weil der schon am Day 1 bezahlt wurde. Erkannt wird das am Namen („Day 2“).

## Wo die Kommentare liegen

`Dokumente\Poker-Handlog\notizen.json`. Jeder Eintrag enthält die Eckdaten der Hand (Karten, Board, Position, Stack, Ablauf, Ergebnis), damit er auch ohne die XML lesbar bleibt. Für ein Review reicht es, diese Datei und die Handhistorien zu nennen.

Andere Pfade lassen sich über Umgebungsvariablen setzen: `HANDLOG_HH` für den Ordner mit den Handhistorien, `HANDLOG_NOTES` für die Kommentar-Datei, `HANDLOG_PORT` für den Port.
