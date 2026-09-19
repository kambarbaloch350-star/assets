import { Rng } from '../src/core/rng';
import { makeExpressions, targetRange, toFa } from '../src/core/equations';
import { levelConfig } from '../src/core/levels';
import { solve } from '../src/core/solver';
import type { Card, Foundation } from '../src/core/types';

function build(level: number, seed: number, downOverride?: number, stockRatio = 0.18) {
  const cfg = levelConfig(level);
  const familySize = cfg.perFamily + 1;
  const rng = new Rng(seed);
  let id = 1;
  const [lo, hi] = targetRange(cfg.tier);
  const cand: number[] = [];
  for (let v = lo; v <= hi; v++) cand.push(v);
  rng.shuffle(cand);
  const fv = cand.slice(0, cfg.families);
  const deck: Card[] = [];
  fv.forEach((v, fi) => {
    deck.push({ id: id++, kind: 'master', family: fi, value: v, label: toFa(v), faceUp: true });
    for (const e of makeExpressions(v, cfg.perFamily, cfg.tier, rng))
      deck.push({ id: id++, kind: 'member', family: fi, value: v, label: e, faceUp: true });
  });
  const foundations: Foundation[] = Array.from({ length: cfg.foundations }, () => ({
    family: -1, cards: [], needed: familySize, bonus: false,
  }));
  rng.shuffle(deck);
  const sc = Math.min(Math.max(0, Math.floor(cfg.totalCards * stockRatio)), Math.max(0, deck.length - cfg.piles * 2));
  const stock = deck.slice(deck.length - sc);
  const tab = deck.slice(0, deck.length - sc);
  const piles: Card[][] = Array.from({ length: cfg.piles }, () => []);
  tab.forEach((c, i) => piles[i % cfg.piles].push(c));
  const down = downOverride ?? cfg.faceDownPerPile;
  for (const p of piles) {
    const hide = Math.min(down, Math.max(0, p.length - 1));
    p.forEach((c, i) => (c.faceUp = i >= hide));
    if (p.length) p[p.length - 1].faceUp = true;
  }
  return { cfg, piles, foundations, stock };
}

const lv = Number(process.argv[2] ?? 30);
console.log(`level ${lv}  cfg=`, levelConfig(lv));

for (const [down, beam, budget] of [
  [undefined, 70, 12_000],
  [undefined, 200, 40_000],
  [0, 70, 12_000],
  [1, 70, 12_000],
  [1, 200, 40_000],
] as [number | undefined, number, number][]) {
  let ok = 0;
  let tot = 0;
  const t0 = Date.now();
  for (let v = 0; v < 12; v++) {
    const b = build(lv, 1000 + v * 7919, down);
    const r = solve(b.piles, b.foundations, b.stock, budget, beam);
    if (r.solved) ok++;
    tot++;
  }
  console.log(
    `down=${down ?? 'cfg'} beam=${beam} budget=${budget}: ${ok}/${tot} solvable, ${Date.now() - t0}ms total`,
  );
}
