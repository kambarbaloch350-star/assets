import { Engine } from '../src/core/engine';
import { levelConfig } from '../src/core/levels';
import { quickFeasible } from '../src/core/solver';

/** Measure: for each level, how many of 40 variants pass quickFeasible. */
const levels = [10, 20, 30, 40, 55, 70, 90, 110, 120];
console.log('level fam per piles fnd down | pass/40 | dealMs');

for (const lv of levels) {
  const cfg = levelConfig(lv);
  let pass = 0;
  const t0 = Date.now();
  for (let a = 0; a < 40; a++) {
    // Build via Engine but measure the first variant's feasibility by
    // constructing repeatedly with different attempts.
    const e = new Engine(lv, a);
    if (quickFeasible(e.piles, e.foundations, e.stock)) pass++;
  }
  console.log(
    `${String(lv).padStart(5)} ${String(cfg.families).padStart(3)} ${String(cfg.perFamily).padStart(3)} ` +
      `${String(cfg.piles).padStart(5)} ${String(cfg.foundations).padStart(3)} ${String(cfg.faceDownPerPile).padStart(4)} | ` +
      `${String(pass).padStart(6)}/40 | ${Date.now() - t0}ms`,
  );
}
