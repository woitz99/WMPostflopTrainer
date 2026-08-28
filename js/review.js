/* =========================================================================
   review.js — Spaced Repetition (Leitner-Boxen) für die Fehler-Wiederholung.
   Bewusst ohne jeden DOM-Zugriff: das sind die Regeln, die stimmen müssen,
   und die lassen sich so direkt in Node testen.

   Box 1 ≈ 4 Minuten  -> kommt in derselben Session wieder (ca. 15–25 Hände
                         später): lang genug, dass du neu denken musst, kurz
                         genug, dass die Wiederholung nicht verloren geht.
   Box 2..5 = 1 / 3 / 7 / 21 Tage.
   Richtig  -> eine Box hoch.   Falsch -> zurück auf Box 1.
   Richtig in Box 5 -> gemeistert, fliegt aus der Liste.
   ========================================================================= */
(function () {
  const DAY = 86400000;
  const BOX_DAYS = [0, 0.003, 1, 3, 7, 21];
  const MAX_BOX = 5;
  const MAX_ITEMS = 500;         // ~3 kB pro Schnappschuss -> grob 1.5 MB

  /** Fällige Einträge, älteste Fälligkeit zuerst. */
  function due(items, now) {
    now = now === undefined ? Date.now() : now;
    return (items || []).filter(i => (i.due || 0) <= now)
      .sort((a, b) => (a.due || 0) - (b.due || 0));
  }

  /** Setzt Box und nächste Fälligkeit. Mutiert item. */
  function schedule(item, correct, now) {
    now = now === undefined ? Date.now() : now;
    item.box = correct ? Math.min(MAX_BOX, (item.box || 1) + 1) : 1;
    item.due = now + BOX_DAYS[item.box] * DAY;
    item.seen = (item.seen || 0) + 1;
    return item;
  }

  /**
   * Ergebnis einer Wiederholung verbuchen.
   * @returns {{mastered:boolean}}
   */
  function applyResult(store, item, correct, now) {
    if (correct && (item.box || 1) >= MAX_BOX) {
      store.items = store.items.filter(x => x.id !== item.id);
      item.seen = (item.seen || 0) + 1;
      return { mastered: true };
    }
    schedule(item, correct, now);
    return { mastered: false };
  }

  /** Hält die Liste im Budget — die ältesten Einträge fallen raus. */
  function trim(store) {
    if (store.items.length > MAX_ITEMS) store.items = store.items.slice(-MAX_ITEMS);
    return store;
  }

  window.PT = window.PT || {};
  window.PT.Review = { DAY, BOX_DAYS, MAX_BOX, MAX_ITEMS, due, schedule, applyResult, trim };
})();
