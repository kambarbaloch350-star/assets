import { Rng } from '../src/core/rng';
import { makeExpressions, targetRange, toFa } from '../src/core/equations';
import { solve } from '../src/core/solver';
import type { Card, Foundation } from '../src/core/types';

function build(
  families: number,
  perFamily: number,
  piles: number,
  foundations: number,
  down: number,
  stockRatio: number,
  seed: number,
) {
  const rng = new Rng(seed);
  let id = 1;
  const [lo, hi] = targetRange(2);
  const cand: number[] = [];
  for (let v = lo; v <= hi; v++) cand.push(v);
  rng.shuffle(cand);
  const fv = cand.slice(0, families);
  const deck: Card[] = [];
  fv.forEach((v, fi) => {
    deck.push({ id: id++, kind: 'master', family: fi, value: v, label: toFa(v), faceUp: true });
    for (const e of makeExpressions(v, perFamily, 2, rng))
      deck.push({ id: id++, kind: 'member', family: fi, value: v, label: e, faceUp: true });
  });
  const fnds: Foundation[] = Array.from({ length: foundations }, () => ({
    family: -1, cards: [], needed: perFamily + 1, bonus: false,
  }));
  rng.shuffle(deck);
  const total = families * (perFamily + 1);
  const sc = Math.min(Math.max(0, Math.floor(total * stockRatio)), Math.max(0, deck.length - piles * 2));
  const stock = deck.slice(deck.length - sc);
  const tab = deck.slice(0, deck.length - sc);
  const P: Card[][] = Array.from({ length: piles }, () => []);
  tab.forEach((c, i) => P[i % piles].push(c));
  for (const p of P) {
    const hide = Math.min(down, Math.max(0, p.length - 1));
    p.forEach((c, i) => (c.faceUp = i >= hide));
    if (p.length) p[p.length - 1].faceUp = true;
  }
  return { piles: P, fnds, stock };
}

function rate(
  families: number, perFamily: number, piles: number, foundations: number,
  down: number, stockRatio: number, tries = 10,
): number {
  let ok = 0;
  for (let i = 0; i < tries; i++) {
    const b = build(families, perFamily, piles, foundations, down, stockRatio, 7000 + i * 104729);
    if (solve(b.piles, b.fnds, b.stock, 14_000, 80).solved) ok++;
  }
  return ok / tries;
}

console.log('fam per piles fnd down stock | total | solvable%');
const rows: string[] = [];
for (const [fam, per, piles, fnd] of [
  [5, 3, 5, 3], [5, 3, 5, 4], [6, 3, 6, 4], [6, 3, 6, 5],
  [6, 4, 6, 4], [7, 3, 6, 4], [7, 3, 7, 5], [7, 4, 7, 5],
  [8, 3, 7, 5], [8, 4, 7, 5], [8, 3, 8, 5], [8, 4, 8, 6],
  [9, 4, 8, 6], [10, 4, 8, 6], [10, 4, 9, 6], [12, 4, 9, 6],
] as [number, number, number, number][]) {
  for (const down of [0, 1, 2]) {
    for (const sr of [0.15]) {
      const r = rate(fam, per, piles, fnd, down, sr);
      const total = fam * (per + 1);
      rows.push(
        `${String(fam).padStart(3)} ${String(per).padStart(3)} ${String(piles).padStart(5)} ` +
          `${String(fnd).padStart(3)} ${String(down).padStart(4)} ${sr.toFixed(2)} | ` +
          `${String(total).padStart(5)} | ${(r * 100).toFixed(0)}%`,
      );
    }
  }
}
console.log(rows.join('\n'));
