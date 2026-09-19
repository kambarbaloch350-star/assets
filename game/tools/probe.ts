import { Rng, levelSeed } from '../src/core/rng';
import { makeExpressions, targetRange, toFa } from '../src/core/equations';
import { levelConfig } from '../src/core/levels';
import { solve } from '../src/core/solver';
import type { Card, Foundation } from '../src/core/types';

/** Rebuild a raw candidate deal the same way Engine.build does, then solve it. */
function build(level: number, seed: number) {
  const cfg = levelConfig(level);
  const familySize = cfg.perFamily + 1;
  const rng = new Rng(seed);
  let id = 1;

  const [lo, hi] = targetRange(cfg.tier);
  const cand: number[] = [];
  for (let v = lo; v <= hi; v++) cand.push(v);
  rng.shuffle(cand);
  const familyValue = cand.slice(0, cfg.families);

  const deck: Card[] = [];
  familyValue.forEach((v, fi) => {
    deck.push({ id: id++, kind: 'master', family: fi, value: v, label: toFa(v), faceUp: true });
    for (const e of makeExpressions(v, cfg.perFamily, cfg.tier, rng))
      deck.push({ id: id++, kind: 'member', family: fi, value: v, label: e, faceUp: true });
  });

  const foundations: Foundation[] = Array.from({ length: cfg.foundations }, () => ({
    family: -1,
    cards: [],
    needed: familySize,
    bonus: false,
  }));

  rng.shuffle(deck);
  const stockCount = Math.min(
    Math.max(0, Math.floor(cfg.totalCards * 0.18)),
    Math.max(0, deck.length - cfg.piles * 2),
  );
  const stock = deck.slice(deck.length - stockCount);
  const tab = deck.slice(0, deck.length - stockCount);
  const piles: Card[][] = Array.from({ length: cfg.piles }, () => []);
  tab.forEach((c, i) => piles[i % cfg.piles].push(c));
  for (const p of piles) {
    const hide = Math.min(cfg.faceDownPerPile, Math.max(0, p.length - 1));
    p.forEach((c, i) => (c.faceUp = i >= hide));
    if (p.length) p[p.length - 1].faceUp = true;
  }
  return { cfg, piles, foundations, stock };
}

const lv = Number(process.argv[2] ?? 1);
console.log('--- level', lv);
for (let v = 0; v < 6; v++) {
  const seed = (levelSeed(lv, 0) + v * 0x9e3779b1) >>> 0;
  const b = build(lv, seed);
  const t0 = Date.now();
  const r = solve(b.piles, b.foundations, b.stock, 60_000);
  console.log(
    `variant ${v}: solved=${r.solved} nodes=${r.nodes} lineLen=${r.line.length} ms=${Date.now() - t0}`,
  );
  if (r.solved) break;
}

// sanity: the absolutely simplest possible board
const cfg = levelConfig(1);
console.log('\ncfg L1', cfg);
