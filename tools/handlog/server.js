/* =========================================================================
   Hand-Logbuch — lokaler Server

   Liest die Handhistorien, die der win2day-Client während eines Turniers
   fortlaufend in AppData schreibt, und speichert Kommentare zu einzelnen
   Händen. Die Seite zeigt nur Hände, die der Client schon abgeschlossen in
   die Datei geschrieben hat — es gibt also keine Information über eine
   laufende Hand und keine Hinweise während des Spiels.

   Start:  node tools/handlog/server.js      (danach http://127.0.0.1:8139)

   Keine Abhängigkeiten. Lauscht nur auf 127.0.0.1, die Daten verlassen den
   Rechner nicht.

   Umgebungsvariablen (optional):
     HANDLOG_PORT   Port, Standard 8139
     HANDLOG_HH     Ordner mit den Turnier-XMLs, Standard wird gesucht
     HANDLOG_NOTES  Kommentar-Datei, Standard Dokumente\Poker-Handlog\notizen.json
   ========================================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = +process.env.HANDLOG_PORT || +process.env.PORT || 8139;
const ROOT = __dirname;
const JS_DIR = path.join(ROOT, '..', '..', 'js');
const NOTES = process.env.HANDLOG_NOTES ||
  path.join(process.env.USERPROFILE || process.env.HOME || ROOT, 'Documents', 'Poker-Handlog', 'notizen.json');

/** Ein "Abend" beginnt um 05:00 — eine Session über Mitternacht bleibt ein Abend. */
const DAY_CUTOFF_H = 5;

/* ---------- Handhistorien-Ordner finden ---------- */
function findHH() {
  if (process.env.HANDLOG_HH) return process.env.HANDLOG_HH;
  const base = path.join(process.env.LOCALAPPDATA || '', 'win2day Poker', 'data');
  let best = null, bestT = 0;
  try {
    for (const nick of fs.readdirSync(base)) {
      const dir = path.join(base, nick, 'History', 'Data', 'Tournaments');
      try {
        const t = fs.statSync(dir).mtimeMs;
        if (t > bestT) { best = dir; bestT = t; }
      } catch (e) { /* kein Spielerordner */ }
    }
  } catch (e) { /* win2day nicht installiert */ }
  return best;
}
const HH = findHH();

/* ---------- Kopfdaten einer Turnierdatei ---------- */
// Der Client schreibt UTF-8, das Eurozeichen und Umlaute aber doppelt
// kodiert ("â‚¬" statt "€"). Nur diese bekannten Folgen werden repariert.
const MOJIBAKE = [['â‚¬', '€'], ['Ã¤', 'ä'], ['Ã¶', 'ö'], ['Ã¼', 'ü'], ['Ã„', 'Ä'], ['Ã–', 'Ö'], ['Ãœ', 'Ü'], ['ÃŸ', 'ß']];
function fixText(s) { for (const [a, b] of MOJIBAKE) s = s.split(a).join(b); return s; }

function tag(xml, name) {
  const m = xml.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'));
  return m ? m[1].trim() : '';
}
/** "€19 + €1" oder "€1.000" -> Summe in Euro */
function euro(s) {
  let sum = 0;
  for (const m of String(s).matchAll(/([\d.]+(?:,\d+)?)/g)) sum += parseFloat(m[1].replace(/\./g, '').replace(',', '.')) || 0;
  return sum;
}
function dayKey(dateStr) { // "2026-10-18 20:24:48" (Ortszeit) -> "2026-10-18"
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d)) return '';
  d.setHours(d.getHours() - DAY_CUTOFF_H);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const headCache = new Map(); // datei -> {mtimeMs, meta}
function headOf(file) {
  const full = path.join(HH, file);
  const st = fs.statSync(full);
  const c = headCache.get(file);
  if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) return c.meta;
  const fd = fs.openSync(full, 'r');
  const buf = Buffer.alloc(Math.min(st.size, 4096));
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const head = fixText(buf.toString('utf8'));
  const rebuys = parseInt(tag(head, 'rebuys'), 10) || 0, addons = parseInt(tag(head, 'addon'), 10) || 0;
  const meta = {
    code: file.replace(/\.xml$/i, ''),
    name: tag(head, 'tournamentname') || tag(head, 'tablename'),
    tournamentCode: tag(head, 'tournamentcode'),
    start: tag(head, 'startdate'),
    buyin: euro(tag(head, 'totalbuyin')),
    rebuys, addons,
    rebuyCost: euro(tag(head, 'totalrebuycost')),
    addonCost: euro(tag(head, 'totaladdoncost')),
    place: tag(head, 'place'),
    win: tag(head, 'win'),
    mtime: st.mtimeMs, size: st.size
  };
  meta.day = dayKey(meta.start);
  headCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, meta });
  return meta;
}
function listFiles() {
  if (!HH) return [];
  let names = [];
  try { names = fs.readdirSync(HH); } catch (e) { return []; }
  // Manuelle Kopien ("… - Kopie.xml") sind Duplikate derselben Session.
  return names.filter(n => /^\d+\.xml$/i.test(n)).map(n => { try { return headOf(n); } catch (e) { return null; } }).filter(Boolean);
}

/* ---------- Kommentare ---------- */
function readNotes() {
  try { return JSON.parse(fs.readFileSync(NOTES, 'utf8')); } catch (e) { return {}; }
}
function writeNotes(obj) {
  fs.mkdirSync(path.dirname(NOTES), { recursive: true });
  const tmp = NOTES + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, NOTES); // atomar: eine halb geschriebene Datei gibt es nie
}

/* ---------- HTTP ---------- */
function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((ok, fail) => {
    let s = '';
    req.on('data', d => { s += d; if (s.length > 1e6) { fail(new Error('zu groß')); req.destroy(); } });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { fail(e); } });
  });
}
const STATIC = {
  '/': [path.join(ROOT, 'handlog.html'), 'text/html; charset=utf-8'],
  '/engine.js': [path.join(JS_DIR, 'engine.js'), 'text/javascript; charset=utf-8'],
  '/w2d.js': [path.join(JS_DIR, 'w2d.js'), 'text/javascript; charset=utf-8']
};
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const server = http.createServer(async (req, res) => {
  // Nur Anfragen vom eigenen Rechner an die eigene Adresse. Schützt davor,
  // dass eine fremde Webseite im Browser die Kommentare liest oder schreibt.
  const host = req.headers.host || '';
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return send(res, 403, { error: 'Nur lokal erreichbar.' });
  const origin = req.headers.origin;
  if (req.method !== 'GET' && origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return send(res, 403, { error: 'Fremde Herkunft.' });

  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && STATIC[p]) {
      const [file, type] = STATIC[p];
      return send(res, 200, fs.readFileSync(file), type);
    }
    if (p === '/api/status') {
      return send(res, 200, { hhDir: HH, notesFile: NOTES, found: !!HH });
    }
    if (p === '/api/days') {
      const by = {};
      for (const f of listFiles()) if (f.day) by[f.day] = (by[f.day] || 0) + 1;
      return send(res, 200, Object.entries(by).sort((a, b) => b[0] < a[0] ? -1 : 1).map(([day, n]) => ({ day, files: n })));
    }
    if (p === '/api/files') {
      const day = url.searchParams.get('day');
      return send(res, 200, listFiles().filter(f => !day || f.day === day).sort((a, b) => a.start < b.start ? -1 : 1));
    }
    let m;
    if ((m = p.match(/^\/api\/file\/(\d+)$/))) {
      const full = path.join(HH, m[1] + '.xml');
      return send(res, 200, fixText(fs.readFileSync(full, 'utf8')), 'text/xml; charset=utf-8');
    }
    if (p === '/api/notes' && req.method === 'GET') return send(res, 200, readNotes());
    if ((m = p.match(/^\/api\/notes\/([^/]+)$/))) {
      const id = decodeURIComponent(m[1]);
      if (!ID_RE.test(id)) return send(res, 400, { error: 'Ungültige Hand-ID.' });
      const notes = readNotes();
      if (req.method === 'PUT') {
        const body = await readBody(req);
        notes[id] = { ...body, id, updatedAt: new Date().toISOString() };
        writeNotes(notes);
        return send(res, 200, notes[id]);
      }
      if (req.method === 'DELETE') {
        delete notes[id];
        writeNotes(notes);
        return send(res, 200, { ok: true });
      }
    }
    send(res, 404, { error: 'Nicht gefunden.' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Hand-Logbuch läuft:  http://127.0.0.1:' + PORT);
  console.log('Handhistorien:       ' + (HH || 'NICHT GEFUNDEN – HANDLOG_HH setzen'));
  console.log('Kommentare:          ' + NOTES);
});
