/**
 * Balance + solvability harness.
 *
 * For each level it:
 *   1. deals exactly what a player would get (Engine, verified at deal time),
 *   2. replays the engine's own hint() — i.e. the solver's winning line —
 *      through the REAL Engine.apply() path, proving the rules the player
 *      plays under can actually reach the win,
 *   3. reports the move budget vs. the optimal line so the curve can be tuned.
 *
 *   npx tsx tools/simulate.ts [from] [to]
 */
import { Engine } from '../src/core/engine';
import { TOTAL_LEVELS, starsFor } from '../src/core/levels';

function playWithHints(level: number): {
  won: boolean;
  moves: number;
  left: number;
  ms: number;
} {
  const t0 = Date.now();
  const e = new Engine(level, 0);
  let guard = 0;

  while (guard++ < 600) {
    if (e.won) break;
    if (e.movesLeft <= 0) break;
    const m = e.hint();
    if (!m) break;
    const r = e.apply(m);
    if (!r.ok) break;
  }
  return { won: e.won, moves: e.movesUsed, left: e.cardsLeft, ms: Date.now() - t0 };
}

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? TOTAL_LEVELS);

let ok = 0;
const failed: number[] = [];
const rows: string[] = [];
let slowest = 0;

for (let lv = from; lv <= to; lv++) {
  const e = new Engine(lv, 0);
  const dealMs = 0;
  const r = playWithHints(lv);
  slowest = Math.max(slowest, r.ms);

  if (r.won) {
    ok++;
    const head = starsFor(e.cfg, r.moves);
    const ratio = (r.moves / e.cfg.moves).toFixed(2);
    rows.push(
      `L${String(lv).padStart(3)}  cards=${String(e.cfg.totalCards).padStart(3)} ` +
        `fam=${String(e.cfg.families).padStart(2)} piles=${e.cfg.piles} fnd=${e.cfg.foundations} ` +
        `down=${e.cfg.faceDownPerPile} tier=${e.cfg.tier}  ` +
        `budget=${String(e.cfg.moves).padStart(4)} solved_in=${String(r.moves).padStart(3)} ` +
        `use=${ratio} stars=${head} ${r.ms}ms`,
    );
  } else {
    failed.push(lv);
    rows.push(
      `L${String(lv).padStart(3)}  *** UNSOLVED *** left=${r.left} moves=${r.moves}/${e.cfg.moves} ${r.ms}ms`,
    );
  }
  void dealMs;
}

console.log(rows.join('\n'));
console.log(
  `\n=== ${ok}/${to - from + 1} levels completed via solver line` +
    (failed.length ? `; FAILED: ${failed.join(', ')}` : '') +
    `; slowest level ${slowest}ms ===`,
);
