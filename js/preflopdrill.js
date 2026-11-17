/* =========================================================================
   preflopdrill.js — 15 Minuten Preflop: öffnen, callen, 3-betten.

   Anlass: die Preflop-Auswertung vom 17.11.2026 (tools/preflop) über 2.361
   eigene Hände. Zu tight war er kaum je — zu loose fast überall:
     - Opens aus EP/MP rund 1,7× so weit wie die Range, fast nur
       Offsuit-Broadways (QTo, KTo, KJo, JTo) und schwache Asse (A7o–A9o),
     - Cold-Calls aus MP/CO/BTN 25–38 % statt 5–8 %,
     - aus dem SB gecallt statt 3-Bet oder Fold.
   Der Drill fragt genau diese Entscheidungen ab, Hand für Hand.

   WAS "RICHTIG" HEISST — und wie belastbar das ist
   Richtig ist, was die Ranges des Trainers sagen (ranges.js, über
   rangeflow.js für Call- und 3-Bet-Ranges). Das sind Näherungen, keine
   Solver-Charts mit Ante. Wo das Modell für eine Positions-Kombination
   keine eigene Range hat, nimmt es die nächstliegende und sagt das dazu
   ("genähert"). Dieselbe Logik benutzt tools/preflop/preflop-report.js —
   Drill und Auswertung sprechen also dieselbe Sprache.

   WELCHE HÄNDE KOMMEN
   Nicht gleichverteilt: dann wäre "Fold" fast immer richtig und der Drill
   nutzlos. Etwa 40 % kommen aus der Range, der Rest knapp daneben — Hände,
   die eine Position weiter hinten gespielt würden, die der Opener selbst
   öffnet, und die Offsuit-Hände, an denen die Auswertung hängen blieb.
   Diese Schwerpunkte kommen aus dem Modell (wo die Range-Grenze liegt),
   nicht aus den eigenen Händen — im Repo steht nichts Privates.

   Ohne DOM: Frage bauen und bewerten lässt sich in Node testen.
   ========================================================================= */
(function () {
  const P = window.PT;

  const classSet = str => new Set(str ? P.parseRange(str).filter(x => x.w > 0).map(x => P.handClassOf(x.c)) : []);
  const bandOf = bb => bb <= 35 ? 'short' : 'mid';
  const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
  function weighted(list, r) {
    let x = r() * list.reduce((a, e) => a + e[1], 0);
    for (const e of list) { x -= e[1]; if (x <= 0) return e[0]; }
    return list[list.length - 1][0];
  }

  /* Die Offsuit-Hände, an denen die Auswertung hängen blieb, und schwache
     Suited-Hände — sie sollen oft kommen, auch wo sie klar Fold sind. */
  const TRAPS = ['A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'KJo', 'KTo', 'K9o', 'K8o', 'K7o', 'QJo', 'QTo', 'Q9o',
    'JTo', 'J9o', 'T9o', 'K8s', 'K6s', 'K4s', 'Q8s', 'Q7s', 'Q6s', 'J8s', 'J7s', 'T8s', '97s', '87s', '76s', '64s',
    '44', '33', '22', 'ATo', 'AJo', 'KQo'];

  /* Nach dem Open von Position X: wer handelt nach dir noch? (8er-Tisch:
     EP = UTG/UTG+1, MP = die beiden davor bis CO) */
  const BEHIND = { EP: 6, MP: 4, CO: 3, BTN: 2, SB: 1 };

  /* ---------------- Modell ---------------- */
  const OPEN_SRC = 'ranges.js RFI';
  function openModel(pos, band) {
    return { raise: classSet(P.adjustForStack(P.RFI[pos], band)), src: `${OPEN_SRC}.${pos}${band === 'short' ? ' (Kurzstack-Variante)' : ''}` };
  }

  /**
   * Call- und 3-Bet-Range für dich (hero) gegen das Open von v.
   * Lücken im Modell werden mit der nächstliegenden Range gefüllt und
   * im Text als "genähert" ausgewiesen.
   */
  function vsModel(h, v, band) {
    let ch = h, cv = v; const note = [];
    if ((h === 'EP' || h === 'MP') && (v === 'EP' || v === 'MP')) { ch = 'CO'; cv = 'EP'; note.push('genähert (CO gegen EP)'); }
    const RF = P.RangeFlow;
    const c = RF.preflopRanges('vOpen_hCall', ch, cv, band).hero, t = RF.preflopRanges('vOpen_h3b', ch, cv, band).hero;
    let call = c && c.str, tb = t && t.str, srcC = c && c.src, approxC = c && c.approx, src3 = t && t.src, approx3 = t && t.approx;
    if (!tb && ch === 'CO') { tb = P.THREEBET.BTN_vs_EP; src3 = '3-Bet BTN_vs_EP'; approx3 = true; }
    if (h === 'SB' && (v === 'EP' || v === 'MP')) { tb = P.THREEBET.BTN_vs_EP; src3 = '3-Bet BTN_vs_EP'; approx3 = true; }
    // Aus dem SB spielt das Modell 3-Bet oder Fold. "Spielbar" ist dort,
    // was der Button cold-callen würde — aber eben als 3-Bet.
    let sb = false;
    if (h === 'SB') {
      sb = true; approxC = false;
      call = (v === 'CO' || v === 'BTN') ? P.IP_FLAT.BTN_vs_CO : P.IP_FLAT.BTN_vs_MP;
      srcC = 'keine — SB spielt 3-Bet oder Fold; spielbar = Button-Cold-Call-Range';
    }
    const C = classSet(call), T = classSet(tb);
    const filled = closeGaps(C, T);
    if (filled.length) note.push(`Lücke zwischen Call- und 3-Bet-Range geschlossen (${filled.join(', ')} als Call)`);
    return {
      sb, call: C, tb: T,
      src: `Call: ${srcC || '—'}${approxC ? ' (genähert)' : ''} · 3-Bet: ${src3 || '—'}${approx3 ? ' (genähert)' : ''}${note.length ? ' · ' + note.join(', ') : ''}`
    };
  }

  /* Werden zwei Ranges aus verschiedenen Spots zusammengesetzt, fallen Hände
     dazwischen durch: BB gegen EP callt 22-99 und 3-bettet JJ+ — TT wäre
     dann ein Fold. Was eine gespielte Hand derselben Familie schlägt (höheres
     Paar, besserer Kicker bei gleicher hoher Karte und Farbe), wird
     mindestens gecallt. Ändert C, gibt die ergänzten Hände zurück. */
  function closeGaps(C, T) {
    const R = 'AKQJT98765432', added = [];
    const add = h => { if (!C.has(h) && !T.has(h)) { C.add(h); added.push(h); } };
    const played = h => C.has(h) || T.has(h);
    // Paare: alles zwischen dem schwächsten gecallten und dem stärksten Paar überhaupt
    for (let i = R.length - 1; i >= 0; i--) {
      const p = R[i] + R[i];
      if (C.has(p)) for (let j = i - 1; j >= 0; j--) add(R[j] + R[j]);
    }
    // Gleiche hohe Karte, gleiche Farbe: besserer Kicker — nur Broadway-Kicker
    // (T+). A5s-A2s ohne A6s-A9s ist kein Loch, sondern Absicht (Wheel-Blocker).
    const T_ = R.indexOf('T');
    for (const h of [...C]) {
      if (h.length !== 3) continue;
      const hi = R.indexOf(h[0]), lo = R.indexOf(h[1]);
      for (let k = Math.min(lo - 1, T_); k > hi; k--) { const better = h[0] + R[k] + h[2]; if (!played(better)) add(better); }
    }
    return added;
  }

  /** Was das Modell mit dieser Hand gegen das Open macht: Liste erlaubter Antworten. */
  function vsIdeal(m, hc) {
    const inC = m.call.has(hc), in3 = m.tb.has(hc);
    if (m.sb) return inC || in3 ? ['3B'] : ['FOLD'];
    const a = [];
    if (in3) a.push('3B');
    if (inC) a.push('CALL');
    return a.length ? a : ['FOLD'];
  }

  /* ---------------- Fragen bauen ---------------- */
  const OPEN_POS = [['EP', 30], ['MP', 25], ['CO', 15], ['BTN', 15], ['SB', 15]];
  const VS_SPOTS = [
    [['MP', 'EP'], 8], [['CO', 'EP'], 8], [['CO', 'MP'], 8], [['BTN', 'EP'], 7], [['BTN', 'MP'], 7], [['BTN', 'CO'], 8],
    [['SB', 'EP'], 6], [['SB', 'MP'], 6], [['SB', 'CO'], 7], [['SB', 'BTN'], 8],
    [['BB', 'EP'], 5], [['BB', 'MP'], 5], [['BB', 'CO'], 6], [['BB', 'BTN'], 7], [['BB', 'SB'], 4]
  ];
  const STACKS = { short: [20, 25, 30], mid: [40, 50, 60] };
  const NEXT_WIDER = { EP: 'MP', MP: 'CO', CO: 'BTN', BTN: 'BTN', SB: 'BTN' };

  function cardsFor(hc, r) {
    const S = 'cdhs', s1 = S[Math.floor(r() * 4)];
    let s2 = s1;
    if (hc.length === 2 || hc[2] === 'o') { do { s2 = S[Math.floor(r() * 4)]; } while (s2 === s1); }
    return [P.cardFromStr(hc[0] + s1), P.cardFromStr(hc[1] + s2)];
  }

  /** Hand ziehen: ~40 % aus der Range, der Rest knapp daneben. */
  function pickHand(inRange, near, r) {
    const a = [...inRange], b = [...near].filter(h => !inRange.has(h));
    if (b.length && (r() >= 0.4 || !a.length)) return pick(b, r);
    return pick(a, r);
  }

  /**
   * @param mode 'mix' | 'open' | 'vs'
   * @returns {type, pos, opener?, band, stack, hc, cards}
   */
  function make(mode, r) {
    r = r || P.rng;
    const type = mode === 'open' || mode === 'vs' ? mode : (r() < 0.5 ? 'open' : 'vs');
    const band = r() < 0.5 ? 'short' : 'mid', stack = pick(STACKS[band], r);
    if (type === 'open') {
      const pos = weighted(OPEN_POS, r), m = openModel(pos, band);
      const near = new Set([...classSet(P.adjustForStack(P.RFI[NEXT_WIDER[pos]], band)), ...TRAPS]);
      const hc = pickHand(m.raise, near, r);
      return { type, pos, band, stack, hc, cards: cardsFor(hc, r) };
    }
    const [pos, opener] = weighted(VS_SPOTS, r), m = vsModel(pos, opener, band);
    const playable = new Set([...m.call, ...m.tb]);
    const near = new Set([...classSet(P.adjustForStack(P.RFI[opener], band)), ...TRAPS]);
    const hc = pickHand(playable, near, r);
    return { type, pos, opener, band, stack, hc, cards: cardsFor(hc, r) };
  }

  /* ---------------- Bewerten ---------------- */
  const LABEL = { FOLD: 'Fold', LIMP: 'Limp', RAISE: 'Raise', CALL: 'Call', '3B': '3-Bet' };
  const offsuitNonPair = hc => hc.length === 3 && hc[2] === 'o';

  /**
   * @param key 'FOLD'|'LIMP'|'RAISE' (Open) bzw. 'FOLD'|'CALL'|'3B' (gegen Open)
   * @returns {right, grade:'ok'|'ok2'|'warn'|'bad', ideal:[keys], why, model}
   */
  function grade(q, key) {
    if (q.type === 'open') {
      const m = openModel(q.pos, q.band), inR = m.raise.has(q.hc);
      const ideal = [inR ? 'RAISE' : 'FOLD'];
      let g = key === ideal[0] ? 'ok' : 'bad', why;
      if (key === 'LIMP' && q.pos === 'SB' && inR) {
        g = 'ok2';
        why = 'Das Modell kennt aus dem SB nur Raise oder Fold. Ein Limp kann als eigene Strategie vertretbar sein — aber nur, wenn du auch starke Hände limpst, sonst liest der BB deine Limps als schwach.';
      } else if (key === 'LIMP') {
        why = `Open-Limps gibt es im Modell nicht: ${inR ? 'die Hand ist gut genug zum Raisen' : 'die Hand gehört gefoldet'}. Hinter dem Limp bekommst du Iso-Raises und Mehrweg-Pots ohne Initiative.`;
      } else if (inR && key === 'FOLD') {
        why = `${q.hc} steht in der Open-Range aus ${q.pos}. Liegen lassen kostet hier zwar weniger als ein falscher Open — aber es ist Geld, das du nicht abholst.`;
      } else if (!inR && key === 'RAISE') {
        why = `${q.hc} ist aus ${q.pos} zu schwach: hinter dir sitzen noch etwa ${BEHIND[q.pos]} Spieler.` +
          (offsuitNonPair(q.hc) ? ' Offsuit ist die Hand leicht dominiert — wer dich callt oder 3-bettet, hat oft dieselbe hohe Karte mit besserem Kicker.' : '');
      } else {
        why = inR ? `${q.hc} gehört aus ${q.pos} in die Open-Range.` : `${q.hc} liegt aus ${q.pos} außerhalb der Open-Range.`;
      }
      return { right: g === 'ok' || g === 'ok2', grade: g, ideal, why, model: m };
    }
    const m = vsModel(q.pos, q.opener, q.band), ideal = vsIdeal(m, q.hc);
    let g = ideal.includes(key) ? 'ok' : 'bad', why;
    const play = ideal[0] !== 'FOLD';
    if (g === 'ok') {
      why = !play ? `${q.hc} liegt gegen ein Open aus ${q.opener} außerhalb von Call- und 3-Bet-Range.`
        : m.sb ? `Aus dem SB: ${q.hc} ist spielbar — als 3-Bet. Callen würde den BB hinter dir billig mitspielen lassen.`
        : ideal.length > 1 ? `${q.hc} steht in beiden Ranges — Call und 3-Bet sind vertretbar.`
        : `${q.hc}: ${LABEL[ideal[0]]} gegen ${q.opener} ist die Antwort des Modells.`;
    } else if (play && key !== 'FOLD') {
      g = 'warn';
      why = m.sb ? 'Aus dem SB nicht callen: du bist ohne Position, und der BB kann hinter dir squeezen oder billig mitspielen. Mit dieser Hand: 3-Bet.'
        : key === '3B' ? `${q.hc} steht in der Call-Range, nicht in der 3-Bet-Range — gegen ${q.opener} spielt das Modell sie flach.`
        : `${q.hc} ist zum Flatten zu stark: das Modell 3-bettet sie gegen ${q.opener}.`;
    } else if (!play) {
      why = `${q.hc} liegt außerhalb von Call- und 3-Bet-Range gegen ${q.opener}. Seine Open-Range ist ${q.opener === 'EP' || q.opener === 'MP' ? 'eng und stark' : 'breit, aber du bist nicht der letzte Spieler'}` +
        (offsuitNonPair(q.hc) ? ' — und offsuit bist du gegen seine besseren Hände mit derselben hohen Karte oft dominiert.' : '.') +
        (q.pos === 'SB' ? ' Aus dem SB zählt das doppelt: ohne Position, BB dahinter.' : '');
    } else {
      why = `${q.hc} ist gegen ${q.opener} spielbar (${ideal.map(k => LABEL[k]).join(' oder ')}). Folden ist hier der Fehler — wenn auch der billigere.`;
    }
    if (q.band === 'short' && ideal.includes('3B')) why += ` Bei ${q.stack}bb ist eine 3-Bet meist ein All-in.`;
    return { right: g === 'ok', grade: g, ideal, why, model: m };
  }

  /** Für die Rasterdarstellung: Antwort des Modells je Handklasse. */
  function idealFor(q, hc) {
    if (q.type === 'open') return openModel(q.pos, q.band).raise.has(hc) ? 'RAISE' : 'FOLD';
    return vsIdeal(vsModel(q.pos, q.opener, q.band), hc)[0];
  }

  function text(q) {
    if (q.type === 'open') return `Alle folden zu dir in <b>${q.pos}</b>. Du hast <b>${q.stack}bb</b>.`;
    return `<b>${q.opener}</b> öffnet auf ${q.band === 'short' ? '2' : '2,2'}bb, alle folden zu dir in <b>${q.pos}</b>. Effektiv <b>${q.stack}bb</b>.`;
  }
  const options = q => q.type === 'open' ? ['FOLD', 'LIMP', 'RAISE'] : ['FOLD', 'CALL', '3B'];
  /** Schlüssel für die Wiederholung: dieselbe Entscheidung, nicht dieselben Farben. */
  const keyOf = q => [q.type, q.pos, q.opener || '', q.band, q.hc].join('|');

  P.PreflopDrill = { make, grade, idealFor, text, options, keyOf, openModel, vsModel, vsIdeal, classSet, bandOf, LABEL, TRAPS };
})();
