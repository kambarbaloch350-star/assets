import { Engine } from '../src/core/engine';

const lv = Number(process.argv[2] ?? 1);
const e = new Engine(lv, 0);

console.log('cfg', e.cfg);
console.log('familyValue', e.familyValue);
console.log('stock', e.stock.length);
console.log(
  'piles:',
  e.piles.map((p) => p.map((c) => `${c.faceUp ? '' : '#'}${c.kind[0]}${c.family}`).join(' ')),
);

let steps = 0;
while (steps++ < 3000) {
  if (e.won) {
    console.log('WON in', e.movesUsed);
    break;
  }
  const ms = e.legalMoves();
  if (!ms.length) {
    console.log('\n*** DEADLOCK at step', steps, 'movesUsed', e.movesUsed, 'cardsLeft', e.cardsLeft);
    console.log(
      'piles:',
      e.piles.map((p) => p.map((c) => `${c.faceUp ? '' : '#'}${c.kind[0]}${c.family}`).join(' ')),
    );
    console.log(
      'fnds:',
      e.foundations.map((f) => `fam${f.family}:${f.cards.length}/${f.needed}`),
    );
    console.log('stock', e.stock.length);
    break;
  }
  e.apply(ms[0].move);
}
if (steps >= 3000) {
  console.log('LOOPED OUT. movesUsed', e.movesUsed, 'cardsLeft', e.cardsLeft);
  console.log(
    'piles:',
    e.piles.map((p) => p.map((c) => `${c.faceUp ? '' : '#'}${c.kind[0]}${c.family}`).join(' ')),
  );
  console.log('fnds:', e.foundations.map((f) => `fam${f.family}:${f.cards.length}/${f.needed}`));
}
