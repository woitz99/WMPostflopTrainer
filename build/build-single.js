/* =========================================================================
   build-single.js — baut aus index.html + css + js EINE eigenständige Datei.
   Ziel: die iPhone-/Web-Version bleibt automatisch synchron zur lokalen App.

       node build/build-single.js

   Ausgabe: dist/postflop-trainer.html
   Bewusst OHNE <!DOCTYPE>/<html>/<head>/<body> — die Datei wird beim
   Veröffentlichen als Artifact in ein Grundgerüst eingebettet.
   ========================================================================= */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const html = read('index.html');
const css = read('css/style.css');
const JS_FILES = ['js/engine.js', 'js/review.js', 'js/ranges.js', 'js/strategy.js',
  'js/handprofile.js', 'js/plan.js', 'js/tips.js', 'js/mental.js', 'js/eqtable.js', 'js/icm.js',
  'js/w2d.js', 'js/w2dstats.js', 'js/w2daudit.js', 'js/multiway.js', 'js/w2dleaks.js', 'js/w2dpost.js', 'js/ownhands.js', 'js/riverdrill.js', 'js/preflopdrill.js', 'js/stackoff.js', 'js/rangeflow.js', 'js/course.js', 'js/courseui.js', 'js/app.js'];

// --- Body-Inhalt herauslösen ---------------------------------------------
const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
if (!m) { console.error('FEHLER: kein <body> in index.html gefunden'); process.exit(1); }
let body = m[1];

// Script-Tags und den zugehörigen Kommentar entfernen (JS wird inline gebündelt)
body = body
  .replace(/<!--[^>]*\?v=[\s\S]*?-->/g, '')
  .replace(/<script\b[^>]*\bsrc=[\s\S]*?<\/script>/gi, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

// --- JS bündeln -----------------------------------------------------------
let js = '';
for (const f of JS_FILES) {
  const src = read(f);
  // Ein "</script>" in einem String würde den inline-Block vorzeitig schließen
  if (/<\/script/i.test(src)) {
    console.error(`FEHLER: ${f} enthält "</script" — das bricht den inline-Block.`);
    process.exit(1);
  }
  js += `\n/* ===== ${f} ===== */\n${src}\n`;
}

// --- Zusammensetzen -------------------------------------------------------
const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [, 'Pokertrainer'])[1].trim();
const out = `<title>${title}</title>
<style>
${css}
</style>

${body}

<script>
${js}
</script>
`;

const distDir = path.join(root, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
const outPath = path.join(distDir, 'postflop-trainer.html');
fs.writeFileSync(outPath, out, 'utf8');

// --- Kontrollen -----------------------------------------------------------
const checks = [
  ['kein <!DOCTYPE>', !/<!DOCTYPE/i.test(out)],
  ['kein <html>/<body>', !/<\/?(html|body|head)\b/i.test(out)],
  ['keine externen URLs', !/(src|href)\s*=\s*["']?(https?:)?\/\//i.test(out)],
  ['keine lokalen Datei-Referenzen', !/(src|href)\s*=\s*["'](css|js)\//i.test(out)],
  ['Titel gesetzt', /<title>.+<\/title>/.test(out)],
  ['JS enthalten', out.includes('PT.SPOTS') || out.includes('SPOTS,')],
  ['CSS enthalten', out.includes('.modal[hidden]')]
];
let bad = 0;
for (const [name, ok] of checks) { if (!ok) bad++; console.log((ok ? '  ok   ' : '  FAIL ') + name); }

console.log(`\n${outPath}  (${(out.length / 1024).toFixed(0)} kB)`);
process.exit(bad ? 1 : 0);
