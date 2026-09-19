import { Engine } from '../src/core/engine';

const levels = [1, 5, 10, 20, 30, 40, 55, 70, 90, 110, 120];
console.log('level  dealMs  firstHintMs  cards  variantsNeeded');

for (const lv of levels) {
  const t0 = Date.now();
  const e = new Engine(lv, 0);
  const deal = Date.now() - t0;

  const t1 = Date.now();
  e.hint();
  const hint = Date.now() - t1;

  console.log(
    `${String(lv).padStart(5)}  ${String(deal).padStart(6)}  ${String(hint).padStart(11)}  ` +
      `${String(e.cfg.totalCards).padStart(5)}  solLen=${e.solution.length}`,
  );
}
