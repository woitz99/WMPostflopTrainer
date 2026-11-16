/* build-index.js — schreibt data/solver/index.json: nur die Einträge aus
   plan.json, deren Lösung schon in data/solver/ liegt. So bietet der Tab
   nie einen Flop als "Solver-Flop" an, der noch nicht gerechnet ist.
     node tools/solver/build-index.js */
const fs = require('fs'), path = require('path');
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'plan.json'), 'utf8'));
const dir = path.join(__dirname, '..', '..', 'data', 'solver');
fs.mkdirSync(dir, { recursive: true });
const done = plan.spots.filter(s => fs.existsSync(path.join(dir, s.id + '.json')));
fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ v: 1, chipsPerBB: plan.chipsPerBB, spots: done }, null, 1));
console.log(`Index: ${done.length} von ${plan.spots.length} Lösungen vorhanden -> data/solver/index.json`);
