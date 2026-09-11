/* =========================================================================
   engine.js — Karten, Hand-Evaluator, Range-Parser, Equity, Board-Analyse
   Das ist der "Flopzilla-Kern": alles wird live gerechnet, nichts ist
   hartkodiert.
   Karten-Encoding: int 0..51,  rank = c >> 2 (0='2' .. 12='A'),  suit = c & 3
   ========================================================================= */

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const SUIT_SYM = { c: '♣', d: '♦', h: '♥', s: '♠' };

function cardFromStr(s) {
  const r = RANKS.indexOf(s[0].toUpperCase());
  const u = SUITS.indexOf(s[1].toLowerCase());
  if (r < 0 || u < 0) throw new Error('Ungültige Karte: ' + s);
  return r * 4 + u;
}
function cardToStr(c) { return RANKS[c >> 2] + SUITS[c & 3]; }
function rankOf(c) { return c >> 2; }
function suitOf(c) { return c & 3; }
function fullDeck() { const d = []; for (let i = 0; i < 52; i++) d.push(i); return d; }

/* ------------------------------------------------------------------ *
 * 7-Karten-Evaluator. Liefert einen Score; höher = besser.
 * Kategorien: 8=StraightFlush 7=Quads 6=FullHouse 5=Flush 4=Straight
 *             3=Trips 2=TwoPair 1=Pair 0=HighCard
 * ------------------------------------------------------------------ */
const CAT_NAMES = ['High Card', 'Paar', 'Two Pair', 'Drilling', 'Straight',
  'Flush', 'Full House', 'Quads', 'Straight Flush'];

function maskToRanksDesc(mask) {
  const out = [];
  for (let r = 12; r >= 0; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

/** Höchste Karte einer Straight im Rank-Bitmask, sonst -1. */
function straightHigh(mask) {
  for (let hi = 12; hi >= 4; hi--) {
    const need = (1 << hi) | (1 << (hi - 1)) | (1 << (hi - 2)) | (1 << (hi - 3)) | (1 << (hi - 4));
    if ((mask & need) === need) return hi;
  }
  // Rad: A-2-3-4-5
  if ((mask & (1 << 12)) && (mask & 0b1111) === 0b1111) return 3;
  return -1;
}

function mkScore(cat, ks) {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 15 + (ks[i] === undefined ? 0 : ks[i] + 1);
  return s;
}
function catOfScore(score) { return Math.floor(score / 759375); }

function evaluate(cards) {
  const rankCount = new Array(13).fill(0);
  const suitCount = [0, 0, 0, 0];
  const suitMask = [0, 0, 0, 0];
  let rankMask = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i], r = c >> 2, u = c & 3;
    rankCount[r]++; suitCount[u]++; suitMask[u] |= 1 << r; rankMask |= 1 << r;
  }
  let flushSuit = -1;
  for (let u = 0; u < 4; u++) if (suitCount[u] >= 5) flushSuit = u;
  if (flushSuit >= 0) {
    const m = suitMask[flushSuit];
    const sf = straightHigh(m);
    if (sf >= 0) return mkScore(8, [sf]);
    return mkScore(5, maskToRanksDesc(m).slice(0, 5));
  }
  const trips = [], pairs = [];
  let quad = -1;
  for (let r = 12; r >= 0; r--) {
    if (rankCount[r] === 4) quad = r;
    else if (rankCount[r] === 3) trips.push(r);
    else if (rankCount[r] === 2) pairs.push(r);
  }
  if (quad >= 0) {
    const kick = maskToRanksDesc(rankMask & ~(1 << quad))[0];
    return mkScore(7, [quad, kick]);
  }
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const t = trips[0];
    const p = trips.length > 1 ? Math.max(trips[1], pairs.length ? pairs[0] : -1) : pairs[0];
    return mkScore(6, [t, p]);
  }
  const st = straightHigh(rankMask);
  if (st >= 0) return mkScore(4, [st]);
  if (trips.length) {
    const t = trips[0];
    return mkScore(3, [t, ...maskToRanksDesc(rankMask & ~(1 << t)).slice(0, 2)]);
  }
  if (pairs.length >= 2) {
    const [p1, p2] = pairs;
    const k = maskToRanksDesc(rankMask & ~(1 << p1) & ~(1 << p2))[0];
    return mkScore(2, [p1, p2, k]);
  }
  if (pairs.length === 1) {
    const p = pairs[0];
    return mkScore(1, [p, ...maskToRanksDesc(rankMask & ~(1 << p)).slice(0, 3)]);
  }
  return mkScore(0, maskToRanksDesc(rankMask).slice(0, 5));
}

/* ------------------------------------------------------------------ *
 * Range-Parser.  Unterstützt:
 *   AA  KK+  77-22  AKs  AQo+  A5s-A2s  T9s-76s  KQ  AhKd  AKs:0.5
 * ------------------------------------------------------------------ */
function handToCombos(h) {
  const out = [];
  const r1 = RANKS.indexOf(h[0]), r2 = RANKS.indexOf(h[1]);
  const type = h[2];
  if (r1 === r2) {
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) out.push([r1 * 4 + a, r1 * 4 + b]);
  } else if (type === 's') {
    for (let u = 0; u < 4; u++) out.push([r1 * 4 + u, r2 * 4 + u]);
  } else {
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (a !== b) out.push([r1 * 4 + a, r2 * 4 + b]);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Token-Grammatik.
 *
 * Bis hierher hat der Parser bei einem Token, das er nicht verstand,
 * still etwas anderes geliefert statt es zu melden:
 *
 *   'AsK'    -> 12 Kombos (gelesen als AKo) statt "A♠ und irgendein König"
 *   'Kh Th'  -> 0 Kombos, das Token verschwindet komplett
 *
 * Beides fällt nirgends auf: die Equity kommt trotzdem, sie ist nur
 * falsch. Deshalb entscheidet ab jetzt eine explizite Grammatik, was ein
 * gültiges Token ist; alles andere wird über `parseRangeStrict` gemeldet
 * — dieselbe Regel wie bei den Aktions-Codes in w2d.js (`unknownTypes`).
 * ------------------------------------------------------------------ */
const RE_COMBO = /^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/i;
const RE_HAND = /^([2-9TJQKA])([2-9TJQKA])([so]?)$/i;

/**
 * Zerlegt eine Hand-Klasse ('AA', 'AK', 'AKs', 'AKo').
 * @returns {{hi:int, lo:int, t:string, pair:boolean}} oder null
 */
function parseHandTok(x) {
  const m = RE_HAND.exec(String(x).trim());
  if (!m) return null;
  const a = RANKS.indexOf(m[1].toUpperCase()), b = RANKS.indexOf(m[2].toUpperCase());
  const t = m[3].toLowerCase();
  // Ein Paar ist nie suited oder offsuit — "AAs" ist keine Notation.
  if (a === b) return t ? null : { hi: a, lo: a, t: '', pair: true };
  return { hi: Math.max(a, b), lo: Math.min(a, b), t, pair: false };
}

/**
 * Erweitert ein Token zu Hand-Klassen ('AKs') bzw. expliziten Kombos ('#AhKd').
 * @returns Array oder null, wenn das Token keine gültige Notation ist.
 */
function expandToken(tok) {
  tok = String(tok).trim();
  if (!tok) return null;

  // explizite Kombo, z.B. AhKd
  if (RE_COMBO.test(tok)) {
    if (cardFromStr(tok.slice(0, 2)) === cardFromStr(tok.slice(2, 4))) return null; // "AsAs"
    return ['#' + tok];
  }

  // Plus-Notation: 77+  A9s+  KTo+  AK+
  if (tok.endsWith('+')) {
    const h = parseHandTok(tok.slice(0, -1));
    if (!h) return null;
    const out = [];
    if (h.pair) { for (let r = h.hi; r <= 12; r++) out.push(RANKS[r] + RANKS[r]); return out; }
    for (let r = h.lo; r < h.hi; r++) {
      if (h.t) out.push(RANKS[h.hi] + RANKS[r] + h.t);
      else { out.push(RANKS[h.hi] + RANKS[r] + 's'); out.push(RANKS[h.hi] + RANKS[r] + 'o'); }
    }
    return out;
  }

  // Range-Notation X-Y: 77-22  A5s-A2s  T9s-76s
  if (tok.includes('-')) {
    const parts = tok.split('-');
    if (parts.length !== 2) return null;
    const n1 = parseHandTok(parts[0]), n2 = parseHandTok(parts[1]);
    if (!n1 || !n2 || n1.pair !== n2.pair) return null;
    const out = [];
    if (n1.pair) {
      for (let r = Math.min(n1.hi, n2.hi); r <= Math.max(n1.hi, n2.hi); r++) out.push(RANKS[r] + RANKS[r]);
      return out;
    }
    // Ohne gleiches Suffix auf beiden Seiten ist die Strecke mehrdeutig
    // ("A5s-A2" hiess bisher still "gar nichts").
    if (!n1.t || n1.t !== n2.t) return null;
    if (n1.hi === n2.hi) { // A5s-A2s
      for (let r = Math.min(n1.lo, n2.lo); r <= Math.max(n1.lo, n2.lo); r++) out.push(RANKS[n1.hi] + RANKS[r] + n1.t);
      return out;
    }
    if (n1.hi - n1.lo === n2.hi - n2.lo) { // T9s-76s (gleicher Gap)
      const gap = n1.hi - n1.lo;
      for (let h = Math.min(n1.hi, n2.hi); h <= Math.max(n1.hi, n2.hi); h++) out.push(RANKS[h] + RANKS[h - gap] + n1.t);
      return out;
    }
    // Weder gleiche hohe Karte noch gleicher Gap: bisher wurden still nur
    // die beiden Endpunkte zurückgegeben, nicht die gemeinte Strecke.
    return null;
  }

  // Einzelne Hand-Klasse; "KQ" ohne Suffix => KQs + KQo
  const h = parseHandTok(tok);
  if (!h) return null;
  if (h.pair) return [RANKS[h.hi] + RANKS[h.lo]];
  if (h.t) return [RANKS[h.hi] + RANKS[h.lo] + h.t];
  return [RANKS[h.hi] + RANKS[h.lo] + 's', RANKS[h.hi] + RANKS[h.lo] + 'o'];
}

/**
 * Wie parseRange, meldet aber zusätzlich jedes Token, das nicht gelesen
 * werden konnte — statt es still zu verwerfen oder umzudeuten.
 * @returns {{range:Array<{c:[int,int], w:number}>, unknown:Array<{token:string, reason:string}>}}
 */
function parseRangeStrict(str) {
  const map = new Map();
  const unknown = [];
  for (const rawTok of String(str).split(/[,\s]+/)) {
    if (!rawTok) continue;
    let tok = rawTok, w = 1;
    if (tok.includes(':')) {
      const p = tok.split(':');
      tok = p[0]; w = parseFloat(p[1]);
      if (p.length !== 2 || !isFinite(w) || w <= 0 || w > 1) {
        unknown.push({ token: rawTok, reason: 'ungültiges Gewicht, erwartet wird 0 < w <= 1' });
        continue;
      }
    }
    const hands = expandToken(tok);
    if (!hands || !hands.length) {
      unknown.push({ token: rawTok, reason: 'keine gültige Range-Notation' });
      continue;
    }
    for (const h of hands) {
      let combos;
      if (h[0] === '#') {
        const s = h.slice(1);
        combos = [[cardFromStr(s.slice(0, 2)), cardFromStr(s.slice(2, 4))]];
      } else combos = handToCombos(h);
      for (const c of combos) {
        const key = Math.min(c[0], c[1]) * 52 + Math.max(c[0], c[1]);
        map.set(key, { c: [Math.max(c[0], c[1]), Math.min(c[0], c[1])], w });
      }
    }
  }
  return { range: [...map.values()], unknown };
}

/**
 * @returns Array<{c:[int,int], w:number}>  — dedupliziert
 * Unlesbare Tokens werden übersprungen; wer sie sehen will, nimmt
 * parseRangeStrict oder validateRange.
 */
function parseRange(str) { return parseRangeStrict(str).range; }

/**
 * Menschenlesbare Meldungen zu allem, was der Parser an einem Range-String
 * nicht versteht. Leeres Array = alles gelesen.
 * @returns Array<string>
 */
function validateRange(str) {
  return parseRangeStrict(str).unknown.map(u => `"${u.token}": ${u.reason}`);
}

/** Entfernt alle Kombos, die mit board/dead kollidieren. */
function filterRange(range, dead) {
  const blocked = new Set(dead);
  return range.filter(x => !blocked.has(x.c[0]) && !blocked.has(x.c[1]));
}

function comboToStr(c) {
  const [a, b] = c[0] > c[1] ? [c[0], c[1]] : [c[1], c[0]];
  return cardToStr(a) + cardToStr(b);
}
function handClassOf(c) {
  const r1 = rankOf(c[0]), r2 = rankOf(c[1]);
  const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  if (r1 === r2) return RANKS[hi] + RANKS[lo];
  return RANKS[hi] + RANKS[lo] + (suitOf(c[0]) === suitOf(c[1]) ? 's' : 'o');
}

/* ------------------------------------------------------------------ *
 * Hand-Klassifikation auf einem Board (Flopzilla-Buckets)
 * ------------------------------------------------------------------ */
const MADE = {
  SF: 'Straight Flush', QUADS: 'Quads', BOAT: 'Full House', FLUSH: 'Flush',
  STRAIGHT: 'Straight', SET: 'Set', TRIPS: 'Trips', TWOPAIR: 'Two Pair',
  OVERPAIR: 'Overpair', TPTK: 'Top Pair Top Kicker', TP: 'Top Pair',
  PP_MID: 'Pocket Pair (mid)', SECOND: 'Second Pair', THIRD: 'Third Pair',
  WEAKPAIR: 'schwaches Paar', ACEHIGH: 'Ace High', AIR: 'Air',
  // Die Hand steht schon auf dem Board — jeder am Tisch hat sie.
  BOARD: 'Board spielt'
};

/** Detaillierte Einordnung von hole (2 Karten) auf board (3-5 Karten). */
function classify(hole, board) {
  const all = hole.concat(board);
  const score = evaluate(all);
  const cat = catOfScore(score);
  const boardRanks = [...new Set(board.map(rankOf))].sort((a, b) => b - a);
  const maxBoard = boardRanks[0];
  const hr = [rankOf(hole[0]), rankOf(hole[1])].sort((a, b) => b - a);
  const boardCount = {};
  board.forEach(c => { boardCount[rankOf(c)] = (boardCount[rankOf(c)] || 0) + 1; });

  // --- Draws (nur relevant vor dem River) ---
  const draws = [];
  let hasFD = false, hasNutFD = false, hasBDFD = false, hasOESD = false, hasGutshot = false;
  if (board.length < 5 && cat < 5) {
    // Flushdraw
    const sc = [0, 0, 0, 0];
    all.forEach(c => sc[suitOf(c)]++);
    for (let u = 0; u < 4; u++) {
      const inHole = (suitOf(hole[0]) === u ? 1 : 0) + (suitOf(hole[1]) === u ? 1 : 0);
      if (sc[u] === 4 && inHole >= 1) {
        const myTop = Math.max(...hole.filter(c => suitOf(c) === u).map(rankOf));
        hasFD = true;
        /* Nut-Flushdraw heißt: keine UNGESEHENE Karte dieser Farbe ist höher
           als deine. Höhere Karten auf dem BOARD zählen nicht — die spielen
           für alle mit; geschlagen wirst du nur von einer höheren Karte in
           einer fremden Hand. Vorher lief die Prüfung gegen `all`, also gegen
           die SICHTBAREN Karten. Damit galt jeder Draw als Nut-Draw, sobald
           deine eigenen Karten die höchsten sichtbaren der Farbe waren. */
        const seen = new Set(all);
        hasNutFD = true;
        for (let r = myTop + 1; r < 13; r++) {
          if (!seen.has((r << 2) | u)) { hasNutFD = false; break; }
        }
        draws.push(hasNutFD ? 'Nut-Flushdraw' : 'Flushdraw');
        break;
      }
      /* Nur am FLOP: mit einer Karte zu kommen ist ein 3-Flush wertlos. */
      if (board.length === 3 && sc[u] === 3 && inHole === 2) { hasBDFD = true; draws.push('Backdoor-Flushdraw'); break; }
    }
    // Straightdraws
    if (cat < 4) {
      let mask = 0; all.forEach(c => mask |= 1 << rankOf(c));
      let bmask = 0; board.forEach(c => bmask |= 1 << rankOf(c));
      let outs = 0;
      for (let r = 0; r < 13; r++) {
        if (mask & (1 << r)) continue;
        // nur zählen, wenn die eigene Hand an der Straight beteiligt ist
        if (straightHigh(mask | (1 << r)) >= 0 && straightHigh(bmask | (1 << r)) < 0) outs++;
      }
      if (outs >= 2) { hasOESD = true; draws.push('OESD / Double Gutshot'); }
      else if (outs === 1) { hasGutshot = true; draws.push('Gutshot'); }
    }
  }

  /* ---------------------------------------------------------------- *
   * Trägt die eigene Hand überhaupt etwas bei?
   *
   * Der Evaluator bewertet fünf Karten und interessiert sich nicht dafür,
   * woher sie kommen. Auf K♠2♦2♣2♥ hat 8♠5♠ nach Pokerregeln korrekt
   * "Trips" — nur liegen die drei Zweien auf dem Board, jeder am Tisch hat
   * sie, und die Hand schlägt real 9 % der Gegner-Range. Ohne diese
   * Unterscheidung stufte tierOf sie als STRONG ein und die Strategie
   * empfahl eine Value-Bet mit Acht-hoch. Dasselbe galt für Board-Straights
   * und Board-Flushes bis hinauf zum Royal Flush.
   * ---------------------------------------------------------------- */
  const bSuitCnt = [0, 0, 0, 0], bSuitMask = [0, 0, 0, 0];
  let bMask = 0;
  for (const c of board) { bSuitCnt[suitOf(c)]++; bSuitMask[suitOf(c)] |= 1 << rankOf(c); bMask |= 1 << rankOf(c); }
  const bTrip = boardRanks.filter(r => boardCount[r] >= 3);
  const bQuad = boardRanks.filter(r => boardCount[r] >= 4);
  const bPair = boardRanks.filter(r => boardCount[r] === 2);
  let bFlushSuit = -1;
  for (let u = 0; u < 4; u++) if (bSuitCnt[u] >= 5) bFlushSuit = u;
  const bStraight = straightHigh(bMask);
  const holds = r => hr[0] === r || hr[1] === r;
  const isPocket = hr[0] === hr[1];

  let rankMaskAll = 0;
  const allSuitCnt = [0, 0, 0, 0], allSuitMask = [0, 0, 0, 0];
  for (const c of all) {
    rankMaskAll |= 1 << rankOf(c);
    allSuitCnt[suitOf(c)]++; allSuitMask[suitOf(c)] |= 1 << rankOf(c);
  }
  let myFlushSuit = -1;
  for (let u = 0; u < 4; u++) if (allSuitCnt[u] >= 5) myFlushSuit = u;

  /** true, wenn die Kategorie allein vom Board kommt. */
  function boardOwnsCategory() {
    if (cat === 8) {
      if (bFlushSuit < 0 || myFlushSuit < 0) return false;
      // Das Board bildet denselben Straight Flush schon allein.
      return straightHigh(bSuitMask[bFlushSuit]) === straightHigh(allSuitMask[myFlushSuit]);
    }
    if (cat === 7) return bQuad.length > 0 && !holds(bQuad[0]);
    if (cat === 6) return bTrip.length > 0 && (bPair.length > 0 || bTrip.length > 1)
      && !holds(bTrip[0]) && !(isPocket && boardCount[hr[0]]);
    if (cat === 5) {
      if (bFlushSuit < 0) return false;
      // Die Hand verbessert nur, wenn sie eine höhere Karte dieser Farbe hält
      // als die fünfthöchste des Boards.
      const bRanksOfSuit = maskToRanksDesc(bSuitMask[bFlushSuit]);
      const fifth = bRanksOfSuit[4];
      const mine = [hole[0], hole[1]].filter(c => suitOf(c) === bFlushSuit).map(rankOf);
      return !mine.some(r => r > fifth);
    }
    if (cat === 4) return bStraight >= 0 && straightHigh(rankMaskAll) === bStraight;
    if (cat === 3) return bTrip.length > 0 && !holds(bTrip[0]);
    if (cat === 2) {
      if (bPair.length >= 2) {
        // Beide Paare auf dem Board: die eigene Hand zählt nur als Kicker.
        return !holds(bPair[0]) && !holds(bPair[1]) && !isPocket;
      }
      return false;
    }
    if (cat === 1) {
      // Das Paar liegt auf dem Board und die eigenen Karten treffen nichts.
      return bPair.length > 0 && !isPocket && !hr.some(r => boardCount[r]);
    }
    return false;
  }
  const boardPlays = boardOwnsCategory();

  /* Ein Pocket-Paar gegen die Board-Ränge einordnen. */
  function pocketLabel() {
    return hr[0] > maxBoard ? MADE.OVERPAIR
      : (boardRanks.length > 1 && hr[0] > boardRanks[1] ? MADE.PP_MID : MADE.WEAKPAIR);
  }
  /* Eine Board-Karte gepaart: welches Paar ist es, und mit welchem Kicker? */
  function hitLabel(paired) {
    const idx = boardRanks.indexOf(paired);
    const kicker = hr.find(r => r !== paired);
    if (idx === 0) {
      // TPTK = bester möglicher Kicker: Ass, oder König wenn kein Ass liegt
      return (kicker === 12 || (kicker === 11 && maxBoard !== 12)) ? MADE.TPTK : MADE.TP;
    }
    if (idx === 1) return MADE.SECOND;
    if (idx === 2) return MADE.THIRD;
    return MADE.WEAKPAIR;
  }

  let made;
  if (boardPlays) made = MADE.BOARD;
  else if (cat === 8) made = MADE.SF;
  else if (cat === 7) made = MADE.QUADS;
  else if (cat === 6) made = MADE.BOAT;
  else if (cat === 5) made = MADE.FLUSH;
  else if (cat === 4) made = MADE.STRAIGHT;
  else if (cat === 3) {
    made = (hr[0] === hr[1]) ? MADE.SET : MADE.TRIPS;
  } else if (cat === 2) {
    /* "Two Pair" ist auf einem GEPAARTEN Board fast immer irreführend: eines
       der beiden Paare liegt dann am Board und gehört jedem. Auf 9♠4♥9♣Q♥
       bekamen 33, TT, KK und Q5 zuvor alle dasselbe Etikett und alle tier
       STRONG — vom Underpair bis zum Overpair. Entscheidend ist, was die
       eigenen Karten beitragen. */
    if (!bPair.length) made = MADE.TWOPAIR;          // beide Paare aus eigener Hand
    else if (isPocket) made = pocketLabel();         // Board-Paar + eigenes Pocket
    else {
      const paired = hr.find(r => boardCount[r]);
      made = paired === undefined ? MADE.BOARD : hitLabel(paired);
    }
  } else if (cat === 1) {
    made = (hr[0] === hr[1]) ? pocketLabel() : hitLabel(hr.find(r => boardCount[r]));
  } else {
    made = (hr[0] === 12) ? MADE.ACEHIGH : MADE.AIR;
  }
  return { score, cat, made, boardPlays, draws, hasFD, hasNutFD, hasBDFD, hasOESD, hasGutshot };
}

/** Gröbere Wertigkeitsstufe für Strategie-Logik: 0=Air .. 5=Nuts-nah */
const TIER = { AIR: 0, WEAK: 1, MARGINAL: 2, MEDIUM: 3, STRONG: 4, NUTTED: 5 };
function tierOf(cls) {
  const m = cls.made;
  // Steht die Hand schon auf dem Board, hat sie jeder — kein eigener Wert.
  if (m === MADE.BOARD) return TIER.AIR;
  if ([MADE.SF, MADE.QUADS, MADE.BOAT, MADE.FLUSH, MADE.STRAIGHT, MADE.SET].includes(m)) return TIER.NUTTED;
  if ([MADE.TRIPS, MADE.TWOPAIR].includes(m)) return TIER.STRONG;
  if ([MADE.OVERPAIR, MADE.TPTK].includes(m)) return TIER.STRONG;
  if (m === MADE.TP) return TIER.MEDIUM;
  if ([MADE.SECOND, MADE.PP_MID].includes(m)) return TIER.MARGINAL;
  if ([MADE.THIRD, MADE.WEAKPAIR].includes(m)) return TIER.WEAK;
  return TIER.AIR;
}

/* ------------------------------------------------------------------ *
 * Equity
 * ------------------------------------------------------------------ */
function shuffleInto(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
}
let _seed = 123456789;
function rng() { _seed ^= _seed << 13; _seed ^= _seed >>> 17; _seed ^= _seed << 5; return ((_seed >>> 0) / 4294967296); }
function seedRng(s) { _seed = (s | 0) || 123456789; }

/** Equity einer konkreten Hand gegen eine Range auf einem Board. */
function equityVsRange(hole, range, board, maxSims) {
  const dead = new Set(hole.concat(board));
  const vr = range.filter(x => !dead.has(x.c[0]) && !dead.has(x.c[1]));
  if (!vr.length) return { eq: 0.5, n: 0 };
  const toCome = 5 - board.length;
  const deckBase = fullDeck().filter(c => !dead.has(c));
  let win = 0, tie = 0, tot = 0, wsum = 0;

  const exactRunouts = toCome === 0 ? 1 : toCome === 1 ? 45 : 990;
  // Der Exakt-Pfad deckt höchstens zwei Karten auf. Preflop (5 to come) würde
  // er stillschweigend falsch rechnen, deshalb dort immer Monte Carlo.
  const exact = toCome <= 2 && vr.length * exactRunouts <= (maxSims || 250000);

  if (exact) {
    for (const v of vr) {
      const d2 = deckBase.filter(c => c !== v.c[0] && c !== v.c[1]);
      const hv = hole.concat(board), vv = v.c.concat(board);
      const run = (extra) => {
        const hs = evaluate(hv.concat(extra)), vs = evaluate(vv.concat(extra));
        tot += v.w;
        if (hs > vs) { win += v.w; wsum += v.w; }
        else if (hs === vs) { tie += v.w; wsum += 0.5 * v.w; }
      };
      if (toCome === 0) run([]);
      else if (toCome === 1) { for (let i = 0; i < d2.length; i++) run([d2[i]]); }
      else { for (let i = 0; i < d2.length; i++) for (let j = i + 1; j < d2.length; j++) run([d2[i], d2[j]]); }
    }
  } else {
    const N = maxSims || 20000;
    const totW = vr.reduce((a, x) => a + x.w, 0);
    for (let s = 0; s < N; s++) {
      let pick = rng() * totW, v = vr[0];
      for (const x of vr) { pick -= x.w; if (pick <= 0) { v = x; break; } }
      const d2 = deckBase.filter(c => c !== v.c[0] && c !== v.c[1]);
      const extra = [];
      for (let k = 0; k < toCome; k++) {
        const idx = (rng() * d2.length) | 0;
        extra.push(d2[idx]); d2.splice(idx, 1);
      }
      const hs = evaluate(hole.concat(board, extra));
      const vs = evaluate(v.c.concat(board, extra));
      tot += 1;
      if (hs > vs) { win++; wsum += 1; } else if (hs === vs) { tie++; wsum += 0.5; }
    }
  }
  return { eq: tot ? wsum / tot : 0.5, win: win / tot, tie: tie / tot, n: tot };
}

/** Range vs Range Equity (Monte Carlo). */
function rangeVsRange(rA, rB, board, N) {
  N = N || 12000;
  const dead = new Set(board);
  const a = rA.filter(x => !dead.has(x.c[0]) && !dead.has(x.c[1]));
  const b = rB.filter(x => !dead.has(x.c[0]) && !dead.has(x.c[1]));
  if (!a.length || !b.length) return 0.5;
  const toCome = 5 - board.length;
  const deckBase = fullDeck().filter(c => !dead.has(c));
  let sum = 0, n = 0;
  for (let s = 0; s < N; s++) {
    const ha = a[(rng() * a.length) | 0].c;
    let hb = null;
    for (let t = 0; t < 8; t++) {
      const cand = b[(rng() * b.length) | 0].c;
      if (cand[0] !== ha[0] && cand[0] !== ha[1] && cand[1] !== ha[0] && cand[1] !== ha[1]) { hb = cand; break; }
    }
    if (!hb) continue;
    const d2 = deckBase.filter(c => c !== ha[0] && c !== ha[1] && c !== hb[0] && c !== hb[1]);
    const extra = [];
    for (let k = 0; k < toCome; k++) {
      const idx = (rng() * d2.length) | 0;
      extra.push(d2[idx]); d2.splice(idx, 1);
    }
    const sa = evaluate(ha.concat(board, extra));
    const sb = evaluate(hb.concat(board, extra));
    if (sa > sb) sum += 1; else if (sa === sb) sum += 0.5;
    n++;
  }
  return n ? sum / n : 0.5;
}

/* ------------------------------------------------------------------ *
 * Board-Analyse: Nuts, Textur, Range-Buckets
 * ------------------------------------------------------------------ */

/** Alle 1326 Kombos auf dem Board sortiert -> die besten möglichen Hände. */
function nutsOnBoard(board, topN) {
  topN = topN || 5;
  const dead = new Set(board);
  const deck = fullDeck().filter(c => !dead.has(c));
  const list = [];
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const sc = evaluate([deck[i], deck[j]].concat(board));
      list.push({ c: [deck[i], deck[j]], sc });
    }
  }
  list.sort((x, y) => y.sc - x.sc);
  // nach Score gruppieren, damit "die Nuts" nicht 4x dasselbe zeigen
  const out = [];
  const seen = new Set();
  for (const it of list) {
    const cls = classify(it.c, board);
    const key = it.sc;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ combo: it.c, label: comboToStr(it.c), made: cls.made, score: it.sc });
    if (out.length >= topN) break;
  }
  return out;
}

function boardTexture(board) {
  const ranks = board.map(rankOf).sort((a, b) => b - a);
  const uniq = [...new Set(ranks)];
  const suits = board.map(suitOf);
  const sc = [0, 0, 0, 0]; suits.forEach(s => sc[s]++);
  const maxSuit = Math.max(...sc);
  const paired = uniq.length < ranks.length;
  const trips = ranks.some(r => ranks.filter(x => x === r).length >= 3);

  let suitTex = 'Rainbow';
  if (maxSuit >= 5) suitTex = 'Board-Flush';
  else if (maxSuit === 4) suitTex = 'Vier-Flush';
  else if (maxSuit === 3) suitTex = board.length === 3 ? 'Monotone' : 'Flush möglich';
  else if (maxSuit === 2) suitTex = 'Two-Tone';

  // Straight-Verbundenheit: wie viele verschiedene Straights sind auf dem Board schon möglich?
  let mask = 0; uniq.forEach(r => mask |= 1 << r);
  let straightCards = 0;
  const deckRanks = [...Array(13).keys()];
  for (const r of deckRanks) {
    for (const r2 of deckRanks) {
      if (straightHigh(mask | (1 << r) | (1 << r2)) >= 0) { straightCards++; break; }
    }
  }
  const straightOnBoard = straightHigh(mask) >= 0;
  const gaps = uniq.length >= 2 ? uniq[0] - uniq[uniq.length - 1] : 0;
  const connected = uniq.length >= 3 && gaps <= 4;

  // Dynamik-Score 0..10 (wie stark kann sich die Nut-Hand noch ändern)
  let dyn = 0;
  if (maxSuit >= 3 && board.length === 3) dyn += 4;   // Monotone: Flush kommt oft
  else if (maxSuit === 3) dyn += 3;
  else if (maxSuit === 2) dyn += 2;
  if (connected) dyn += 3;
  else if (gaps <= 6) dyn += 1;
  if (straightOnBoard) dyn += 2;
  if (straightCards >= 10) dyn += 1;
  if (paired) dyn -= 1;
  if (uniq[0] <= 8 && !connected && maxSuit <= 2) dyn -= 1;
  dyn = Math.max(0, Math.min(10, dyn));

  const highCard = ranks[0];
  const lowBoard = highCard <= 8;          // T oder niedriger
  const aceHigh = highCard === 12;
  const broadwayCount = ranks.filter(r => r >= 8).length; // T+

  return {
    ranks, uniq, paired, trips, suitTex, maxSuit, connected, gaps,
    straightOnBoard, dyn, highCard, lowBoard, aceHigh, broadwayCount,
    static: dyn <= 3,
    label: `${ranks.map(r => RANKS[r]).join('')} · ${suitTex}${paired ? ' · Paired' : ''}${connected ? ' · Connected' : ''}`
  };
}

/** Verteilung einer Range über Made-Hand-Buckets. */
const BUCKET_ORDER = [MADE.SF, MADE.QUADS, MADE.BOAT, MADE.FLUSH, MADE.STRAIGHT,
  MADE.SET, MADE.TRIPS, MADE.TWOPAIR, MADE.OVERPAIR, MADE.TPTK, MADE.TP,
  MADE.PP_MID, MADE.SECOND, MADE.THIRD, MADE.WEAKPAIR, MADE.ACEHIGH, MADE.BOARD, MADE.AIR];

function rangeBuckets(range, board, dead) {
  const blocked = new Set((dead || []).concat(board));
  const r = range.filter(x => !blocked.has(x.c[0]) && !blocked.has(x.c[1]));
  const totW = r.reduce((a, x) => a + x.w, 0) || 1;
  const buckets = {};
  let strongW = 0, nuttedW = 0, drawW = 0, airW = 0;
  const scores = [];
  for (const x of r) {
    const cls = classify(x.c, board);
    buckets[cls.made] = (buckets[cls.made] || 0) + x.w;
    const t = tierOf(cls);
    if (t >= TIER.NUTTED) nuttedW += x.w;
    if (t >= TIER.STRONG) strongW += x.w;
    if (t <= TIER.WEAK && cls.draws.length) drawW += x.w;
    if (t === TIER.AIR && !cls.draws.length) airW += x.w;
    scores.push({ s: cls.score, w: x.w });
  }
  scores.sort((a, b) => a.s - b.s);
  const list = BUCKET_ORDER.filter(b => buckets[b])
    .map(b => ({ name: b, w: buckets[b], pct: buckets[b] / totW }));
  return {
    combos: r.length, totW, list, scores,
    strongPct: strongW / totW, nuttedPct: nuttedW / totW,
    drawPct: drawW / totW, airPct: airW / totW
  };
}

/** Wieviel % der gegnerischen Range schlägt meine Hand JETZT (Showdown)? */
function relativeStrength(hole, vrange, board) {
  const dead = new Set(hole.concat(board));
  const vr = vrange.filter(x => !dead.has(x.c[0]) && !dead.has(x.c[1]));
  const my = evaluate(hole.concat(board));
  let beat = 0, tieW = 0, tot = 0;
  for (const x of vr) {
    const s = evaluate(x.c.concat(board));
    tot += x.w;
    if (my > s) beat += x.w; else if (my === s) tieW += x.w;
  }
  return { pct: tot ? (beat + tieW / 2) / tot : 0.5, beat, tie: tieW, tot, combos: vr.length };
}

/* ------------------------------------------------------------------ *
 * Kompakte Serialisierung von Ranges (für die Fehler-Wiederholung).
 * Eine verengte Turn-Range hat schnell 400 Kombos — als JSON wäre das
 * zu groß für localStorage, deshalb "karten:gewicht" als kurze Liste.
 * ------------------------------------------------------------------ */
/* Format "2|<voll>|<gewichtet>" — feste Feldbreiten statt Trennzeichen:
   Kartenschlüssel immer 3 Zeichen Base36 (0..2703 passt genau hinein),
   Kombos mit vollem Gewicht brauchen gar kein Gewichtsfeld, der Rest genau
   ein Zeichen (36 Stufen, Fehler < 1.5%). Das halbiert den Platzbedarf
   gegenüber Dezimal-CSV und bringt 500 Spots auf rund 2 MB.
   Ältere Formate werden weiter gelesen, damit gespeicherte Fehler beim
   Update nicht verloren gehen. */
const W_MIN = 0.02, W_STEPS = 35;
function packRange(range) {
  const full = [], frac = [];
  for (const x of range) {
    if (x.w < W_MIN) continue;
    const hi = Math.max(x.c[0], x.c[1]), lo = Math.min(x.c[0], x.c[1]);
    const k = (hi * 52 + lo).toString(36).padStart(3, '0');
    if (x.w >= 0.995) full.push(k);
    else frac.push(k + Math.round((x.w - W_MIN) / (1 - W_MIN) * W_STEPS).toString(36));
  }
  return '2|' + full.join('') + '|' + frac.join('');
}
function unpackRange(str) {
  if (!str) return [];
  const s = String(str), out = [];
  const add = (n, w) => { if (isFinite(n) && n >= 0 && n < 2704) out.push({ c: [Math.floor(n / 52), n % 52], w }); };
  if (s.slice(0, 2) === '2|') {
    const p = s.slice(2).split('|'), f = p[0] || '', fr = p[1] || '';
    for (let i = 0; i + 3 <= f.length; i += 3) add(parseInt(f.substr(i, 3), 36), 1);
    for (let i = 0; i + 4 <= fr.length; i += 4)
      add(parseInt(fr.substr(i, 3), 36), W_MIN + parseInt(fr[i + 3], 36) / W_STEPS * (1 - W_MIN));
    return out;
  }
  // Ältere Formate: "1|" = Base36-CSV, ohne Präfix = Dezimal-CSV
  let body = s, base = 10;
  if (s.slice(0, 2) === '1|') { body = s.slice(2); base = 36; }
  for (const t of body.split(',')) {
    if (!t) continue;
    const i = t.indexOf(':');
    add(parseInt(i < 0 ? t : t.slice(0, i), base), i < 0 ? 1 : parseInt(t.slice(i + 1), base) / 100);
  }
  return out;
}

/**
 * Kombiniertes Advantage-Maß.
 * Die reine Equity-Differenz zweier breiter Ranges liegt fast immer bei
 * ±1–2 Punkten und ist damit als Steuersignal zu schwach. Was Strategie
 * tatsächlich treibt, ist die *Verteilung*: wer hat anteilig mehr starke
 * Hände und mehr Nut-Hände. Deshalb werden alle drei Signale kombiniert,
 * die Anteile als relative Shares (robust gegen Board-Absolutniveau).
 */
function advantage(heroB, villB, rangeEq) {
  const advEq = rangeEq - 0.5;
  const sSum = heroB.strongPct + villB.strongPct;
  const nSum = heroB.nuttedPct + villB.nuttedPct;
  // Nenner mit Untergrenze: auf Boards, wo beide Ranges kaum Nut-Hände haben,
  // darf eine winzige absolute Differenz keinen riesigen relativen Anteil ergeben.
  const strongShare = (heroB.strongPct - villB.strongPct) / Math.max(0.08, sSum);
  const nutShare = (heroB.nuttedPct - villB.nuttedPct) / Math.max(0.05, nSum);
  const cl = (x, m) => Math.max(-m, Math.min(m, x));
  return {
    advEq, strongShare, nutShare,
    rangeAdv: cl(advEq * 1.2 + strongShare * 0.14, 0.12),
    nutAdv: cl(nutShare * 0.12 + (heroB.nuttedPct - villB.nuttedPct) * 0.8, 0.12)
  };
}

/* ------------------------------------------------------------------ */
window.PT = window.PT || {};
Object.assign(window.PT, {
  RANKS, SUITS, SUIT_SYM, CAT_NAMES, MADE, TIER, BUCKET_ORDER, advantage,
  packRange, unpackRange,
  cardFromStr, cardToStr, rankOf, suitOf, fullDeck, evaluate, catOfScore,
  parseRange, parseRangeStrict, validateRange, filterRange, comboToStr, handClassOf, handToCombos,
  classify, tierOf, equityVsRange, rangeVsRange, nutsOnBoard, boardTexture,
  rangeBuckets, relativeStrength, seedRng, rng, straightHigh
});
