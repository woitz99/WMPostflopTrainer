/* =========================================================================
   courseui.js — Oberfläche des Kurses (Tab „Plan“). Daten und Rechnung
   stehen in js/course.js; hier nur Darstellung, Fortschritt und Sprünge.
   ========================================================================= */
(function () {
  const P = window.PT;
  const C = P.Course;

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>');
  const $ = (s, r) => (r || document).querySelector(s);
  const LABEL = { FOLD: 'Fold', CALL: 'Call', JAM: 'All-in', OPEN: 'Open' };
  const cardsHtml = s => (s.match(/../g) || []).map(c => {
    const red = c[1] === 'h' || c[1] === 'd';
    return `<span class="rfcard${red ? ' red' : ''}">${c[0]}${P.SUIT_SYM[c[1]]}</span>`;
  }).join('');
  const fmtDate = iso => { const [, m, d] = iso.split('-'); return `${d}.${m}.`; };
  const bb = x => (x >= 0 ? '+' : '') + x.toFixed(2) + 'bb';

  let ROOT = null, ST = null, VIEW = null;   // VIEW: angezeigte Einheit (Index)
  const QZ = { unit: null, list: [], i: 0, cur: null, answered: null, next: null };

  function rng() { return Math.random(); }

  /* ---------------- Rendern ---------------- */
  function render(root) {
    ROOT = root;
    ST = C.load();
    const cur = C.currentIndex(ST);
    if (VIEW == null || VIEW > C.UNITS.length - 1) VIEW = Math.min(cur, C.UNITS.length - 1);
    root.innerHTML = head(cur) + blocksHtml(cur) + unitHtml(VIEW, cur) + coachHtml() + listHtml(cur);
    wire();
  }

  function head(cur) {
    const done = C.UNITS.filter(u => ST.units[u.id] && ST.units[u.id].done).length;
    const planIdx = C.UNITS.findIndex((u, k) => C.plannedDate(k) >= todayIso());
    const planned = planIdx < 0 ? C.UNITS.length : planIdx;
    const diff = done - planned;
    const pace = diff === 0 ? 'genau im Plan' : diff > 0 ? `${diff} Einheit${diff > 1 ? 'en' : ''} voraus` : `${-diff} Einheit${diff < -1 ? 'en' : ''} hinterher`;
    return `<section class="panel wide planhead">
      <div class="planttl">
        <div><div class="plantarget">Kurs bis Februar</div>
          <div class="muted">16.11.2026 – 28.02.2027 · 5 × 60 min pro Woche · Ziel: Entscheidungsqualität an der Spitze deines Feldes</div></div>
        <div class="plancount"><div class="v">${done}<span class="sub2">/${C.UNITS.length}</span></div><div class="k">Block 1 erledigt</div></div>
        <div class="plancount"><div class="v">${cur < C.UNITS.length ? cur + 1 : '✓'}</div><div class="k">nächste Einheit</div></div>
        <div class="plancount"><div class="v cr-pace">${esc(pace)}</div><div class="k">gegenüber Plan</div></div>
      </div>
      <div class="planbarwrap"><i style="width:${(done / C.UNITS.length * 100).toFixed(1)}%"></i></div>
    </section>`;
  }
  function todayIso() { const t = new Date(); return new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())).toISOString().slice(0, 10); }

  function blocksHtml() {
    return `<section class="panel wide"><div class="cr-blocks">${C.BLOCKS.map(b => `
      <div class="cr-block${b.n === 1 ? ' on' : ''}">
        <div class="cr-bn">Block ${b.n} · ${fmtDate(b.from)}–${fmtDate(b.to)}</div>
        <div class="cr-bt">${esc(b.title)}</div>
        <div class="muted cr-bw">${md(b.why)}</div>
        ${b.n > 1 ? '<div class="muted cr-later">Einheiten schreibt der Coach nach dem Review von Block ' + (b.n - 1) + '.</div>' : ''}
      </div>`).join('')}</div></section>`;
  }

  function unitHtml(k, cur) {
    if (k >= C.UNITS.length) return `<section class="panel wide"><h3>Block 1 ist durch</h3><p>Coach-Bericht herunterladen und <code>/coach</code> aufrufen — dort entsteht Block 2.</p></section>`;
    const u = C.UNITS[k], s = ST.units[u.id] || {};
    const started = !!s.started, done = !!s.done;
    const total = u.tasks.reduce((a, t) => a + t.min, 0);
    const ex = started && u.example ? exampleHtml(u.example()) : '';
    return `<section class="panel wide plantoday cr-unit ${done ? 'ok' : ''}">
      <div class="planrow">
        <h3>Einheit ${k + 1} · ${esc(u.title)}</h3>
        <span class="chip">geplant ${fmtDate(C.plannedDate(k))}</span>
        ${done ? '<span class="chip">✓ erledigt</span>' : k !== cur ? '<span class="chip">Vorschau</span>' : ''}
      </div>
      ${!started ? `<p class="muted">Lektion, ${u.quiz ? u.quiz.n + ' Fragen, ' : ''}${u.tasks.length} Aufträge, Check-in — gut 60 Minuten.</p>
        <div class="planactions"><button class="primary" id="crStart">${done ? 'Nochmal öffnen' : 'Einheit starten'} ▸</button>
        ${k > 0 ? '<button class="ghost" id="crPrev">◂ vorige</button>' : ''}${k < C.UNITS.length - 1 ? '<button class="ghost" id="crNext">nächste ▸</button>' : ''}</div>` : `
      <div class="cr-lesson">${u.lesson.map(p => `<p>${md(p)}</p>`).join('')}</div>
      ${ex}
      ${u.quiz ? `<div class="cr-quiz" id="crQuiz"></div>` : ''}
      <h4 class="cr-h">Aufträge (${total} min)</h4>
      <div class="cr-tasks">${u.tasks.map((t, i) => `
        <label class="cr-task"><input type="checkbox" data-task="${i}"${(s.tasks || {})[i] ? ' checked' : ''}>
          <span class="t">${t.min} min</span><span>${md(t.t)}</span>
          ${t.jump ? `<button class="ghost small" data-jump="${i}">${jumpLabel(t.jump)} ▸</button>` : ''}
          ${t.coach ? '<button class="ghost small" data-dl="1">Bericht herunterladen ▸</button>' : ''}
        </label>`).join('')}</div>
      <p class="cr-target"><b>Ziel:</b> ${md(u.target)}</p>
      ${checkinHtml(u, s)}`}
    </section>`;
  }

  function jumpLabel(j) {
    if (j.drill) return 'Drill starten';
    if (j.verlauf) return 'Verlauf öffnen';
    if (j.url) return 'Hand-Logbuch öffnen';
    return 'Tab öffnen';
  }

  function exampleHtml(q) {
    const a = C.solve(q);
    return `<div class="cr-example"><div class="cr-exh">Beispielrechnung</div>
      <p>${esc(q.text)} Deine Hand: ${cardsHtml(q.hero)}</p>
      ${evTable(q, a, null)}
    </div>`;
  }

  /** EV-Tabelle mit Begründung — dieselbe für Beispiel und Auflösung. */
  function evTable(q, a, chosen) {
    const rows = a.liste.map(o => `<tr class="${o.key === a.best.key ? 'best' : ''}${o.key === chosen ? ' mine' : ''}">
      <td>${LABEL[o.key]}${o.key === chosen ? ' (du)' : ''}</td><td>${bb(o.ev)}</td>
      <td class="muted">${o.key === 'CALL' ? 'bei ' + Math.round(a.low * 100) + ' % Realisierung: ' + bb(a.evsLow.CALL) : ''}</td></tr>`).join('');
    const callNeed = a.callNoetig != null && q.options.includes('CALL') ? `Ein Call braucht <b>${(a.callNoetig * 100).toFixed(0)} %</b> Equity (Pot Odds), du hast <b>${(a.eqGesamt * 100).toFixed(0)} %</b> gegen seine Range — ohne Position realisierst du davon nur einen Teil.` : '';
    const jam = q.options.includes('JAM') ? ` All-in: er foldet <b>${((1 - a.callAnteil) * 100).toFixed(0)} %</b>; wenn er callt, hast du <b>${(a.eqGegenCaller * 100).toFixed(0)} %</b>.` +
      (a.jamAlt != null ? ` Callt er weiter (Top 20 %), foldet er nur ${((1 - a.callAnteilAlt) * 100).toFixed(0)} % — All-in dann ${bb(a.jamAlt)}.` : '') : '';
    return `<table class="cr-ev"><tr><th>Option</th><th>EV</th><th></th></tr>${rows}</table>
      <p class="cr-why">${callNeed}${jam}</p>
      <details class="cr-src"><summary>Annahmen dieser Rechnung</summary>
        <p>Seine Range: <code>${esc(q.villRange)}</code><br><span class="muted">${esc(q.villSrc)}</span></p>
        ${q.options.includes('JAM') ? `<p>Er callt dein All-in mit: <code>${esc(q.callRange)}</code><br><span class="muted">${esc(q.callSrc)}</span></p>` : ''}
        ${q.callRangeAlt ? `<p>Zweite Variante: <code>${esc(q.callRangeAlt)}</code><br><span class="muted">${esc(q.callSrcAlt)} — gefragt wird nur, was in beiden Fällen gleich ausgeht.</span></p>` : ''}
        ${q.note ? `<p class="muted">${esc(q.note)}</p>` : ''}
        <p class="muted">Rechnung wie im Stack-off-Check (js/stackoff.js). EV in bb gegenüber Fold.</p>
      </details>`;
  }

  function checkinHtml(u, s) {
    const auto = autoMetrics(s);
    return `<div class="cr-checkin">
      <h4 class="cr-h">Check-in</h4>
      <div class="cr-auto">${auto.html}</div>
      <label>Was nimmst du mit, was war schwer?<textarea id="crNote" rows="3">${esc(s.note || '')}</textarea></label>
      <div class="cr-conf">Wie sicher fühlst du dich beim Thema?
        ${[1, 2, 3, 4, 5].map(n => `<button class="ghost small${s.conf === n ? ' on' : ''}" data-conf="${n}">${n}</button>`).join('')}
        <span class="muted">1 = gar nicht · 5 = sitzt</span></div>
      <div class="planactions"><button class="primary" id="crDone">${s.done ? 'Check-in aktualisieren' : 'Einheit abschließen ✓'}</button>
        <span class="muted" id="crMsg"></span></div>
    </div>`;
  }

  /** Was seit dem Start der Einheit im Trainer und im Rate-Modus passiert ist. */
  function autoMetrics(s) {
    const out = {};
    const parts = [];
    if (s.quiz && s.quiz.n) {
      out.quiz = s.quiz;
      parts.push(`Fragen: <b>${s.quiz.right}/${s.quiz.n}</b> richtig, EV-Verlust zusammen ${s.quiz.evLoss.toFixed(1)}bb`);
    }
    const st = P.App && P.App.stats ? P.App.stats() : null;
    if (st && s.snap) {
      const dec = st.dec - s.snap.dec, pts = st.pts - s.snap.pts, max = st.max - s.snap.max;
      out.trainer = { dec, score: max ? pts / max : null };
      parts.push(dec ? `Trainer: <b>${dec}</b> Entscheidungen, Score <b>${Math.round(pts / max * 100)} %</b>` : 'Trainer: noch keine Entscheidung seit Start');
    }
    let h = [];
    try { h = JSON.parse(localStorage.getItem('pt.rf.quizHist') || '[]'); } catch (e) { /* leer */ }
    if (s.snap) {
      const since = h.filter(x => x.t >= s.started);
      if (since.length) {
        const avg = since.reduce((a, x) => a + x.m, 0) / since.length;
        out.rate = { n: since.length, avg: +avg.toFixed(1) };
        parts.push(`Rate-Modus: <b>${since.length}</b> Flops, im Schnitt <b>${avg.toFixed(1)}</b> Punkte daneben`);
      }
    }
    return { data: out, html: parts.length ? parts.map(p => `<div>${p}</div>`).join('') : '<div class="muted">Noch keine Werte — die Fragen und Aufträge füllen das hier automatisch.</div>' };
  }

  function coachHtml() {
    return `<section class="panel wide cr-coach"><h3>Dein Coach</h3>
      <p>Einmal pro Woche (Einheit 5, 10, 15) und gern nach jedem Turnierabend: Bericht herunterladen und in Claude Code <code>/coach</code> aufrufen.
        Ich lese den Bericht aus deinem Download-Ordner und deine neuen Hände aus dem Hand-Logbuch, gebe dir Rückmeldung und passe den Plan an.</p>
      <div class="planactions"><button class="primary" data-dl="1">Coach-Bericht herunterladen ▸</button>
        <button class="ghost" id="crCopy">Bericht kopieren</button><span class="muted" id="crCoachMsg"></span></div>
    </section>`;
  }

  function listHtml(cur) {
    return `<section class="panel wide"><h3>Block 1 — alle Einheiten</h3><div class="cr-list">${C.UNITS.map((u, k) => {
      const s = ST.units[u.id] || {};
      return `<button class="cr-li${k === VIEW ? ' sel' : ''}${s.done ? ' ok' : ''}${k === cur ? ' cur' : ''}" data-view="${k}">
        <span class="cr-ln">${k + 1}</span><span class="cr-ld">${fmtDate(C.plannedDate(k))}</span>
        <span class="cr-lt">${esc(u.title)}</span><span class="cr-ls">${s.done ? '✓' : s.quiz && s.quiz.n ? s.quiz.right + '/' + s.quiz.n : ''}</span></button>`;
    }).join('')}</div></section>`;
  }

  /* ---------------- Verhalten ---------------- */
  function wire() {
    const u = C.UNITS[VIEW];
    const on = (sel, f) => { const e = $(sel, ROOT); if (e) e.onclick = f; };
    on('#crStart', () => {
      const s = unit(u.id);
      if (!s.started || s.done) {
        const st = P.App && P.App.stats ? P.App.stats() : { dec: 0, pts: 0, max: 0 };
        s.started = Date.now(); s.snap = { dec: st.dec, pts: st.pts, max: st.max };
      }
      C.save(ST); QZ.unit = null; render(ROOT);
    });
    on('#crPrev', () => { VIEW--; render(ROOT); });
    on('#crNext', () => { VIEW++; render(ROOT); });
    ROOT.querySelectorAll('[data-view]').forEach(b => { b.onclick = () => { VIEW = +b.dataset.view; QZ.unit = null; render(ROOT); }; });
    ROOT.querySelectorAll('[data-task]').forEach(cb => {
      cb.onchange = () => { const s = unit(u.id); (s.tasks || (s.tasks = {}))[cb.dataset.task] = cb.checked; C.save(ST); };
    });
    ROOT.querySelectorAll('[data-jump]').forEach(b => {
      b.onclick = e => { e.preventDefault(); jump(u.tasks[+b.dataset.jump].jump); };
    });
    ROOT.querySelectorAll('[data-dl]').forEach(b => { b.onclick = e => { e.preventDefault(); downloadReport(); }; });
    on('#crCopy', copyReport);
    ROOT.querySelectorAll('[data-conf]').forEach(b => {
      b.onclick = () => { unit(u.id).conf = +b.dataset.conf; C.save(ST); ROOT.querySelectorAll('[data-conf]').forEach(x => x.classList.toggle('on', x === b)); };
    });
    const note = $('#crNote', ROOT);
    if (note) note.oninput = () => { unit(u.id).note = note.value; C.save(ST); };
    on('#crDone', () => {
      const s = unit(u.id);
      s.auto = autoMetrics(s).data;
      s.note = note ? note.value : s.note;
      const first = !s.done;
      s.done = s.done || Date.now();
      C.save(ST);
      if (first && VIEW < C.UNITS.length - 1) VIEW++;
      render(ROOT);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    if ($('#crQuiz', ROOT)) startQuiz(u);
  }

  function unit(id) { return ST.units[id] || (ST.units[id] = {}); }

  function jump(j) {
    if (j.url) { window.open(j.url, '_blank', 'noopener'); return; }
    if (!P.App) return;
    if (j.drill) { P.App.startDrill(j.drill); return; }
    if (j.verlauf) {
      P.App.switchView('verlauf');
      P.RangeFlow.preset(document.querySelector('#rfRoot'), j.verlauf);
      return;
    }
    if (j.view) P.App.switchView(j.view);
  }

  /* ---------------- Fragen ---------------- */
  function startQuiz(u) {
    if (QZ.unit !== u.id) Object.assign(QZ, { unit: u.id, i: 0, cur: null, answered: null, next: null, list: [] });
    drawQuiz(u);
  }

  /** Nächste Frage vorbereiten, während du die Auflösung liest (Equity-Rechnung dauert). */
  function prepare(u) {
    if (QZ.next) return;
    setTimeout(() => {
      if (QZ.unit !== u.id || QZ.next) return;
      const g = u.quiz.gens[(QZ.i + 1) % u.quiz.gens.length];
      const q = g(rng);
      if (q.kind === 'ev') C.solve(q);
      QZ.next = q;
    }, 30);
  }

  function drawQuiz(u) {
    const box = $('#crQuiz', ROOT); if (!box) return;
    const s = unit(u.id);
    const n = u.quiz.n;
    if (QZ.i >= n) {
      const q = s.quiz || { n: 0, right: 0 };
      box.innerHTML = `<div class="cr-qdone"><b>Fragen fertig: ${q.right}/${q.n} richtig.</b>
        <button class="ghost small" id="crQAgain">Neue Runde ▸</button></div>`;
      $('#crQAgain', box).onclick = () => { QZ.i = 0; QZ.cur = null; QZ.answered = null; s.quiz = { n: 0, right: 0, evLoss: 0 }; C.save(ST); drawQuiz(u); };
      return;
    }
    if (!QZ.cur) {
      box.innerHTML = `<p class="muted">Frage ${QZ.i + 1} von ${n} wird gerechnet …</p>`;
      setTimeout(() => {
        QZ.cur = QZ.next || u.quiz.gens[QZ.i % u.quiz.gens.length](rng);
        QZ.next = null;
        if (QZ.cur.kind === 'ev') C.solve(QZ.cur);
        QZ.answered = null;
        drawQuiz(u);
      }, 20);
      return;
    }
    const q = QZ.cur;
    const head = `<div class="cr-qh">Frage ${QZ.i + 1} von ${n}${u.quiz.test ? ' · Block-Test' : ''}</div>
      <p class="cr-qt">${esc(q.text)}${q.kind === 'ev' ? ' Deine Hand: ' + cardsHtml(q.hero) : ''}</p>`;
    if (!QZ.answered) {
      box.innerHTML = head + `<div class="cr-opts">${q.options.map(o => `<button class="opt" data-a="${o}">${LABEL[o]}</button>`).join('')}</div>`;
      box.querySelectorAll('[data-a]').forEach(b => { b.onclick = () => answer(u, b.dataset.a); });
      prepare(u);
      return;
    }
    const g = QZ.answered.g;
    let body;
    if (q.kind === 'open') {
      body = `<p class="cr-verdict ${g.right ? 'ok' : 'bad'}">${g.right ? 'Richtig' : 'Falsch'} — ${q.hc} ${q.answer === 'OPEN' ? '<b>gehört</b>' : '<b>gehört nicht</b>'} in die Open-Range aus ${q.pos}.</p>
        <details class="cr-src"><summary>Open-Range ${q.pos} (${esc(P.STACKS[q.band].label)})</summary><p><code>${esc(q.range)}</code></p></details>`;
    } else {
      const a = g.a;
      body = `<p class="cr-verdict ${g.right ? 'ok' : 'bad'}">${g.right ? 'Richtig' : 'Nicht die beste Option'} — am besten: <b>${LABEL[a.best.key]}</b>${g.right ? '' : `, deine Wahl kostet ${g.evLoss.toFixed(2)}bb`}.${q.borderline ? ' <span class="muted">(Grenzfall: hängt an der Realisierung, beide Antworten zählen.)</span>' : ''}</p>
        ${evTable(q, a, QZ.answered.key)}`;
    }
    box.innerHTML = head + body + `<div class="planactions"><button class="primary" id="crQNext">${QZ.i + 1 < n ? 'Nächste Frage' : 'Auswertung'} ▸</button></div>`;
    $('#crQNext', box).onclick = () => { QZ.i++; QZ.cur = null; QZ.answered = null; drawQuiz(u); };
    prepare(u);
  }

  function answer(u, key) {
    const q = QZ.cur;
    const g = C.grade(q, key);
    QZ.answered = { key, g };
    const s = unit(u.id);
    const z = s.quiz || (s.quiz = { n: 0, right: 0, evLoss: 0 });
    z.n++; if (g.right) z.right++; z.evLoss = +(z.evLoss + (g.evLoss || 0)).toFixed(2);
    if (!g.right) {
      (s.misses || (s.misses = [])).push(q.kind === 'open'
        ? { k: 'open', hc: q.hc, pos: q.pos, du: key, best: q.answer }
        : { k: 'ev', hand: q.hero, spot: q.text, du: key, best: g.a.best.key, loss: +g.evLoss.toFixed(2) });
      s.misses = s.misses.slice(-30);
    }
    C.save(ST);
    drawQuiz(u);
  }

  /* ---------------- Coach-Bericht ---------------- */
  function buildReport() {
    const st = P.App && P.App.stats ? P.App.stats() : null;
    let rate = [];
    try { rate = JSON.parse(localStorage.getItem('pt.rf.quizHist') || '[]'); } catch (e) { /* leer */ }
    return C.report(ST, {
      trainer: st ? {
        dec: st.dec, score: st.max ? +(st.pts / st.max).toFixed(3) : null,
        byTag: Object.fromEntries(Object.entries(st.byTag || {}).map(([k, v]) => [k, { n: v.m / 3, score: v.m ? +(v.p / v.m).toFixed(3) : null }])),
        reviewDue: P.App.reviewDue ? P.App.reviewDue() : null
      } : null,
      rateModus: { n: rate.length, last20avg: rate.length ? +(rate.slice(-20).reduce((a, x) => a + x.m, 0) / Math.min(20, rate.length)).toFixed(1) : null }
    });
  }
  function downloadReport() {
    const r = buildReport();
    const name = 'coach-bericht-' + new Date().toISOString().slice(0, 10) + '.json';
    const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const m = $('#crCoachMsg', ROOT); if (m) m.textContent = name + ' liegt im Download-Ordner. Jetzt /coach in Claude Code aufrufen.';
  }
  function copyReport() {
    const txt = JSON.stringify(buildReport(), null, 1);
    const m = $('#crCoachMsg', ROOT);
    const ok = () => { if (m) m.textContent = 'Kopiert — in /coach einfügen.'; };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(ok, () => { if (m) m.textContent = 'Kopieren ging nicht — bitte herunterladen.'; });
    else { if (m) m.textContent = 'Kopieren geht hier nicht — bitte herunterladen.'; }
  }

  P.Course.render = render;
})();
