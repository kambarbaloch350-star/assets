import { Engine } from '../src/core/engine';
import { solve } from '../src/core/solver';

/** Greedy oracle that follows the construction's intended plan:
 *  always play any card that can go to a foundation; else park; else stock. */
function oraclePlay(e: Engine, maxSteps = 2000): boolean {
  let steps = 0;
  while (steps++ < maxSteps) {
    if (e.won) return true;
    const ms = e.legalMoves();
    if (!ms.length) return false;
    // prefer foundation moves, then uncovering moves, then stock
    const f = ms.find((m) => m.move.t === 'foundation');
    const chosen = f ?? ms[0];
    if (!e.apply(chosen.move).ok) return false;
  }
  return e.won;
}

const lv = Number(process.argv[2] ?? 30);

// Inspect the raw constructed board before solver verification by
// reaching into a fresh Engine (which already ran verification/fallback).
const e = new Engine(lv, 0);
console.log(`L${lv} cfg`, e.cfg);
console.log('solution length recorded:', e.solution.length);
console.log(
  'piles (rank-tokens):',
  e.piles.map((p) => p.map((c) => `${c.faceUp ? '' : '#'}${c.kind==='master'?'M':c.kind==='joker'?'J':'c'}${c.family}`).join(' ')),
);
console.log('stock', e.stock.length);

const t0 = Date.now();
const r = solve(e.piles, e.foundations, e.stock, 60_000, 400);
console.log(`solver(beam 400, 60k): solved=${r.solved} nodes=${r.nodes} ms=${Date.now() - t0}`);

const e2 = new Engine(lv, 0);
console.log('greedy oracle wins:', oraclePlay(e2), 'movesUsed', e2.movesUsed, 'left', e2.cardsLeft);
