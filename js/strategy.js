/* =========================================================================
   strategy.js — Heuristik-Engine: Aktion, Sizing, Bewertung, Range-Narrowing
   Kein Solver — aber eine konsistente, erklärbare Logik, die auf denselben
   Größen basiert, die ein Solver benutzt: Range-Advantage, Nut-Advantage,
   Board-Dynamik, SPR und Position.
   ========================================================================= */
(function () {
  const P = window.PT;
  const T = P.TIER;

  /* ---------- Sizing-Optionen ---------- */
  const BET_OPTIONS = [
    { key: 'CHECK', label: 'Check', pct: 0 },
    { key: 'BET_S', label: 'Bet 33%', pct: 0.33 },
    { key: 'BET_M', label: 'Bet 55%', pct: 0.55 },
    { key: 'BET_L', label: 'Bet 80%', pct: 0.80 },
    { key: 'BET_XL', label: 'Bet 130% / All-in', pct: 1.30 }
  ];
  const FACING_OPTIONS = [
    { key: 'FOLD', label: 'Fold' },
    { key: 'CALL', label: 'Call' },
    { key: 'RAISE_S', label: 'Raise klein (≈2.7x)' },
    { key: 'RAISE_L', label: 'Raise groß / All-in' }
  ];

  const clamp01 = x => Math.max(0, Math.min(1, x));

  /* ---------------------------------------------------------------- *
   * Gegnertypen
   *   v* = wie ER spielt,  h* = wie DU dich anpassen solltest.
   * Wichtig: der stärkste Effekt läuft NICHT über Zuschläge auf deine
   * Empfehlung, sondern über seine Bet-Range (siehe bettingRangeOf).
   * Ein Gegner, der nie blufft, hat eine stärkere Bet-Range — dass du
   * dagegen mehr folden musst, fällt dann aus der Mathematik heraus.
   * ---------------------------------------------------------------- */
  const PROFILES = {
    reg: {
      key: 'reg', name: 'Reg', short: 'Solide, ausgeglichene Frequenzen.',
      vAgg: 0, vBluff: 1.0, vCont: 1.0, vRaise: 1.0,
      hValue: 0, hBluff: 0, hSize: 0,
      tip: 'Nah an der Baseline spielen — gegen einen Reg ist Ausgeglichenheit der Plan.'
    },
    station: {
      key: 'station', name: 'Calling Station', short: 'Callt viel zu viel, blufft fast nie.',
      vAgg: -0.10, vBluff: 0.30, vCont: 1.45, vRaise: 0.45,
      hValue: 0.12, hBluff: -0.22, hSize: 0.14,
      tip: 'Dünner Value betten und **größer** — er zahlt. Bluffs praktisch streichen: gegen jemanden, der nicht foldet, ist jeder Bluff verbrannte Chips. Wenn **er** bettet oder raist, hat er es fast immer.'
    },
    nit: {
      key: 'nit', name: 'Nit', short: 'Foldet zu viel, wird nur mit starken Händen aktiv.',
      vAgg: -0.15, vBluff: 0.45, vCont: 0.60, vRaise: 0.80,
      hValue: -0.05, hBluff: 0.20, hSize: -0.06,
      tip: 'Mehr bluffen, und **kleine** Sizings reichen — er foldet ohnehin. Dünner Value bringt nichts, weil er nur mit besseren Händen callt. Gegen seine Aggression konsequent folden.'
    },
    lag: {
      key: 'lag', name: 'Aggro / Maniac', short: 'Bettet und raist zu oft, blufft zu viel.',
      vAgg: 0.18, vBluff: 1.85, vCont: 1.15, vRaise: 1.70,
      hValue: 0.05, hBluff: -0.15, hSize: 0,
      tip: 'Lass **ihn** bluffen: mehr checken und callen mit Medium-Händen. Eigene Bluffs runterfahren, er foldet nicht. Starke Hände darfst du passiv spielen — er setzt für dich.'
    }
  };
  const PROFILE_LIST = ['reg', 'station', 'nit', 'lag'];

  /** Ist die Hand ein Value-Bet- oder ein Bluff-Kandidat? */
  function roleOfHand(cls) {
    const t = P.tierOf(cls);
    const strong = !!(cls.hasFD || cls.hasOESD);
    if (t >= 3) return 'value';
    if (strong) return 'semibluff';
    return 'bluff';
  }

  /* ---------------------------------------------------------------- *
   * Aggression A und Polarität P einer konkreten Hand in einem Kontext
   * ---------------------------------------------------------------- */
  function handDrive(cls, ctx) {
    const tier = P.tierOf(cls);
    const fd = !!cls.hasFD, oesd = !!cls.hasOESD, gs = !!cls.hasGutshot, bdfd = !!cls.hasBDFD;
    const strongDraw = fd || oesd;

    /* --- Aggression ---
       Basis bewusst niedrig: "betten" darf nicht der Default sein. Erst
       Handstärke, Draws und Range-Advantage heben eine Hand über die
       Bet-Schwelle (≈0.335, siehe CHECK-Kurve unten). Dadurch reicht die
       resultierende C-Bet-Frequenz realistisch von ~20% (schlechtes Board,
       OOP) bis ~95% (A/K-hoch, IP). */
    let A = 0.20;
    const tierBonus = [0.00, -0.10, 0.02, 0.24, 0.42, 0.50][tier];
    A += tierBonus;
    if (fd) A += 0.25;
    if (oesd) A += 0.22;
    if (gs) A += 0.09;
    if (bdfd) A += 0.05;
    // Range-Advantage steuert die Frequenz (WIE OFT), Nut-Advantage vor allem
    // das Sizing (WIE GROSS -> Pol). Deshalb geht nutAdv hier nur schwach ein.
    A += ctx.rangeAdv * 1.8;
    A += ctx.nutAdv * 0.4;
    A += ctx.heroIP ? 0.08 : -0.08;
    if (ctx.potType === '3BP') A += 0.06;
    if (ctx.role === 'CALLER' || ctx.role === 'CALL3B') A -= 0.06;
    if (tier <= 2 && !strongDraw && !gs && ctx.rangeAdv < 0.015) A -= 0.08;

    /* --- Multiway ---------------------------------------------------
       Zwei Dinge ändern sich gegenüber Heads-up, und beide in dieselbe
       Richtung: weniger betten.
       1. Bluffs sterben. Alle müssen folden, die Fold-Equity ist f^n —
          bei 60% Foldrate je Gegner sind das 3-way nur noch 36%.
       2. Dünner Value stirbt. Du musst ALLE schlagen, nicht einen.
          Top Pair ist 3-way oft schon ein Bluffcatcher.
       Nut-Hände dagegen werden mehr wert: mehr Zahler, größere Sizings. */
    if (ctx.opponents > 1) {
      const extra = ctx.opponents - 1;
      const hr0 = roleOfHand(cls);
      if (hr0 === 'bluff') A -= 0.13 + 0.11 * extra;
      else if (hr0 === 'semibluff') A -= 0.05 * extra;
      else if (tier === 3) A -= 0.11 * extra;
      else if (tier <= 2) A -= 0.08 * extra;
      if (tier >= 5) A += 0.05;
      // Die Sizing-Anpassung steht weiter unten — Pol existiert hier noch nicht.
    }

    /* --- Gegnertyp --------------------------------------------------
       ctx.profile beschreibt IMMER den profilierten Spieler. Ob dieser
       gerade selbst handelt (Simulation) oder ob wir uns an ihn anpassen
       (Empfehlung an dich), unterscheidet actorIsProfiled. */
    const prof = ctx.profile;
    if (prof && prof.key !== 'reg') {
      const hr = roleOfHand(cls);
      if (ctx.actorIsProfiled) {
        A += prof.vAgg;
        if (hr === 'bluff') A -= (1 - prof.vBluff) * 0.30;
      } else {
        if (hr === 'value') A += prof.hValue;
        else if (hr === 'bluff') A += prof.hBluff;
        else A += prof.hBluff * 0.4;   // Semibluffs nur halb so stark anpassen
      }
    }
    if (ctx.street === 'river') { A -= 0.05; if (tier === 3) A -= 0.12; } // dünne Value/Bluffcatcher checken
    if (ctx.street !== 'flop' && tier <= 1 && !strongDraw && !gs) A -= 0.06;

    /* --- Polarität (klein vs groß) --- */
    let Pol = 0.35;
    Pol += (ctx.tex.dyn - 4) / 13;
    if (tier === 5) Pol += 0.20;
    else if (tier === 4) Pol += 0.06;
    else if (tier === 3) Pol -= 0.22;
    else if (tier <= 2 && strongDraw) Pol += 0.16;
    else if (tier <= 2) Pol -= 0.05;
    Pol += ctx.nutAdv * 2.0;
    if (ctx.spr < 2.5) Pol += 0.15;
    if (ctx.spr > 8 && ctx.tex.static) Pol -= 0.12;
    if (ctx.potType === '3BP') Pol += 0.08;
    if (ctx.street === 'river' && tier >= 4) Pol += 0.12;
    // Multiway: wer hier überhaupt bettet, bettet groß — mehr Zahler, und
    // du willst Draws nicht billig gegen mehrere Gegner ziehen lassen.
    if (ctx.opponents > 1) Pol += 0.07 * (ctx.opponents - 1);

    /* Sizing-Anpassung nach Gegnertyp NACH dem Clamp: auf sehr trockenen
       Boards liegt Pol schon am unteren Anschlag, ein Zuschlag davor würde
       einfach verschluckt — gegen eine Station willst du dort aber gerade
       größer betten. */
    let Polc = clamp01(Pol);
    if (prof && !ctx.actorIsProfiled && tier >= 3) Polc = clamp01(Polc + prof.hSize);
    return { A: clamp01(A), Pol: Polc, tier, fd, oesd, gs, bdfd, strongDraw };
  }

  /* ---------------------------------------------------------------- *
   * Empfehlung ohne Bet vor uns
   * ---------------------------------------------------------------- */
  function recommendBetting(cls, ctx) {
    const { A, Pol, tier, fd, oesd, gs, bdfd, strongDraw } = handDrive(cls, ctx);
    const s = {};
    // Exponent 2.2 setzt die Bet/Check-Schwelle auf A ≈ 0.335
    s.CHECK = Math.pow(1 - A, 2.2) * 100;
    s.BET_S = A * (1 - Pol) * 118;
    s.BET_M = A * (1 - Math.abs(Pol - 0.52) * 1.25) * 104;
    s.BET_L = A * Pol * 112;
    s.BET_XL = A * Pol * (ctx.spr < 1.8 && (tier >= 4 || strongDraw) ? 95
      : ctx.street === 'river' && tier >= 5 ? 70 : 30);
    for (const k in s) s[k] = Math.max(0, s[k]);
    const best = Object.keys(s).reduce((a, b) => s[a] >= s[b] ? a : b);
    const max = s[best] || 1;
    const norm = {}; for (const k in s) norm[k] = Math.round(s[k] / max * 100);

    /* --- Begründungen --- */
    const R = [];
    R.push(`Board: **${ctx.tex.label}** — Dynamik ${ctx.tex.dyn}/10 (${ctx.tex.static ? 'statisch → kleine Sizings, breit betten' : 'dynamisch → polarisieren, groß betten'}).`);
    R.push(rangeAdvText(ctx));
    R.push(nutAdvText(ctx));
    R.push(`Deine Hand: **${cls.made}**${cls.draws.length ? ' + ' + cls.draws.join(', ') : ''} — du schlägst gerade **${(ctx.heroPct * 100).toFixed(0)}%** seiner Kombos, Equity **${(ctx.heroEq * 100).toFixed(0)}%**.`);
    if (tier >= 4) R.push('Klare Value-Hand: Geld reinbekommen ist die Hauptaufgabe.');
    else if (tier === 3) R.push('Medium-Value: gewinnt oft am Showdown, verträgt aber keinen großen Pot. → kleine Bet oder Check/Call.');
    else if (tier <= 2 && strongDraw) R.push(`Starker Draw (${cls.draws.join(', ')}): Semibluff — du gewinnst sofort oder triffst. Große Sizings maximieren beides.`);
    else if (gs || bdfd) R.push('Schwache Equity + Blocker → guter Bluff-Kandidat für kleine Sizings, aber nicht mehrstraßig.');
    else if (tier <= 1) R.push('Kein Value, keine Equity → check. Bluffs brauchen Equity oder Blocker, nicht nur "nichts".');
    if (ctx.spr < 2) R.push(`SPR ${ctx.spr} — nur noch ~1–2 Bets bis all-in. Plane jetzt schon den Stack-off: Bettest du, committest du dich meist.`);
    else if (ctx.spr > 7) R.push(`SPR ${ctx.spr} — tief. Du brauchst 3 Streets, um den Stack zu bekommen: Sizing so wählen, dass Turn+River passen.`);
    if (!ctx.heroIP) R.push('OOP: Check-Frequenz erhöhen. Ohne Position kannst du deine Range nicht billig zum Showdown bringen — Check/Call und Check/Raise sind deine Werkzeuge.');
    else R.push('IP: Du darfst breiter betten. Mit Check kannst du dir günstige Turn-Karten und Bluff-Chancen aufheben.');
    if (ctx.opponents > 1) R.push(multiwayText(ctx, cls));
    if (ctx.profile && ctx.profile.key !== 'reg') R.push(profileText(ctx, cls));

    return { scores: norm, best, reasons: R, A, Pol, tier, cls };
  }

  /** Erklärt, was sich gegenüber Heads-up konkret ändert. */
  function multiwayText(ctx, cls) {
    const n = ctx.opponents, hr = roleOfHand(cls);
    const fair = 1 / (n + 1);
    const fe = Math.pow(0.6, n);              // je Gegner 60% Foldrate angenommen
    const kern = hr === 'bluff'
      ? `Als Bluff brauchst du, dass **alle ${n}** folden. Bei realistischen 60% je Gegner sind das nur noch **${(fe * 100).toFixed(0)}%** statt 60% Heads-up — deshalb fast immer checken.`
      : hr === 'value' && ctx.heroPct > 0.8
        ? `Starke Hand gegen ${n} Gegner: **mehr Zahler, größeres Sizing.** Der Pot ist schon groß, du musst ihn nicht künstlich aufbauen — aber du darfst kassieren.`
        : hr === 'value'
          ? `Achtung: Du musst **alle ${n}** schlagen, nicht einen. Deine ${(ctx.heroPct * 100).toFixed(0)}% sind bereits die Wahrscheinlichkeit, gegen das ganze Feld vorne zu liegen — dünner Value verliert hier Geld.`
          : `Semibluff bleibt spielbar, weil du Equity hast — aber setze kleiner oder checke, Fold-Equity ist gegen ${n} Gegner kaum vorhanden.`;
    return `**Multiway (${n} Gegner):** fairer Equity-Anteil wäre **${(fair * 100).toFixed(0)}%**, du hast **${(ctx.heroEq * 100).toFixed(0)}%**. ${kern}`;
  }

  /** Erklärt die Abweichung von der Baseline für den aktuellen Gegnertyp. */
  function profileText(ctx, cls) {
    const p = ctx.profile, hr = roleOfHand(cls);
    const wie = hr === 'value'
      ? (p.hValue > 0 ? 'Deine Value-Hand wird gegen ihn **mehr wert** — dünner und größer betten.'
        : 'Value ist gegen ihn **weniger wert** — er callt nur mit besseren Händen.')
      : hr === 'bluff'
        ? (p.hBluff < 0 ? 'Als Bluff ist diese Hand gegen ihn **fast wertlos** — er foldet zu selten.'
          : 'Als Bluff ist diese Hand gegen ihn **überdurchschnittlich gut** — er foldet zu oft.')
        : 'Semibluffs bleiben spielbar: du hast Equity, auch wenn er nicht foldet.';
    return `**Gegnertyp ${p.name}:** ${p.short} ${wie} ${p.tip}`;
  }

  function rangeAdvText(ctx) {
    const s = ctx.rangeAdv;
    const who = s > 0.035 ? 'klarer Range-Advantage bei dir → hohe Bet-Frequenz'
      : s > 0.012 ? 'leichter Range-Advantage bei dir'
        : s < -0.035 ? 'Range-Advantage beim Gegner → viel checken'
          : s < -0.012 ? 'leichter Range-Advantage beim Gegner'
            : 'Ranges ausgeglichen → selektiv betten';
    const hs = ctx.heroBuckets.strongPct * 100, vs = ctx.villBuckets.strongPct * 100;
    return `**Range-Advantage:** Roh-Equity deiner Range **${((0.5 + (ctx.advEq !== undefined ? ctx.advEq : 0)) * 100).toFixed(1)}%**; ` +
      `Two-Pair+ hast du **${hs.toFixed(1)}%** vs seine **${vs.toFixed(1)}%** → ${who}.`;
  }
  function nutAdvText(ctx) {
    const h = ctx.heroNut * 100, v = ctx.villNut * 100;
    const s = ctx.nutAdv;
    const who = s > 0.03 ? 'Nut-Advantage bei dir → du darfst groß betten und overbetten'
      : s > 0.01 ? 'leichter Nut-Advantage bei dir'
        : s < -0.03 ? 'Nut-Advantage beim Gegner → große Sizings sind gefährlich, klein betten oder checken'
          : 'Nut-Advantage geteilt → mittlere Sizings';
    return `**Nut-Advantage:** Set-oder-besser bei dir **${h.toFixed(1)}%**, bei ihm **${v.toFixed(1)}%** → ${who}.`;
  }

  /* ---------------------------------------------------------------- *
   * Empfehlung gegen eine Bet
   * ---------------------------------------------------------------- */
  /**
   * Die Range, mit der ein Spieler die gegebene Bet-Größe setzt.
   * @param profile Gegnertyp — NUR übergeben, wenn die Range dem
   *   profilierten Spieler gehört. Ein Gegner, der selten blufft, bekommt
   *   dadurch eine echt stärkere Bet-Range; deine Fold-Entscheidung folgt
   *   dann aus der Equity-Rechnung statt aus einem pauschalen Zuschlag.
   */
  function bettingRangeOf(range, board, betPct, ctx, profile) {
    const out = [];
    for (const x of range) {
      if (board.some(b => b === x.c[0] || b === x.c[1])) continue;
      const cls = P.classify(x.c, board);
      const tier = P.tierOf(cls);
      const strong = !!(cls.hasFD || cls.hasOESD);
      let f;
      if (betPct <= 0.42) {
        f = [0.30, 0.35, 0.45, 0.70, 0.85, 0.90][tier];
        if (strong) f = Math.max(f, 0.75);
      } else if (betPct <= 0.70) {
        f = [0.28, 0.20, 0.25, 0.45, 0.90, 0.95][tier];
        if (strong) f = Math.max(f, 0.85);
      } else {
        f = [0.32, 0.14, 0.14, 0.25, 0.85, 0.97][tier];
        if (strong) f = Math.max(f, 0.80);
      }
      if (profile && profile.key !== 'reg' && tier <= 1 && !strong) {
        f *= profile.vBluff;                 // reine Bluffs nach Gegnertyp skalieren
      }
      if (f > 0.01) out.push({ c: x.c, w: x.w * f });
    }
    return out;
  }

  function recommendFacing(cls, ctx) {
    const { betPct, potNow, toCall } = ctx.facing;   // potNow = Pot inkl. seiner Bet
    const callAmt = Math.min(toCall, ctx.eff);
    const potBefore = Math.max(0.1, potNow - toCall);
    const potOdds = callAmt / (potNow + callAmt);
    const mdf = potBefore / potNow;
    const tier = P.tierOf(cls);
    const strongDraw = !!(cls.hasFD || cls.hasOESD);
    const gs = !!cls.hasGutshot;

    // Equity gegen seine BET-Range (nicht gegen seine Gesamtrange!)
    const eqVsBet = ctx.eqVsBettingRange;
    const realize = ctx.street === 'river' ? 1
      : (ctx.heroIP ? 1.04 : 0.90) * (strongDraw ? 1.06 : 1);
    const effEq = ctx.street === 'river' ? eqVsBet : eqVsBet * realize;

    const s = {};
    const margin = effEq - potOdds;
    s.CALL = 100 * clamp01(0.5 + margin * 5.5);
    s.FOLD = 100 * clamp01(0.5 - margin * 6.0);
    // Raise: Nut-Hände, starke Draws mit Fold-Equity, Blocker
    let raiseDrive = 0;
    if (tier >= 5) raiseDrive += 0.75;
    else if (tier === 4) raiseDrive += ctx.heroIP ? 0.35 : 0.45;
    else if (tier === 3) raiseDrive += 0.08;
    if (strongDraw && ctx.street !== 'river') raiseDrive += 0.45;
    if (gs && ctx.street === 'flop' && !ctx.heroIP) raiseDrive += 0.12;
    if (tier <= 1 && !strongDraw && !gs && ctx.street === 'river') raiseDrive += 0.05; // reiner Bluff
    raiseDrive += ctx.nutAdv * 1.5;
    if (ctx.spr < 1.2) raiseDrive += 0.1;
    const profF = ctx.profile;
    if (profF && profF.key !== 'reg' && !ctx.actorIsProfiled) {
      // Value-Raise gegen eine Station: gut. Bluff-Raise gegen eine Station: teuer.
      raiseDrive += (roleOfHand(cls) === 'value' ? profF.hValue * 0.8 : profF.hBluff * 0.9);
    }
    raiseDrive = clamp01(raiseDrive);
    const polar = clamp01(0.3 + (ctx.tex.dyn - 4) / 12 + (tier >= 5 ? 0.2 : 0) + (ctx.spr < 2 ? 0.2 : 0));
    // Basis-Anteil, damit auch die "falsche" Sizing-Richtung nicht auf 0 fällt:
    // ob geraist wird, ist die wichtigere Entscheidung als wie groß.
    s.RAISE_S = raiseDrive * (0.35 + 0.65 * (1 - polar)) * 118;
    s.RAISE_L = raiseDrive * (0.35 + 0.65 * polar) * 118;
    if (ctx.street === 'river') { s.RAISE_S *= (tier >= 5 ? 1 : 0.5); s.RAISE_L *= (tier >= 5 ? 1 : 0.6); }
    // Eine klare Value-Raise-Hand nur zu callen lässt Value liegen -> Call abwerten.
    if (tier >= 5 || (tier === 4 && ctx.tex.static && ctx.street !== 'river')) s.CALL *= 0.70;

    for (const k in s) s[k] = Math.max(0, s[k]);
    const best = Object.keys(s).reduce((a, b) => s[a] >= s[b] ? a : b);
    const max = s[best] || 1;
    const norm = {}; for (const k in s) norm[k] = Math.round(s[k] / max * 100);

    const R = [];
    R.push(`Er setzt **${toCall.toFixed(1)}bb in ${potBefore.toFixed(1)}bb** (${(betPct * 100).toFixed(0)}% Pot).`);
    R.push(`**Pot Odds:** du musst ${(potOdds * 100).toFixed(0)}% Equity haben. **MDF:** du darfst nur ${((1 - mdf) * 100).toFixed(0)}% deiner Range folden (${(mdf * 100).toFixed(0)}% verteidigen), sonst wird sein Bluff automatisch profitabel.`);
    R.push(`Deine Hand: **${cls.made}**${cls.draws.length ? ' + ' + cls.draws.join(', ') : ''} → **${(eqVsBet * 100).toFixed(0)}% Equity gegen seine Bet-Range** (nicht gegen seine ganze Range!).`);
    if (ctx.street !== 'river') R.push(`Equity-Realisierung ${ctx.heroIP ? 'IP (+)' : 'OOP (−)'}: effektiv ≈ ${(effEq * 100).toFixed(0)}%. ${margin >= 0 ? 'Über' : 'Unter'} den Pot Odds → ${margin >= 0 ? 'Call ist rentabel' : 'Call verliert Geld, außer du hast Implied Odds'}.`);
    R.push(nutAdvText(ctx));
    if (raiseDrive > 0.4) R.push('Raise-Kandidat: Du hast entweder die Nut-Region oder genug Equity + Fold-Equity. Passiv zu spielen lässt Value liegen.');
    if (tier === 3 && margin < 0.03) R.push('Klassische Bluffcatcher-Situation: Call nur, wenn er zu viel bluffen kann. Gegen tighte Gegner ist Fold korrekt.');
    if (ctx.spr < 1.5) R.push(`SPR ${ctx.spr}: Call = Commitment. Wenn du nicht bereit bist, am Turn all-in zu gehen, folde jetzt.`);
    if (ctx.profile && ctx.profile.key !== 'reg') {
      R.push(profileText(ctx, cls));
      R.push(`Seine Bet-Range ist nach Gegnertyp angepasst: **${ctx.profile.name}** blufft ${ctx.profile.vBluff < 1 ? 'deutlich seltener' : 'deutlich öfter'} als ein Reg. Genau deshalb liegt deine Equity gegen seine Bet bei ${(eqVsBet * 100).toFixed(0)}% — die Zahl oben enthält die Anpassung schon.`);
    }

    return { scores: norm, best, reasons: R, potOdds, mdf, eqVsBet, effEq, tier, cls };
  }

  /* ---------------------------------------------------------------- *
   * Range-Narrowing nach Aktionen
   * ---------------------------------------------------------------- */
  function continueWeight(cls, betPct, street, profile) {
    const tier = P.tierOf(cls);
    const strong = !!(cls.hasFD || cls.hasOESD);
    const gs = !!cls.hasGutshot;
    let w = [0.05, 0.22, 0.45, 0.80, 0.96, 0.99][tier];
    if (profile && profile.key !== 'reg') w = Math.min(1, w * profile.vCont);
    if (strong && street !== 'river') w = Math.max(w, 0.88);
    else if (gs && street === 'flop') w = Math.max(w, 0.42);
    if (betPct > 0.70) w *= 0.78;
    else if (betPct < 0.40) w = Math.min(1, w * 1.20);
    if (street === 'river') { if (strong || gs) w = Math.min(w, [0.04, 0.18, 0.40, 0.75, 0.95, 0.99][tier]); }
    return w;
  }

  /** action: 'bet'|'check'|'call'|'fold'|'raise' */
  function narrow(range, board, action, opts) {
    opts = opts || {};
    const betPct = opts.betPct || 0.5;
    const ctx = opts.ctx;
    const out = [];
    for (const x of range) {
      if (board.some(b => b === x.c[0] || b === x.c[1])) continue;
      const cls = P.classify(x.c, board);
      let f = 1;
      if (action === 'bet') f = ctx ? handDrive(cls, ctx).A : 0.5;
      else if (action === 'check') f = 1 - (ctx ? handDrive(cls, ctx).A : 0.5);
      else if (action === 'call') f = continueWeight(cls, betPct, opts.street, opts.profile) * (P.tierOf(cls) >= 5 ? 0.55 : 1);
      else if (action === 'raise') {
        const tier = P.tierOf(cls);
        const strong = !!(cls.hasFD || cls.hasOESD);
        f = tier >= 5 ? 0.9 : tier === 4 ? 0.35 : strong ? 0.45 : tier <= 1 ? 0.08 : 0.05;
      }
      if (f > 0.02) out.push({ c: x.c, w: x.w * f });
    }
    return out.length ? out : range.slice();
  }

  /* ---------------------------------------------------------------- *
   * Villain-KI: wählt selbst eine Aktion mit derselben Logik
   * ---------------------------------------------------------------- */
  function villainAct(villHole, board, ctx, facing) {
    const cls = P.classify(villHole, board);
    if (facing) {
      const r = recommendFacing(cls, ctx);
      return pickWeighted(r.scores, ['FOLD', 'CALL', 'RAISE_S', 'RAISE_L']);
    }
    const r = recommendBetting(cls, ctx);
    return pickWeighted(r.scores, ['CHECK', 'BET_S', 'BET_M', 'BET_L', 'BET_XL']);
  }
  function pickWeighted(scores, keys) {
    const w = keys.map(k => Math.pow((scores[k] || 0) / 100, 2.2));
    const tot = w.reduce((a, b) => a + b, 0) || 1;
    let r = P.rng() * tot;
    for (let i = 0; i < keys.length; i++) { r -= w[i]; if (r <= 0) return keys[i]; }
    return keys[0];
  }

  /* ---------------------------------------------------------------- *
   * Bewertung der Nutzerantwort
   * ---------------------------------------------------------------- */
  function grade(scores, pick) {
    const v = scores[pick] || 0;
    if (v >= 85) return { rating: 'Optimal', cls: 'ok', pts: 3 };
    if (v >= 62) return { rating: 'Solide (Mix-Alternative)', cls: 'ok2', pts: 2 };
    if (v >= 35) return { rating: 'Ungenau', cls: 'warn', pts: 1 };
    return { rating: 'Fehler', cls: 'bad', pts: 0 };
  }

  Object.assign(P, {
    BET_OPTIONS, FACING_OPTIONS, handDrive, recommendBetting, recommendFacing,
    bettingRangeOf, narrow, continueWeight, villainAct, grade, pickWeighted,
    rangeAdvText, nutAdvText, PROFILES, PROFILE_LIST, roleOfHand, profileText, multiwayText
  });
})();
