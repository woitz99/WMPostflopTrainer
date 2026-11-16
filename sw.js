/* =========================================================================
   sw.js — Service Worker: der Trainer läuft offline

   Zweck ist ein konkreter: das Ding soll im Turniersaal funktionieren, wo
   es kein Netz gibt. Deshalb wird die komplette App beim ersten Besuch in
   den Cache gelegt und danach IMMER von dort bedient — nicht "erst Netz
   versuchen, dann Cache". Ein Turnierpause-Drill darf nicht auf ein
   Timeout warten.

   ---------------------------------------------------------------------
   ZWEI DINGE, DIE HIER LEICHT SCHIEFGEHEN

   1. UNTERVERZEICHNIS. Auf GitHub Pages liegt die App nicht unter "/",
      sondern unter "/<repo>/". Alle Pfade unten sind deshalb relativ und
      werden gegen die Adresse des Service Workers aufgelöst. Ein
      führender Slash würde die App auf dem iPhone still leer starten
      lassen — die Datei wäre da, nur unter einer anderen Adresse.

   2. CACHE-BUSTER IN DER URL. index.html lädt die Skripte mit "?v=NN".
      Der Cache speichert die Dateien OHNE Query und liest sie mit
      `ignoreSearch: true` wieder aus. Sonst müsste man jede Versionsnummer
      an zwei Stellen pflegen, und ein vergessener Ort heißt: die App holt
      sich offline gar nichts mehr. Deshalb steht die Nummer hier bewusst
      nirgends — sie darf sich in index.html ändern, ohne dass diese Datei
      davon weiß.

   NEUE VERSION AUSSPIELEN: CACHE_VERSION unten hochzählen. Der alte Cache
   wird beim Aktivieren gelöscht, der neue beim nächsten Start gefüllt.
   Ohne das behält ein Gerät, das die App einmal installiert hat, ewig den
   alten Stand.
   ========================================================================= */

const CACHE_VERSION = 'v20';
const CACHE_NAME = 'pokertrainer-' + CACHE_VERSION;

/* Die komplette App. Reihenfolge egal, Vollständigkeit nicht:
   was hier fehlt, fehlt offline. Der Smoke-Test gleicht diese Liste
   gegen die <script>-Tags in index.html ab. */
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/engine.js',
  'js/review.js',
  'js/ranges.js',
  'js/strategy.js',
  'js/handprofile.js',
  'js/plan.js',
  'js/tips.js',
  'js/mental.js',
  'js/eqtable.js',
  'js/icm.js',
  'js/w2d.js',
  'js/w2dstats.js',
  'js/w2daudit.js',
  'js/multiway.js',
  'js/w2dleaks.js',
  'js/w2dpost.js',
  'js/ownhands.js',
  'js/riverdrill.js',
  'js/stackoff.js',
  'js/rangeflow.js',
  'js/course.js',
  'js/courseui.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Einzeln statt addAll(): addAll bricht komplett ab, wenn EINE Datei
    // fehlt — dann ist gar nichts gecacht und der Fehler ist unsichtbar.
    await Promise.all(PRECACHE.map(async url => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res.ok) await cache.put(url, res);
        else console.warn('[sw] nicht gecacht (%s): %s', res.status, url);
      } catch (e) {
        console.warn('[sw] nicht gecacht:', url, e);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(n => n.startsWith('pokertrainer-') && n !== CACHE_NAME)
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Fremde Hosts (Schriften, was auch immer) gehen uns nichts an.
  if (new URL(req.url).origin !== self.location.origin) return;

  /* Der Index der Solver-Bibliothek wächst mit jedem Nachtlauf. Cache-first
     würde für immer die erste Fassung liefern — deshalb hier zuerst das Netz,
     offline der letzte Stand. Die Lösungen selbst ändern sich nie und
     laufen über den normalen Cache-first-Weg unten. */
  if (new URL(req.url).pathname.endsWith('/data/solver/index.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const res = await fetch(req, { cache: 'no-store' });
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return (await cache.match(req, { ignoreSearch: true }))
          || new Response('{"spots":[]}', { headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Navigation: immer die App-Hülle ausliefern, auch bei tiefen Adressen.
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html', { ignoreSearch: true });
      if (shell) return shell;
    }

    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;

    try {
      const res = await fetch(req);
      // Nachträglich dazulernen, damit auch spät geladenes offline bleibt.
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (e) {
      // Offline und nichts im Cache: für Seitenaufrufe die Hülle, sonst 504.
      const shell = await cache.match('index.html', { ignoreSearch: true });
      if (req.mode === 'navigate' && shell) return shell;
      return new Response('Offline und nicht im Cache: ' + req.url,
        { status: 504, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
