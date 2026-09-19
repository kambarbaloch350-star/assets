import type { Card, Foundation, Move } from './types';

/**
 * Beam-search solver.
 *
 * Used for two things:
 *   1. GENERATION — every dealt board is proven winnable before the player
 *      sees it, so "stuck" is always the player's doing, never an unfair deal.
 *   2. HINTS — a hint replays the solver's next move, so it is always a move
 *      that still leads to a win, not merely a legal one.
 *
 * Performance comes from three things:
 *   • forced-move reduction: a move that COMPLETES a foundation is never
 *     wrong, so it is played immediately with zero branching;
 *   • canonical state keys: columns/foundations are interchangeable and cards
 *     of the same family are interchangeable, which collapses huge numbers of
 *     duplicate states;
 *   • a fixed-width beam, so cost is linear in depth instead of exponential.
 */

export interface SolveResult {
  solved: boolean;
  first?: Move;
  line: Move[];
  nodes: number;
}

/**
 * FAST feasibility check used at deal time.
 *
 * It does not search: it simply plays the board with the "clear families in
 * their construction order" strategy, parking any card that is in the way on
 * a free column or an open foundation. If that strategy finishes the board,
 * the deal is definitely winnable. It is a sufficient (not necessary)
 * condition, which is exactly what generation needs — and it runs in
 * microseconds instead of milliseconds.
 */
export function quickFeasible(
  piles: Card[][],
  fnds: Foundation[],
  stock: Card[],
): boolean {
  const P = piles.map((p) => p.map((c) => ({ ...c })));
  const F = fnds.map((f) => ({ ...f, cards: f.cards.slice() }));
  const S = stock.map((c) => ({ ...c }));

  const total = () => {
    let r = S.length;
    for (const p of P) r += p.length;
    for (const f of F) r += f.cards.length;
    return r;
  };

  let guard = 0;
  const limit = (total() + 8) * 12;

  while (guard++ < limit) {
    if (total() === 0) return true;
    let acted = false;

    // reveal any face-down top
    for (const p of P) {
      if (p.length && !p[p.length - 1].faceUp) {
        p[p.length - 1].faceUp = true;
        acted = true;
      }
    }

    // 1. play every top card that a foundation accepts
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (!p.length) continue;
      const top = p[p.length - 1];
      if (!top.faceUp) continue;

      // continue an open family
      let placed = false;
      for (const f of F) {
        if (f.family === -1) continue;
        if (f.cards.length >= f.needed) continue;
        if (top.kind === 'joker' || (top.family === f.family && top.kind !== 'master')) {
          f.cards.push(p.pop()!);
          if (f.cards.length >= f.needed) {
            f.family = -1;
            f.cards = [];
          }
          placed = true;
          acted = true;
          break;
        }
      }
      if (placed) continue;

      // open a new family with a master
      if (top.kind === 'master' && !F.some((f) => f.family === top.family)) {
        const free = F.find((f) => f.family === -1);
        if (free) {
          free.family = top.family;
          free.cards.push(p.pop()!);
          acted = true;
        }
      }
    }
    if (acted) continue;

    // 2. park a blocking top card onto a same-family column or an empty one
    let parked = false;
    for (let i = 0; i < P.length && !parked; i++) {
      const p = P[i];
      if (p.length < 1) continue;
      const top = p[p.length - 1];
      if (!top.faceUp) continue;

      for (let q = 0; q < P.length; q++) {
        if (q === i) continue;
        const d = P[q];
        if (d.length) {
          const dt = d[d.length - 1];
          if (!dt.faceUp) continue;
          if (dt.family !== top.family && dt.kind !== 'joker' && top.kind !== 'joker') continue;
        } else if (p.length === 1) {
          continue; // pointless column relocation
        }
        d.push(p.pop()!);
        parked = true;
        acted = true;
        break;
      }
    }
    if (acted) continue;

    // 3. deal from stock
    if (S.length) {
      const targets: number[] = [];
      for (let i = 0; i < P.length; i++) if (P[i].length) targets.push(i);
      const dest = targets.length ? targets : P.map((_, i) => i);
      for (const i of dest) {
        const c = S.pop();
        if (!c) break;
        c.faceUp = true;
        P[i].push(c);
      }
      continue;
    }

    return false; // no progress possible
  }
  return total() === 0;
}

interface Node {
  piles: Card[][];
  fnds: Foundation[];
  stock: Card[];
  path: Move[];
  score: number;
}

// ------------------------------------------------------------------ keys

function tok(c: Card): number {
  // pack (kind, family, faceUp) into a small int
  const k = c.kind === 'master' ? 1 : c.kind === 'joker' ? 2 : 0;
  return ((c.family + 2) << 3) | (k << 1) | (c.faceUp ? 1 : 0);
}

function keyOf(n: Node): string {
  const cols: string[] = [];
  for (const p of n.piles) {
    let s = '';
    for (const c of p) s += tok(c).toString(36) + '.';
    cols.push(s);
  }
  cols.sort();
  const f: string[] = [];
  for (const x of n.fnds) f.push(x.family === -1 ? '-' : `${x.family}:${x.cards.length}`);
  f.sort();
  return cols.join('|') + '/' + f.join(',') + '/' + n.stock.length;
}

// ----------------------------------------------------------------- rules

function runAt(pile: Card[], index: number): boolean {
  if (index < 0 || index >= pile.length) return false;
  if (!pile[index].faceUp) return false;
  let fam = pile[index].family;
  for (let k = index + 1; k < pile.length; k++) {
    const c = pile[k];
    if (!c.faceUp) return false;
    if (c.kind === 'joker' || fam === -1) {
      if (c.family !== -1) fam = c.family;
      continue;
    }
    if (c.family !== fam) return false;
  }
  return true;
}

function maxRun(pile: Card[]): number {
  for (let i = 0; i < pile.length; i++) if (runAt(pile, i)) return pile.length - i;
  return 0;
}

function canToFnd(cards: Card[], f: Foundation, fnds: Foundation[]): boolean {
  if (f.family === -1) {
    if (cards[0].kind !== 'master') return false;
    const fam = cards[0].family;
    for (const x of fnds) if (x.family === fam) return false;
    for (const c of cards) if (c.family !== fam && c.kind !== 'joker') return false;
    return true;
  }
  if (f.cards.length + cards.length > f.needed) return false;
  for (const c of cards) {
    if (c.kind === 'joker') continue;
    if (c.family !== f.family || c.kind === 'master') return false;
  }
  return true;
}

function canToPile(moving: Card, dst: Card[]): boolean {
  if (!dst.length) return true;
  const top = dst[dst.length - 1];
  if (!top.faceUp) return false;
  if (top.kind === 'joker' || moving.kind === 'joker') return true;
  return top.family === moving.family;
}

// ------------------------------------------------------------ transitions

function cloneNode(n: Node): Node {
  return {
    piles: n.piles.map((p) => p.slice()),
    fnds: n.fnds.map((f) => ({ ...f, cards: f.cards.slice() })),
    stock: n.stock.slice(),
    path: n.path,
    score: 0,
  };
}

function apply(n: Node, m: Move): Node | null {
  const c = cloneNode(n);

  if (m.t === 'stock') {
    if (!c.stock.length) return null;
    const targets: number[] = [];
    for (let i = 0; i < c.piles.length; i++) if (c.piles[i].length) targets.push(i);
    const dest = targets.length ? targets : c.piles.map((_, i) => i);
    for (const i of dest) {
      const card = c.stock.pop();
      if (!card) break;
      c.piles[i].push({ ...card, faceUp: true });
    }
  } else if (m.t === 'tableau') {
    const src = c.piles[m.from];
    const moving = src.splice(src.length - m.count, m.count);
    c.piles[m.to].push(...moving);
    if (src.length && !src[src.length - 1].faceUp)
      src[src.length - 1] = { ...src[src.length - 1], faceUp: true };
  } else if (m.t === 'foundation') {
    const src = c.piles[m.from];
    const moving = src.splice(src.length - m.count, m.count);
    const f = c.fnds[m.fnd];
    if (f.family === -1) f.family = moving[0].family;
    f.cards.push(...moving);
    if (f.cards.length >= f.needed) {
      f.family = -1;
      f.cards = [];
    }
    if (src.length && !src[src.length - 1].faceUp)
      src[src.length - 1] = { ...src[src.length - 1], faceUp: true };
  } else {
    return null;
  }

  c.path = n.path.concat(m);
  return c;
}

/**
 * A move that finishes a foundation can always be taken immediately —
 * removing a completed family never closes off any other line.
 */
function forcedMove(n: Node): Move | null {
  for (let p = 0; p < n.piles.length; p++) {
    const pile = n.piles[p];
    if (!pile.length) continue;
    const run = maxRun(pile);
    for (let count = 1; count <= run; count++) {
      const cards = pile.slice(pile.length - count);
      for (let f = 0; f < n.fnds.length; f++) {
        const fnd = n.fnds[f];
        if (fnd.family === -1) continue;
        if (fnd.cards.length + count === fnd.needed && canToFnd(cards, fnd, n.fnds)) {
          return { t: 'foundation', from: p, fnd: f, count };
        }
      }
    }
  }
  return null;
}

function expand(n: Node): Move[] {
  const out: Move[] = [];
  let firstEmpty = -1;
  for (let i = 0; i < n.piles.length; i++)
    if (!n.piles[i].length) {
      firstEmpty = i;
      break;
    }

  for (let p = 0; p < n.piles.length; p++) {
    const pile = n.piles[p];
    if (!pile.length) continue;
    const run = maxRun(pile);

    for (let count = 1; count <= run; count++) {
      const cards = pile.slice(pile.length - count);

      for (let f = 0; f < n.fnds.length; f++) {
        if (canToFnd(cards, n.fnds[f], n.fnds)) out.push({ t: 'foundation', from: p, fnd: f, count });
      }

      let usedEmpty = false;
      for (let q = 0; q < n.piles.length; q++) {
        if (q === p) continue;
        const dst = n.piles[q];
        if (!canToPile(cards[0], dst)) continue;
        if (!dst.length) {
          if (count === pile.length) continue; // pointless relocation
          if (usedEmpty || q !== firstEmpty) continue; // empty columns are equivalent
          usedEmpty = true;
        }
        out.push({ t: 'tableau', from: p, to: q, count });
      }
    }
  }

  if (n.stock.length) out.push({ t: 'stock' });
  return out;
}

function remaining(n: Node): number {
  let r = n.stock.length;
  for (const p of n.piles) r += p.length;
  for (const f of n.fnds) r += f.cards.length;
  return r;
}

function evaluate(n: Node): number {
  let hidden = 0;
  let buried = 0;
  for (const p of n.piles) {
    for (let i = 0; i < p.length; i++) {
      if (!p[i].faceUp) hidden++;
      // a master trapped under other cards is the main source of dead ends
      else if (p[i].kind === 'master' && i < p.length - 1) buried++;
    }
  }
  let prog = 0;
  for (const f of n.fnds) prog += f.cards.length;
  // lower is better
  return remaining(n) * 4 + hidden * 3 + buried * 2 - prog;
}

// ------------------------------------------------------------------ solve

export function solve(
  piles: Card[][],
  fnds: Foundation[],
  stock: Card[],
  budget = 20_000,
  beamWidth = 90,
): SolveResult {
  let root: Node = {
    piles: piles.map((p) => p.slice()),
    fnds: fnds.map((f) => ({ ...f, cards: f.cards.slice() })),
    stock: stock.slice(),
    path: [],
    score: 0,
  };

  // play out any forced completions before searching
  let fm: Move | null;
  let guard = 0;
  while ((fm = forcedMove(root)) && guard++ < 400) {
    const nx = apply(root, fm);
    if (!nx) break;
    root = nx;
  }
  if (remaining(root) === 0) {
    return { solved: true, first: root.path[0], line: root.path, nodes: 0 };
  }

  const seen = new Set<string>([keyOf(root)]);
  let beam: Node[] = [root];
  let nodes = 0;
  const maxDepth = remaining(root) * 6 + 40;

  for (let depth = 0; depth < maxDepth && beam.length; depth++) {
    const children: Node[] = [];

    for (const n of beam) {
      if (nodes >= budget) break;

      for (const m of expand(n)) {
        let child = apply(n, m);
        if (!child) continue;
        nodes++;

        // chain forced completions immediately
        let f2: Move | null;
        let g2 = 0;
        while ((f2 = forcedMove(child)) && g2++ < 400) {
          const nx = apply(child, f2);
          if (!nx) break;
          child = nx;
        }

        if (remaining(child) === 0) {
          return { solved: true, first: child.path[0], line: child.path, nodes };
        }

        const k = keyOf(child);
        if (seen.has(k)) continue;
        seen.add(k);

        child.score = evaluate(child);
        children.push(child);
      }
    }

    if (!children.length || nodes >= budget) break;
    children.sort((a, b) => a.score - b.score);
    beam = children.slice(0, beamWidth);
  }

  return { solved: false, line: [], nodes };
}
