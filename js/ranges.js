/* =========================================================================
   ranges.js — MTT-Preflop-Ranges und Spot-Bibliothek
   Die Ranges sind bewusst "gut genug"-Approximationen typischer
   Solver-/Standard-MTT-Ranges. Sie sind bewusst offen gehalten, damit du
   sie mit Flopzilla/HRC-Output ersetzen kannst (siehe README).
   ========================================================================= */
(function () {
  const P = window.PT;

  /* ---------------- RFI (Raise First In) ---------------- */
  const RFI = {
    EP: '55+, A9s+, A5s-A4s, K9s+, Q9s+, J9s+, T9s, 98s, AJo+, KQo',
    MP: '44+, A7s+, A5s-A2s, K8s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, ATo+, KJo+, QJo',
    CO: '22+, A2s+, K5s+, Q7s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A9o+, KTo+, QTo+, JTo, T9o',
    BTN: '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 95s+, 85s+, 74s+, 63s+, 53s+, 43s, A2o+, K7o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o',
    SB: '22+, A2s+, K4s+, Q6s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A4o+, K9o+, Q9o+, J9o+, T9o, 98o'
  };

  /* ---------------- BB-Defense (Flat vs RFI) ---------------- */
  const BB_FLAT = {
    EP: '22-99, A2s-ATs, K8s+, Q9s+, J9s+, T9s, 98s, 87s, 76s, 65s, A7o-AJo, KTo+, QJo, JTo',
    MP: '22-TT, A2s-AJs, K7s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, 54s, A5o-AJo, K9o+, QTo+, JTo, T9o',
    CO: '22-TT, A2s-AJs, K5s+, Q7s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, A2o-AJo, K9o+, Q9o+, J9o+, T9o, 98o',
    BTN: '22-JJ, A2s-AJs, K2s+, Q4s+, J6s+, T6s+, 96s+, 85s+, 75s+, 64s+, 53s+, 43s, A2o-AJo, K7o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o',
    SB: '22-JJ, A2s-AJs, K2s+, Q3s+, J5s+, T6s+, 95s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o-AJo, K5o+, Q7o+, J7o+, T7o+, 96o+, 86o+, 75o+, 65o'
  };

  /* ---------------- IP-Flat (Cold Call) ---------------- */
  const IP_FLAT = {
    'BTN_vs_CO': '22-JJ, A5s-A2s, ATs-AJs, KTs+, QTs+, J9s+, T9s, 98s, 87s, 76s, AQo, KQo',
    'BTN_vs_MP': '22-JJ, A5s-A4s, ATs-AJs, KTs+, QTs+, J9s+, T9s, 98s, 87s, AQo, KQo',
    'CO_vs_EP': '22-TT, A5s-A4s, ATs-AJs, KTs+, QTs+, JTs, T9s, 98s, AQo, KQo'
  };

  /* ---------------- 3-Bet-Ranges & Calls ---------------- */
  const THREEBET = {
    'BB_vs_BTN': 'TT+, AQs+, A5s-A3s, KQs, KJs, QJs, T9s, 76s, 65s, AQo+',
    'BB_vs_CO': 'JJ+, AQs+, A5s-A4s, KQs, KJs, T9s, 76s, AKo, AQo',
    'BTN_vs_CO': 'TT+, AJs+, A5s-A4s, KQs, KJs, AQo+',
    'BTN_vs_EP': 'QQ+, AJs+, A5s-A4s, KQs, AKo',
    'SB_vs_BTN': 'TT+, AQs+, A5s-A3s, KQs, KJs, QJs, 76s, AQo+'
  };
  const CALL_3BET = {
    'BTN_vs_BB': '99-JJ, ATs-AQs, KQs, KJs, QJs, JTs, T9s, 98s, 87s, A5s-A4s, AQo, KQo',
    'CO_vs_BB': '88-QQ, AJs-AQs, KQs, KJs, QJs, JTs, T9s, AQo, KQo',
    'CO_vs_BTN': '88-QQ, AJs-AQs, KQs, KJs, QJs, JTs, T9s, AQo, KQo',
    'EP_vs_BTN': '99-QQ, AJs+, KQs, AQo'
  };

  /* ---------------- Stack-Bänder ---------------- */
  /* Das Band 'push' ist die Endphase jedes Live-Turniers: SPR um 2, eine Bet
     committet dich, ein 3-Bet ist faktisch ein Shove. Bewusst als eigenes
     Band statt als Untergrenze von 'short' — bei 27bb spielt man noch Poker,
     bei 16bb rechnet man. */
  const STACKS = {
    push: { label: '12–20bb', bb: 16, open: 2.0, threeBet: 5.0, tighten: 0.75 },
    short: { label: '20–35bb', bb: 27, open: 2.0, threeBet: 7.0, tighten: 0.85 },
    mid: { label: '40–60bb', bb: 48, open: 2.2, threeBet: 9.0, tighten: 1.0 },
    deep: { label: '60–100bb', bb: 80, open: 2.3, threeBet: 9.5, tighten: 1.05 }
  };

  /* Kurz-Ranges bei kurzen Stacks etwas straffen (grob: Randhände raus). */
  const TRIM_SHORT = ', 43s, 53s, 63s, 74s, 76o, 87o, 97o, T8o, J8o, Q8o, K7o, 95s, 85s';
  function adjustForStack(rangeStr, band) {
    if (band !== 'short' && band !== 'push') return rangeStr;
    const drop = new Set(TRIM_SHORT.split(',').map(s => s.trim()).filter(Boolean));
    return rangeStr.split(',').map(s => s.trim()).filter(t => !drop.has(t)).join(', ');
  }

  /* ---------------- Spot-Bibliothek ----------------
     role: 'PFR' | 'CALLER' | '3BET' | 'CALL3B'
     Jede Spot-Definition erzeugt Ranges + Pot/Stack-Geometrie.        */
  /* ---------------- Multiway ----------------
     Drei Wege in einen 3-Wege-Pot, die im Turnier tatsächlich vorkommen.
     opponents:N schaltet im Trainer die Multiway-Rechnung frei; villRanges
     liefert je Gegner eine eigene Range statt einer gemeinsamen. */
  const MULTIWAY = [
    {
      id: 'mw_co_btn_bb', tag: 'MW', freq: 7, opponents: 2,
      name: 'CO öffnet, BTN callt, BB callt — du bist CO',
      heroPos: 'CO', villPos: 'BTN + BB', heroIP: false, role: 'PFR', potType: 'SRP',
      heroRange: b => adjustForStack(RFI.CO, b),
      villRanges: b => [IP_FLAT.BTN_vs_CO, adjustForStack(BB_FLAT.CO, b)],
      villNames: ['BTN (hinter dir)', 'BB (vor dir)'],
      story: 'Du hast die Initiative, aber **zwei** Gegner und keine Position auf einen davon. Die C-Bet-Frequenz fällt hier drastisch.'
    },
    {
      id: 'mw_bb_vs_two', tag: 'MW', freq: 6, opponents: 2,
      name: 'MP öffnet, BTN callt, du callst im BB',
      heroPos: 'BB', villPos: 'MP + BTN', heroIP: false, role: 'CALLER', potType: 'SRP',
      heroRange: b => adjustForStack(BB_FLAT.MP, b),
      villRanges: b => [adjustForStack(RFI.MP, b), IP_FLAT.BTN_vs_MP],
      villNames: ['MP (Aggressor)', 'BTN (hinter dir)'],
      story: 'Der schlechteste Platz am Tisch: **OOP gegen zwei**, dazwischen eingeklemmt. Ohne starke Hand gehört hier fast alles in den Müll.'
    },
    {
      id: 'mw_btn_ip_3way', tag: 'MW', freq: 6, opponents: 2,
      name: 'MP öffnet, du callst am BTN, BB callt',
      heroPos: 'BTN', villPos: 'MP + BB', heroIP: true, role: 'CALLER', potType: 'SRP',
      heroRange: () => IP_FLAT.BTN_vs_MP,
      villRanges: b => [adjustForStack(RFI.MP, b), adjustForStack(BB_FLAT.MP, b)],
      villNames: ['MP (Aggressor)', 'BB (vor dir)'],
      story: 'Position gegen zwei ist Gold wert — aber nur, wenn du sie für **Information** nutzt statt für Bluffs. Bluffs brauchen hier zwei Folds.'
    },
    {
      id: 'mw_limped', tag: 'MW', freq: 4, opponents: 2,
      name: 'Zwei Limper, du checkst im BB',
      heroPos: 'BB', villPos: '2 Limper', heroIP: false, role: 'CALLER', potType: 'SRP',
      heroRange: () => '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 95s+, 84s+, 74s+, 63s+, 53s+, 43s, A2o+, K5o+, Q7o+, J7o+, T7o+, 96o+, 86o+, 75o+, 65o',
      villRanges: () => [LIMP, LIMP],
      villNames: ['Limper 1', 'Limper 2'],
      story: 'Limped Pot am Live-Tisch: kleiner Pot, schwache Ranges, aber **zwei** davon. Kleine Pötte gewinnt man mit Value, nicht mit Bluffs.'
    }
  ];
  /* Typische Live-Limp-Range: viele Broadways, alle Pockets, viel Suited-Trash. */
  const LIMP = '22-JJ, A2s+, K3s+, Q5s+, J6s+, T6s+, 95s+, 85s+, 74s+, 64s+, 53s+, A2o-AJo, K7o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o';

  /* JEDER Spot muss villRange() anbieten. Andere Module — Hand-Steckbriefe,
     Analyse-Presets — iterieren über SPOTS und rufen es auf; ein Spot mit
     ausschließlich villRanges (Mehrweg) hat dort die Initialisierung
     abgebrochen. Für Mehrweg ist villRange die Range des ersten Gegners. */
  MULTIWAY.forEach(s => { if (!s.villRange) s.villRange = b => s.villRanges(b)[0]; });

  const SPOTS = [
    // ---- Single Raised Pots, Hero = Preflop-Aggressor ----
    {
      id: 'btn_vs_bb_ip', tag: 'SRP', freq: 10,
      name: 'BTN öffnet, BB callt — du bist BTN',
      heroPos: 'BTN', villPos: 'BB', heroIP: true, role: 'PFR', potType: 'SRP',
      heroRange: b => adjustForStack(RFI.BTN, b), villRange: b => adjustForStack(BB_FLAT.BTN, b),
      story: 'Du openst vom Button, der BB verteidigt. **Der wichtigste Postflop-Spot im Turnier.**'
    },
    {
      id: 'co_vs_bb_ip', tag: 'SRP', freq: 8,
      name: 'CO öffnet, BB callt — du bist CO',
      heroPos: 'CO', villPos: 'BB', heroIP: true, role: 'PFR', potType: 'SRP',
      heroRange: b => adjustForStack(RFI.CO, b), villRange: b => adjustForStack(BB_FLAT.CO, b),
      story: 'CO-Open, BB verteidigt. Deine Range ist stärker als BTN-Range, aber du hast weniger Airballs.'
    },
    {
      id: 'ep_vs_bb_ip', tag: 'SRP', freq: 6,
      name: 'EP/MP öffnet, BB callt — du bist EP/MP',
      heroPos: 'MP', villPos: 'BB', heroIP: true, role: 'PFR', potType: 'SRP',
      heroRange: b => adjustForStack(RFI.EP, b), villRange: b => adjustForStack(BB_FLAT.EP, b),
      story: 'Enge Open-Range gegen BB-Defense. Starkes Nut-Advantage auf hohen Boards.'
    },
    {
      id: 'co_vs_btn_oop', tag: 'SRP', freq: 6,
      name: 'CO öffnet, BTN callt — du bist CO (OOP)',
      heroPos: 'CO', villPos: 'BTN', heroIP: false, role: 'PFR', potType: 'SRP',
      heroRange: b => adjustForStack(RFI.CO, b), villRange: () => IP_FLAT.BTN_vs_CO,
      story: 'PFR ohne Position gegen einen starken, gecappten Flat-Call. Viel häufiger checken!'
    },
    {
      id: 'sb_vs_bb_oop', tag: 'BvB', freq: 7,
      name: 'SB öffnet, BB callt — du bist SB (OOP)',
      heroPos: 'SB', villPos: 'BB', heroIP: false, role: 'PFR', potType: 'SRP',
      heroRange: b => adjustForStack(RFI.SB, b), villRange: b => adjustForStack(BB_FLAT.SB, b),
      story: 'Blind vs Blind: beide Ranges sehr breit, du bist OOP. Kleine Sizings, hohe Check-Frequenz.'
    },
    // ---- Single Raised Pots, Hero = Defender ----
    {
      id: 'bb_vs_btn_def', tag: 'DEF', freq: 10,
      name: 'BTN öffnet, du callst im BB (Defense)',
      heroPos: 'BB', villPos: 'BTN', heroIP: false, role: 'CALLER', potType: 'SRP',
      heroRange: b => adjustForStack(BB_FLAT.BTN, b), villRange: b => adjustForStack(RFI.BTN, b),
      story: 'Du verteidigst OOP gegen die breiteste Range am Tisch. Check-Raise ist deine Waffe.'
    },
    {
      id: 'bb_vs_co_def', tag: 'DEF', freq: 7,
      name: 'CO öffnet, du callst im BB (Defense)',
      heroPos: 'BB', villPos: 'CO', heroIP: false, role: 'CALLER', potType: 'SRP',
      heroRange: b => adjustForStack(BB_FLAT.CO, b), villRange: b => adjustForStack(RFI.CO, b),
      story: 'Etwas engere Gegner-Range — du musst disziplinierter folden als gegen BTN.'
    },
    {
      id: 'bb_vs_ep_def', tag: 'DEF', freq: 5,
      name: 'EP/MP öffnet, du callst im BB (Defense)',
      heroPos: 'BB', villPos: 'MP', heroIP: false, role: 'CALLER', potType: 'SRP',
      heroRange: b => adjustForStack(BB_FLAT.EP, b), villRange: b => adjustForStack(RFI.EP, b),
      story: 'Gegen eine starke Range: Top Pair ist hier oft nur ein Bluffcatcher.'
    },
    {
      id: 'btn_vs_co_def', tag: 'DEF', freq: 5,
      name: 'CO öffnet, du callst am BTN (IP Defense)',
      heroPos: 'BTN', villPos: 'CO', heroIP: true, role: 'CALLER', potType: 'SRP',
      heroRange: () => IP_FLAT.BTN_vs_CO, villRange: b => adjustForStack(RFI.CO, b),
      story: 'Position + gecappte eigene Range. Floaten und Turn-Aggression sind hier Gold wert.'
    },
    // ---- 3-Bet-Pots ----
    {
      id: '3bp_bb_vs_btn_oop', tag: '3BP', freq: 6,
      name: 'Du 3-bettest aus dem BB, BTN callt (OOP)',
      heroPos: 'BB', villPos: 'BTN', heroIP: false, role: '3BET', potType: '3BP',
      heroRange: () => THREEBET.BB_vs_BTN, villRange: () => CALL_3BET.BTN_vs_BB,
      story: 'Niedriger SPR, du hast Nut-Advantage. Große Sizings, wenige Streets bis all-in.'
    },
    {
      id: '3bp_btn_call_ip', tag: '3BP', freq: 5,
      name: 'BB 3-bettet, du callst am BTN (IP)',
      heroPos: 'BTN', villPos: 'BB', heroIP: true, role: 'CALL3B', potType: '3BP',
      heroRange: () => CALL_3BET.BTN_vs_BB, villRange: () => THREEBET.BB_vs_BTN,
      story: 'Gecappte Range gegen Polarisierung — aber du hast Position und SPR ist klein.'
    },
    {
      id: '3bp_btn_vs_co_ip', tag: '3BP', freq: 5,
      name: 'Du 3-bettest am BTN, CO callt (IP)',
      heroPos: 'BTN', villPos: 'CO', heroIP: true, role: '3BET', potType: '3BP',
      heroRange: () => THREEBET.BTN_vs_CO, villRange: () => CALL_3BET.CO_vs_BTN,
      story: 'Position + Nut-Advantage + niedriger SPR = der profitabelste 3-Bet-Pot.'
    },
    {
      id: '3bp_ep_call_oop', tag: '3BP', freq: 3,
      name: 'Du openst EP, BTN 3-bettet, du callst (OOP)',
      heroPos: 'MP', villPos: 'BTN', heroIP: false, role: 'CALL3B', potType: '3BP',
      heroRange: () => CALL_3BET.EP_vs_BTN, villRange: () => THREEBET.BTN_vs_EP,
      story: 'Der schwierigste Spot: OOP, gecappt, niedriger SPR. Diszipliniert checken/folden.'
    }
  ].concat(MULTIWAY);

  /** Pot & Stack-Geometrie für einen Spot (in Big Blinds). Ante = 1bb (BB-Ante). */
  function geometry(spot, band) {
    const S = STACKS[band];
    const ante = 1.0;
    if (spot.potType === 'SRP') {
      // Multiway zahlen mehr Spieler ein -> größerer Pot, kleinerer SPR
      const payers = 1 + (spot.opponents || 1);
      const pot = (spot.id === 'mw_limped' ? 1 : S.open) * payers + 0.5 + ante;
      const eff = S.bb - S.open;
      return { pot: +pot.toFixed(1), eff: +eff.toFixed(1), spr: +(eff / pot).toFixed(1), stack: S.bb };
    }
    const pot = S.threeBet * 2 + 0.5 + ante;
    const eff = S.bb - S.threeBet;
    return { pot: +pot.toFixed(1), eff: +eff.toFixed(1), spr: +(eff / pot).toFixed(1), stack: S.bb };
  }

  function weightedPick(list) {
    const tot = list.reduce((a, s) => a + (s.freq || 1), 0);
    let r = P.rng() * tot;
    for (const s of list) { r -= (s.freq || 1); if (r <= 0) return s; }
    return list[list.length - 1];
  }

  Object.assign(P, {
    RFI, BB_FLAT, IP_FLAT, THREEBET, CALL_3BET, STACKS, SPOTS,
    geometry, weightedPick, adjustForStack
  });
})();
