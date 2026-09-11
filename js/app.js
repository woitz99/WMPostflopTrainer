/* =========================================================================
   app.js — Drill-Flow, Rendering, Statistik
   ========================================================================= */
(function () {
  const P = window.PT;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const md = s => String(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const pct = x => (x * 100).toFixed(0) + '%';

  const SUIT_CLASS = { s: '', h: 'red', d: 'blue', c: 'green' };

  /* ------------------------------ State ------------------------------ */
  const S = {
    cfg: {
      stacks: ['mid', 'deep'], tags: ['SRP', 'DEF', '3BP', 'BvB', 'MW'],
      multi: true, autoHint: false, profile: 'reg', quiz: true
    },
    stats: load('pt_stats', { hands: 0, dec: 0, pts: 0, max: 0, byTag: {}, byStreet: {}, byHand: {}, mistakes: [], reviews: 0, mastered: 0 }),
    review: load('pt_review', { items: [] }),
    notes: load('pt_handnotes', { byHand: {} }),
    plan: load('pt_plan', { done: {} }),
    reviewMode: false, queue: [], qIdx: 0,
    hp: { sel: 'AKo', rangeKey: 'bb_vs_btn_def', cache: {}, evCache: {}, busy: false },
    rd: { cache: {} },
    sc: { cache: {}, q: null, busy: false },
    rf: { q: null, ev: null, picked: null, raise: null },
    mt: load('pt_mental', { right: 0, total: 0, streak: 0, best: 0 }),
    own: { id: null, step: 0, picks: [] }
  };
  // Ältere gespeicherte Statistiken kennen byHand noch nicht.
  if (!S.stats.byHand) S.stats.byHand = {};
  if (!S.notes.byHand) S.notes.byHand = {};

  function load(k, d) { try { return Object.assign({}, d, JSON.parse(localStorage.getItem(k) || '{}')); } catch (e) { return d; } }
  function save() { try { localStorage.setItem('pt_stats', JSON.stringify(S.stats)); } catch (e) { } }
  const RV = P.Review;   // Leitner-Regeln, siehe js/review.js
  /**
   * Speichert die Fehlerliste. Bei vollem localStorage werden gezielt die
   * ÄLTESTEN Einträge verworfen und es wird erneut versucht — ein stilles
   * Scheitern würde sonst alle neuen Fehler verlieren, ohne dass du es merkst.
   */
  function saveReview() {
    RV.trim(S.review);
    for (let i = 0; i < 12; i++) {
      try {
        localStorage.setItem('pt_review', JSON.stringify(S.review));
        S.storageFull = false;
        return true;
      } catch (e) {
        if (!S.review.items.length) { S.storageFull = true; return false; }
        const drop = Math.max(1, Math.ceil(S.review.items.length * 0.15));
        S.review.items = S.review.items.slice(drop);
        S.stats.dropped = (S.stats.dropped || 0) + drop;
        S.storageFull = true;
      }
    }
    return false;
  }
  function reviewBytes() { try { return (localStorage.getItem('pt_review') || '').length; } catch (e) { return 0; } }
  function saveNotes() { try { localStorage.setItem('pt_handnotes', JSON.stringify(S.notes)); return true; } catch (e) { return false; } }

  /**
   * Zählt jede Entscheidung zusätzlich nach Handklasse mit, damit im
   * Steckbrief steht, wie DU diese Hand spielst — nicht nur, wie sie
   * theoretisch aussieht. Der Flop-Bucket kommt mit, weil "3 von 4 Fehlern
   * auf niedrig verbundenen Boards" die brauchbarere Aussage ist als "4
   * Fehler mit AKo".
   */
  function trackHand(key, g) {
    const H = P.HandProfile;
    const hc = P.handClassOf(S.heroHole);
    const b = S.stats.byHand[hc] || (S.stats.byHand[hc] = { dec: 0, pts: 0, max: 0, err: [] });
    b.dec++; b.pts += g.pts; b.max += 3;
    if (g.pts <= 1) {
      b.err.unshift({
        b: S.board.slice(0, 3).map(P.cardToStr).join(''),
        s: S.street, sp: S.spot.id,
        bk: H.bucketOf(H.fastTex(S.board.slice(0, 3))),
        p: labelOf(key), best: labelOf(S.rec.best), ts: Date.now()
      });
      b.err = b.err.slice(0, 4);   // pro Hand reichen die letzten vier
    }
  }
  function dueItems() { return RV.due(S.review.items); }
  function updateReviewButton() {
    const n = dueItems().length;
    $('#reviewCount').textContent = n;
    $('#btnReview').hidden = n === 0 || S.reviewMode;
  }

  /* ------------------------------ Karten ----------------------------- */
  function cardEl(c, isNew) {
    const r = P.RANKS[P.rankOf(c)], u = P.SUITS[P.suitOf(c)];
    const d = document.createElement('div');
    d.className = 'card ' + (SUIT_CLASS[u] || '') + (isNew ? ' new' : '');
    d.innerHTML = `<span class="r">${r}</span><span class="s">${P.SUIT_SYM[u]}</span>`;
    return d;
  }
  function renderCards(el, cards, newFrom) {
    el.innerHTML = '';
    cards.forEach((c, i) => el.appendChild(cardEl(c, newFrom !== undefined && i >= newFrom)));
  }

  /* --------------------------- Hand starten -------------------------- */
  function newHand() {
    S.reviewMode = false;
    $('#reviewBar').hidden = true;
    P.seedRng((Math.random() * 1e9) | 0);
    const pool = P.SPOTS.filter(s => S.cfg.tags.includes(s.tag));
    S.spot = P.weightedPick(pool.length ? pool : P.SPOTS);
    const bands = S.cfg.stacks.length ? S.cfg.stacks : ['mid'];
    S.band = bands[(P.rng() * bands.length) | 0];
    const pk = S.cfg.profile === 'mix'
      ? P.PROFILE_LIST[(P.rng() * P.PROFILE_LIST.length) | 0]
      : (S.cfg.profile || 'reg');
    S.profile = P.PROFILES[pk] || P.PROFILES.reg;
    S.geo = P.geometry(S.spot, S.band);
    S.pot = S.geo.pot; S.eff = S.geo.eff;

    S.heroRangeStr = S.spot.heroRange(S.band);
    S.heroRange = P.parseRange(S.heroRangeStr);
    if (S.spot.villRanges) {          // Multiway: je Gegner eine eigene Range
      S.villRangeStrs = S.spot.villRanges(S.band);
      S.villRanges = S.villRangeStrs.map(s => P.parseRange(s));
      S.villRangeStr = S.villRangeStrs[0];
      S.villRange = S.villRanges[0];
    } else {
      S.villRangeStrs = null; S.villRanges = null;
      S.villRangeStr = S.spot.villRange(S.band);
      S.villRange = P.parseRange(S.villRangeStr);
    }

    // Hände samplen — im Multiway für jeden Gegner eine, ohne Kartenkollision
    S.heroHole = pickCombo(S.heroRange, []);
    S.villHoles = [];
    if (S.villRanges) {
      let blocked = S.heroHole.slice();
      for (const vr of S.villRanges) {
        const h = pickCombo(vr, blocked);
        S.villHoles.push(h); blocked = blocked.concat(h);
      }
      S.villHole = S.villHoles[0];
    } else {
      S.villHole = pickCombo(S.villRange, S.heroHole);
      S.villHoles = [S.villHole];
    }
    const dead = new Set(S.heroHole.concat(...S.villHoles));
    const deck = P.fullDeck().filter(c => !dead.has(c));
    S.deck = deck;
    S.board = [];
    for (let i = 0; i < 3; i++) S.board.push(drawCard());

    S.street = 'flop';
    S.log = [];
    S.finished = false;
    S.newFrom = 0;
    S.invH = 0; S.invV = 0; S.allInAt = null;
    S.stats.hands++;

    logPreflop();
    renderSpot();
    updateReviewButton();
    startStreet();
  }

  function drawCard() {
    const i = (P.rng() * S.deck.length) | 0;
    return S.deck.splice(i, 1)[0];
  }
  function pickCombo(range, dead) {
    const d = new Set(dead);
    const ok = range.filter(x => !d.has(x.c[0]) && !d.has(x.c[1]));
    const tot = ok.reduce((a, x) => a + x.w, 0);
    let r = P.rng() * tot;
    for (const x of ok) { r -= x.w; if (r <= 0) return x.c.slice(); }
    return ok[0].c.slice();
  }

  function logPreflop() {
    const S_ = P.STACKS[S.band];
    const sp = S.spot;
    if (sp.potType === 'SRP') {
      const pfr = sp.role === 'PFR' ? 'Du' : sp.villPos;
      const cal = sp.role === 'PFR' ? sp.villPos : 'Du';
      S.log.push({ t: `Preflop: ${pfr === 'Du' ? 'Du openst' : pfr + ' openst'} auf ${S_.open}bb — ${cal === 'Du' ? 'du callst' : cal + ' callt'}.` });
    } else {
      const tb = sp.role === '3BET' ? 'Du' : sp.villPos;
      const cl = sp.role === '3BET' ? sp.villPos : 'Du';
      S.log.push({ t: `Preflop: Open ${S_.open}bb, ${tb === 'Du' ? 'du 3-bettest' : tb + ' 3-bettet'} auf ${S_.threeBet}bb — ${cl === 'Du' ? 'du callst' : cl + ' callt'}.` });
    }
  }

  /* --------------------------- Kontext rechnen ----------------------- */
  function computeCtx() {
    const t0 = performance.now();
    const board = S.board;
    const tex = P.boardTexture(board);
    const hB = P.rangeBuckets(S.heroRange, board, []);
    const vB = P.rangeBuckets(S.villRange, board, S.heroHole);
    const rEq = P.rangeVsRange(S.heroRange, S.villRange, board, 8000);
    const hEq = P.equityVsRange(S.heroHole, S.villRange, board, 120000).eq;
    const rel = P.relativeStrength(S.heroHole, S.villRange, board);
    const cls = P.classify(S.heroHole, board);

    /* --- Multiway ---------------------------------------------------
       Der Ansatz: das Feld wird NICHT zu einem Durchschnittsgegner
       verschmolzen, sondern jeder Gegner behält seine eigene Range.
         Equity      = equityMulti gegen alle Ranges gleichzeitig (exakt)
         rel. Stärke = Produkt der Einzelwerte -> P(du schlägst ALLE)
         Gefahr      = 1 - Π(1 - stark_i) -> P(mindestens einer hat 2P+)
       Angenommen wird Unabhängigkeit der Ranges (Kartenentfernung zwischen
       den Gegnern wird ignoriert) — das ist die eigentliche Näherung. */
    let mwEq = null, mwPct = null, mwDanger = null;
    if (S.villRanges && S.villRanges.length > 1) {
      const M = P.Multiway;
      mwEq = M.equityMulti(S.heroHole, S.villRanges, board, 14000).eq;
      mwPct = 1; mwDanger = 1;
      S.villBuckets = [];
      for (const vr of S.villRanges) {
        mwPct *= P.relativeStrength(S.heroHole, vr, board).pct;
        const b = P.rangeBuckets(vr, board, S.heroHole);
        S.villBuckets.push(b);
        mwDanger *= (1 - b.strongPct);
      }
      mwDanger = 1 - mwDanger;
    }
    const adv = P.advantage(hB, vB, rEq);
    S.ctx = Object.assign({
      street: S.street, tex, spr: +(S.eff / S.pot).toFixed(1), pot: S.pot, eff: S.eff,
      heroIP: S.spot.heroIP, role: S.spot.role, potType: S.spot.potType,
      heroNut: hB.nuttedPct, villNut: vB.nuttedPct,
      heroEq: mwEq != null ? mwEq : hEq,
      heroPct: mwPct != null ? mwPct : rel.pct,
      heroBuckets: hB, villBuckets: vB, cls,
      opponents: S.spot.opponents || 1, mwDanger, mwEqHU: hEq,
      rangeEq: rEq,
      // ctx.profile beschreibt immer den GEGNER; actorIsProfiled=false heißt:
      // "berechne, wie DU dich an ihn anpasst".
      profile: S.profile, actorIsProfiled: false
    }, adv);
    S.calcMs = Math.round(performance.now() - t0);
  }

  /** Kontext aus Gegnersicht. */
  /**
   * Gewichte sind nur relativ zueinander gemeint — jede Auswertung normiert
   * ohnehin auf die Summe. Über drei Straßen multiplizieren sich die Filter
   * aber zu winzigen Werten, und unter 0.02 fällt eine Kombo beim Packen des
   * Wiederholungs-Schnappschusses ersatzlos raus. Hochskalieren hält die
   * Verhältnisse und die Range vollständig.
   */
  function rescale(range) {
    const m = range.reduce((a, x) => Math.max(a, x.w), 0);
    return (m > 0 && m < 1) ? range.map(x => ({ c: x.c, w: x.w / m })) : range;
  }

  function villCtx(extra) {
    const c = S.ctx;
    return Object.assign({}, c, {
      heroIP: !c.heroIP,
      rangeAdv: -c.rangeAdv, nutAdv: -c.nutAdv, advEq: -c.advEq,
      strongShare: -c.strongShare, nutShare: -c.nutShare,
      heroNut: c.villNut, villNut: c.heroNut,
      heroBuckets: c.villBuckets, villBuckets: c.heroBuckets,
      role: flipRole(c.role),
      actorIsProfiled: true      // jetzt handelt der profilierte Gegner selbst
    }, extra || {});
  }
  function flipRole(r) {
    return r === 'PFR' ? 'CALLER' : r === 'CALLER' ? 'PFR' : r === '3BET' ? 'CALL3B' : '3BET';
  }

  /* ---------------------------- Straßenablauf ------------------------ */
  /* Einsatz-Buchhaltung: S.pot enthält immer die Chips, die JETZT in der
     Mitte liegen (inklusive der Bets dieser Straße). S.invH / S.invV sind,
     was jeder in DIESER Straße schon investiert hat — daraus ergibt sich der
     Rest-Stack. Vorher wurde die eigene Bet nach einem gegnerischen Raise
     nicht vom Stack abgezogen, dadurch stimmte der SPR ab dem Turn nicht. */
  function remH() { return Math.max(0, S.eff - (S.invH || 0)); }
  function remV() { return Math.max(0, S.eff - (S.invV || 0)); }
  /** Wieviel hat der Gegner NICHT mitgehen können? Der Rest gehört zurück. */
  function uncalled() { return Math.abs((S.invH || 0) - (S.invV || 0)); }
  /**
   * Straße abschließen. Gematcht ist nur der kleinere der beiden Einsätze —
   * wer mehr gesetzt hat, als der andere callen konnte, bekommt die Differenz
   * zurück. Ohne diese Rückgabe verschwanden Chips aus der Rechnung, sobald
   * jemand für weniger als die volle Bet all-in ging.
   */
  function closeRound() {
    const iH = S.invH || 0, iV = S.invV || 0;
    const rest = Math.abs(iH - iV);
    if (rest > 0.001) S.pot -= rest;
    S.eff -= Math.min(iH, iV);
    S.invH = 0; S.invV = 0;
  }

  function startStreet() {
    computeCtx();
    S.villChecked = false;
    S.invH = 0; S.invV = 0;
    renderTable();
    /* Multiway ist bewusst ein Flop-Drill: die eine Entscheidung, die im
       3-Wege-Pot fast alles entscheidet. Mehrstraßiges Multiway bräuchte
       eine echte Mehrspieler-Aktionslogik — das ist hier nicht drin, und
       so getan als ob wird nicht. */
    if (S.villRanges) {
      const vorDir = (S.spot.villActsBefore || []).filter(Boolean).length;
      if (vorDir) {
        S.villChecked = true;
        pushLog('vil', vorDir > 1 ? 'Alle vor dir checken' : 'Der Spieler vor dir checkt');
      }
      return askBetting();
    }
    if (S.spot.heroIP) {
      const act = villainOpenAction();
      if (act.type === 'bet') villainBets(act);
      else { S.villChecked = true; pushLog('vil', 'Gegner checkt'); askBetting(); }
    } else {
      askBetting();
    }
  }

  function villainOpenAction() {
    const vc = villCtx();
    const key = P.villainAct(S.villHole, S.board, vc, null);
    if (key === 'CHECK') return { type: 'check' };
    const o = P.BET_OPTIONS.find(x => x.key === key);
    const amt = Math.min(+(o.pct * S.pot).toFixed(1), remV());
    if (amt < 0.1) return { type: 'check' };
    return { type: 'bet', amt };
  }

  /**
   * Seine Bet buchen: Pot, Einsatz, Log, Frage — bewusst an EINER Stelle.
   * Vorher stand dieselbe Buchung zweimal im Code, und die zweite Kopie (du
   * checkst OOP, er bettet danach) hat den Pot nicht erhöht und eine
   * Prozentzahl gelesen, die es nirgends gibt (`act.pctv`): im Log stand
   * "(NaN%)", und alle Folgesizings liefen auf einem zu kleinen Pot.
   */
  function villainBets(act) {
    const potBefore = S.pot;
    S.pot += act.amt; S.invV = (S.invV || 0) + act.amt;
    pushLog('vil', `Gegner bettet ${act.amt.toFixed(1)}bb (${pct(act.amt / potBefore)})`);
    renderTable();
    // potNow muss seine Bet ENTHALTEN, sonst stimmen Pot Odds und MDF nicht
    return askFacing(act.amt, S.pot, act.amt / potBefore);
  }

  /* ------------------------------ Fragen ----------------------------- */
  /**
   * Baut die anklickbaren Sizings.
   * Zwei Sizings, die beide auf den Rest-Stack gedeckelt werden, sind
   * dieselbe Aktion — sie werden zu EINER Schaltfläche zusammengefasst und
   * bekommen die bessere der beiden Bewertungen, damit die Rückmeldung nicht
   * eine Option als "richtig" nennt, die gar nicht anklickbar war.
   */
  function buildBetOptions() {
    const rem = remH(), out = [], groups = [];
    for (const o of P.BET_OPTIONS) {
      if (o.pct === 0) {
        out.push({ key: o.key, label: o.label, amt: '' });
        S.q.optSrc[o.key] = [o.key];
        continue;
      }
      if (rem <= 0.05) continue;
      const amt = Math.min(+(o.pct * S.pot).toFixed(1), rem);
      if (amt < 0.1) continue;
      const g = groups.find(x => Math.abs(x.amt - amt) < 0.15);
      if (g) g.keys.push(o.key); else groups.push({ amt, keys: [o.key] });
    }
    /* Eigene All-in-Schaltfläche nur, wenn der Shove auch spielbar ist.
       Bei SPR 12 wären 46bb in einen 6bb-Pot keine Option, sondern Unsinn —
       deshalb erst ab höchstens ~2.5 Pot Reststack. */
    if (rem > 0.05 && rem <= S.pot * 2.5 && !groups.some(g => g.amt >= rem - 0.05)) {
      groups.push({ amt: rem, keys: ['BET_XL'], forced: true });
    }
    for (const g of groups) {
      const best = g.keys.reduce((a, b) => (S.rec.scores[a] || 0) >= (S.rec.scores[b] || 0) ? a : b);
      const score = Math.max(...g.keys.map(k => S.rec.scores[k] || 0));
      const key = g.forced ? 'BET_AI' : best;
      S.rec.scores[key] = score;
      S.q.optSrc[key] = g.keys.slice();
      if (g.forced) S.aiAmount = g.amt;
      const allIn = g.amt >= rem - 0.05;
      out.push({
        key, label: allIn ? 'All-in' : (P.BET_OPTIONS.find(o => o.key === best) || {}).label,
        amt: `${g.amt.toFixed(1)}bb`
      });
    }
    return out;
  }

  function askBetting() {
    S.q = { mode: 'BET', optSrc: {} };
    S.aiAmount = null;
    S.rec = P.recommendBetting(S.ctx.cls, S.ctx);
    const opts = buildBetOptions();
    S.q.optKeys = opts.map(o => o.key);
    S.q.optLabels = {}; opts.forEach(o => S.q.optLabels[o.key] = o.label);
    limitToOptions();
    /* Der Fragetext wird HERGELEITET, nicht aus gespeichertem Zustand gelesen.
       Im BET-Modus impliziert die Reihenfolge bereits, dass alle vor dir
       gecheckt haben — sonst stuende hier eine Bet und wir waeren im
       FACE-Modus. Vorher hing der Text an S.villChecked; bei wiederholten
       Spots aus aelteren Schnappschuessen fehlt dieses Flag. */
    renderAsk(askTitleFor(S.spot), opts);
  }

  /**
   * Wer ist vor dir dran? Heads-up beantwortet das `heroIP` allein, im
   * Mehrweg nicht: als CO hast du den BTN hinter dir und den BB vor dir.
   * Genau da stand vorher "Du bist zuerst dran", obwohl der BB zuerst
   * handelt. Die Reihenfolge kommt deshalb aus `villActsBefore`, das in
   * ranges.js aus den Positionen hergeleitet wird.
   */
  function askTitleFor(spot) {
    const before = spot.villActsBefore;
    if (!before || !before.length) {
      // Heads-up: in Position heisst, er hat schon gecheckt.
      return spot.heroIP ? 'Gegner checkt zu dir — deine Aktion?'
        : 'Du bist zuerst dran — deine Aktion?';
    }
    const shortName = i => String((spot.villNames || [])[i] || 'Gegner').replace(/\s*\(.*$/, '');
    const vor = before.map((b, i) => b ? i : -1).filter(i => i >= 0);
    const hinter = before.map((b, i) => b ? -1 : i).filter(i => i >= 0);
    if (!vor.length) return 'Du bist zuerst dran — deine Aktion?';
    if (!hinter.length) {
      return (vor.length > 1 ? 'Alle checken zu dir' : shortName(vor[0]) + ' checkt zu dir')
        + ' — deine Aktion?';
    }
    return vor.map(shortName).join(' und ') + ' checkt zu dir, '
      + hinter.map(shortName).join(' und ') + ' sitzt hinter dir — deine Aktion?';
  }

  function askFacing(toCall, potNow, betPct, label, actionRange) {
    const rem = remH();
    const call = Math.min(toCall, rem);
    const facing = { toCall, potNow, betPct, label: label || `Bet ${toCall.toFixed(1)}bb` };
    /* Seine Range für GENAU diese Aktion — und zwar EINMAL gefiltert.
       Für eine Bet leitet bettingRangeOf sie aus der Größe ab (samt Profil:
       eine Station blufft hier fast nicht). Ein Raise bringt seine eigene
       Range mit, weil eine Erhöhung eine ganz andere ist als eine Bet. */
    const villBet = actionRange || P.bettingRangeOf(S.villRange, S.board, betPct, S.ctx, S.profile);
    const eqVsBet = P.equityVsRange(S.heroHole, villBet, S.board, 120000).eq;
    S.q = { mode: 'FACE', facing, villBet, optSrc: {} };
    S.rec = P.recommendFacing(S.ctx.cls, Object.assign({}, S.ctx, { facing, eqVsBettingRange: eqVsBet }));
    S.ctxFacing = Object.assign({}, S.ctx, { facing, eqVsBettingRange: eqVsBet });

    /* Raise-Optionen nur zeigen, wenn ein Raise überhaupt möglich ist —
       wer nur noch den Call im Stack hat, kann nicht erhöhen. Fallen beide
       Raise-Größen auf denselben Betrag (All-in), bleibt eine übrig. */
    const canRaise = rem > call + 0.1 && remV() > 0.05;
    const opts = [];
    for (const o of P.FACING_OPTIONS) {
      S.q.optSrc[o.key] = [o.key];
      if (o.key === 'FOLD') { opts.push({ key: o.key, label: o.label, amt: '' }); continue; }
      if (o.key === 'CALL') {
        opts.push({ key: o.key, label: call >= rem - 0.05 ? 'Call All-in' : o.label, amt: `${call.toFixed(1)}bb` });
        continue;
      }
      if (!canRaise) continue;
      const to = Math.min(S.eff, +(raiseTarget(o.key, toCall)).toFixed(1));
      const g = opts.find(x => x.raiseTo !== undefined && Math.abs(x.raiseTo - to) < 0.15);
      if (g) {   // identische Höhe -> zusammenfassen, bessere Bewertung behalten
        const score = Math.max(S.rec.scores[g.key] || 0, S.rec.scores[o.key] || 0);
        S.rec.scores[g.key] = score;
        S.q.optSrc[g.key].push(o.key);
        continue;
      }
      const allIn = to >= S.eff - 0.05;
      opts.push({
        key: o.key, raiseTo: to,
        label: allIn ? 'Raise All-in' : o.label, amt: `auf ${to.toFixed(1)}bb`
      });
    }
    S.q.optKeys = opts.map(o => o.key);
    S.q.optLabels = {}; opts.forEach(o => S.q.optLabels[o.key] = o.label);
    limitToOptions();
    renderAsk(`Er setzt ${toCall.toFixed(1)}bb in einen Pot von ${(potNow - toCall).toFixed(1)}bb — deine Aktion?`, opts);
  }
  function raiseTarget(key, toCall) {
    return (S.invH || 0) + toCall * (key === 'RAISE_L' ? 3.4 : 2.6);
  }

  /* ---------------------------- Antwort/Feedback --------------------- */
  function onAnswer(key) {
    const g = P.grade(S.rec.scores, key);
    S.stats.dec++; S.stats.pts += g.pts; S.stats.max += 3;
    const tag = S.spot.tag;
    S.stats.byTag[tag] = S.stats.byTag[tag] || { p: 0, m: 0 };
    S.stats.byTag[tag].p += g.pts; S.stats.byTag[tag].m += 3;
    S.stats.byStreet[S.street] = S.stats.byStreet[S.street] || { p: 0, m: 0 };
    S.stats.byStreet[S.street].p += g.pts; S.stats.byStreet[S.street].m += 3;
    trackHand(key, g);
    /* --- Wiederholungs-Modus: Box aktualisieren statt weiterspielen --- */
    if (S.reviewMode) {
      const item = S.queue[S.qIdx];
      const correct = g.pts >= 2;
      S.stats.reviews = (S.stats.reviews || 0) + 1;
      const res = RV.applyResult(S.review, item, correct);
      if (res.mastered) S.stats.mastered = (S.stats.mastered || 0) + 1;
      saveReview(); save();
      showFeedback(key, g);
      S.after = nextReviewItem;
      return;
    }

    if (g.pts <= 1) {
      S.stats.mistakes.unshift({
        spot: S.spot.name, street: S.street,
        board: S.board.map(P.cardToStr).join(' '),
        hand: P.comboToStr(S.heroHole), cls: S.ctx.cls.made,
        picked: labelOf(key), best: labelOf(S.rec.best),
        why: S.rec.reasons[S.rec.reasons.length - 1]
      });
      S.stats.mistakes = S.stats.mistakes.slice(0, 40);
      pushReviewItem(key);
    }
    save();
    showFeedback(key, g);
    S.after = () => applyAnswer(key);
  }

  /* ------------------------- Wiederholung ---------------------------- */
  /** Vollständiger Schnappschuss, damit der Spot exakt rekonstruierbar ist. */
  function pushReviewItem(key) {
    S.review.items.push({
      id: 'r' + Date.now() + '_' + ((Math.random() * 1e4) | 0),
      ts: Date.now(), box: 1, seen: 0, due: Date.now() + RV.BOX_DAYS[1] * RV.DAY,
      spotId: S.spot.id, band: S.band, street: S.street, profile: S.profile.key,
      pot: S.pot, eff: S.eff, vChk: !!S.villChecked,
      invH: S.invH || 0, invV: S.invV || 0,
      board: S.board.slice(), hero: S.heroHole.slice(), vill: S.villHole.slice(),
      hr: P.packRange(S.heroRange), vr: P.packRange(S.villRange),
      // Multiway: alle Gegner-Ranges und -Hände, sonst käme der Spot als
      // Heads-up zurück und die Bewertung wäre eine andere als beim Fehler.
      vrs: S.villRanges ? S.villRanges.map(r => P.packRange(r)) : null,
      vhs: S.villRanges ? S.villHoles.map(h => h.slice()) : null,
      qMode: S.q.mode,
      facing: S.q.mode === 'FACE'
        ? { toCall: S.q.facing.toCall, potNow: S.q.facing.potNow, betPct: S.q.facing.betPct } : null,
      log: S.log.slice(),
      picked: labelOf(key), best: labelOf(S.rec.best), score: S.rec.scores[key]
    });
    saveReview();
  }

  function startReview() {
    S.queue = dueItems();
    if (!S.queue.length) return;
    S.reviewMode = true; S.qIdx = 0;
    $('#btnReview').hidden = true;
    switchView('trainer');
    loadReviewItem();
  }
  function nextReviewItem() {
    S.qIdx++;
    if (S.qIdx >= S.queue.length) return exitReview();
    loadReviewItem();
  }
  function exitReview() {
    S.reviewMode = false;
    $('#reviewBar').hidden = true;
    newHand();
  }

  function loadReviewItem() {
    const it = S.queue[S.qIdx];
    const spot = P.SPOTS.find(s => s.id === it.spotId);
    if (!spot) return nextReviewItem();          // Spot existiert nicht mehr
    S.spot = spot; S.band = it.band;
    S.geo = P.geometry(spot, it.band);
    S.profile = P.PROFILES[it.profile] || P.PROFILES.reg;
    S.board = it.board.slice();
    S.heroHole = it.hero.slice(); S.villHole = it.vill.slice();
    S.heroRangeStr = spot.heroRange(it.band); S.villRangeStr = spot.villRange(it.band);
    S.heroRange = P.unpackRange(it.hr); S.villRange = P.unpackRange(it.vr);
    if (it.vrs && it.vrs.length > 1) {
      S.villRanges = it.vrs.map(s => P.unpackRange(s));
      S.villHoles = (it.vhs || []).map(h => h.slice());
      if (S.villHoles.length !== S.villRanges.length) {   // Altbestand ohne vhs
        S.villHoles = S.villRanges.map((r, i) => S.villHoles[i] || pickCombo(r, S.heroHole));
      }
      S.villHole = S.villHoles[0]; S.villRange = S.villRanges[0];
    } else { S.villRanges = null; S.villHoles = [S.villHole]; }
    // Sicherheitsnetz, falls ein Schnappschuss leer/beschädigt ist
    if (!S.heroRange.length) S.heroRange = P.parseRange(S.heroRangeStr);
    if (!S.villRange.length) S.villRange = P.parseRange(S.villRangeStr);
    S.pot = it.pot; S.eff = it.eff; S.street = it.street;
    S.invH = it.invH || 0; S.invV = it.invV || 0;
    S.allInAt = null;
    S.log = (it.log || []).slice();
    S.villChecked = !!it.vChk;
    S.finished = false; S.newFrom = undefined;
    const dead = new Set(S.board.concat(S.heroHole, S.villHole));
    S.deck = P.fullDeck().filter(c => !dead.has(c));

    computeCtx();
    renderSpot(); renderTable();
    $('#reviewBar').hidden = false;
    $('#reviewProgress').textContent = `${S.qIdx + 1} von ${S.queue.length} · Box ${it.box || 1} von 5`;
    $('#reviewWhy').innerHTML = `Beim letzten Mal: <b>${escapeHtml(it.picked)}</b> statt <b style="color:var(--ok)">${escapeHtml(it.best)}</b>`;
    if (it.qMode === 'FACE' && it.facing) askFacing(it.facing.toCall, it.facing.potNow, it.facing.betPct);
    else askBetting();
  }

  /**
   * Bewertet wird nur, was auch anklickbar war.
   *
   * Die Engine bewertet immer alle vier Aktionen. Ist eine davon in diesem
   * Spot gar nicht spielbar — mit den Nuts am River all-in gecallt, der
   * Reststack liegt schon im Pot — stand sie trotzdem als "Baseline" im
   * Urteil, und die eigene Aktion bekam nur den Rest der Skala. Deshalb
   * werden Bewertung und Baseline hier auf die angebotenen Optionen
   * eingedampft; dass die stärkste Aktion fehlt, wird stattdessen gesagt.
   */
  function limitToOptions() {
    const keys = (S.q && S.q.optKeys) || [];
    if (!keys.length || !S.rec) return;
    const engineBest = S.rec.best;
    const top = Math.max(...keys.map(k => S.rec.scores[k] || 0)) || 1;
    for (const k of keys) S.rec.scores[k] = Math.round((S.rec.scores[k] || 0) / top * 100);
    S.rec.best = keys.reduce((a, b) => (S.rec.scores[a] || 0) >= (S.rec.scores[b] || 0) ? a : b);
    /* "Nicht angeboten" heißt: die Aktion steckt auch in keiner
       zusammengefassten Schaltfläche. Sonst stünde der Hinweis da, obwohl
       der All-in-Knopf genau diese Aktion ist. */
    const src = (S.q && S.q.optSrc) || {};
    const covered = keys.some(k => (src[k] || [k]).indexOf(engineBest) >= 0);
    /* Wenn gar kein Raise mehr geht, ist auch die Begründung "Raise-Kandidat"
       falsch — sie empfiehlt etwas, das der Stack nicht mehr hergibt. */
    if (!keys.some(k => k === 'RAISE_S' || k === 'RAISE_L') && S.q.mode === 'FACE') {
      S.rec.reasons = S.rec.reasons.filter(r => !/^Raise-Kandidat/.test(r));
    }
    if (!covered) {
      S.rec.reasons.push(`Stärker wäre **${labelOf(engineBest)}** — das ist hier keine Option mehr (der ` +
        `Reststack reicht nicht dafür). Bewertet wird nur, was du anklicken konntest.`);
    }
  }

  function labelOf(key) {
    // Die angezeigte Beschriftung gewinnt (z.B. "All-in" statt "Bet 130%")
    if (S.q && S.q.optLabels && S.q.optLabels[key]) return S.q.optLabels[key];
    if (key === 'BET_AI') return 'All-in';
    const a = P.BET_OPTIONS.find(o => o.key === key) || P.FACING_OPTIONS.find(o => o.key === key);
    return a ? a.label : key;
  }

  function applyAnswer(key) {
    if (S.villRanges) return endMultiway(key);
    if (S.q.mode === 'BET') return applyBet(key);
    return applyFacing(key);
  }

  /** Multiway-Drill abschließen: Aktion protokollieren, ausrunnen, zeigen. */
  function endMultiway(key) {
    if (key === 'CHECK') pushLog('you', 'Du checkst');
    else {
      const o = P.BET_OPTIONS.find(x => x.key === key);
      const bet = key === 'BET_AI' ? remH() : Math.min(+(o.pct * S.pot).toFixed(1), remH());
      pushLog('you', `Du bettest ${bet.toFixed(1)}bb (${pct(bet / S.pot)})`);
    }
    while (S.board.length < 5) S.board.push(drawCard());
    S.finished = true;
    renderTable();
    $('#askBox').hidden = true; $('#feedback').hidden = true;

    const mine = P.evaluate(S.heroHole.concat(S.board));
    const rows = S.villHoles.map((h, i) => {
      const sc = P.evaluate(h.concat(S.board));
      const cl = P.classify(h, S.board);
      const nm = (S.spot.villNames && S.spot.villNames[i]) || ('Gegner ' + (i + 1));
      return `<div class="muted">${nm}: <b>${P.comboToStr(h)}</b> — ${cl.made}
        ${sc > mine ? '<span style="color:var(--bad)">schlägt dich</span>' : ''}</div>`;
    }).join('');
    const beatAll = S.villHoles.every(h => mine > P.evaluate(h.concat(S.board)));
    const myCls = P.classify(S.heroHole, S.board);
    $('#handEndText').innerHTML =
      `<div class="res" style="color:var(--${beatAll ? 'ok' : 'bad'})">${beatAll
        ? 'Am River vorne gegen beide.' : 'Am River nicht mehr vorne.'}</div>` +
      `<div class="muted" style="margin-bottom:.4rem">Deine Hand: <b>${myCls.made}</b></div>` + rows +
      `<div class="muted" style="margin-top:.5rem">Board: ${S.board.map(P.cardToStr).join(' ')}</div>` +
      `<div class="muted" style="margin-top:.5rem">Multiway wird als Flop-Drill trainiert — die
        Folgestraßen werden nicht simuliert, weil dafür eine echte Mehrspieler-Aktionslogik nötig wäre.</div>`;
    $('#handEnd').hidden = false;
  }

  function applyBet(key) {
    if (key === 'CHECK') {
      pushLog('you', 'Du checkst');
      if (S.spot.heroIP) { narrowBoth('check', 'check'); return nextStreet(); }
      // Gegner ist IP und agiert jetzt
      S.heroRange = P.narrow(S.heroRange, S.board, 'check', { ctx: S.ctx });
      const act = villainOpenAction();
      // Kein zusätzliches narrow('bet') hier: askFacing filtert die Range
      // bereits mit bettingRangeOf, und zweimal filtern hieße, seine
      // Bet-Frequenz zweimal einzurechnen (siehe applyFacing).
      if (act.type === 'bet') return villainBets(act);
      S.villRange = P.narrow(S.villRange, S.board, 'check', { ctx: villCtx() });
      pushLog('vil', 'Gegner checkt');
      return nextStreet();
    }
    const potBefore = S.pot;
    const o = P.BET_OPTIONS.find(x => x.key === key);
    const bet = key === 'BET_AI' ? remH() : Math.min(+(o.pct * S.pot).toFixed(1), remH());
    const bp = bet / potBefore;
    S.pot += bet; S.invH = (S.invH || 0) + bet;
    pushLog('you', `Du bettest ${bet.toFixed(1)}bb (${pct(bp)})${remH() <= 0.05 ? ' — All-in' : ''}`);
    renderTable();
    S.heroRange = P.narrow(S.heroRange, S.board, 'bet', { ctx: S.ctx });

    const heroBet = P.bettingRangeOf(S.heroRange, S.board, bp, S.ctx);
    const vEq = P.equityVsRange(S.villHole, heroBet, S.board, 60000).eq;
    const toCallV = Math.min(bet, remV());
    const vc = villCtx({ facing: { toCall: toCallV, potNow: S.pot, betPct: bp }, eqVsBettingRange: vEq });
    let resp = P.villainAct(S.villHole, S.board, vc, true);
    // Gegen einen All-in-Spieler kann man nicht mehr erhöhen
    if (resp !== 'FOLD' && resp !== 'CALL' && (remH() <= 0.05 || remV() <= toCallV + 0.1)) resp = 'CALL';

    if (resp === 'FOLD') { pushLog('vil', 'Gegner foldet'); return endHand('villFold', S.pot - uncalled()); }
    if (resp === 'CALL') {
      pushLog('vil', `Gegner callt ${toCallV.toFixed(1)}bb`);
      S.villRange = P.narrow(S.villRange, S.board, 'call', { betPct: bp, street: S.street, profile: S.profile });
      S.pot += toCallV; S.invV = (S.invV || 0) + toCallV;
      closeRound();
      return nextStreet();
    }
    // Gegner raist — raiseTo ist sein GESAMTEINSATZ dieser Straße
    const raiseTo = Math.min(S.eff, +(bet * (resp === 'RAISE_L' ? 3.4 : 2.6)).toFixed(1));
    const add = raiseTo - (S.invV || 0);
    const villRaise = P.narrow(S.villRange, S.board, 'raise', { ctx: vc });
    S.pot += add; S.invV = raiseTo;
    pushLog('vil', `Gegner raist auf ${raiseTo.toFixed(1)}bb${remV() <= 0.05 ? ' (All-in)' : ''}`);
    renderTable();
    return askFacing(raiseTo - S.invH, S.pot, raiseTo / potBefore, null, villRaise);
  }

  function applyFacing(key) {
    const f = S.q.facing;
    if (key === 'FOLD') { pushLog('you', 'Du foldest'); return endHand('heroFold', 0); }
    /* Ab hier ist seine Range die, MIT DER ER GESETZT HAT — genau die, gegen
       die oben die Equity gerechnet wurde, und sie gilt auch auf den
       Folgestraßen. Vorher wurde sie auf dem einen Weg zusätzlich durch
       narrow('bet') geschickt und auf dem anderen gar nicht: derselbe Spot
       ergab je nach Position im Median 12 Prozentpunkte Equity-Unterschied
       und in einem Drittel der Fälle eine andere Empfehlung. */
    if (S.q.villBet && S.q.villBet.length) S.villRange = rescale(S.q.villBet);
    if (key === 'CALL') {
      const call = Math.min(f.toCall, remH());
      S.pot += call; S.invH = (S.invH || 0) + call;
      pushLog('you', `Du callst ${call.toFixed(1)}bb${remH() <= 0.05 ? ' — All-in' : ''}`);
      S.heroRange = P.narrow(S.heroRange, S.board, 'call', { betPct: f.betPct, street: S.street });
      closeRound();
      return nextStreet();
    }
    // Hero raist — raiseTo ist sein GESAMTEINSATZ dieser Straße
    const raiseTo = Math.min(S.eff, +(raiseTarget(key, f.toCall)).toFixed(1));
    const addH = raiseTo - (S.invH || 0);
    S.pot += addH; S.invH = raiseTo;
    pushLog('you', `Du raist auf ${raiseTo.toFixed(1)}bb${remH() <= 0.05 ? ' — All-in' : ''}`);
    renderTable();
    S.heroRange = P.narrow(S.heroRange, S.board, 'raise', { ctx: S.ctx });
    const heroRaise = P.bettingRangeOf(S.heroRange, S.board, 0.9, S.ctx);
    const vEq = P.equityVsRange(S.villHole, heroRaise, S.board, 60000).eq;
    const toCallV = Math.min(raiseTo - (S.invV || 0), remV());
    const vc = villCtx({ facing: { toCall: toCallV, potNow: S.pot, betPct: 0.9 }, eqVsBettingRange: vEq });
    const resp = P.villainAct(S.villHole, S.board, vc, true);
    if (resp === 'FOLD') { pushLog('vil', 'Gegner foldet'); return endHand('villFold', S.pot - uncalled()); }
    pushLog('vil', `Gegner callt ${toCallV.toFixed(1)}bb`);
    S.villRange = P.narrow(S.villRange, S.board, 'call', { betPct: 0.9, street: S.street, profile: S.profile });
    S.pot += toCallV; S.invV = (S.invV || 0) + toCallV;
    closeRound();
    return nextStreet();
  }

  function narrowBoth(hAct, vAct) {
    S.heroRange = P.narrow(S.heroRange, S.board, hAct, { ctx: S.ctx });
    S.villRange = P.narrow(S.villRange, S.board, vAct, { ctx: villCtx() });
  }

  function nextStreet() {
    if (!S.cfg.multi && S.street === 'flop') return endHand('stop', S.pot);
    if (S.eff <= 0.3) {
      /* Beide All-in: es gibt keine Entscheidung mehr zu treffen. Das wird
         ausdrücklich angezeigt, damit die fehlende River-Frage nicht wie ein
         Fehler aussieht — die Karten werden nur noch ausgeteilt. */
      S.allInAt = S.board.length < 5 ? S.street : null;
      while (S.board.length < 5) S.board.push(drawCard());
      return showdown();
    }
    if (S.street === 'river') return showdown();
    S.newFrom = S.board.length;
    S.board.push(drawCard());
    S.street = S.street === 'flop' ? 'turn' : 'river';
    startStreet();
  }

  function showdown() {
    const h = P.evaluate(S.heroHole.concat(S.board));
    const v = P.evaluate(S.villHole.concat(S.board));
    endHand(h > v ? 'win' : h === v ? 'split' : 'lose', S.pot);
  }

  function endHand(how, potWon) {
    S.finished = true;
    while (S.board.length < 5 && (how === 'win' || how === 'lose' || how === 'split')) S.board.push(drawCard());
    renderTable();
    $('#askBox').hidden = true;
    $('#feedback').hidden = true;
    const vc = P.classify(S.villHole, S.board);
    const msg = {
      villFold: `<div class="res" style="color:var(--ok)">Gegner foldet — du gewinnst ${potWon.toFixed(1)}bb.</div>`,
      heroFold: `<div class="res" style="color:var(--warn)">Du foldest.</div>`,
      win: `<div class="res" style="color:var(--ok)">Showdown gewonnen — ${potWon.toFixed(1)}bb.</div>`,
      lose: `<div class="res" style="color:var(--bad)">Showdown verloren.</div>`,
      split: `<div class="res">Split Pot.</div>`,
      stop: `<div class="res">Flop-Drill beendet.</div>`
    }[how];
    const aiNote = S.allInAt
      ? `<div class="muted" style="margin-bottom:.4rem">Beide All-in am ${{ flop: 'Flop', turn: 'Turn', river: 'River' }[S.allInAt]} — ${S.allInAt === 'river' ? 'der Pot wird direkt gezeigt' : 'die restlichen Karten werden nur noch ausgeteilt. Ab hier gibt es keine Entscheidung mehr.'}</div>`
      : '';
    $('#handEndText').innerHTML = msg + aiNote +
      `<div class="muted">Er hatte <b>${P.comboToStr(S.villHole)}</b> — ${vc.made}${vc.draws.length ? ' (' + vc.draws.join(', ') + ')' : ''}.</div>` +
      `<div class="muted" style="margin-top:.4rem">Board: ${S.board.map(P.cardToStr).join(' ')}</div>`;
    $('#handEnd').hidden = false;
  }

  /* ------------------------------ Rendering -------------------------- */
  function pushLog(who, t) { S.log.push({ who, t }); renderLog(); }
  function renderLog() {
    $('#actionLog').innerHTML = S.log.map(l =>
      `<div class="${l.who || ''}">${l.t}</div>`).join('');
  }

  /* SPR aus dem Kontext, nicht aus dem Live-Pot: die Engine rechnet mit dem
     Wert vom Straßenbeginn (computeCtx), und die Schwellen im Code ("SPR < 1.5
     = Commitment", raiseDrive bei SPR < 1.2) beziehen sich auf genau den.
     Vorher stand im Nenner des Chips der Pot INKLUSIVE seiner Bet: angezeigt
     wurden 1.9, gerechnet wurde mit 3.4. */
  function sprNow() { return (S.ctx ? S.ctx.spr : S.eff / S.pot).toFixed(1); }

  function renderSpot() {
    const sp = S.spot, st = P.STACKS[S.band];
    $('#spotName').textContent = sp.name;
    $('#chipTag').innerHTML = `<b>${sp.tag}</b>`;
    $('#chipStack').innerHTML = `Stacks <b>${st.bb}bb</b>`;
    $('#chipPot').innerHTML = `Pot <b>${S.pot.toFixed(1)}bb</b>`;
    $('#chipSpr').innerHTML = `SPR <b>${sprNow()}</b>`;
    $('#chipPos').innerHTML = `<b>${sp.heroIP ? 'IP' : 'OOP'}</b> · ${sp.heroPos} vs ${sp.villPos}`;
    const pc = $('#chipProfile');
    if (S.profile && S.profile.key !== 'reg') {
      pc.hidden = false; pc.className = 'chip prof';
      pc.innerHTML = `Gegner <b>${S.profile.name}</b>`;
      pc.title = S.profile.short;
    } else { pc.hidden = true; }
    $('#spotStory').innerHTML = md(sp.story);
  }

  function renderTable() {
    $('#streetLabel').textContent = { flop: 'FLOP', turn: 'TURN', river: 'RIVER' }[S.street] || 'BOARD';
    renderCards($('#board'), S.board, S.newFrom);
    renderCards($('#heroHand'), S.heroHole);
    const c = P.classify(S.heroHole, S.board);
    $('#heroClass').textContent = c.made + (c.draws.length ? ' + ' + c.draws.join(', ') : '');
    $('#chipPot').innerHTML = `Pot <b>${S.pot.toFixed(1)}bb</b>`;
    $('#chipSpr').innerHTML = `SPR <b>${sprNow()}</b>`;
    renderLog();
  }

  function renderAsk(title, opts) {
    $('#feedback').hidden = true;
    $('#handEnd').hidden = true;
    $('#askBox').hidden = false;
    $('#askTitle').textContent = title;
    const box = $('#opts'); box.innerHTML = '';
    opts.forEach(o => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.innerHTML = `${o.label}${o.amt ? `<span class="amt">${o.amt}</span>` : ''}`;
      b.onclick = () => onAnswer(o.key);
      box.appendChild(b);
    });
    $('#calcNote').textContent = `Ranges: du ${S.heroRange.length} / er ${S.villRange.length} Kombos · ${S.calcMs}ms`;
    const hb = $('#hintBox');
    hb.innerHTML = hintHTML();
    hb.hidden = !S.cfg.autoHint;
  }

  function hintHTML() {
    const c = S.ctx;
    return `<div>${md(P.rangeAdvText(c))}</div><div>${md(P.nutAdvText(c))}</div>
      <div>Board: <b>${c.tex.label}</b> — Dynamik ${c.tex.dyn}/10 (${c.tex.static ? 'statisch' : 'dynamisch'})</div>
      <div>Seine Range: ${pct(c.villBuckets.strongPct)} Overpair/TPTK+, ${pct(c.villBuckets.drawPct)} Draws, ${pct(c.villBuckets.airPct)} Air</div>`;
  }

  /* ========================= Handklassen-Quiz ======================== *
   * Die Frage, die im Feedback bisher fehlte: nicht "war DEINE Hand ein
   * Call", sondern "welche Hände sind hier überhaupt ein Call". Gefragt
   * wird dieselbe Stelle mit einer anderen Hand aus DEINER Range. Die
   * Antwort kommt aus derselben Engine wie die Hauptempfehlung — hier steht
   * nichts, was der Trainer nicht auch für die echte Hand rechnen würde.
   * ------------------------------------------------------------------ */
  function quizPickHand() {
    const dead = new Set(S.board.concat(S.heroHole, ...(S.villHoles || [])));
    const mine = P.tierOf(S.ctx.cls);
    const pool = S.heroRange.filter(x => x.w > 0.05 && !dead.has(x.c[0]) && !dead.has(x.c[1]));
    if (!pool.length) return null;
    /* Eine Hand aus einer ANDEREN Stärkeklasse ist die lehrreichere Frage —
       sonst lautet die Antwort meistens genau wie gerade eben. */
    const other = pool.filter(x => P.tierOf(P.classify(x.c, S.board)) !== mine);
    const from = other.length >= 3 ? other : pool;
    let r = P.rng() * from.reduce((a, x) => a + x.w, 0);
    for (const x of from) { r -= x.w; if (r <= 0) return x.c.slice(); }
    return from[from.length - 1].c.slice();
  }

  function quizBuild() {
    if (S.cfg.quiz === false || !S.ctx || !S.q || !S.q.optKeys) return null;
    const hole = quizPickHand();
    if (!hole) return null;
    const cls = P.classify(hole, S.board);
    /* Die Stärkewerte gehören zur QUIZ-Hand. Sonst stünde in der Begründung
       die Equity der eben gespielten Hand unter einem anderen Handnamen. */
    const rel = P.relativeStrength(hole, S.villRange, S.board).pct;
    const eq = (S.villRanges && S.villRanges.length > 1)
      ? P.Multiway.equityMulti(hole, S.villRanges, S.board, 8000).eq
      : P.equityVsRange(hole, S.villRange, S.board, 60000).eq;
    const base = { cls, heroPct: rel, heroEq: eq };
    let rec;
    if (S.q.mode === 'FACE' && S.ctxFacing && S.q.villBet) {
      base.eqVsBettingRange = P.equityVsRange(hole, S.q.villBet, S.board, 60000).eq;
      rec = P.recommendFacing(cls, Object.assign({}, S.ctxFacing, base));
    } else {
      rec = P.recommendBetting(cls, Object.assign({}, S.ctx, base));
    }
    /* Bewertet werden nur die Optionen, die auch angeboten wurden — und wie
       im Hauptablauf zählt bei zusammengefassten Sizings die bessere. */
    const keys = S.q.optKeys, src = S.q.optSrc || {};
    const raw = {};
    for (const k of keys) raw[k] = Math.max(...(src[k] || [k]).map(x => rec.scores[x] || 0));
    const top = Math.max(1, ...keys.map(k => raw[k]));
    const scores = {};
    for (const k of keys) scores[k] = Math.round(raw[k] / top * 100);
    return { hole, cls, rec, scores, keys, eq };
  }

  function miniCards(cards) {
    return cards.map(c => {
      const u = P.SUITS[P.suitOf(c)];
      return `<span class="card mini ${SUIT_CLASS[u] || ''}"><span class="r">${P.RANKS[P.rankOf(c)]}</span><span class="s">${P.SUIT_SYM[u]}</span></span>`;
    }).join(' ');
  }

  function renderQuiz() {
    const panel = $('#fbQuizPanel');
    S.quiz = quizBuild();
    if (!S.quiz) { panel.hidden = true; return; }
    panel.hidden = false;
    const q = S.quiz;
    $('#fbQuiz').innerHTML = `<div class="quizask">Du hältst hier stattdessen ${miniCards(q.hole)}
        <b>${q.cls.made}</b>${q.cls.draws.length ? ' + ' + q.cls.draws.join(', ') : ''} —
        gleiches Board, gleiche Gegner-Range, gleiche Aktion vor dir. Was machst du damit?</div>
      <div class="opts" id="quizOpts"></div>`;
    const wrap = $('#quizOpts');
    q.keys.forEach(k => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.textContent = labelOf(k);
      b.onclick = () => quizAnswer(k);
      wrap.appendChild(b);
    });
  }

  function quizAnswer(key) {
    const q = S.quiz;
    if (!q) return;
    const g = P.grade(q.scores, key);
    const st = S.stats.quiz || (S.stats.quiz = { right: 0, total: 0 });
    st.total++; if (g.pts >= 2) st.right++;
    save();
    const best = q.keys.reduce((a, b) => q.scores[a] >= q.scores[b] ? a : b);
    $('#fbQuiz').innerHTML =
      `<div class="verdict ${g.cls}">${g.rating} — mit ${miniCards(q.hole)} du: <b>${labelOf(key)}</b>${key !== best ? ' · Baseline: <b>' + labelOf(best) + '</b>' : ''}
        <small>Bewertung ${q.scores[key]}/100 · Quiz insgesamt ${st.right}/${st.total} richtig</small></div>
      <div class="scorebars">${q.keys.map(k => `<div class="sb ${k === key ? 'picked' : ''} ${k === best ? 'bestopt' : ''}">
        <span class="name">${labelOf(k)}</span><span class="bar"><i style="width:${q.scores[k]}%"></i></span>
        <span class="val">${q.scores[k]}</span></div>`).join('')}</div>
      <ul class="reasons">${q.rec.reasons.map(r => `<li>${md(r)}</li>`).join('')}</ul>`;
  }

  function showFeedback(picked, g) {
    $('#askBox').hidden = true;
    const fb = $('#feedback'); fb.hidden = false;
    const c = S.ctx;
    $('#verdict').className = 'verdict ' + g.cls;
    $('#verdict').innerHTML = `${g.rating} — du: <b>${labelOf(picked)}</b>${picked !== S.rec.best ? ` · Baseline: <b>${labelOf(S.rec.best)}</b>` : ''}
      <small>Bewertung ${S.rec.scores[picked]}/100. Mehrere Optionen können gleichzeitig richtig sein — Poker ist eine Mix-Strategie.</small>`;

    // Score-Balken
    // Nur die Optionen bewerten, die auch anklickbar waren
    const keys = S.q.optKeys || (S.q.mode === 'BET' ? P.BET_OPTIONS.map(o => o.key) : P.FACING_OPTIONS.map(o => o.key));
    $('#scorebars').innerHTML = keys.map(k => {
      const v = S.rec.scores[k] || 0;
      return `<div class="sb ${k === picked ? 'picked' : ''} ${k === S.rec.best ? 'bestopt' : ''}">
        <span class="name">${labelOf(k)}</span>
        <span class="bar"><i style="width:${v}%"></i></span>
        <span class="val">${v}</span></div>`;
    }).join('');

    // Panel 1: Board & Ranges
    $('#fbBoard').innerHTML = `
      <div class="tagline"><span>${c.tex.suitTex}</span>${c.tex.paired ? '<span>Paired</span>' : ''}
        ${c.tex.connected ? '<span>Connected</span>' : ''}<span>${c.tex.static ? 'statisch' : 'dynamisch'} ${c.tex.dyn}/10</span>
        <span>SPR ${c.spr}</span></div>
      <div>${md(P.rangeAdvText(c))}</div>
      <div style="margin-top:.4rem">${md(P.nutAdvText(c))}</div>
      <div style="margin-top:.5rem" class="muted">Deine Range: ${pct(c.heroBuckets.strongPct)} Overpair/TPTK+ · ${pct(c.heroBuckets.drawPct)} Draws · ${pct(c.heroBuckets.airPct)} Air</div>`;

    // Panel 2: Gegner-Range
    const vb = c.villBuckets;
    if (S.villRanges && S.villBuckets) {
      // Multiway: jeder Gegner einzeln, plus die kombinierte Gefahr
      $('#fbVillain').innerHTML = S.villBuckets.map((b, i) => {
        const nm = (S.spot.villNames && S.spot.villNames[i]) || ('Gegner ' + (i + 1));
        return `<div style="margin-bottom:.5rem"><b>${nm}</b> <span class="muted">(${b.combos} Kombos)</span>
          ${b.list.slice(0, 4).map(x => `<div class="bucket"><span>${x.name}</span>
            <span class="n">${pct(x.pct)}</span><span class="n"></span>
            <span class="bbar"><i style="width:${Math.min(100, x.pct * 260)}%;background:${bucketColor(x.name)}"></i></span></div>`).join('')}
          <div class="muted">${pct(b.strongPct)} Overpair/TPTK+ · ${pct(b.airPct)} Luft</div></div>`;
      }).join('') +
        `<div class="muted" style="border-top:1px dashed var(--line);padding-top:.4rem">
          → <b>${pct(c.mwDanger)}</b> Chance, dass <b>mindestens einer</b> Overpair/TPTK-oder-besser hat.
          Heads-up wären es nur ${pct(S.villBuckets[0].strongPct)}. Genau deshalb stirbt hier der dünne Value.</div>`;
    } else
    $('#fbVillain').innerHTML =
      `<div class="muted" style="margin-bottom:.4rem">${vb.combos} Kombos: <span title="Preflop-Range">${escapeHtml(S.villRangeStr).slice(0, 120)}…</span></div>` +
      vb.list.slice(0, 9).map(b => `
        <div class="bucket"><span>${b.name}</span><span class="n">${pct(b.pct)}</span><span class="n">${b.w.toFixed(0)}</span>
          <span class="bbar"><i style="width:${Math.min(100, b.pct * 260)}%;background:${bucketColor(b.name)}"></i></span></div>`).join('') +
      `<div class="muted" style="margin-top:.5rem">→ Er hat <b>${pct(vb.strongPct)}</b> Overpair/TPTK-oder-besser, <b>${pct(vb.airPct)}</b> reine Luft.</div>`;

    // Panel 3: Relative Stärke
    const p = c.heroPct;
    $('#fbHero').innerHTML = `
      <div><b>${c.cls.made}</b>${c.cls.draws.length ? ' + ' + c.cls.draws.join(', ') : ''}</div>
      <div class="gauge"><i style="width:${p * 100}%"></i><span>schlägt ${pct(p)} seiner Range</span></div>
      <div class="gauge"><i style="width:${c.heroEq * 100}%"></i><span>Equity ${pct(c.heroEq)}</span></div>
      <div class="muted">${strengthVerdict(p, c)}</div>
      ${S.q.mode === 'FACE' ? `<div style="margin-top:.5rem">Gegen seine <b>Bet-Range</b>: <b>${pct(S.rec.eqVsBet)}</b> Equity · Pot Odds <b>${pct(S.rec.potOdds)}</b> · MDF <b>${pct(S.rec.mdf)}</b></div>` : ''}`;

    // Panel 4: Nuts
    const nuts = P.nutsOnBoard(S.board, 5);
    $('#fbNuts').innerHTML = `<ul class="nutlist">` + nuts.map((n, i) =>
      `<li><span class="rk">${i + 1}.</span><span class="hd">${fmtCombo(n.combo)}</span><span class="muted">${n.made}</span></li>`).join('') +
      `</ul><div class="muted" style="margin-top:.4rem">Hast du eine davon? → maximal Value. Kann <i>er</i> sie haben? → große Bets von ihm ernst nehmen.</div>`;

    $('#fbReasons').innerHTML = S.rec.reasons.map(r => `<li>${md(r)}</li>`).join('');
    renderQuiz();
  }

  function fmtCombo(c) {
    return c.map(x => {
      const u = P.SUITS[P.suitOf(x)];
      return P.RANKS[P.rankOf(x)] + P.SUIT_SYM[u];
    }).join(' ');
  }
  function bucketColor(n) {
    const strong = [P.MADE.SF, P.MADE.QUADS, P.MADE.BOAT, P.MADE.FLUSH, P.MADE.STRAIGHT, P.MADE.SET, P.MADE.TRIPS, P.MADE.TWOPAIR];
    if (strong.includes(n)) return 'var(--bad)';
    if ([P.MADE.OVERPAIR, P.MADE.TPTK, P.MADE.TP].includes(n)) return 'var(--warn)';
    return 'var(--acc2)';
  }
  function strengthVerdict(p, c) {
    // Ohne Made Hand ist der Prozentwert irreführend: er sagt nur, dass auch er
    // oft nichts hat. Bluffcatchen kann man nur mit Showdown-Wert.
    if (P.tierOf(c.cls) === 0) {
      return c.cls.draws.length
        ? `Keine Made Hand, aber Equity (${c.cls.draws.join(', ')}) → Semibluff, nicht Check/Call.`
        : 'Keine Made Hand, keine Equity. Der %-Wert oben heißt nur, dass auch er oft nichts hat — am Showdown gewinnst du damit fast nie. → aufgeben oder gezielt bluffen (mit Blockern).';
    }
    if (p > 0.85) return 'Top of Range → Value maximieren, Streets planen.';
    if (p > 0.7) return 'Starke Value-Hand → 2 Streets Value, gegen große Aggression aufpassen.';
    if (p > 0.55) return 'Medium: gewinnt oft am Showdown, aber verträgt keinen großen Pot → klein betten oder Check/Call.';
    if (p > 0.4) return 'Bluffcatcher-Region → Pot klein halten, Check/Call gegen aggressive Gegner.';
    return 'Schwache Made Hand → Check/Fold, außer die Pot Odds sind sehr gut.';
  }
  function escapeHtml(s) { return String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

  /* ------------------------------ Analyse ---------------------------- */
  function parseCards(str) {
    const m = String(str).toUpperCase().match(/[2-9TJQKA][CDHS]/g) || [];
    return m.map(P.cardFromStr);
  }
  function runAnalyse() {
    const board = parseCards($('#anBoard').value);
    const hero = parseCards($('#anHero').value);
    const out = $('#anOut');
    if (board.length < 3) { out.innerHTML = '<div class="panel wide">Bitte mindestens 3 Board-Karten eingeben (z.B. <code>Kh7d2c</code>).</div>'; return; }
    // Freie Eingabe: was der Parser nicht liest, muss der Nutzer sehen.
    // Sonst rechnet die Analyse still mit einer anderen Range weiter als der
    // eingegebenen und liefert eine plausible, aber falsche Zahl.
    const DEF_RANGE = 'AA-22, AKs-A2s, AKo-A2o';
    const hrP = P.parseRangeStrict($('#anHeroRange').value || DEF_RANGE);
    const vrP = P.parseRangeStrict($('#anVillRange').value || DEF_RANGE);
    const hr = hrP.range, vr = vrP.range;
    const ignored = hrP.unknown.map(u => ['Deine Range', u])
      .concat(vrP.unknown.map(u => ['Gegner-Range', u]));
    const warnHTML = ignored.length ? `<div class="verdict warn">${ignored.length === 1
      ? 'Ein Token wurde ignoriert' : ignored.length + ' Tokens wurden ignoriert'} — die Analyse rechnet ohne ${ignored.length === 1 ? 'ihn' : 'sie'}.
      <small>${ignored.map(([wo, u]) => `${wo}: <code>${escapeHtml(u.token)}</code> — ${u.reason}`).join('<br>')}</small></div>` : '';
    if (!hr.length || !vr.length) {
      out.innerHTML = warnHTML + `<div class="panel wide">${!hr.length && !vr.length ? 'Beide Ranges sind' : (!hr.length ? 'Deine Range ist' : 'Die Gegner-Range ist')} leer — bitte eine gültige Notation eingeben (z.B. <code>AA-22, AKs-A2s, AKo-A2o</code>).</div>`;
      return;
    }
    const tex = P.boardTexture(board);
    const hB = P.rangeBuckets(hr, board, []);
    const vB = P.rangeBuckets(vr, board, hero);
    const rEq = P.rangeVsRange(hr, vr, board, 10000);
    const pot = parseFloat($('#anPot').value) || 6, eff = parseFloat($('#anEff').value) || 40;
    const ctx = Object.assign({
      street: board.length === 3 ? 'flop' : board.length === 4 ? 'turn' : 'river',
      tex, spr: +(eff / pot).toFixed(1), pot, eff, heroIP: true, role: 'PFR',
      potType: 'SRP', heroNut: hB.nuttedPct, villNut: vB.nuttedPct,
      heroBuckets: hB, villBuckets: vB, rangeEq: rEq
    }, P.advantage(hB, vB, rEq));
    let heroBlock = '';
    if (hero.length === 2) {
      const cls = P.classify(hero, board);
      const eq = P.equityVsRange(hero, vr, board, 120000).eq;
      const rel = P.relativeStrength(hero, vr, board);
      Object.assign(ctx, { heroEq: eq, heroPct: rel.pct, cls });
      const rec = P.recommendBetting(cls, ctx);
      heroBlock = `<div class="panel"><h3>Deine Hand</h3>
        <div><b>${cls.made}</b>${cls.draws.length ? ' + ' + cls.draws.join(', ') : ''}</div>
        <div class="gauge"><i style="width:${rel.pct * 100}%"></i><span>schlägt ${pct(rel.pct)} seiner Range</span></div>
        <div class="gauge"><i style="width:${eq * 100}%"></i><span>Equity ${pct(eq)}</span></div>
        <div style="margin-top:.5rem"><b>Baseline:</b> ${labelOf(rec.best)}</div>
        <ul class="reasons">${rec.reasons.map(r => `<li>${md(r)}</li>`).join('')}</ul></div>`;
    }
    const nuts = P.nutsOnBoard(board, 6);
    out.innerHTML = warnHTML + `<div class="grid2">
      <div class="panel"><h3>Board</h3>
        <div class="tagline"><span>${tex.label}</span><span>Dynamik ${tex.dyn}/10</span><span>SPR ${ctx.spr}</span></div>
        <div>${md(P.rangeAdvText(ctx))}</div><div style="margin-top:.4rem">${md(P.nutAdvText(ctx))}</div></div>
      <div class="panel"><h3>Nuts</h3><ul class="nutlist">${nuts.map((n, i) =>
      `<li><span class="rk">${i + 1}.</span><span class="hd">${fmtCombo(n.combo)}</span><span class="muted">${n.made}</span></li>`).join('')}</ul></div>
      <div class="panel"><h3>Deine Range (${hB.combos} Kombos)</h3>${bucketHTML(hB)}</div>
      <div class="panel"><h3>Gegner-Range (${vB.combos} Kombos)</h3>${bucketHTML(vB)}</div>
      ${heroBlock}</div>`;
  }
  function bucketHTML(b) {
    return b.list.map(x => `<div class="bucket"><span>${x.name}</span><span class="n">${pct(x.pct)}</span>
      <span class="n">${x.w.toFixed(0)}</span><span class="bbar"><i style="width:${Math.min(100, x.pct * 260)}%;background:${bucketColor(x.name)}"></i></span></div>`).join('');
  }

  /* ============================ HAND-STECKBRIEFE ==================== *
   * Die Umkehrung des Trainers: nicht ein Board gegen alle Hände, sondern
   * eine Hand gegen alle Flops. Rechnen tut das js/handprofile.js, hier
   * steht nur die Darstellung.
   * ------------------------------------------------------------------ */
  const HP = () => P.HandProfile;
  const ARCHE_COLOR = {
    pp_hi: '#3fbf7f', pp_mid: '#2a8d5c', pp_low: '#1f6b47',
    bw_s: '#5aa9e6', bw_o: '#3d7ba8',
    ax_s: '#e0a23c', ax_o: '#9c7128',
    sc: '#b06fd0', sg: '#7d4d94', sx: '#4a5f74', weak_o: '#3a4a44'
  };

  /** Auswahl der Gegner-Ranges: die Spot-Bibliothek plus eine Zufallshand. */
  function hpRanges() {
    const out = [{ key: 'random', label: 'Zufällige Hand (alle 1.326 Kombos)', str: HP().ALL_HANDS }];
    for (const s of P.SPOTS) out.push({ key: s.id, label: s.name + ' — seine Range', str: s.villRange('mid') });
    return out;
  }
  function hpRangeFor(key) {
    const all = hpRanges();
    return all.find(r => r.key === key) || all[0];
  }

  function renderHpGrid() {
    const H = HP(), g = $('#hpGrid');
    const mode = S.hp.colorMode || 'arche';
    g.innerHTML = '';
    for (const hc of H.allHandClasses()) {
      const b = document.createElement('button');
      const st = S.stats.byHand[hc];
      const notes = (S.notes.byHand[hc] || []).length;
      b.className = 'hpcell' + (hc === S.hp.sel ? ' sel' : '') + (hc.length === 2 ? ' pp' : '');
      if (mode === 'arche') {
        b.style.background = ARCHE_COLOR[H.archetypeOf(hc)];
        // Nicht zu stark abdunkeln — die dunklen Archetypen (Offsuit-Rest)
        // waren sonst nicht mehr lesbar.
        b.style.opacity = st || notes ? '1' : '.82';
      } else {
        // Fehlerquote: rot = viel falsch. Ungeübte Hände bleiben neutral.
        if (st && st.max) {
          const acc = st.pts / st.max;
          b.style.background = `hsl(${Math.round(acc * 120)} 55% ${26 + acc * 8}%)`;
        } else b.style.background = '#16211d';
      }
      b.innerHTML = hc + (st && st.err.length ? '<i class="dot"></i>' : '') + (notes ? '<i class="pen">✎</i>' : '');
      b.title = hc + ' · ' + H.ARCHETYPES[H.archetypeOf(hc)].name
        + (st ? ` · ${st.dec} Entscheidungen, Score ${Math.round(st.pts / st.max * 100)}%` : '')
        + (notes ? ` · ${notes} Notiz(en)` : '');
      b.onclick = () => selectHand(hc);
      g.appendChild(b);
    }
    $('#hpLegend').innerHTML = mode === 'arche'
      ? Object.keys(ARCHE_COLOR).map(k =>
        `<span><i style="background:${ARCHE_COLOR[k]}"></i>${H.ARCHETYPES[k].name.replace(/ \(.*/, '')}</span>`).join('')
      : '<span class="muted">Grün = hoher Score, Rot = viele Fehler. Dunkel = noch nicht gespielt.</span>';
  }

  function computeProfile(hc) {
    const H = HP();
    const rng = hpRangeFor(S.hp.rangeKey);
    const vr = P.parseRange(rng.str);
    const hole = H.canonicalCombo(hc);
    if (!S.hp.allRange) S.hp.allRange = P.parseRange(H.ALL_HANDS);
    const t0 = performance.now();
    const st = H.flopStats(hc, { villRange: vr, sample: 900 });
    const dom = H.dominance(hc);
    const eqRnd = H.preflopEquity(hole, S.hp.allRange, 15000);
    const eqVs = rng.key === 'random' ? eqRnd : H.preflopEquity(hole, vr, 15000);
    const shove = H.shoveTable(hc, S.hp.evCache);
    return {
      hc, st, dom, eqRnd, eqVs, shove, combos: vr.length,
      rangeLabel: rng.label, ms: Math.round(performance.now() - t0)
    };
  }

  function selectHand(hc) {
    S.hp.sel = hc;
    switchView('haende');
    renderHpGrid();
    const key = hc + '|' + S.hp.rangeKey;
    if (S.hp.cache[key]) return renderHpProfile(S.hp.cache[key]);
    $('#hpOut').innerHTML = `<div class="panel wide hpbusy">Rechnet <b>${hc}</b> gegen alle 19.600 Flops …</div>`;
    // Ein Tick Pause, damit der Browser den Hinweis noch zeichnet.
    setTimeout(() => {
      const r = computeProfile(hc);
      S.hp.cache[key] = r;
      if (S.hp.sel === hc) renderHpProfile(r);
    }, 25);
  }

  function bar(v, color) {
    return `<span class="hpbar"><i style="width:${Math.max(0, Math.min(100, v * 100))}%;background:${color || 'var(--acc2)'}"></i></span>`;
  }
  function relColor(v) { return `hsl(${Math.round(v * 120)} 60% 45%)`; }

  function renderHpProfile(r) {
    const H = HP(), hc = r.hc, st = r.st, arche = H.ARCHETYPES[H.archetypeOf(hc)];
    const bucketName = k => (H.BOARD_BUCKETS.find(b => b.key === k) || { name: k }).name;
    const worst = st.buckets.filter(b => b.topAvg !== null).slice().sort((a, b) => a.topAvg - b.topAvg);
    const mine = S.stats.byHand[hc];

    /* -- Trefferverteilung -- */
    const hits = st.hits.filter(h => h.pct > 0.0005).map(h =>
      `<div class="hprow"><span>${h.name}</span><span class="n">${(h.pct * 100).toFixed(1)}%</span>
        ${bar(h.pct, h.key === 'air' || h.key === 'gutshot' ? 'var(--bad)'
        : h.key === 'draw' || h.key === 'weakpair' ? 'var(--warn)' : 'var(--acc2)')}</div>`).join('');

    /* -- Gefahren-Landkarte -- */
    const map = st.buckets.map(b => `
      <div class="hprow c4"><span>${b.name}</span>
        <span class="n">${(b.freq * 100).toFixed(0)}%</span>
        <span class="n2">${b.relAvg === null ? '—' : (b.relAvg * 100).toFixed(0) + '%'}</span>
        <span class="n3">${b.topAvg === null ? '—' : (b.topAvg * 100).toFixed(0) + '%'}</span>
        ${bar(b.topAvg === null ? 0 : b.topAvg, relColor(b.topAvg || 0))}</div>`).join('');

    /* -- Fallen -- */
    const trapBlock = st.traps.length
      ? `<div class="muted" style="margin-bottom:.4rem">In <b>${(st.trapPct * 100).toFixed(1)}%</b> der Flops,
          auf denen du triffst, schlägst du sein stärkstes Viertel trotzdem nicht:</div>` +
      `<ul class="nutlist">${st.traps.map(t =>
        `<li><span class="hd">${t.board.map(P.cardToStr).join(' ')}</span>
           <span class="muted">${t.made} — gegen Top ${(H.TOP_FRAC * 100) | 0}% nur ${(t.top * 100).toFixed(0)}%
           (gegen die ganze Range ${(t.rel * 100).toFixed(0)}%)</span></li>`).join('')}</ul>`
      : `<div class="hpnone">Keine gefunden. Wenn diese Hand trifft, ist sie gegen diese Range praktisch
         immer vorne — die Gefahr liegt nicht im Getroffen-und-hinten, sondern in den
         <b>${(st.hits.find(h => h.key === 'air').pct * 100).toFixed(0)}%</b> der Flops, auf denen sie
         gar nichts trifft, und in den <b>${((1 - st.strongPlus) * 100).toFixed(0)}%</b> ohne Top Pair.</div>`;

    /* -- Push/Fold-EV -- */
    const evRows = r.shove.map(row => `<tr><th>${row.name}</th>` + row.cells.map(c =>
      `<td class="${c.ev > 0.5 ? 'evgood' : c.ev < 0 ? 'evbad' : ''}">${c.ev >= 0 ? '+' : ''}${c.ev.toFixed(2)}
        <small>fold ${(c.foldPct * 100).toFixed(0)}%</small></td>`).join('') + '</tr>').join('');

    /* -- Deine Fehler aus dem Trainer -- */
    let mineBlock;
    if (!mine) {
      mineBlock = '<div class="hpnone">Diese Hand hattest du im Trainer noch nicht.</div>';
    } else {
      const byBucket = {};
      mine.err.forEach(e => byBucket[e.bk] = (byBucket[e.bk] || 0) + 1);
      const top = Object.keys(byBucket).sort((a, b) => byBucket[b] - byBucket[a])[0];
      mineBlock = `<div class="hpstatline"><b>${mine.dec}</b> Entscheidungen · Score
          <b style="color:${relColor(mine.pts / mine.max)}">${Math.round(mine.pts / mine.max * 100)}%</b>
          ${mine.err.length ? ` · zuletzt <b>${mine.err.length}</b> Fehler` : ' · keine Fehler erfasst'}</div>` +
        (top ? `<div class="muted">Häufigste Fehlertextur: <b>${bucketName(top)}</b> (${byBucket[top]} von ${mine.err.length})</div>` : '') +
        mine.err.map(e => `<div class="mistake">
            <div class="hd">${e.b.replace(/(..)/g, '$1 ')}· ${e.s} · ${bucketName(e.bk)}</div>
            <div>Du: <b>${escapeHtml(e.p)}</b> — Baseline: <b style="color:var(--ok)">${escapeHtml(e.best)}</b></div>
          </div>`).join('');
    }

    /* -- Eigene Live-Hände -- */
    const notes = S.notes.byHand[hc] || [];
    const notesBlock = notes.length
      ? notes.map((n, i) => `<div class="hpnote">
          <div class="hd">${n.board ? escapeHtml(n.board) + ' · ' : ''}<span class="muted">${new Date(n.ts).toLocaleDateString('de-DE')}</span>
            <button class="ghost small hpdel" data-i="${i}">löschen</button></div>
          <div>${escapeHtml(n.text).replace(/\n/g, '<br>')}</div></div>`).join('')
      : '<div class="hpnone">Noch keine eigenen Hände notiert.</div>';

    $('#hpOut').innerHTML = `
      <section class="panel wide hphead">
        <div class="hptitle"><span class="hpname">${hc}</span>
          <span class="hparche" style="border-color:${ARCHE_COLOR[H.archetypeOf(hc)]}">${arche.name}</span>
          <span class="muted hpms">${st.total.toLocaleString('de-DE')} Flops exakt · ${st.sampled} Flops für die Landkarte · ${r.ms}ms</span></div>
        <div class="hpkpis">
          <div class="hpkpi"><div class="v">${(r.eqRnd * 100).toFixed(1)}%</div><div class="k">Equity vs. Zufallshand</div></div>
          <div class="hpkpi"><div class="v">${(r.eqVs * 100).toFixed(1)}%</div><div class="k">Equity vs. gewählte Range</div></div>
          <div class="hpkpi"><div class="v">${(st.strongPlus * 100).toFixed(1)}%</div><div class="k">Flops mit Top Pair+</div></div>
          <div class="hpkpi"><div class="v">${(st.hits.find(h => h.key === 'air').pct * 100).toFixed(1)}%</div><div class="k">Flops ohne alles</div></div>
        </div>
        <div class="muted hpsub">Gegner-Range: <b>${escapeHtml(r.rangeLabel)}</b> (${r.combos} Kombos)</div>
      </section>

      <div class="grid2">
        <div class="panel"><h3>Was triffst du am Flop?</h3>
          ${hits}
          <div class="hpdraws">Flushdraw <b>${(st.draws.fd * 100).toFixed(1)}%</b>
            (davon Nut <b>${(st.draws.nutfd * 100).toFixed(1)}%</b>) ·
            OESD <b>${(st.draws.oesd * 100).toFixed(1)}%</b> ·
            Gutshot <b>${(st.draws.gut * 100).toFixed(1)}%</b> ·
            Backdoor-FD <b>${(st.draws.bdfd * 100).toFixed(1)}%</b></div>
          <div class="hpnote-sm">${H.HIT_NOTE}</div></div>

        <div class="panel"><h3>Dominanz — exakt über alle 1.326 Kombos</h3>
          <div class="hprow"><span>du dominierst</span><span class="n">${(r.dom.domPct * 100).toFixed(1)}%</span>${bar(r.dom.domPct, 'var(--acc2)')}</div>
          <div class="hprow"><span>du wirst dominiert</span><span class="n">${(r.dom.domByPct * 100).toFixed(1)}%</span>${bar(r.dom.domByPct, 'var(--bad)')}</div>
          ${r.dom.isPair ? `<div class="hprow"><span>Flip gegen zwei Overcards</span><span class="n">${(r.dom.twoOverPct * 100).toFixed(1)}%</span>${bar(r.dom.twoOverPct, 'var(--warn)')}</div>` : ''}
          <div class="hpnote-sm">Dominanz heißt hier <b>strukturell</b>: gemeinsamer Rang, besserer Kicker —
            die Situation, in der der Gegner praktisch nur drei Outs hat. Das ist eine viel kleinere Zahl,
            als sie sich anfühlt, und sie sagt nichts darüber, wie weit du gegen eine <i>echte</i> Range
            vorne bist. Dafür stehen die Equity-Werte oben.</div></div>

        <div class="panel"><h3>Gefahren-Landkarte</h3>
          <div class="hprowhead c4"><span>Board-Textur</span><span class="n">Anteil</span>
            <span class="n2">ganze Range</span><span class="n3">Top ${(H.TOP_FRAC * 100) | 0}%</span></div>
          ${map}
          <div class="hpnote-sm">Anteil = wie oft dieser Flop kommt. „Ganze Range" = welchen Teil
            seiner Preflop-Range du am Showdown schlägst — diese Zahl ist fast immer hoch, weil der
            Großteil seiner Range auf jedem Flop Luft ist und sofort foldet. Die Zahl, auf die es
            ankommt, ist <b>Top ${(H.TOP_FRAC * 100) | 0}%</b>: sein stärkstes Viertel auf diesem
            Board — grob der Teil, der weiterspielt. Der Balken zeigt diese.
            Schwächste drei Texturen für ${hc}:
            <b>${worst.slice(0, 3).map(b => b.name).join(', ')}</b>.
            <br><br>Alle Zahlen sind auf <b>deine Blocker</b> konditioniert: Karten in deiner Hand
            kann er nicht haben. Deshalb steht AA auf K72 gegen sein stärkstes Viertel
            <i>schlechter</i> da als AK — der König blockt seine K7 und K2. Zwischen zwei Händen
            sind die Werte darum nur eingeschränkt vergleichbar.</div></div>

        <div class="panel"><h3>Getroffen und trotzdem hinten</h3>${trapBlock}</div>
      </div>

      <section class="panel wide"><h3>Shove-EV (Push/Fold)</h3>
        <table class="hpev"><tr><th></th>${H.SHOVE_STACKS.map(s => `<th>${s}bb</th>`).join('')}</tr>${evRows}</table>
        <div class="hpnote-sm"><b>bb relativ zum Folden.</b> Positiv = shoven ist besser als wegwerfen.
          Modell: Ante 1bb, genau ein Caller, <b>kein ICM</b>. Das ist das einzige EV in bb, das ohne
          Solver ehrlich rechenbar ist — für „EV eines Min-Raise bei 50bb" bräuchte es einen
          vollständigen Solve über den ganzen Baum, und eine erfundene Zahl wäre schlimmer als keine.
          <br><br>Die Call-Ranges sind nicht gesetzt, sondern <b>hergeleitet</b>: gecallt wird, wenn die
          Equity die Pot Odds gegen eine angenommene Shove-Range schlägt. Angenommen wird, dass der
          Shover ${H.ASSUMED_SHOVE_PCT[10].BB}% (10bb) / ${H.ASSUMED_SHOVE_PCT[15].BB}% (15bb) /
          ${H.ASSUMED_SHOVE_PCT[20].BB}% (20bb) seiner Hände shovt, aus früher Position entsprechend
          enger. Gegen einen Gegner, der deutlich enger shovt, sind die Zahlen zu optimistisch.
          <b>Nahe der Bubble</b> liegen die echten Grenzen wegen ICM enger als hier.</div>
      </section>

      <div class="grid2">
        <section class="panel"><h3>Wie du diese Hand spielst</h3>${mineBlock}</section>
        <section class="panel"><h3>Deine Live-Hände</h3>
          <div class="hpaddnote">
            <input id="hpNoteBoard" placeholder="Board / Spot, optional — z.B. BTN vs BB, Kh7d2c">
            <textarea id="hpNoteText" rows="3" placeholder="Was ist passiert, was war die Frage, was hast du gelernt?"></textarea>
            <button class="primary" id="hpNoteAdd">Hand hinzufügen</button>
            <span class="muted" id="hpNoteMsg"></span>
          </div>
          ${notesBlock}</section>
      </div>

      <section class="panel wide prose"><h3>${arche.name}</h3>
        <p><b>Was die Klasse ausmacht.</b> ${md(arche.kern)}</p>
        <p><b>Häufigster Fehler.</b> ${md(arche.fehler)}</p>
        <p><b>Wie du sie spielst.</b> ${md(arche.spiel)}</p>
        <p class="tip">Diese drei Absätze gelten für den ganzen Archetyp, nicht nur für ${hc}.
          Acht bis elf Muster lernst du — 169 Karteikarten nicht.</p>
      </section>`;

    $('#hpNoteAdd').onclick = () => addNote(hc);
    $$('#hpOut .hpdel').forEach(b => b.onclick = () => delNote(hc, +b.dataset.i));
  }

  function addNote(hc) {
    const text = $('#hpNoteText').value.trim();
    if (!text) { $('#hpNoteMsg').textContent = 'Bitte etwas eintragen.'; return; }
    const list = S.notes.byHand[hc] || (S.notes.byHand[hc] = []);
    list.unshift({ ts: Date.now(), board: $('#hpNoteBoard').value.trim().slice(0, 60), text: text.slice(0, 1200) });
    S.notes.byHand[hc] = list.slice(0, 40);
    if (!saveNotes()) { $('#hpNoteMsg').textContent = 'Speicher voll — Notiz nicht gesichert.'; return; }
    renderHpProfile(S.hp.cache[hc + '|' + S.hp.rangeKey]);
    renderHpGrid();
  }
  function delNote(hc, i) {
    const list = S.notes.byHand[hc];
    if (!list || !list[i]) return;
    list.splice(i, 1);
    if (!list.length) delete S.notes.byHand[hc];
    saveNotes();
    renderHpProfile(S.hp.cache[hc + '|' + S.hp.rangeKey]);
    renderHpGrid();
  }

  /* ============================ KOPFRECHNEN ========================= *
   * Pot Odds, MDF und Bluff-Break-even als Aufgaben mit echten
   * Chipbeträgen. Die Formeln stehen in js/mental.js.
   * ------------------------------------------------------------------ */
  function mtNew() {
    const M = P.Mental;
    const maxLvl = parseInt($('#mtLevel').value, 10) || 19;
    S.mt.q = M.makeQuestion(P.rng, { maxLevel: maxLvl });
    const q = S.mt.q;
    $('#mtType').textContent = q.name + ' · Level ' + q.lv.lvl
      + ' (' + M.fmt(q.lv.sb) + '/' + M.fmt(q.lv.bb) + ', Ante ' + M.fmt(q.lv.ante) + ')';
    $('#mtQ').innerHTML = q.text;
    $('#mtFb').hidden = true;
    $('#mtNext').hidden = true;
    const box = $('#mtOpts'); box.innerHTML = '';
    q.options.forEach(v => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.textContent = (v * 100).toFixed(0) + '%';
      b.onclick = () => mtAnswer(v, b);
      box.appendChild(b);
    });
  }

  function mtAnswer(v, btn) {
    const q = S.mt.q, M = P.Mental;
    if ($('#mtFb').hidden === false) return;                  // schon beantwortet
    const correct = Math.abs(v - q.answer) < 0.005;
    S.mt.total++; if (correct) { S.mt.right++; S.mt.streak++; } else S.mt.streak = 0;
    S.mt.best = Math.max(S.mt.best || 0, S.mt.streak);
    $$('#mtOpts .opt').forEach(b => {
      const val = parseFloat(b.textContent) / 100;
      if (Math.abs(val - q.answer) < 0.005) b.classList.add('good');
      else if (b === btn) b.classList.add('bad');
      b.disabled = true;
    });
    const fb = $('#mtFb');
    fb.className = 'mtfb ' + (correct ? 'ok' : 'bad');
    fb.innerHTML = `<b>${correct ? 'Richtig' : 'Daneben'} — ${(q.answer * 100).toFixed(1)}%</b><br>${q.explain}`;
    fb.hidden = false;
    $('#mtNext').hidden = false;
    mtScore();
    try { localStorage.setItem('pt_mental', JSON.stringify(S.mt)); } catch (e) { }
  }

  function mtScore() {
    $('#mtRight').textContent = S.mt.right;
    $('#mtTotal').textContent = S.mt.total;
    $('#mtPct').textContent = S.mt.total ? Math.round(S.mt.right / S.mt.total * 100) + '%' : '—';
    $('#mtStreak').textContent = S.mt.streak > 2 ? ` · ${S.mt.streak} in Folge` : (S.mt.best > 2 ? ` · Bestserie ${S.mt.best}` : '');
  }

  function renderSizings() {
    const M = P.Mental;
    const day = parseInt($('#szDay').value, 10) || 1;
    const cell = x => `${M.fmt(x.chips)}<small>${(x.real * 100).toFixed(0)}%</small>`;
    const rows = M.sizingTable(day).map(r => `<tr>
      <td>${r.lvl}</td><td>${M.fmt(r.sb)}/${M.fmt(r.bb)}</td>
      <td>${M.fmt(r.unit)}</td>
      <td>${M.fmt(r.open)}<small>${r.openBB.toFixed(1)}bb</small></td>
      <td>${M.fmt(r.threeBet)}<small>${r.threeBetBB.toFixed(1)}bb</small></td>
      <td>${M.fmt(r.potSRP)}</td>
      <td>${cell(r.s33)}</td><td>${cell(r.s55)}</td><td>${cell(r.s80)}</td></tr>`).join('');
    $('#szOut').innerHTML = `<table class="sizing struct szt">
      <tr><th>Lvl</th><th>Blinds</th><th>kleinster<br>Jeton</th><th>Open</th><th>3-Bet</th>
        <th>Pot am<br>Flop</th><th>33 %</th><th>55 %</th><th>80 %</th></tr>${rows}</table>
      <div class="hpnote-sm">Alles auf Beträge gerundet, die du auch <b>hinlegen</b> kannst.
        Der kleinste Jeton ist die größte Stückelung, mit der sich beide Blinds genau legen lassen
        und die höchstens ein Achtel des Big Blinds beträgt — kleinere sind zu dem Zeitpunkt
        ausgetauscht.
        <br><br>Open und 3-Bet wählst du frei, die werden deshalb <b>glatt</b> gelegt (700, 900,
        1.100 — nicht 875). Die C-Bets sind ein Bruchteil des Pots und werden aufs Chipraster
        gerundet; die kleine Zahl darunter ist der Prozentsatz, der dabei <b>wirklich</b>
        herauskommt. Die Abweichung vom Ziel bleibt überall unter einem Punkt.
        <br><br>Der Pot am Flop unterstellt dein Open plus einen Caller, dazu SB und Ante.
        Lohnt sich, die 33-%-Spalte des aktuellen Levels im Kopf zu haben — dann musst du am
        Tisch nicht rechnen, sondern nur abzählen.</div>`;
  }

  /* ====================== SHOVE-CALL-TRAINER ======================== *
   * Der Range-Designer oben beantwortet die Frage als Tabelle. Hier wird
   * sie abgefragt, weil man am Tisch nicht nachschlägt. Die Antwort kommt
   * aus derselben Rechnung (icm.js, defend.range) — es gibt hier keine
   * zweite, handgeschriebene Range.
   *
   * Zwei Dinge kosten Zeit und sind deshalb so gelöst:
   *   1. Eine ICM-Rechnung dauert je nach Feldgröße 0,2-3s. Sie hängt aber
   *      NICHT von deiner Hand ab — pro Konfiguration wird sie einmal
   *      gerechnet und gecacht, danach ist jede weitere Frage sofort da.
   *   2. Die Shove-Größe wird nur aus drei Werten gezogen, damit der Cache
   *      greift, statt bei jeder Frage neu zu rechnen.
   * ------------------------------------------------------------------ */
  const SC_SIMS = 12000;      // Schwelle schwankt dadurch um rund 1 Punkt

  function scShoveSizes(cfg) {
    const raw = [Math.max(2, cfg.shortBB - 4), cfg.shortBB, cfg.shortBB + 4];
    const uniq = [];
    for (const v of raw) {
      const x = Math.round(Math.min(v, cfg.heroBB) * 2) / 2;
      if (x >= 1.5 && !uniq.includes(x)) uniq.push(x);
    }
    return uniq.length ? uniq : [Math.min(cfg.shortBB, cfg.heroBB)];
  }

  /** Eine Handklasse ziehen — gewichtet nach Kombos, sonst kämen Paare viel zu oft. */
  function scPickHand() {
    const hands = P.HandProfile.allHandClasses();
    const w = h => h.length === 2 ? 6 : h[2] === 's' ? 4 : 12;
    let r = P.rng() * hands.reduce((a, h) => a + w(h), 0);
    for (const h of hands) { r -= w(h); if (r <= 0) return h; }
    return hands[0];
  }

  /** Konkrete Karten zu einer Handklasse, nur für die Anzeige. */
  function scCardsOf(hc) {
    const ri = c => P.RANKS.indexOf(c);
    const a = ri(hc[0]), b = ri(hc[1]);
    if (hc.length === 2) return [(a << 2) | 0, (b << 2) | 1];
    return hc[2] === 's' ? [(a << 2) | 2, (b << 2) | 2] : [(a << 2) | 2, (b << 2) | 3];
  }

  function scSolve(cfg) {
    const key = JSON.stringify(cfg);
    if (S.sc.cache[key]) return S.sc.cache[key];
    const r = P.ICM.pushFoldICM(Object.assign({}, cfg, { sims: SC_SIMS }));
    // Seine Shove-Range als Index-Liste, damit sich die Equity DEINER Hand
    // gegen genau die Range ausrechnen lässt, gegen die auch gecallt wird.
    const IDX = P.ICM.classIndex();
    r.shoveIdx = (r.defend.shoverPct != null ? P.ICM.topPct(r.defend.shoverPct) : r.push.range)
      .map(h => IDX[h]).filter(i => i !== undefined);
    S.sc.cache[key] = r;
    return r;
  }

  function scNewQuestion() {
    if (S.sc.busy) return;
    const base = rdReadCfg();
    const f = P.ICM.fieldModel(base);
    if (!f.valid) {
      $('#scOut').innerHTML = '<div class="hpnote-sm">Das Feld oben geht nicht auf — erst die Eingaben ' +
        'korrigieren, sonst wäre auch die Antwort hier Unsinn.</div>';
      return;
    }
    const sizes = scShoveSizes(base);
    const cfg = Object.assign({}, base, { shortBB: sizes[(P.rng() * sizes.length) | 0] });
    const hand = scPickHand();
    const cached = !!S.sc.cache[JSON.stringify(cfg)];
    if (!cached) $('#scOut').innerHTML = '<div class="panel wide hpbusy">Rechnet ICM für dieses Feld …</div>';
    // Solange gerechnet wird, ist der Knopf tot — sonst klickt man ins Leere
    // und wundert sich, dass die alte Frage stehen bleibt.
    S.sc.busy = true;
    $('#scNew').disabled = true;
    setTimeout(() => {
      const r = scSolve(cfg);
      S.sc.busy = false;
      $('#scNew').disabled = false;
      S.sc.q = { cfg, hand, r, cards: scCardsOf(hand) };
      scRenderQuestion();
    }, cached ? 0 : 25);
  }

  function scRenderQuestion() {
    const q = S.sc.q, c = q.cfg;
    $('#scOut').innerHTML = `
      <div class="scask">Noch <b>${c.left}</b> Spieler, <b>${c.bubble}</b> bis zur Bubble.
        Du hast <b>${c.heroBB}bb</b>. Ein Shorty mit <b>${q.cfg.shortBB}bb</b> shovt vor dir.
        Du hältst ${miniCards(q.cards)} <b>${q.hand}</b>.</div>
      <div class="opts" id="scOpts"></div>`;
    const wrap = $('#scOpts');
    [['CALL', 'Call'], ['FOLD', 'Fold']].forEach(([k, lbl]) => {
      const b = document.createElement('button');
      b.className = 'opt'; b.textContent = lbl;
      b.onclick = () => scAnswer(k);
      wrap.appendChild(b);
    });
    scRenderScore();
  }

  function scRenderScore() {
    const st = S.stats.shove;
    $('#scScore').textContent = st && st.total
      ? `${st.right} von ${st.total} richtig` : '';
  }

  function scAnswer(key) {
    const q = S.sc.q; if (!q) return;
    const r = q.r, IDX = P.ICM.classIndex();
    const i = IDX[q.hand];
    const eq = P.ICM.eqVsSet(i, r.shoveIdx);
    const need = r.defend.need, po = r.defend.potOdds;
    const isCall = r.defend.range.includes(q.hand);
    const chipCall = r.defend.chipRange.includes(q.hand);
    /* Grenzfall: liegt die Equity dicht an der Schwelle, ist die Frage keine
       Wissensfrage mehr — dann zählt beides. Die Schwelle selbst ist
       simuliert und auf rund einen Punkt genau. */
    const knapp = Math.abs(eq - need) <= 0.015;
    const right = knapp || (key === 'CALL') === isCall;
    const st = S.stats.shove || (S.stats.shove = { right: 0, total: 0 });
    st.total++; if (right) st.right++;
    save();

    const lehre = chipCall && !isCall
      ? `<div class="hpnote-sm">Genau der Fehler, um den es geht: <b>in Chips wäre das ein Call</b>
          (Pot Odds ${(po * 100).toFixed(1)}%), <b>in Geld nicht</b> (ICM ${(need * 100).toFixed(1)}%).
          Solche Hände kosten an der Bubble am meisten, weil sie sich richtig anfühlen.</div>`
      : isCall
        ? '<div class="hpnote-sm">Diese Hand hält auch dem ICM-Aufschlag stand — hier ist Folden der Fehler.</div>'
        : `<div class="hpnote-sm">Auch ohne ICM wäre das kein Call: ${(eq * 100).toFixed(1)}% reichen
            nicht einmal für die reinen Pot Odds von ${(po * 100).toFixed(1)}%.</div>`;

    const grid = P.HandProfile.allHandClasses().map(hc => {
      const d = r.defend.range.includes(hc), ch = r.defend.chipRange.includes(hc);
      const cl = d ? 'rdp' : ch ? 'rdc' : 'rdf';
      return `<button class="hpcell ${cl}${hc === q.hand ? ' scme' : ''}" title="${hc}">${hc}</button>`;
    }).join('');

    $('#scOut').innerHTML = `
      <div class="verdict ${right ? (knapp ? 'ok2' : 'ok') : 'bad'}">
        ${right ? (knapp ? 'Grenzfall — beides vertretbar' : 'Richtig') : 'Falsch'} —
        mit ${miniCards(q.cards)} <b>${q.hand}</b> gegen ${q.cfg.shortBB}bb: <b>${isCall ? 'Call' : 'Fold'}</b>
        <small>Du: ${key === 'CALL' ? 'Call' : 'Fold'} · ${(S.stats.shove.right)} von ${S.stats.shove.total} richtig</small>
      </div>
      <div class="scnums">
        <div><b>${(eq * 100).toFixed(1)}%</b><span>deine Equity gegen seine Shove-Range (${(r.defend.shoverPct != null ? r.defend.shoverPct : r.push.pct).toFixed(0)}% der Hände)</span></div>
        <div><b>${(need * 100).toFixed(1)}%</b><span>nötig mit ICM</span></div>
        <div><b>${(po * 100).toFixed(1)}%</b><span>nötig nach reinen Pot Odds</span></div>
        <div><b>${r.metrics.bubbleFactor.toFixed(2)}</b><span>Bubble-Faktor</span></div>
      </div>
      ${lehre}
      <div class="hpgridwrap" style="margin-top:.6rem"><div class="hpgrid">${grid}</div></div>
      <div class="hplegend">
        <span><i style="background:var(--acc2)"></i>callen (${r.defend.pct.toFixed(1)}%)</span>
        <span><i style="background:var(--warn)"></i>nur ohne ICM ein Call</span>
        <span><i style="background:#1b2621"></i>folden</span>
      </div>
      <div class="hpnote-sm">${r.defend.shoverPct != null
        ? 'Seine Shove-Range kommt aus derselben ICM-Rechnung mit ihm als Held.'
        : 'Er deckt dich — als seine Shove-Range wird die eines gleich großen Stacks angesetzt.'}
        Gerechnet mit ${SC_SIMS.toLocaleString('de-DE')} ICM-Simulationen; die Schwelle schwankt dadurch um
        etwa einen Prozentpunkt. Nicht enthalten: Spieler hinter dir, die auch noch callen können — die
        machen den echten Call nochmal enger.</div>
      <div class="planactions" style="margin-top:.6rem"><button class="primary" id="scNext">Nächste Frage ▸</button></div>`;
    $('#scNext').onclick = scNewQuestion;
    scRenderScore();
  }

  /* ============================ RIVER-FILTER ======================== *
   * Ein Paar, zweimal gecallt, er checkt zum dritten Mal. Die Rechnung
   * steht in js/riverdrill.js; hier nur Frage, Antwort und Darstellung.
   * Bewertet wird gegen EV, nicht gegen die Heuristik — warum, steht im
   * Kopf der Moduldatei.
   * ------------------------------------------------------------------ */
  const RF_TOLERANZ = 0.3;      // bb, innerhalb derer zwei Optionen gleich gut sind

  function rfBand() {
    /* Der Leak sitzt im tiefen Spiel — bei 25bb gibt es am River nichts
       mehr zu entscheiden. Deshalb nur die beiden großen Bänder, und die
       aus der Einstellung, falls dort eines angehakt ist. */
    const erlaubt = (S.cfg.stacks || []).filter(b => b === 'mid' || b === 'deep');
    const pool = erlaubt.length ? erlaubt : ['deep'];
    return pool[(P.rng() * pool.length) | 0];
  }

  function rfNew() {
    let q = null;
    for (let i = 0; i < 8 && !q; i++) q = P.RiverDrill.make(rfBand());
    if (!q) { $('#rfOut').innerHTML = '<div class="hpnote-sm">Kein passendes Szenario gefunden — nochmal klicken.</div>'; return; }
    S.rf = { q, ev: P.RiverDrill.evs(q), picked: null, raise: null };
    rfRenderQuestion();
  }

  function rfRenderQuestion() {
    const q = S.rf.q, st = P.STACKS[q.band];
    $('#rfOut').innerHTML =
      '<div class="rfask"><b>' + q.spot.heroPos + ' gegen ' + q.spot.villPos + '</b>, Stacks ' + st.bb +
        'bb — du bist der Aggressor und in Position.<br>Board ' + miniCards(q.board) +
        ' · deine Hand ' + miniCards(q.hero) + ' <b>' + q.cls.made + '</b><br>Pot <b>' +
        q.pot.toFixed(1) + 'bb</b>, hinter dir liegen noch <b>' + q.eff.toFixed(1) + 'bb</b>.</div>' +
      '<div class="rflog">' + q.log.map(l => '<div>' + escapeHtml(l) + '</div>').join('') + '</div>' +
      '<div class="opts" id="rfOpts"></div>';
    const wrap = $('#rfOpts');
    /* In fester Reihenfolge, NICHT nach EV: sortiert stünde die Antwort
       schon in der Reihenfolge der Knöpfe. */
    const reihenfolge = P.RiverDrill.BET_OPTIONS.map(o => o.key);
    const knoepfe = S.rf.ev.list.slice().sort((a, b) => reihenfolge.indexOf(a.key) - reihenfolge.indexOf(b.key));
    for (const o of knoepfe) {
      const b = document.createElement('button');
      b.className = 'opt';
      b.innerHTML = o.bet ? o.label + '<span class="amt">' + o.bet.toFixed(1) + 'bb</span>' : o.label;
      b.onclick = () => rfAnswer(o.key);
      wrap.appendChild(b);
    }
    rfScore();
  }

  function rfScore() {
    const st = S.stats.river;
    $('#rfScore').textContent = st && st.total ? st.right + ' von ' + st.total + ' richtig' : '';
  }

  /** Die EV-Tabelle — gleiche Darstellung nach Frage 1 und nach Frage 2. */
  function rfEvTable() {
    const ev = S.rf.ev, picked = S.rf.picked;
    return '<table class="rfev"><tr><th>Aktion</th><th>Einsatz</th><th>EV</th><th>wer dich bezahlt</th></tr>' +
      ev.list.map(o =>
        '<tr class="' + (o.key === ev.best.key ? 'best' : '') + (o.key === picked ? ' picked' : '') + '">' +
        '<td>' + o.label + (o.key === picked ? ' <small>(du)</small>' : '') + '</td>' +
        '<td class="num">' + (o.bet ? o.bet.toFixed(1) + 'bb' : '—') + '</td>' +
        '<td class="num">' + o.ev.toFixed(2) + 'bb</td>' +
        '<td class="num">' + (o.bet ? (o.anteilBesserUnterZahlern * 100).toFixed(0) + '% schlagen dich' : 'Showdown') + '</td></tr>'
      ).join('') + '</table>';
  }

  function rfSplitPanel() {
    const sp = S.rf.ev.split, q = S.rf.q;
    const top = sp.schlaegtDich.slice(0, 6).map(x => x[0] + '×' + x[1]).join(', ');
    return '<div class="rfsplit">' +
      '<div><b>' + (sp.anteilHinten * 100).toFixed(0) + '%</b><span>seiner verbliebenen Range schlägt dich (' + sp.komboHinten + ' Kombos)</span></div>' +
      '<div><b>' + (sp.anteilVorne * 100).toFixed(0) + '%</b><span>schlägst du — genau das gewinnt der Check am Showdown</span></div>' +
      '<div><b>' + q.villRange.length + '</b><span>Kombos hat er nach zwei Calls noch</span></div></div>' +
      (top ? '<div class="hpnote-sm">Was dich schlägt: ' + escapeHtml(top) + '.</div>' : '');
  }

  function rfZeigeHand() {
    const q = S.rf.q;
    return miniCards(q.vill) + ' <b>' + P.classify(q.vill, q.board).made + '</b>';
  }
  function rfHeroVorne() {
    const q = S.rf.q;
    return P.evaluate(q.hero.concat(q.board)) > P.evaluate(q.vill.concat(q.board));
  }

  function rfAnswer(key) {
    const q = S.rf.q, ev = S.rf.ev;
    S.rf.picked = key;
    const gewaehlt = ev.list.find(o => o.key === key);
    const right = (ev.best.ev - gewaehlt.ev) <= RF_TOLERANZ;
    const knapp = right && key !== ev.best.key;
    const st = S.stats.river || (S.stats.river = { right: 0, total: 0 });
    st.total++; if (right) st.right++;
    save();

    let out =
      '<div class="verdict ' + (right ? (knapp ? 'ok2' : 'ok') : 'bad') + '">' +
        (right ? (knapp ? 'Vertretbar — der Unterschied ist kleiner als 0,3bb' : 'Richtig') : 'Das kostet') +
        ' — bestes Ergebnis: <b>' + ev.best.label + '</b> mit ' + ev.best.ev.toFixed(2) + 'bb' +
        '<small>Du: ' + gewaehlt.label + ' (' + gewaehlt.ev.toFixed(2) + 'bb) · ' +
        st.right + ' von ' + st.total + ' richtig</small></div>' +
      rfEvTable() + rfSplitPanel();

    const weiter = '<div class="planactions" style="margin-top:.6rem"><button class="primary" id="rfNext">Nächste Hand ▸</button></div>';

    if (!gewaehlt.bet) {
      out += '<div class="hpnote-sm">Check heißt Showdown: du gewinnst den Pot von ' + q.pot.toFixed(1) +
        'bb in ' + (ev.split.anteilVorne * 100).toFixed(0) + '% der Fälle. Er hatte ' + rfZeigeHand() + ' — ' +
        (rfHeroVorne() ? 'du hättest den Showdown gewonnen.' : 'er hätte den Showdown gewonnen.') + '</div>' + weiter;
      $('#rfOut').innerHTML = out;
      $('#rfNext').onclick = rfNew;
      rfScore();
      return;
    }

    /* Du hast gebettet — seine Antwort kommt aus seiner ECHTEN Hand, damit
       der Showdown später zur Geschichte passt. */
    const antwort = P.RiverDrill.villainReply(q, gewaehlt.bet);
    if (antwort !== 'RAISE') {
      out += '<div class="hpnote-sm">Er ' + (antwort === 'CALL' ? 'callt' : 'foldet') + '. Er hatte ' + rfZeigeHand() +
        (antwort === 'CALL'
          ? (rfHeroVorne() ? ' — ' + gewaehlt.bet.toFixed(1) + 'bb extra kassiert.'
                           : ' — die Bet hat dich ' + gewaehlt.bet.toFixed(1) + 'bb gekostet.')
          : '.') + '</div>' + weiter;
      $('#rfOut').innerHTML = out;
      $('#rfNext').onclick = rfNew;
      rfScore();
      return;
    }

    const mult = P.RiverDrill.RAISE_MULT[(P.rng() * P.RiverDrill.RAISE_MULT.length) | 0];
    const rs = P.RiverDrill.raiseSpot(q, gewaehlt.bet, mult);
    S.rf.raise = { rs: rs, bet: gewaehlt.bet };
    out += '<div class="rfask" style="margin-top:.8rem">Er <b>check-raist auf ' + rs.raiseTo.toFixed(1) +
      'bb</b>. Du musst <b>' + rs.toCall.toFixed(1) + 'bb</b> in einen Pot von ' + rs.potNow.toFixed(1) +
      'bb callen.</div><div class="opts" id="rfOpts2"></div>';
    $('#rfOut').innerHTML = out;
    [['CALL', 'Call'], ['FOLD', 'Fold']].forEach(pair => {
      const b = document.createElement('button');
      b.className = 'opt'; b.textContent = pair[1];
      b.onclick = () => rfRaiseAnswer(pair[0]);
      $('#rfOpts2').appendChild(b);
    });
    rfScore();
  }

  function rfRaiseAnswer(key) {
    const rs = S.rf.raise.rs;
    const right = (key === 'CALL') === rs.lohnt;
    const st = S.stats.river || (S.stats.river = { right: 0, total: 0 });
    st.total++; if (right) st.right++;
    save();

    $('#rfOut').innerHTML =
      '<div class="verdict ' + (right ? 'ok' : 'bad') + '">' + (right ? 'Richtig' : 'Das kostet') +
        ' — nach dem Modell ist <b>' + (rs.lohnt ? 'Call' : 'Fold') + '</b> die bessere Antwort' +
        '<small>Du: ' + (key === 'CALL' ? 'Call' : 'Fold') + ' · ' + st.right + ' von ' + st.total + ' richtig</small></div>' +
      '<div class="rfsplit">' +
        '<div><b>' + (rs.breakeven * 100).toFixed(0) + '%</b><span>Bluffs braucht seine Raise-Range, damit dein Call bei null liegt</span></div>' +
        '<div><b>' + (rs.bluffAnteil * 100).toFixed(0) + '%</b><span>hat sie im Modell (' + rs.nBluff + ' Bluff- gegen ' + rs.nValue + ' Value-Kombos)</span></div>' +
        '<div><b>' + (rs.evCall >= 0 ? '+' : '') + rs.evCall.toFixed(1) + 'bb</b><span>EV des Calls unter dieser Annahme</span></div></div>' +
      '<div class="hpnote-sm">Er hatte ' + rfZeigeHand() + ' — dein Call hätte hier <b>' +
        (rfHeroVorne() ? 'gewonnen' : 'verloren') + '</b>. Das ist aber nur diese eine Hand: entschieden wird ' +
        'die Frage vom <b>Bluff-Anteil</b>, nicht vom Ausgang. Deshalb steht die Breakeven-Zahl links — sie ist ' +
        'die, die am Tisch in den Kopf gehört. Wie viele Bluffs jemand wirklich hat, sagt dir keine Rechnung, ' +
        'sondern der Gegner.</div>' +
      rfEvTable() +
      '<div class="planactions" style="margin-top:.6rem"><button class="primary" id="rfNext">Nächste Hand ▸</button></div>';
    $('#rfNext').onclick = rfNew;
    rfScore();
  }

  /* ============================ RANGE-DESIGNER ====================== *
   * Push/Fold mit ICM. Die Rechnung steht in js/icm.js, hier nur Eingabe
   * und Darstellung.
   * ------------------------------------------------------------------ */
  function rdReadCfg() {
    const num = (id, d) => { const v = parseFloat($(id).value); return isFinite(v) ? v : d; };
    const left = Math.max(3, Math.round(num('#rdLeft', 100)));
    const bubble = Math.max(0, Math.round(num('#rdBubble', 3)));
    return {
      left, paid: Math.max(1, left - bubble), bubble,
      heroBB: num('#rdHero', 5), avgBB: num('#rdAvg', 25),
      shortCount: Math.max(0, Math.round(num('#rdShorts', 10))),
      shortBB: num('#rdShortBB', 8),
      behind: Math.max(1, Math.round(num('#rdBehind', 4)))
    };
  }

  function runRangeDesigner() {
    const cfg = rdReadCfg();
    const key = JSON.stringify(cfg);
    if (S.rd.cache[key]) return renderRange(S.rd.cache[key], cfg);
    // Plausibilität prüfen, bevor gerechnet wird — ein negativer Reststack
    // ergibt sonst stillschweigend Unsinn.
    const f = P.ICM.fieldModel(cfg);
    if (!f.valid) {
      $('#rdOut').innerHTML = `<section class="panel wide"><h3>Das Feld geht nicht auf</h3>
        <p>Bei ${cfg.left} Spielern mit im Schnitt ${cfg.avgBB}bb sind ${(cfg.avgBB * cfg.left).toFixed(0)}bb im Spiel.
        Dein Stack und ${cfg.shortCount} Shorties à ${cfg.shortBB}bb lassen für die übrigen
        ${(f.restBB).toFixed(1)}bb — das ist weniger als ein Shorty hat und damit kein sinnvolles Feld.
        Erhöhe den Durchschnittsstack oder verringere die Zahl der Shorties.</p></section>`;
      return;
    }
    $('#rdOut').innerHTML = `<section class="panel wide hpbusy">Rechnet ICM für ${cfg.left} Spieler …</section>`;
    setTimeout(() => {
      const t0 = performance.now();
      const r = P.ICM.pushFoldICM(cfg);
      r.ms = Math.round(performance.now() - t0);
      S.rd.cache[key] = r;
      renderRange(r, cfg);
    }, 25);
  }

  function renderRange(r, cfg) {
    const H = P.HandProfile, I = P.ICM;
    const push = new Set(r.push.range), chip = new Set(r.pushChipEV.range);
    const grid = H.allHandClasses().map(hc => {
      const inP = push.has(hc), inC = chip.has(hc);
      // Grün = shoven, Gelb = nur ohne ICM shoven (also: Finger weg), Grau = folden
      const cls = inP ? 'rdp' : inC ? 'rdc' : 'rdf';
      return `<button class="hpcell ${cls}" title="${hc} — ${inP ? 'shoven' : inC ? 'nur ohne ICM ein Shove — hier folden' : 'folden'}">${hc}</button>`;
    }).join('');

    const bf = r.metrics.bubbleFactor;
    const bfText = bf < 1.15 ? 'Chips sind hier praktisch linear — spiel normal.'
      : bf < 1.5 ? 'Spürbarer ICM-Druck. Marginale Spots weglassen.'
        : bf < 2.2 ? 'Starker ICM-Druck. Nur noch klare Spots.'
          : 'Extremer ICM-Druck. Fast alles außer Premium ist ein Fehler.';

    $('#rdOut').innerHTML = `
      <section class="panel wide hphead">
        <div class="hptitle"><span class="hpname">${cfg.heroBB}bb</span>
          <span class="hparche" style="border-color:var(--acc)">${cfg.left} übrig · noch ${cfg.bubble} bis zur Bubble</span>
          <span class="muted hpms">${r.ms}ms</span></div>
        <div class="hpkpis">
          <div class="hpkpi"><div class="v">${(r.metrics.eqNow / r.minCash).toFixed(2)}×</div><div class="k">Min-Cashes, die du gerade wert bist</div></div>
          <div class="hpkpi"><div class="v">${bf.toFixed(2)}</div><div class="k">Bubble-Faktor</div></div>
          <div class="hpkpi"><div class="v">${(r.metrics.needFlip * 100).toFixed(0)}%</div><div class="k">nötig für einen Flip (statt 50%)</div></div>
          <div class="hpkpi"><div class="v">${r.push.pct.toFixed(0)}%</div><div class="k">deine Shove-Range</div></div>
        </div>
        <div class="muted hpsub">${bfText}${r.isShortest
        ? ' <b>Du bist der kürzeste Stack am Tisch</b> — es gibt niemanden, auf dessen Bustout du warten könntest. Warten hilft nur, wenn jemand vor dir ausscheidet.'
        : ' Es gibt kürzere Stacks als dich. Deren Bustout ist bares Geld für dich, also brauchst du für eigene Risiken deutlich mehr.'}</div>
      </section>

      <section class="panel wide">
        <h3>Was du shoven kannst</h3>
        <div class="hpgridwrap"><div class="hpgrid">${grid}</div></div>
        <div class="hplegend">
          <span><i style="background:var(--acc2)"></i>shoven (${r.push.pct.toFixed(1)}%)</span>
          <span><i style="background:var(--warn)"></i>nur ohne ICM ein Shove — hier folden</span>
          <span><i style="background:#1b2621"></i>folden</span>
        </div>
        <div class="hpnote-sm">Ohne ICM wären <b>${r.pushChipEV.pct.toFixed(1)}%</b> profitabel, mit ICM nur
          <b>${r.push.pct.toFixed(1)}%</b>. Die gelben Felder sind genau die Hände, die in Chips gewinnen
          und in Geld verlieren — <b>${r.dropped.length} Handklassen</b>. Der Vergleich hält die Call-Range
          des Gegners konstant, zeigt also: was ändert sich, wenn <i>du</i> ICM ignorierst.</div>
      </section>

      <section class="panel wide">
        <h3>Die andere Seite: wenn DU callen musst</h3>
        <div class="hpgridwrap"><div class="hpgrid">${P.HandProfile.allHandClasses().map(hc => {
        const d = new Set(r.defend.range), c = new Set(r.defend.chipRange);
        const cl = d.has(hc) ? 'rdp' : c.has(hc) ? 'rdc' : 'rdf';
        return `<button class="hpcell ${cl}" title="${hc}">${hc}</button>`;
      }).join('')}</div></div>
        <div class="hplegend">
          <span><i style="background:var(--acc2)"></i>callen (${r.defend.pct.toFixed(1)}%)</span>
          <span><i style="background:var(--warn)"></i>nur ohne ICM ein Call</span>
          <span><i style="background:#1b2621"></i>folden</span>
        </div>
        <div class="hpnote-sm">Gegen einen All-in von <b>${r.defend.vsStack.toFixed(1)}bb</b> brauchst du
          <b>${(r.defend.need * 100).toFixed(1)}%</b> Equity statt der reinen
          <b>${(r.defend.potOdds * 100).toFixed(1)}%</b> Pot Odds.
          ${r.defend.shoverPct != null ? `Gerechnet wird gegen seine Shove-Range von
            <b>${r.defend.shoverPct.toFixed(0)}%</b> — die entsteht aus derselben ICM-Rechnung
            mit <i>seinem</i> Stack. Je kürzer er ist, desto weiter shovt er und desto weiter
            darfst du callen.` : ''}
          <br><br><b>Das ist der eigentliche ICM-Effekt an der Bubble</b> — und er wirkt genau
          andersherum als beim Shoven. Beim Shoven hilft dir der Druck der anderen: sie müssen folden,
          deine Fold-Equity steigt. Beim Callen gibt es keine Fold-Equity, der ganze Druck wirkt gegen
          dich. Deshalb shovst du hier <b>${r.push.pct.toFixed(0)}%</b>, callst aber nur
          <b>${r.defend.pct.toFixed(0)}%</b>. Wer die beiden verwechselt, spielt die Bubble falsch.</div>
      </section>

      <div class="grid2">
        <section class="panel"><h3>Warum so eng</h3>
          <div class="hprow"><span>Geld-Equity jetzt</span><span class="n">${(r.metrics.eqNow * 100).toFixed(3)}%</span></div>
          <div class="hprow"><span>… wenn du verdoppelst</span><span class="n">${(r.metrics.eqDouble * 100).toFixed(3)}%</span></div>
          <div class="hprow"><span>… wenn du raus bist</span><span class="n">${(r.metrics.eqBust * 100).toFixed(3)}%</span></div>
          <div class="hpnote-sm">Du gibst beim Verlieren <b>${((r.metrics.eqNow - r.metrics.eqBust) * 100).toFixed(3)}</b> Punkte ab,
            gewinnst beim Verdoppeln aber nur <b>${((r.metrics.eqDouble - r.metrics.eqNow) * 100).toFixed(3)}</b> dazu.
            Das Verhältnis ist der Bubble-Faktor <b>${bf.toFixed(2)}</b>. Ein 50/50 reicht deshalb nicht mehr —
            du brauchst <b>${(r.metrics.needFlip * 100).toFixed(1)}%</b>.</div></section>

        <section class="panel"><h3>Der Gegner hinter dir</h3>
          <div class="hprow"><span>sein Stack</span><span class="n">${r.caller.stack.toFixed(1)}bb</span></div>
          <div class="hprow"><span>reine Pot Odds</span><span class="n">${(r.caller.potOdds * 100).toFixed(1)}%</span></div>
          <div class="hprow"><span>mit ICM braucht er</span><span class="n">${(r.caller.need * 100).toFixed(1)}%</span></div>
          <div class="hprow"><span>callt damit</span><span class="n">${r.caller.pct.toFixed(1)}%</span></div>
          <div class="hprow"><span>irgendwer von ${r.behind} callt</span><span class="n">${(r.pAnyCall * 100).toFixed(1)}%</span></div>
          <div class="hpnote-sm">Auch er verliert Geld-Equity, wenn er Chips abgibt — deshalb callt er enger,
            als die Pot Odds erlauben würden. <b>Das ist deine Fold-Equity.</b> Je mehr Spieler hinter dir
            sitzen, desto wahrscheinlicher wacht trotzdem einer auf: mit ${r.behind} Gegnern
            ${(r.pAnyCall * 100).toFixed(0)}%.</div></section>
      </div>

      <section class="panel wide"><h3>Modell — was hier drinsteckt und was nicht</h3>
        <div class="hpnote-sm">
          <b>Gerechnet:</b> Malmuth-Harville über alle ${cfg.left} Spieler, per Monte Carlo geschätzt.
          Auszahlungskurve als Potenzgesetz — bei ${cfg.paid} bezahlten Plätzen ergibt das
          Sieger <b>${(r.firstPrize * 100).toFixed(1)}%</b> des Pools und Min-Cash
          <b>${(r.minCash * 100).toFixed(3)}%</b>. Die Call-Range des Gegners ist nicht gesetzt, sondern
          aus seiner eigenen ICM-Rechnung hergeleitet; beide Ranges werden gegeneinander bis zum
          Stillstand iteriert.
          <br><br>
          <b>Nicht gerechnet:</b> Kein Skill, keine Reads, keine Blindstruktur. Vor allem:
          <b>Folden kostet hier nichts.</b> In Wirklichkeit fressen dich die Blinds auf — bei
          ${cfg.heroBB}bb bist du in einer Umlaufbahn deutlich kürzer. Dadurch ist die echte
          Shove-Range <i>weiter</i> als die hier gezeigte. Nimm die grünen Felder als Untergrenze,
          nicht als Obergrenze. Und: das Modell nimmt an, dass du nicht selbst in den Blinds sitzt.
        </div></section>`;
  }

  /* ============================ TRAININGSPLAN ======================= *
   * 35 Tage à 30 Minuten bis zum King's Million. Die Logik und die
   * Begründung stehen in js/plan.js — hier nur Darstellung und der
   * Ein-Klick-Start, der das Wochen-Setup in die Einstellungen schreibt.
   * ------------------------------------------------------------------ */
  function planDone() { return S.plan.done || (S.plan.done = {}); }
  function savePlan() { try { localStorage.setItem('pt_plan', JSON.stringify(S.plan)); } catch (e) { } }

  /** Längste ununterbrochene Serie erledigter Tage, die heute oder gestern endet. */
  function planStreak() {
    const PL = P.Plan, done = planDone();
    let n = 0;
    for (let i = PL.DAYS - 1; i >= 0; i--) {
      const iso = PL.dateOf(i);
      if (PL.toUTC(iso) > PL.todayUTC()) continue;      // Zukunft überspringen
      if (done[iso]) n++; else break;
    }
    return n;
  }

  function startPlanSession(sess) {
    Object.assign(S.cfg, sess.week.cfg);
    try { localStorage.setItem('pt_cfg', JSON.stringify(S.cfg)); } catch (e) { }
    cfgToUI();
    switchView('trainer');
    newHand();
  }

  function renderPlan() {
    const PL = P.Plan, md_ = md;
    const idx = PL.dayIndex();
    const until = PL.daysUntilTarget();
    const done = planDone();
    const worst = PL.worstHandsFrom(S.stats.byHand);
    const total = Object.keys(done).filter(k => done[k]).length;

    /* --- Kopf: Countdown --- */
    const head = `<section class="panel wide planhead">
      <div class="planttl">
        <div><div class="plantarget">${PL.TARGET.name}</div>
          <div class="muted">${PL.TARGET.venue} · €${PL.TARGET.buyIn.toLocaleString('de-DE')} ·
            <b>${PL.TARGET.gtdText} GTD</b> · ${PL.fmtDate(PL.TARGET.start)}–${PL.fmtDate(PL.TARGET.end)}2026<br>
            Festival ab ${PL.fmtDate(PL.TARGET.festivalStart)} — der Plan zielt auf das Main Event,
            nicht auf den Festivalstart.</div></div>
        <div class="plancount"><div class="v">${until > 0 ? until : 0}</div><div class="k">Tage bis Start</div></div>
        <div class="plancount"><div class="v">${total}<span class="sub2">/${PL.DAYS}</span></div><div class="k">Einheiten erledigt</div></div>
        <div class="plancount"><div class="v">${planStreak()}</div><div class="k">Tage in Folge</div></div>
      </div>
      <div class="planbarwrap"><i style="width:${(total / PL.DAYS * 100).toFixed(1)}%"></i></div>
    </section>`;

    if (idx === null) {
      const before = PL.toUTC(PL.PLAN_START) > PL.todayUTC();
      $('#planOut').innerHTML = head + `<section class="panel wide">
        <h3>${before ? 'Der Plan startet am ' + PL.fmtDate(PL.PLAN_START) : 'Der Plan ist durch'}</h3>
        <p class="muted">${before
          ? 'Bis dahin einfach frei drillen — die Wiederholungsqueue läuft ohnehin.'
          : 'Fünf Wochen sind vorbei. Ab hier zählt nur noch: jeden Tag die fällige Wiederholungsqueue leeren und vor jeder Session einmal in „Deine Fehler" schauen. Viel Erfolg in Rozvadov.'}</p>
      </section>` + planWeeksHTML(worst);
      $$('#planOut .planjump').forEach(b => b.onclick = () => selectHand(b.dataset.hc));
      return;
    }

    const s = PL.sessionFor(idx, worst);
    const isDone = !!done[s.iso];

    /* --- Heutige Einheit --- */
    const today = `<section class="panel wide plantoday ${isDone ? 'ok' : ''}">
      <div class="planrow">
        <h3>Heute · ${s.date} — Woche ${s.week.n}, Tag ${s.dayOfWeek + 1}</h3>
        <span class="chip">${s.type.name}</span>
        <span class="chip">30 Minuten</span>
      </div>
      <div class="planweektitle">${s.week.title}</div>
      ${(function () {
      const t = P.Tips && P.Tips.tipFor(idx);
      return t ? `<div class="daytip"><div class="dtk">Merksatz des Tages · ${escapeHtml(t.k)}</div>
        <div class="dtd">${md_(t.d)}</div></div>` : '';
    })()}
      <p class="planwhy">${md_(s.week.why)}</p>

      <div class="planblocks">${s.type.blocks.map(b =>
      `<div class="planblock"><span class="t">${b[0]}</span><span>${b[1]}</span></div>`).join('')}</div>

      <div class="plansetup">
        <div><b>Setup:</b> ${md_(s.week.cfgText)}</div>
        <div><b>Hände heute:</b> ${s.hands.map(h =>
        `<button class="ghost small planjump" data-hc="${h}">${h} ▸</button>`).join(' ')}
        ${s.week.hands ? '' : '<span class="muted"> — aus deiner eigenen Fehlerliste</span>'}</div>
        <div><b>Ziel:</b> ${md_(s.week.goal)}</div>
        <div><b>Woran du es merkst:</b> ${md_(s.week.check)}</div>
        ${s.week.tool ? `<div><b>Werkzeug diese Woche:</b>
          <button class="ghost small" id="planTool" data-v="${s.week.tool}">Tab ${s.week.tool === 'range' ? 'Range' : 'Rechnen'} öffnen ▸</button></div>` : ''}
      </div>

      <div class="planactions">
        <button class="primary" id="planStart">Setup übernehmen & starten ▸</button>
        <button class="ghost" id="planDone">${isDone ? '✓ erledigt — zurücknehmen' : 'Als erledigt markieren'}</button>
        <span class="muted">${P.Plan.WEEKS[Math.floor(idx / 7)].n === 5 && !worst.length
        ? 'Noch zu wenig Daten für deine persönliche Fehlerliste — spiel erst ein paar Einheiten.' : ''}</span>
      </div>
    </section>`;

    $('#planOut').innerHTML = head + today + planWeeksHTML(worst, idx) + planStructureHTML();
    $('#planStart').onclick = () => startPlanSession(s);
    if ($('#planTool')) $('#planTool').onclick = e => switchView(e.target.dataset.v);
    $('#planDone').onclick = () => {
      if (done[s.iso]) delete done[s.iso]; else done[s.iso] = true;
      savePlan(); renderPlan();
    };
    $$('#planOut .planjump').forEach(b => b.onclick = () => selectHand(b.dataset.hc));
  }

  /** Die echte Blindstruktur von Tag 1 als Tiefentabelle. */
  function planStructureHTML() {
    const PL = P.Plan;
    const rows = PL.depthTable().filter(r => r.day === 1).map(r => `
      <tr class="lv-${r.band}">
        <td>${r.lvl}</td><td>${r.sb.toLocaleString('de-DE')}/${r.bb.toLocaleString('de-DE')}</td>
        <td>${r.ante.toLocaleString('de-DE')}</td>
        <td><b>${r.depth.toFixed(1)}</b>bb</td>
        <td>${{ deep: '60–100bb', mid: '40–60bb', short: '20–35bb', push: '12–20bb und darunter' }[r.band]}</td>
      </tr>`).join('');
    const lPush = PL.firstLevelOf('push'), lShort = PL.firstLevelOf('short'), lMid = PL.firstLevelOf('mid');
    return `<section class="panel wide"><h3>Deine Turnierstruktur — Tag 1</h3>
      <p class="muted" style="font-size:.88rem">${PL.START_CHIPS.toLocaleString('de-DE')} Startchips,
        Ante = Big Blind, ${PL.LEVELS.length} Level über vier Tage. Gezeigt ist Tag 1; die Tiefe gilt
        für einen Stack, der <i>nichts</i> gewinnt — sie zeigt, wann welche Phase spätestens kommt.
        Die vollständige Sizing-Tabelle für alle Tage steht im Tab <b>Rechnen</b>.</p>
      <table class="sizing struct">
        <tr><th>Lvl</th><th>Blinds</th><th>Ante</th><th>Tiefe</th><th>entspricht Band</th></tr>
        ${rows}
      </table>
      <div class="hpnote-sm">Das ist das Argument für Woche 4 in Zahlen: <b>ab Level ${lPush} von 19</b>
        bist du im Push/Fold-Bereich, das sind die letzten neun Level. Tief (über 60bb) bist du nur
        bis Level 5, ab Level ${lMid} mittel, ab Level ${lShort} kurz. Wer nur 40–100bb übt, trainiert
        das erste Viertel von Tag 1.
        <br><br>Zweite Bestätigung: <b>Ante = BB</b> über die ganze Struktur. Damit liegt das tote Geld
        vor dem Flop konstant bei rund <b>2,5bb</b> (SB + BB + Ante) — genau der Wert, mit dem der
        Range-Designer und die Shove-EV rechnen. Einzige Ausnahme ist Level 1 mit 100/300, dort sind
        es 2,33bb.</div></section>`;
  }

  /** Wochenübersicht mit allen 35 Tagen als Raster. */
  function planWeeksHTML(worst, curIdx) {
    const PL = P.Plan, done = planDone();
    return `<section class="panel wide"><h3>Die fünf Wochen</h3>
      ${PL.WEEKS.map(w => {
      const days = [];
      for (let d = 0; d < 7; d++) {
        const i = (w.n - 1) * 7 + d;
        const s = PL.sessionFor(i, worst);
        const past = PL.toUTC(s.iso) < PL.todayUTC();
        days.push(`<div class="planday ${done[s.iso] ? 'done' : past ? 'missed' : ''} ${i === curIdx ? 'cur' : ''}"
            title="${s.date} — ${s.type.name}: ${s.hands.join(', ')}">
            <span class="d">${s.date.split(', ')[0]}</span><span class="n">${s.iso.slice(8)}.</span></div>`);
      }
      return `<div class="planweek ${curIdx !== undefined && Math.floor(curIdx / 7) === w.n - 1 ? 'cur' : ''}">
          <div class="planweekhd"><b>Woche ${w.n}</b> · ${w.title}
            <span class="muted">${w.cfgText.replace(/\*\*/g, '')}</span></div>
          <div class="plandays">${days.join('')}</div>
          <div class="planwhy small">${md(w.why)}</div>
          ${(function () {
        const list = P.Tips ? P.Tips.tipsOfWeek(w.n) : [];
        if (!list.length) return '';
        const heute = curIdx !== undefined ? curIdx % 7 : -1;
        const dieseWoche = curIdx !== undefined && Math.floor(curIdx / 7) === w.n - 1;
        return `<div class="tipweek">${list.map((t, i) =>
          `<div class="tw ${dieseWoche && i === heute ? 'cur' : ''}"><i>${i + 1}.</i>
             <span><b>${escapeHtml(t.k)}</b>${dieseWoche && i === heute ? ' — heute' : ''}</span></div>`).join('')}</div>`;
      })()}
        </div>`;
    }).join('')}
      <div class="hpnote-sm">Der Aufbau ist nicht beliebig: <b>Woche 1 geblockt</b> (immer derselbe
        Spot-Typ) lernt die Regel am schnellsten, behält sie aber am schlechtesten. Ab
        <b>Woche 3 gemischt</b> — das fühlt sich schlechter an, dein Score sinkt kurz, und genau
        das trainiert das Unterscheiden statt das Auswendiglernen. <b>Woche 4</b> geht auf kurze
        Stacks, weil sich jedes Live-Turnier unter 20bb entscheidet — das Band, das bisher in
        deinen Einstellungen fehlte.</div>
    </section>`;
  }

  /** "AhKd" -> "AKo" — für die Verknüpfung aus der Fehlerliste. */
  function classFromComboStr(s) {
    const m = String(s).match(/[2-9TJQKA][cdhs]/gi);
    if (!m || m.length < 2) return null;
    try { return P.handClassOf([P.cardFromStr(m[0]), P.cardFromStr(m[1])]); } catch (e) { return null; }
  }

  /* ============================ SESSION-AUSWERTUNG ================== *
   * Liest win2day-XML lokal im Browser. Gespeichert wird nur eine
   * kompakte Zusammenfassung je Session (rund 1,4 kB), nicht die Hände —
   * damit summieren sich die Frequenzen über beliebig viele Turniere.
   * ------------------------------------------------------------------ */
  const WSK = 'pt_w2d';
  function wsLoad() {
    try { return JSON.parse(localStorage.getItem(WSK) || '{"sessions":[]}'); }
    catch (e) { return { sessions: [] }; }
  }
  function wsSave(st) {
    try { localStorage.setItem(WSK, JSON.stringify(st)); return true; } catch (e) { return false; }
  }

  function wsHandleFiles(files) {
    const list = [...files];
    if (!list.length) return;
    $('#wsNote').textContent = 'Lese ' + list.length + ' Datei' + (list.length > 1 ? 'en' : '') +
      ' und spiele die Hände nach …';
    const store = wsLoad();
    let done = 0, added = 0, dup = 0;
    const failed = [], analyses = [];

    list.forEach(file => {
      const rd = new FileReader();
      const finish = () => { if (++done === list.length) wsFinish(store, analyses, added, dup, failed); };
      rd.onload = () => {
        try {
          const sess = P.W2D.parseSession(String(rd.result));
          if (!sess.heroHands.length) throw new Error('keine Hände mit deinem Spieler gefunden');
          const a = P.W2DStats.analyse(sess);
          // Postflop nachspielen — das ist der teuerste Teil (rund eine
          // Sekunde je Turnier), läuft aber nur einmal beim Einlesen.
          a.decisions = P.W2DPost.replayAll(a).decisions;
          analyses.push(a);
          const sum = P.W2DStats.summarise(a);
          sum.post = P.W2DLeaks.summarisePost(a.decisions);
          sum.sizing = P.W2DLeaks.sizingProfile(
            P.W2DLeaks.betFractions(a.rows).map(x => x.f));
          if (store.sessions.some(x => x.code === sum.code)) dup++;
          else { store.sessions.push(sum); added++; }
        } catch (e) { failed.push(file.name + ': ' + e.message); }
        finish();
      };
      rd.onerror = () => { failed.push(file.name + ': konnte nicht gelesen werden'); finish(); };
      rd.readAsText(file, 'utf-8');
    });
  }

  function wsFinish(store, analyses, added, dup, failed) {
    store.sessions.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const saved = wsSave(store);
    S.ws = { store, analyses };
    const bits = [];
    if (added) bits.push(added + ' neu');
    if (dup) bits.push(dup + ' schon vorhanden');
    if (!saved) bits.push('Speicher voll — nur für diese Sitzung geladen');
    failed.forEach(f => bits.push('Fehler: ' + f));
    $('#wsNote').textContent = bits.join(' · ');
    renderSession();
  }

  const wsFmt = n => Math.round(n).toLocaleString('de-DE');
  function wsFreq(x) {
    if (!x || x.n < P.W2DStats.MIN_N) return { txt: '—', ci: 'n=' + (x ? x.n : 0), thin: true };
    return {
      txt: (x.p * 100).toFixed(0) + '%',
      ci: (x.lo * 100).toFixed(0) + '–' + (x.hi * 100).toFixed(0) + ' · n=' + x.n,
      thin: false
    };
  }

  /** Stackverlauf als SVG. */
  function wsCurve(a) {
    const c = a.curve;
    if (c.length < 2) return '';
    const W = 720, H = 120, pad = 4;
    const max = Math.max.apply(null, c.map(x => x.chips)) || 1;
    const pts = c.map((x, i) =>
      (pad + i / (c.length - 1) * (W - 2 * pad)).toFixed(1) + ',' +
      (H - pad - x.chips / max * (H - 2 * pad)).toFixed(1)).join(' ');
    const pk = c.indexOf(a.peak);
    const px = (pad + pk / (c.length - 1) * (W - 2 * pad)).toFixed(1);
    return '<svg class="wscurve" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-label="Stackverlauf">' +
      '<polyline points="' + pts + '" fill="none" stroke="var(--acc)" stroke-width="2"/>' +
      '<line x1="' + px + '" y1="0" x2="' + px + '" y2="' + H + '" stroke="var(--warn)" stroke-dasharray="3 3" stroke-width="1"/></svg>';
  }

  const WS_REF = {
    vpip: '20–28 %', pfr: '16–22 %', threeBet: '6–9 %',
    foldTo3Bet: '55–65 %', steal: '35–45 %', bbDefend: '30–40 %',
    cbet: '55–70 %', foldToCbet: '40–50 %', wtsd: '24–30 %', wsd: '50–55 %'
  };
  const WS_LBL = {
    vpip: 'VPIP — freiwillig Geld in den Pot', pfr: 'PFR — präflop erhöht',
    threeBet: '3-Bet', foldTo3Bet: 'Fold gegen 3-Bet', steal: 'Steal-Versuch (BTN/CO/SB)',
    bbDefend: 'BB-Defense', cbet: 'C-Bet am Flop', foldToCbet: 'Fold gegen C-Bet',
    wtsd: 'WTSD — bis zum Showdown', wsd: 'W$SD — Showdown gewonnen'
  };

  /* --------------------------- Leak-Anzeige -------------------------- */
  const WS_OPT = {
    CHECK: 'Check', BET_S: 'Bet 33%', BET_M: 'Bet 55%', BET_L: 'Bet 80%', BET_XL: 'Overbet/All-in',
    FOLD: 'Fold', CALL: 'Call', RAISE_S: 'Raise klein', RAISE_L: 'Raise groß'
  };
  const wsNote = t => '<div class="hpnote-sm">' + t + '</div>';

  function wsLeakPanels(st, cur) {
    const L = P.W2DLeaks;
    const posts = st.sessions.map(s => s.post).filter(Boolean);
    if (!posts.length) return '';
    const agg = L.combinePost(posts);

    /* --- Sizing-Repertoire, über alle Sessions --- */
    let sizing = '';
    const sizes = st.sessions.map(s => s.sizing).filter(Boolean);
    if (sizes.length) {
      const all = [];
      sizes.forEach(x => x.rows.forEach(r => { for (let i = 0; i < r.n; i++) all.push(r.pct / 100); }));
      const sp = L.sizingProfile(all);
      if (sp) {
        const max = Math.max.apply(null, sp.rows.map(r => r.n));
        const bars = sp.rows.map(r => '<div class="wshist"><span>' + r.pct + '%</span>' +
          '<span class="bar"><i style="width:' + (r.n / max * 100).toFixed(0) + '%"></i></span>' +
          '<span class="n">' + r.n + '</span></div>').join('');
        sizing = '<section class="panel wide"><h3>Dein Sizing-Repertoire</h3>' + bars +
          wsNote('<b>' + sp.n + ' Bets, davon ' + (sp.concentration * 100).toFixed(0) + ' % auf nur zwei Größen.</b> ' +
            (sp.flagged
              ? 'Das ist das Muster von jemandem, der die Voreinstellungsknöpfe des Clients drückt, ' +
              'statt die Größe zu wählen. Die mittlere Größe um 65 % ist der Kompromiss, der fast nie ' +
              'der beste ist: auf trockenen Boards mit Range-Advantage will man 33 % über die ganze ' +
              'Range, auf dynamischen Boards mit Nut-Advantage 75–80 %. Wer nur 65 % hat, bettet auf ' +
              'trockenen Boards zu groß und auf nassen zu klein — beides kostet, ohne dass es auffällt.'
              : 'Die Verteilung ist breit genug — du wählst deine Größen.') +
            ' Median ' + (sp.median * 100).toFixed(0) + ' %, Mittel ' + (sp.mean * 100).toFixed(0) + ' %.') +
          '</section>';
      }
    }

    /* --- Muster --- */
    const pats = agg.patterns.filter(p => p.n >= 1);
    const patHtml = pats.map(p => {
      const belastbar = p.n >= L.MIN_CASES;
      return '<div class="wsleak' + (belastbar ? '' : ' thin') + '">' +
        '<div class="hd">' + p.title +
        ' <span class="wsbadge">' + p.n + '×</span>' +
        (belastbar ? '' : ' <span class="wsbadge weak">zu wenig Fälle</span>') + '</div>' +
        '<div class="why">' + p.why + '<br><b>Was du änderst:</b> ' + p.fix + '</div>' +
        (p.examples && p.examples.length ? p.examples.slice(0, 4).map(e =>
          '<div class="wshand"><span>#' + (e.handIdx + 1) + '</span><b>' + e.handClass + '</b>' +
          '<span>' + e.street + '</span><span>' + (e.heroIP ? 'IP' : 'OOP') + '</span>' +
          '<span>' + e.made + ' · du: ' + (WS_OPT[e.picked] || e.picked) +
          ' · Engine: ' + (WS_OPT[e.best] || e.best) + ' · Note ' + e.score + '</span></div>').join('') : '') +
        '</div>';
    }).join('');

    /* --- Dimensionen --- */
    const dimHtml = agg.dims.map(d => {
      const rows = d.rows.filter(r => r.n >= 3).map(r =>
        '<tr><td>' + r.key + '</td><td class="num">' + r.n + '</td>' +
        '<td class="num" style="color:' + relColor(r.mean / 100) + '">' + r.mean.toFixed(0) + '</td></tr>').join('');
      if (!rows) return '';
      return '<div class="wsdim"><h4>' + d.label + '</h4><table class="wsstat">' +
        '<tr><th></th><th class="num">n</th><th class="num">Note</th></tr>' + rows + '</table></div>';
    }).join('');

    return sizing +
      '<section class="panel wide"><h3>Leaks — was sich wiederholt</h3>' +
      '<div class="wssum"><div><div class="v">' + agg.n + '</div><div class="k">bewertete Entscheidungen</div></div>' +
      '<div><div class="v" style="color:' + relColor(agg.mean / 100) + '">' + agg.mean.toFixed(0) + '</div>' +
      '<div class="k">Durchschnittsnote</div></div></div>' +
      (agg.enough ? '' : wsNote('<b>Unter 30 bewerteten Entscheidungen ist noch nichts belastbar.</b> ' +
        'Lade weitere Sessions dazu — die Muster addieren sich.')) +
      patHtml +
      wsNote('Die Note kommt aus <b>derselben Engine</b>, die dich im Drill benotet: die Range des ' +
        'Gegners wird aus seiner Position und seinen Aktionen rekonstruiert und Straße für Straße ' +
        'verengt, genau wie im Trainer. Damit sind diese Noten direkt mit deinen Drill-Noten ' +
        'vergleichbar.<br><br><b>Was das nicht ist:</b> ein Solver. Die Engine ist eine Heuristik, ' +
        'und die Gegner-Range ist eine Referenz, kein Wissen über den konkreten Spieler. Eine ' +
        'einzelne Note ist deshalb kein Urteil — erst die Wiederholung desselben Fehlertyps ist ein ' +
        'Leak. Mehrweg-Pots werden ausgelassen, weil die App dafür keine Range-Logik hat.') +
      '</section>' +
      (dimHtml ? '<section class="panel wide"><h3>Wo die Schwäche sitzt</h3><div class="wsdims">' +
        dimHtml + '</div>' +
        wsNote('Durchschnittsnote je Gruppe, aufsteigend — oben steht, wo es am meisten hakt. ' +
          'Gruppen mit weniger als drei Entscheidungen sind ausgelassen.') + '</section>' : '');
  }

  function renderSession() {
    const out = $('#wsOut');
    const st = (S.ws && S.ws.store) || wsLoad();
    if (!st.sessions || !st.sessions.length) {
      out.innerHTML = '<section class="panel wide"><div class="hpnone">' +
        'Noch keine Session geladen. Bei win2day findest du den Export im Spielverlauf, ' +
        'eine XML-Datei je Turnier. Mehrere auf einmal auswählen geht.</div></section>';
      return;
    }
    const agg = P.W2DStats.statsFromSummaries(st.sessions);
    const cur = S.ws && S.ws.analyses && S.ws.analyses.length === 1 ? S.ws.analyses[0] : null;

    const totalHands = agg.stats.hands;
    const cashes = st.sessions.filter(s => s.win && !/^€?\s*0/.test(s.win)).length;
    let head = '<section class="panel wide"><h3>Über alle geladenen Sessions</h3><div class="wssum">' +
      '<div><div class="v">' + st.sessions.length + '</div><div class="k">Turniere</div></div>' +
      '<div><div class="v">' + wsFmt(totalHands) + '</div><div class="k">Hände</div></div>' +
      '<div><div class="v">' + cashes + '</div><div class="k">im Geld</div></div>' +
      '<div><div class="v">' + st.sessions.reduce((a, s) => a + s.knockouts, 0) + '</div><div class="k">Knockouts</div></div>' +
      '<div><div class="v ' + (agg.allInAct < agg.allInExp ? 'neg' : '') + '">' + agg.allInAct +
      '<span class="sub2">/' + agg.allInExp.toFixed(1) + '</span></div><div class="k">All-ins gew. / erwartet</div></div>' +
      '</div>';
    if (totalHands < 1000) {
      head += '<div class="hpnote-sm"><b>' + wsFmt(totalHands) + ' Hände sind für Frequenzen wenig.</b> ' +
        'Für VPIP und PFR braucht es rund 1.000 Hände, bis das Intervall unter ±4 Punkte fällt, für ' +
        'Postflop-Werte ein Vielfaches. Die Spalte „95-%-Bereich" zeigt deshalb bei jeder Zahl, wo der ' +
        'wahre Wert liegen kann. Lade weitere Dateien dazu — die Zahlen addieren sich.</div>';
    }
    head += '</section>';

    const rows = P.W2DStats.STAT_KEYS.map(k => {
      const f = wsFreq(agg.stats[k]);
      return '<tr class="' + (f.thin ? 'thin' : '') + '"><td>' + WS_LBL[k] + '</td>' +
        '<td class="num">' + f.txt + '</td><td class="ci">' + f.ci + '</td>' +
        '<td class="wsref">' + WS_REF[k] + '</td></tr>';
    }).join('');
    const freqPanel = '<section class="panel wide"><h3>Frequenzen</h3>' +
      '<table class="wsstat"><tr><th>Kennzahl</th><th class="num">du</th>' +
      '<th class="ci">95-%-Bereich</th><th>üblich</th></tr>' + rows + '</table>' +
      '<div class="hpnote-sm">Die Referenzspalte sind Erfahrungswerte für Turniere, keine ' +
      'Solver-Vorgaben. Solange dein 95-%-Bereich die Referenz überschneidet, ist eine Abweichung ' +
      '<b>nicht belegt</b> — dafür fehlen die Hände.</div></section>';

    const posRows = ['UTG', 'UTG1', 'UTG2', 'MP', 'MP1', 'MP2', 'CO', 'BTN', 'SB', 'BB']
      .filter(p => agg.byPos[p]).map(p => {
        const b = agg.byPos[p];
        return '<tr><td>' + p + '</td><td class="num">' + b.n + '</td>' +
          '<td class="num">' + (b.vpip / b.n * 100).toFixed(0) + '%</td>' +
          '<td class="num">' + (b.pfr / b.n * 100).toFixed(0) + '%</td>' +
          '<td class="num">' + (b.openChance ? (b.opens / b.openChance * 100).toFixed(0) + '%' : '—') + '</td>' +
          '<td class="ci">' + (b.openChance || 0) + '</td></tr>';
      }).join('');
    const bandRows = P.W2DStats.BANDS.filter(k => agg.byBand[k]).map(k => {
      const b = agg.byBand[k];
      return '<tr><td>' + P.W2DStats.BAND_LABEL[k] + '</td><td class="num">' + b.n + '</td>' +
        '<td class="num">' + (b.vpip / b.n * 100).toFixed(0) + '%</td>' +
        '<td class="num">' + b.allIn + '</td></tr>';
    }).join('');
    const posPanel = '<div class="grid2">' +
      '<section class="panel"><h3>Nach Position</h3><table class="wsstat">' +
      '<tr><th>Pos</th><th class="num">Hände</th><th class="num">VPIP</th><th class="num">PFR</th>' +
      '<th class="num">Open</th><th class="ci">Gelegenh.</th></tr>' + posRows + '</table>' +
      '<div class="hpnote-sm">„Open" zählt nur Hände, die ungeöffnet zu dir kamen — die einzige ' +
      'Situation, in der du frei entscheidest. Hände mit totem Button sind ausgelassen, dort ist ' +
      'die Position nicht eindeutig bestimmbar.</div></section>' +
      '<section class="panel"><h3>Nach Stackgröße</h3><table class="wsstat">' +
      '<tr><th>Band</th><th class="num">Hände</th><th class="num">VPIP</th><th class="num">All-in</th></tr>' +
      bandRows + '</table>' +
      '<div class="hpnote-sm">Dieselben Bänder wie im Trainer. Ein Ergebnis in bb steht hier bewusst ' +
      '<b>nicht</b>: Big Blinds sind über Blindstufen hinweg nicht addierbar — in der Beispielsession ' +
      'ergäbe die Summe +113bb, obwohl das Turnier verloren ging.</div></section></div>';

    let detail = '';
    if (cur) {
      const m = cur.session.meta;
      const audit = P.W2DAudit.auditAll(cur);
      const leaks = [];
      Object.keys(audit.byVerdict).forEach(k => {
        const t = P.W2DAudit.VERDICT_TEXT[k], list = audit.byVerdict[k];
        leaks.push('<div class="wsleak"><div class="hd">' + t.title + ' — ' + list.length + '×</div>' +
          list.slice(0, 6).map(x => '<div class="wshand"><span>#' + (x.row.idx + 1) + '</span>' +
            '<b>' + x.row.handClass + '</b><span>' + x.row.pos + '</span>' +
            '<span>' + x.row.stackBB.toFixed(1) + 'bb</span>' +
            '<span>du: ' + x.action + ' · Shove-EV <span class="ev ' + (x.ev >= 0 ? 'pos' : 'neg') + '">' +
            (x.ev >= 0 ? '+' : '') + x.ev.toFixed(2) + 'bb</span></span></div>').join('') +
          '<div class="why">' + t.why + '</div></div>');
      });
      let shoveN = 0;
      const cache = {};
      cur.rows.forEach(r => { if (P.W2DAudit.auditShove(r, cache)) shoveN++; });
      if (!leaks.length) {
        leaks.push('<div class="wsleak good"><div class="hd">Keine Push/Fold-Fehler gefunden</div>' +
          '<div class="why">Alle ' + shoveN + ' Shove-oder-Fold-Entscheidungen mit kurzem Stack waren ' +
          'richtig: jeder Fold hatte negativen Shove-EV, jeder All-in positiven. Das ist der Teil des ' +
          'Spiels, der sich exakt nachrechnen lässt — dein Leak liegt also nicht hier.</div></div>');
      }
      const openBits = [];
      if (audit.openTooWide.length) openBits.push('<b>weiter als die Referenz:</b> ' +
        audit.openTooWide.map(o => o.row.handClass + ' (' + o.row.pos + ')').join(', '));
      if (audit.openTooTight.length) openBits.push('<b>enger als die Referenz:</b> ' +
        audit.openTooTight.map(o => o.row.handClass + ' (' + o.row.pos + ')').join(', '));

      const aiRows = cur.allIns.map(x => '<div class="wshand"><span>#' + (x.row.idx + 1) + '</span>' +
        '<b>' + x.row.handClass + '</b><span>' + x.villain.map(P.cardToStr).join('') + '</span>' +
        '<span>' + (x.eq * 100).toFixed(0) + '%</span><span>' + x.street +
        (x.known.length ? ' · ' + x.known.map(P.cardToStr).join(' ') : '') +
        ' → ' + (x.won ? 'gewonnen' : 'verloren') + '</span></div>').join('');
      const aiDiff = cur.allInActual - cur.allInExpected;

      detail = '<section class="panel wide"><h3>' + escapeHtml(m.tournamentName || m.tableName) + '</h3>' +
        '<div class="wssum">' +
        '<div><div class="v">' + (m.place || '—') + '</div><div class="k">Platz</div></div>' +
        '<div><div class="v">' + cur.stats.hands + '</div><div class="k">Hände</div></div>' +
        '<div><div class="v">' + wsFmt(cur.peak.chips) + '</div><div class="k">Höchststand</div></div>' +
        '<div><div class="v">' + escapeHtml(m.win || '—') + '</div><div class="k">Auszahlung</div></div>' +
        '<div><div class="v">' + escapeHtml(m.duration || '—') + '</div><div class="k">Dauer</div></div>' +
        '</div>' + wsCurve(cur) +
        '<div class="muted" style="font-size:.8rem">Stackverlauf über ' + cur.stats.hands +
        ' Hände. Die gestrichelte Linie markiert den Höchststand bei Hand ' + (cur.peak.idx + 1) + '.</div></section>' +

        '<section class="panel wide"><h3>Nachgerechnete Entscheidungen</h3>' + leaks.join('') +
        (openBits.length ? '<div class="wsleak"><div class="hd">Open-Range gegen die Referenz</div>' +
          '<div class="why">' + openBits.join('<br>') + '<br><br>Die Referenzranges der App sind ' +
          'Näherungen, keine Solver-Ausgabe. Das sind <i>Abweichungen</i>, keine belegten Fehler — ' +
          'wenn dieselbe Hand über mehrere Sessions auffällt, lohnt der Blick in den Steckbrief.</div></div>' : '') +
        '<div class="hpnote-sm">Postflop wird bewusst <b>nicht</b> benotet: die Karten der Gegner sind in ' +
        'den allermeisten Händen verdeckt, jede Note wäre geraten. Geprüft wird der Teil mit kurzem ' +
        'Stack — dort ist Shove-oder-Fold eine geschlossene Rechnung.</div></section>' +

        (cur.allIns.length ? '<section class="panel wide"><h3>All-ins mit aufgedeckten Karten</h3>' +
          aiRows + '<div class="hpnote-sm">Equity zum Zeitpunkt, an dem das Geld reinging — nicht am ' +
          'fertigen Board. Erwartet <b>' + cur.allInExpected.toFixed(2) + '</b> gewonnene, tatsächlich <b>' +
          cur.allInActual + '</b> (' + (aiDiff >= 0 ? '+' : '') + aiDiff.toFixed(2) + '). ' +
          (Math.abs(aiDiff) < 1.5 ? 'Das liegt im Rahmen — das Ergebnis erklärt sich nicht über Glück oder Pech.'
            : aiDiff > 0 ? 'Du bist über Erwartung gelaufen.' : 'Du bist unter Erwartung gelaufen.') +
          '</div></section>' : '');
    }

    const sessRows = st.sessions.slice().reverse().map(s => '<div class="wssess">' +
      '<span class="nm">' + escapeHtml(s.name || s.code) + '<br><span class="muted" style="font-size:.78rem">' +
      escapeHtml(String(s.date).slice(0, 16)) + '</span></span>' +
      '<span class="num">' + s.hands + ' Hände</span>' +
      '<span class="num">Platz ' + (s.place || '—') + '</span>' +
      '<span class="num ' + (!s.win || /^€?\s*0/.test(s.win) ? 'neg' : '') + '">' +
      escapeHtml(s.win || '—') + '</span></div>').join('');

    out.innerHTML = head + detail + wsLeakPanels(st, cur) + freqPanel + posPanel +
      '<section class="panel wide"><h3>Geladene Sessions</h3>' + sessRows + '</section>';
  }

  /* --------------------------- Mehrweg-Rechner ----------------------- */
  function runMultiway() {
    const M = P.Multiway, out = $('#mwOut');
    const board = parseCards($('#mwBoard').value);
    const hand = parseCards($('#mwHand').value);
    const n = parseInt($('#mwOpp').value, 10) || 2;
    const pot = parseFloat($('#mwPot').value) || 0;
    const bet = parseFloat($('#mwBet').value) || 0;
    if (board.length < 3 || hand.length !== 2) {
      out.innerHTML = '<div class="hpnone">Board mit mindestens drei Karten und zwei eigene Karten eingeben.</div>';
      return;
    }
    out.innerHTML = '<div class="hpnone">Rechnet …</div>';
    setTimeout(() => {
      const cont = P.parseRange(M.CONTINUE);
      const ranges = [];
      for (let i = 0; i < n; i++) ranges.push(cont);
      const r = M.equityMulti(hand, ranges, board, 20000);
      const cls = P.classify(hand, board);
      const fair = 1 / (n + 1);
      const valueLine = fair + 0.15;
      const rows = [];
      rows.push(['Deine Hand', cls.made + (cls.draws.length ? ' + ' + cls.draws.join(', ') : '')]);
      rows.push(['Equity gegen ' + n + ' Gegner', (r.eq * 100).toFixed(1) + '%']);
      rows.push(['fairer Anteil bei ' + (n + 1) + ' Spielern', (fair * 100).toFixed(0) + '%']);
      rows.push(['Schwelle für eine Value-Bet', (valueLine * 100).toFixed(0) + '%']);
      let verdict, tone;
      if (bet > 0) {
        const need = M.needEquity(pot, bet);
        rows.push(['nötige Equity zum Callen', (need * 100).toFixed(1) + '%']);
        const be = M.bluffBreakEven(pot, bet, n);
        rows.push(['als Bluff müsste jeder folden mit', (be.needEach * 100).toFixed(0) + '%']);
        const ok = r.eq >= need;
        tone = ok ? 'good' : 'bad';
        verdict = ok
          ? 'Call: deine <b>' + (r.eq * 100).toFixed(1) + '%</b> liegen über den nötigen <b>' +
          (need * 100).toFixed(1) + '%</b>.'
          : 'Fold: deine <b>' + (r.eq * 100).toFixed(1) + '%</b> reichen nicht an die nötigen <b>' +
          (need * 100).toFixed(1) + '%</b> heran.';
      } else {
        const ok = r.eq >= valueLine;
        tone = ok ? 'good' : 'bad';
        verdict = ok
          ? 'Value-Bet: <b>' + (r.eq * 100).toFixed(1) + '%</b> liegen über der Schwelle von <b>' +
          (valueLine * 100).toFixed(0) + '%</b>.'
          : 'Check: <b>' + (r.eq * 100).toFixed(1) + '%</b> reichen mehrweg nicht zum Setzen. ' +
          'Der Pot gehört statistisch jemand anderem.';
      }
      out.innerHTML = '<div class="mwres">' +
        rows.map(x => '<div class="mwrow"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>').join('') +
        '<div class="mwverdict ' + tone + '">' + verdict + '</div>' +
        '<div class="hpnote-sm">Gerechnet gegen die <b>Weiterspiel-Range</b> je Gegner (dieselbe wie in der ' +
        'Tabelle oben, nicht die breitere Preflop-Range), ' +
        r.n.toLocaleString('de-DE') + ' Simulationen. Das ist eine <b>Wahrscheinlichkeit, kein ' +
        'Gleichgewicht</b> — es sagt dir, wie oft du gewinnst, nicht was ein Solver tun würde. ' +
        'Für Mehrweg gibt es keinen.</div></div>';
    }, 20);
  }

  /* ------------------------------ Statistik -------------------------- */
  function renderStats() {
    const s = S.stats;
    const acc = s.max ? Math.round(s.pts / s.max * 100) : 0;
    const rows = (obj) => Object.keys(obj).map(k =>
      `<div class="stat"><div class="v">${obj[k].m ? Math.round(obj[k].p / obj[k].m * 100) : 0}%</div><div class="k">${k}</div></div>`).join('');
    $('#statsOut').innerHTML = `
      <div class="statgrid">
        <div class="stat"><div class="v">${s.hands}</div><div class="k">Hände</div></div>
        <div class="stat"><div class="v">${s.dec}</div><div class="k">Entscheidungen</div></div>
        <div class="stat"><div class="v">${acc}%</div><div class="k">Score gesamt</div></div>
        <div class="stat"><div class="v">${dueItems().length}</div><div class="k">jetzt fällig</div></div>
        <div class="stat"><div class="v">${S.review.items.length}<span class="sub2">/${RV.MAX_ITEMS}</span></div><div class="k">in Wiederholung</div></div>
        <div class="stat"><div class="v">${s.mastered || 0}</div><div class="k">gemeistert</div></div>
        <div class="stat"><div class="v">${(reviewBytes() / 1048576).toFixed(2)}<span class="sub2">MB</span></div><div class="k">Speicher</div></div>
      </div>
      ${s.dropped ? `<div class="mistake">Speicher war voll — ${s.dropped} alte Einträge wurden verworfen. Die neuesten bleiben erhalten.</div>` : ''}
      <h3 style="margin-top:1rem">Nach Spot-Typ</h3><div class="statgrid">${rows(s.byTag) || '<div class="muted">—</div>'}</div>
      <h3 style="margin-top:1rem">Nach Straße</h3><div class="statgrid">${rows(s.byStreet) || '<div class="muted">—</div>'}</div>`;
    $('#mistakesOut').innerHTML = s.mistakes.length ? s.mistakes.map(m => {
      const hc = classFromComboStr(m.hand);
      return `<div class="mistake"><div class="hd">${escapeHtml(m.spot)} · ${m.street} · ${m.board} · ${m.hand} (${m.cls})
         ${hc ? `<button class="ghost small hpjump" data-hc="${hc}">Steckbrief ${hc} ▸</button>` : ''}</div>
       <div>Du: <b>${m.picked}</b> — Baseline: <b style="color:var(--ok)">${m.best}</b></div>
       <div class="muted">${md(escapeHtml(m.why || ''))}</div></div>`;
    }).join('')
      : '<div class="muted">Noch keine Fehler erfasst.</div>';
    $$('#mistakesOut .hpjump').forEach(b => b.onclick = () => selectHand(b.dataset.hc));
  }

  /* ====================== Eigene Hände (feste Spots) ================== *
     Nachspielen echter Hände aus der eigenen Historie. Anders als im Drill
     ist hier nichts zufällig: Board, Karten und Bet-Größen stehen fest, nur
     die Entscheidung ist offen. Die Empfehlung kommt aus ownhands.js und
     wird dort gerechnet, nicht hier gesetzt — dieser Block ist reine
     Darstellung.
     ------------------------------------------------------------------- */
  const OWNK = 'pt_ownhands';

  function loadOwn() {
    try { return JSON.parse(localStorage.getItem(OWNK) || '{}'); } catch (e) { return {}; }
  }
  function saveOwn(st) {
    try { localStorage.setItem(OWNK, JSON.stringify(st)); } catch (e) { }
  }

  /** Karten als HTML-String (die Drill-Ansicht baut DOM-Knoten, hier reicht Markup). */
  function ownCards(str) {
    return P.OwnHands.cards(str).map(c => {
      const s = P.RANKS[c >> 2], u = 'cdhs'[c & 3];
      return `<span class="card mini ${SUIT_CLASS[u] || ''}">` +
        `<span class="r">${s}</span><span class="s">${P.SUIT_SYM[u]}</span></span>`;
    }).join('');
  }

  function renderOwn() {
    const O = P.OwnHands;
    const done = loadOwn();
    const cur = S.own.id ? O.byId(S.own.id) : null;

    const list = O.HANDS.map(h => {
      const st = done[h.id];
      const mark = st ? `<span class="ownscore">${st.right}/${st.total}</span>` : '';
      return `<button class="ownitem${cur && cur.id === h.id ? ' active' : ''}" data-own="${h.id}">
        <span class="ownttl">${escapeHtml(h.title)}${mark}</span>
        <span class="ownmeta">${escapeHtml(h.src.time)} · ${h.costBB.toFixed(1)}bb</span>
      </button>`;
    }).join('');

    $('#ownList').innerHTML = list;
    $$('#ownList .ownitem').forEach(b => b.onclick = () => {
      S.own = { id: b.dataset.own, step: 0, picks: [] };
      renderOwn();
    });

    if (!cur) {
      $('#ownOut').innerHTML = '<section class="panel wide"><p class="muted">' +
        'Wähle links eine Hand. Jede stammt aus deiner eigenen Historie — ' +
        'Board, Karten und Bet-Größen stehen exakt so, wie sie gespielt wurden.' +
        '</p></section>';
      return;
    }
    renderOwnHand(cur);
  }

  function renderOwnHand(h) {
    const O = P.OwnHands;
    const step = Math.min(S.own.step, h.asks.length);
    const finished = step >= h.asks.length;
    const out = [];

    out.push(`<section class="panel wide">
      <h3>${escapeHtml(h.title)}</h3>
      <p class="muted ownsrc">${escapeHtml(h.src.tourney)} · ${escapeHtml(h.src.time)} ·
        Hand ${h.src.hand} aus <code>${escapeHtml(h.src.file)}</code></p>
      <div class="ownfacts">
        <div><b>Blinds</b> ${h.sb}/${h.bb}</div>
        <div><b>Du</b> ${escapeHtml(h.heroPos)} · ${h.heroStackBB.toFixed(1)}bb</div>
        <div><b>Gegner</b> ${escapeHtml(h.villPos)} · ${h.villStackBB.toFixed(1)}bb</div>
        <div><b>Deine Karten</b> ${ownCards(h.heroCards)}</div>
      </div>
      <p class="ownpre">${escapeHtml(h.preflop)}</p>
    </section>`);

    /* Bereits gespielte Straßen als aufgeklappte Historie. */
    for (let i = 0; i < step; i++) out.push(ownAskHtml(h, h.asks[i], i, S.own.picks[i]));
    /* Die aktuelle Straße, noch offen. */
    if (!finished) out.push(ownAskHtml(h, h.asks[step], step, null));

    if (finished) {
      out.push(`<section class="panel wide ownlesson">
        <h3>Was er wirklich hatte</h3>
        <p>${ownCards(h.villCards)} &nbsp; — die Hand kostete dich
          <b class="ownneg">${h.costChips.toLocaleString('de-AT')} Chips</b>
          (${h.costBB.toFixed(1)}bb).</p>
        <p>${escapeHtml(h.lesson)}</p>
        <button class="ghost" id="ownAgain">Noch einmal ⟳</button>
      </section>`);
    }

    $('#ownOut').innerHTML = out.join('');

    if (!finished) {
      $$('#ownOut .opt[data-act]').forEach(b => b.onclick = () => {
        S.own.picks[step] = b.dataset.act;
        S.own.step = step + 1;
        if (S.own.step >= h.asks.length) {
          const g = h.asks.map((a, i) => O.grade(h, a, S.own.picks[i]));
          const st = loadOwn();
          st[h.id] = { right: g.filter(x => x.level === 'ok').length, total: g.length, ts: Date.now() };
          saveOwn(st);
        }
        renderOwn();
      });
    } else {
      const again = $('#ownAgain');
      if (again) again.onclick = () => { S.own = { id: h.id, step: 0, picks: [] }; renderOwn(); };
    }
  }

  const OWN_LABEL = { FOLD: 'Fold', CALL: 'Call', RAISE: 'Raise', CHECK: 'Check', BET: 'Bet' };
  const OWN_VERDICT = { ok: 'ok', vertretbar: 'warn', abweichend: 'warn', falsch: 'bad' };

  /** Eine Entscheidung: offen (picked === null) oder ausgewertet. */
  function ownAskHtml(h, ask, idx, picked) {
    const O = P.OwnHands;
    const pot = ask.potBB.toFixed(1);
    const head = `<section class="panel wide ownask">
      <div class="ownstreet">${ask.street.toUpperCase()}
        ${ask.board ? '<span class="ownboard">' + ownCards(ask.board) + '</span>' : ''}
        <span class="ownpot">Pot ${pot}bb${ask.betBB ? ' · seine Bet ' + ask.betBB.toFixed(1) + 'bb' : ''}</span>
      </div>
      <p class="ownstory">${escapeHtml(ask.text)}</p>`;

    if (!picked) {
      const opts = ask.options.map(o =>
        `<button class="opt" data-act="${o}">${OWN_LABEL[o] || o}${
          o === 'CALL' && ask.toCallBB ? `<span class="amt">${ask.toCallBB.toFixed(1)}bb</span>` :
          o === 'BET' && ask.betBB ? `<span class="amt">${ask.betBB.toFixed(1)}bb</span>` : ''
        }</button>`).join('');
      return head + `<div class="ask-title">Deine Aktion?</div>
        <div class="opts">${opts}</div></section>`;
    }

    const g = O.grade(h, ask, picked);
    const cls = OWN_VERDICT[g.level] || 'warn';
    const recTxt = g.rec === 'FOLD_OR_RAISE' ? 'Fold oder Raise — nur nicht Call' : (OWN_LABEL[g.rec] || g.rec);

    let rows = '';
    if (g.basis === 'gerechnet') {
      const reqTxt = ask.mode === 'BET'
        ? 'Schwelle für eine Value-Bet'
        : 'Nötige Equity aus den Pot Odds';
      rows = `<ul class="ownnums">
        <li><span>${reqTxt}</span><b>${(g.req * 100).toFixed(1)} %</b></li>
        <li><span>Deine Equity gegen seine Range</span><b>${(g.eq * 100).toFixed(1)} %</b></li>
        <li class="ownbasis"><span>Genauigkeit</span><b>${
          g.exact ? 'exakt — vollständig ausgezählt' : 'Stichprobe'
        }</b></li>
      </ul>`;
    } else {
      rows = `<p class="ownjudge"><b>Keine Zahl, ein Urteil.</b> ${escapeHtml(ask.judgementWhy)}</p>`;
    }

    const mwNote = ask.headsUp === false
      ? `<p class="ownwarn">Mehrweg: hier lebt noch ein dritter Spieler. Die Pot Odds
         stimmen exakt, die Equity gilt aber nur gegen den Aggressor — die echte
         Hürde liegt höher, nicht niedriger.</p>`
      : '';

    return head + `
      <div class="verdict ${cls}">Du: ${OWN_LABEL[picked] || picked} · Empfehlung: ${recTxt}
        <small>${g.matchedActual
          ? 'Das ist auch das, was du damals gespielt hast.'
          : 'Damals hast du ' + (OWN_LABEL[ask.actual] || ask.actual) + ' gespielt.'}</small>
      </div>
      ${rows}
      ${mwNote}
      <details class="ownrange"><summary>Seine Range — die Annahme hinter der Zahl</summary>
        <p class="ownrangestr"><code>${escapeHtml(ask.villRange || '—')}</code></p>
        <p>${escapeHtml(ask.rangeWhy || '')}</p>
      </details>
      ${ask.note ? '<p class="ownnote">' + escapeHtml(ask.note) + '</p>' : ''}
    </section>`;
  }

  /* ------------------------------ UI-Wiring -------------------------- */
  function switchView(v) {
    $$('.view').forEach(e => e.classList.remove('active'));
    $$('.tab').forEach(e => e.classList.remove('active'));
    $('#view-' + v).classList.add('active');
    $(`.tab[data-view="${v}"]`).classList.add('active');
    if (v === 'stats') renderStats();
    if (v === 'session') renderSession();
    if (v === 'eigene') renderOwn();
    if (v === 'plan') renderPlan();
    if (v === 'range' && !$('#rdOut').children.length) { runRangeDesigner(); scNewQuestion(); }
    if (v === 'rechnen' && !$('#mtOpts').children.length) { mtScore(); mtNew(); renderSizings(); rfNew(); }
    if (v === 'haende' && !$('#hpGrid').children.length) {
      renderHpGrid();
      selectHand(S.hp.sel);
    }
  }

  function readCfg() {
    S.cfg.stacks = $$('.cfgStack:checked').map(e => e.value);
    S.cfg.tags = $$('.cfgTag:checked').map(e => e.value);
    S.cfg.multi = $('#cfgMultiStreet').checked;
    S.cfg.autoHint = $('#cfgAutoHint').checked;
    S.cfg.quiz = $('#cfgQuiz').checked;
    S.cfg.profile = $('#cfgProfile').value || 'reg';
    if (!S.cfg.stacks.length) S.cfg.stacks = ['mid'];
    if (!S.cfg.tags.length) S.cfg.tags = ['SRP'];
    try { localStorage.setItem('pt_cfg', JSON.stringify(S.cfg)); } catch (e) { }
  }
  function loadCfg() {
    try {
      const c = JSON.parse(localStorage.getItem('pt_cfg') || 'null');
      if (c) S.cfg = Object.assign(S.cfg, c);
    } catch (e) { }
  }
  /** Schreibt den gespeicherten Zustand in die Checkboxen zurück. */
  function cfgToUI() {
    $$('.cfgStack').forEach(e => e.checked = S.cfg.stacks.includes(e.value));
    $$('.cfgTag').forEach(e => e.checked = S.cfg.tags.includes(e.value));
    $('#cfgMultiStreet').checked = S.cfg.multi;
    $('#cfgAutoHint').checked = S.cfg.autoHint;
    $('#cfgQuiz').checked = S.cfg.quiz !== false;
    $('#cfgProfile').value = S.cfg.profile || 'reg';
  }
  function openSettings() { cfgToUI(); $('#settings').hidden = false; }
  /**
   * @param apply true = Übernehmen, false = Abbrechen (verwirft die Klicks).
   * Neu ausgeteilt wird nur, wenn sich wirklich etwas geändert hat — sonst
   * kostet ein Blick in die Einstellungen die laufende Hand.
   */
  function closeSettings(apply) {
    if (apply) {
      const before = JSON.stringify(S.cfg);
      readCfg();
      $('#settings').hidden = true;
      if (JSON.stringify(S.cfg) !== before) newHand();
    } else {
      cfgToUI();
      $('#settings').hidden = true;
    }
  }

  function init() {
    loadCfg(); cfgToUI(); updateReviewButton();
    $$('.tab').forEach(t => t.onclick = () => switchView(t.dataset.view));
    $('#btnSettings').onclick = openSettings;
    $('#btnCloseSettings').onclick = () => closeSettings(true);
    $('#btnCancelSettings').onclick = () => closeSettings(false);
    // Klick auf den Hintergrund (nicht auf die Box) schließt ohne Änderung
    $('#settings').onclick = e => { if (e.target === $('#settings')) closeSettings(false); };
    $('#btnHint').onclick = () => { const h = $('#hintBox'); h.hidden = !h.hidden; };
    $('#btnNext').onclick = () => { const f = S.after; S.after = null; if (f) f(); };
    $('#btnSkip').onclick = newHand;
    $('#btnNewHand').onclick = newHand;
    $('#btnReview').onclick = startReview;
    $('#btnExitReview').onclick = exitReview;
    $('#btnAnalyse').onclick = runAnalyse;
    $('#btnResetStats').onclick = () => {
      S.stats = { hands: 0, dec: 0, pts: 0, max: 0, byTag: {}, byStreet: {}, byHand: {}, mistakes: [], reviews: 0, mastered: 0 };
      S.review = { items: [] };
      save(); saveReview(); updateReviewButton(); renderStats();
      // Eigene Notizen bleiben bewusst erhalten — die sind keine Statistik.
      if ($('#hpGrid').children.length) renderHpGrid();
    };

    $('#mwRun').onclick = runMultiway;

    /* --- Session-Auswertung --- */
    $('#wsFile').onchange = e => { wsHandleFiles(e.target.files); e.target.value = ''; };
    $('#wsClear').onclick = () => {
      if (!confirm('Alle gespeicherten Session-Zusammenfassungen loeschen?')) return;
      try { localStorage.removeItem(WSK); } catch (e) { }
      S.ws = null; $('#wsNote').textContent = 'geloescht'; renderSession();
    };

    /* --- Hand-Steckbriefe --- */
    const rs = $('#hpRange');
    rs.innerHTML = hpRanges().map(r => `<option value="${r.key}">${escapeHtml(r.label)}</option>`).join('');
    rs.value = S.hp.rangeKey;
    rs.onchange = () => { S.hp.rangeKey = rs.value; selectHand(S.hp.sel); };
    $('#hpColor').onchange = e => { S.hp.colorMode = e.target.value; renderHpGrid(); };

    /* --- Kopfrechnen --- */
    $('#mtNext').onclick = mtNew;
    $('#mtLevel').onchange = mtNew;
    $('#szDay').onchange = renderSizings;
    $('#mtReset').onclick = () => {
      S.mt = { right: 0, total: 0, streak: 0, best: 0 };
      try { localStorage.setItem('pt_mental', JSON.stringify(S.mt)); } catch (e) { }
      mtScore(); mtNew();
    };

    /* --- Range-Designer --- */
    $('#rdRun').onclick = runRangeDesigner;
    $('#scNew').onclick = scNewQuestion;
    $('#rfNew').onclick = rfNew;
    const setRd = o => { for (const k in o) $(k).value = o[k]; runRangeDesigner(); };
    $('#rdBubbleNow').onclick = () => setRd({
      '#rdHero': 12, '#rdLeft': 100, '#rdBubble': 1, '#rdAvg': 25,
      '#rdShorts': 10, '#rdShortBB': 3, '#rdBehind': 4
    });
    $('#rdShortest').onclick = () => setRd({
      '#rdHero': 5, '#rdLeft': 100, '#rdBubble': 1, '#rdAvg': 25,
      '#rdShorts': 10, '#rdShortBB': 8, '#rdBehind': 4
    });
    $('#rdDeep').onclick = () => setRd({
      '#rdHero': 12, '#rdLeft': 400, '#rdBubble': 300, '#rdAvg': 40,
      '#rdShorts': 40, '#rdShortBB': 8, '#rdBehind': 4
    });
    // Analyse-Presets
    const sel = $('#anPreset');
    sel.innerHTML = '<option value="">— Preset wählen —</option>' +
      P.SPOTS.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
    sel.onchange = () => {
      const s = P.SPOTS[sel.value]; if (!s) return;
      $('#anHeroRange').value = s.heroRange('mid');
      $('#anVillRange').value = s.villRange('mid');
      const g = P.geometry(s, 'mid');
      $('#anPot').value = g.pot; $('#anEff').value = g.eff;
    };
    $('#anHeroRange').value = P.RFI.BTN;
    $('#anVillRange').value = P.BB_FLAT.BTN;
    document.addEventListener('keydown', e => {
      // Bei offenem Dialog dürfen die Zifferntasten nicht die Frage dahinter
      // beantworten — Escape schließt ohne Änderung.
      if (!$('#settings').hidden) {
        if (e.key === 'Escape') closeSettings(false);
        return;
      }
      if ($('#askBox').hidden) {
        if (e.key === 'Enter') { (!$('#feedback').hidden ? $('#btnNext') : $('#btnNewHand')).click(); }
        return;
      }
      const btns = $$('#opts .opt');
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= btns.length) btns[n - 1].click();
    });
    newHand();
  }

  /* Diagnose-Haken. Die Chip-Erhaltung ist von außen nicht prüfbar, weil der
     Zustand im Modul gekapselt ist — ohne diesen Zugriff bliebe der
     Buchhaltungsfehler beim effektiven Stack unentdeckt.
     Invariante: pot + remH + remV bleibt über eine ganze Hand konstant. */
  window.__PT_STATE = () => ({
    pot: S.pot, eff: S.eff, invH: S.invH || 0, invV: S.invV || 0,
    remH: remH(), remV: remV(), street: S.street, finished: S.finished,
    mode: S.q && S.q.mode, optKeys: (S.q && S.q.optKeys) || [],
    allInAt: S.allInAt || null, reviewMode: S.reviewMode
  });

  // Je nach Ladeweg (file://, defer, Snapshot) kann DOMContentLoaded bereits
  // gefeuert haben, bevor dieser Listener registriert wird.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
