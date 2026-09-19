import { Rng, levelSeed } from './rng';
import { makeExpressions, targetRange, toFa } from './equations';
import { levelConfig } from './levels';
import { solve, quickFeasible } from './solver';
import type { Card, Foundation, LevelConfig, Move, PileId, Snapshot } from './types';

export interface HintMove {
  move: Move;
  /** higher = better suggestion */
  score: number;
}

/**
 * Core rules (mirrors the original Math Solitaire):
 *
 *  • Tableau → Foundation
 *      - empty foundation accepts ONLY a master card (the bare number)
 *      - a started foundation accepts members of its family, or a joker
 *      - stacking the last missing card clears the foundation with a burst
 *  • Tableau → Tableau
 *      - a card may sit on another card of the SAME family
 *      - a run of same-family cards moves as one block
 *      - an empty column accepts anything
 *  • Stock
 *      - deals one card onto every non-empty column, or onto empty ones
 *        when nothing else is left
 */
export class Engine {
  cfg: LevelConfig;
  piles: Card[][] = [];
  foundations: Foundation[] = [];
  stock: Card[] = [];
  movesUsed = 0;
  cleared = 0;
  /** number of cards needed per family (master + members) */
  familySize: number;
  /** target value of each family, by family index */
  familyValue: number[] = [];
  /** a proven winning line for the initial deal (used as a hint fallback) */
  solution: Move[] = [];

  private undoStack: Snapshot[] = [];
  private nextId = 1;

  constructor(level: number, attempt = 0) {
    this.cfg = levelConfig(level);
    this.familySize = this.cfg.perFamily + 1;
    this.deal(levelSeed(level, attempt));
  }

  // ---------------------------------------------------------------- dealing

  private deal(seed: number) {
    // Try successive shuffles until the solver PROVES the board is winnable.
    // Deterministic: the same (level, attempt) always yields the same board.
    for (let variant = 0; variant < 60; variant++) {
      const rng = new Rng((seed + variant * 0x9e3779b1) >>> 0);
      const built = this.build(rng);
      // Cheap sufficient check first (microseconds); only fall back to the
      // full beam search if the greedy plan cannot close the board.
      let good = quickFeasible(built.piles, built.foundations, built.stock);
      let line: Move[] = [];
      if (!good) {
        const check = solve(built.piles, built.foundations, built.stock, 8_000, 60);
        good = check.solved;
        line = check.line;
      }
      if (good) {
        this.piles = built.piles;
        this.foundations = built.foundations;
        this.stock = built.stock;
        this.familyValue = built.familyValue;
        this.solution = line;
        return;
      }
    }

    // Extremely unlikely fallback: relax to a guaranteed-trivial layout.
    const rng = new Rng(seed);
    const built = this.build(rng, true);
    this.piles = built.piles;
    this.foundations = built.foundations;
    this.stock = built.stock;
    this.familyValue = built.familyValue;
    this.solution = [];
  }

  /**
   * CONSTRUCTIVE DEAL
   * -----------------------------------------------------------------------
   * Random shuffles are almost never winnable in this rule-set (a card can
   * only sit on its own family, so a few bad covers dead-lock the board).
   * Instead we build the deal *backwards from a known solution*:
   *
   *  1. pick a completion order for the families (rank 0 is cleared first);
   *  2. lay every column out sorted by rank, deepest rank at the bottom, so
   *     the board can be cleared family-by-family off the column tops — this
   *     is trivially winnable even with a single foundation;
   *  3. inject a controlled number of INVERSIONS (a later-rank card resting
   *     on an earlier-rank one). Each inversion forces the player to park a
   *     card — that is where the actual puzzle lives. The count scales with
   *     the level, bounded by the parking capacity (free foundations + empty
   *     columns) so the board stays solvable;
   *  4. the solver then verifies the finished board anyway.
   */
  private build(rng: Rng, easyMode = false) {
    const cfg = this.cfg;

    // --- 1. family target values ---------------------------------------
    const [lo, hi] = targetRange(cfg.tier);
    const candidates: number[] = [];
    for (let v = lo; v <= hi; v++) candidates.push(v);
    rng.shuffle(candidates);
    const familyValue = candidates.slice(0, cfg.families);
    while (familyValue.length < cfg.families) familyValue.push(rng.int(lo, hi));

    // --- 2. cards, grouped per family ----------------------------------
    const byFamily: Card[][] = familyValue.map((v, fi) => {
      const group: Card[] = [
        {
          id: this.nextId++,
          kind: 'master',
          family: fi,
          value: v,
          label: toFa(v),
          faceUp: true,
        },
      ];
      for (const e of makeExpressions(v, cfg.perFamily, cfg.tier, rng)) {
        group.push({
          id: this.nextId++,
          kind: 'member',
          family: fi,
          value: v,
          label: e,
          faceUp: true,
        });
      }
      return group;
    });

    const foundations: Foundation[] = Array.from({ length: cfg.foundations }, () => ({
      family: -1,
      cards: [],
      needed: this.familySize,
      bonus: false,
    }));

    // --- 3. completion order -------------------------------------------
    const order = byFamily.map((_, i) => i);
    rng.shuffle(order);
    // rank[family] = position in the completion order
    const rank = new Array<number>(cfg.families);
    order.forEach((fam, i) => (rank[fam] = i));

    /** One family's cards, members first then its master (master on top). */
    const groupOf = (fam: number): Card[] => {
      const g = byFamily[fam];
      const members = g.slice(1);
      rng.shuffle(members);
      return [...members, g[0]];
    };

    // --- 4. optional stock: the FIRST family to clear ------------------
    // Dealing the stock drops one card on each column; because these belong
    // to the earliest family they are playable the moment they land.
    const useStock = !easyMode && cfg.families >= 5;
    const stockFamily = useStock ? order[0] : -1;
    const stock = useStock ? groupOf(stockFamily).reverse() : [];

    // --- 5. assign WHOLE families to columns, descending rank ----------
    // Column c receives the families at positions c, c+piles, c+2·piles …
    // of the descending-rank list. Because rank decreases as the position
    // grows, every column ends up sorted "clear last at the bottom, clear
    // first on top", and each column top always holds one of the next
    // families due. No family is ever split across two columns, so a master
    // can never be stranded under a different family.
    const descending: number[] = [];
    for (let r = cfg.families - 1; r >= 0; r--) {
      const fam = order[r];
      if (fam === stockFamily) continue;
      descending.push(fam);
    }

    const piles: Card[][] = Array.from({ length: cfg.piles }, () => []);
    descending.forEach((fam, i) => {
      piles[i % cfg.piles].push(...groupOf(fam));
    });

    // --- 6. inject inversions (the difficulty knob) ---------------------
    if (!easyMode) this.injectInversions(piles, rank, rng);

    // --- 7. face-down layering -------------------------------------------
    const depth = easyMode ? 0 : cfg.faceDownPerPile;
    for (const pile of piles) {
      const hide = Math.min(depth, Math.max(0, pile.length - 1));
      pile.forEach((c, idx) => {
        c.faceUp = idx >= hide;
      });
      if (pile.length) pile[pile.length - 1].faceUp = true;
    }

    return { piles, foundations, stock, familyValue };
  }

  /**
   * Swap adjacent cards inside columns so that a later-rank card ends up
   * resting on an earlier-rank one. Each such inversion costs the player one
   * "parking" operation, so the total is capped by the board's spare capacity.
   */
  private injectInversions(piles: Card[][], rank: number[], rng: Rng) {
    const cfg = this.cfg;
    // capacity ≈ concurrent foundations + a little column slack
    const capacity = cfg.foundations + Math.max(0, cfg.piles - 3);
    const wanted = Math.min(
      capacity * 2,
      Math.max(1, Math.round(cfg.families * (0.35 + Math.min(0.45, cfg.level / 160)))),
    );

    let done = 0;
    let guard = 0;
    while (done < wanted && guard++ < wanted * 40) {
      const pile = rng.pick(piles.filter((p) => p.length >= 2));
      if (!pile) break;
      const i = rng.int(0, pile.length - 2); // swap i and i+1
      const a = pile[i];
      const b = pile[i + 1];
      if (a.family === b.family) continue;
      // only create an inversion (upper card cleared LATER than lower one)
      if (rank[b.family] <= rank[a.family]) continue;
      pile[i] = b;
      pile[i + 1] = a;
      done++;
    }
  }

  // ------------------------------------------------------------------ rules

  /** Cards at `from` from index `i` upward form a movable run? */
  runLength(pile: PileId, index: number): number {
    const p = this.piles[pile];
    if (index < 0 || index >= p.length) return 0;
    if (!p[index].faceUp) return 0;
    let fam = p[index].family;
    for (let k = index + 1; k < p.length; k++) {
      const c = p[k];
      if (!c.faceUp) return 0;
      // jokers glue to anything; masters can never be buried under a run
      if (c.kind === 'joker' || fam === -1) {
        fam = c.family === -1 ? fam : c.family;
        continue;
      }
      if (c.family !== fam) return 0;
    }
    return p.length - index;
  }

  canMoveToPile(from: PileId, count: number, to: PileId): boolean {
    if (from === to) return false;
    const src = this.piles[from];
    if (count <= 0 || count > src.length) return false;
    const moving = src[src.length - count];
    if (!moving.faceUp) return false;
    if (this.runLength(from, src.length - count) !== count) return false;

    const dst = this.piles[to];
    if (!dst.length) return true;
    const top = dst[dst.length - 1];
    if (!top.faceUp) return false;
    if (top.kind === 'joker' || moving.kind === 'joker') return true;
    return top.family === moving.family;
  }

  canMoveToFoundation(from: PileId, fnd: number, count = 1): boolean {
    const f = this.foundations[fnd];
    const src = this.piles[from];
    if (!f || !src.length || count <= 0 || count > src.length) return false;
    if (this.runLength(from, src.length - count) !== count) return false;

    const cards = src.slice(src.length - count);

    if (f.family === -1) {
      // only a master opens an empty foundation, and it must be first
      if (cards[0].kind !== 'master') return false;
      const fam = cards[0].family;
      if (this.foundations.some((x) => x.family === fam)) return false;
      return cards.every((c) => c.family === fam || c.kind === 'joker');
    }

    if (f.cards.length + count > f.needed) return false;
    return cards.every(
      (c) => c.kind === 'joker' || (c.family === f.family && c.kind !== 'master'),
    );
  }

  // ------------------------------------------------------------- mutations

  private snapshot(): Snapshot {
    return {
      piles: this.piles.map((p) => p.map((c) => ({ ...c }))),
      foundations: this.foundations.map((f) => ({ ...f, cards: f.cards.map((c) => ({ ...c })) })),
      stock: this.stock.map((c) => ({ ...c })),
      movesUsed: this.movesUsed,
      cleared: this.cleared,
    };
  }

  private pushUndo() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 60) this.undoStack.shift();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  undo(): boolean {
    const s = this.undoStack.pop();
    if (!s) return false;
    this.piles = s.piles;
    this.foundations = s.foundations;
    this.stock = s.stock;
    this.movesUsed = s.movesUsed;
    this.cleared = s.cleared;
    return true;
  }

  /** Apply a move. Returns what happened so the view can animate it. */
  apply(m: Move): { ok: boolean; clearedFoundation?: number; flipped?: PileId } {
    switch (m.t) {
      case 'tableau': {
        if (!this.canMoveToPile(m.from, m.count, m.to)) return { ok: false };
        this.pushUndo();
        const src = this.piles[m.from];
        const moving = src.splice(src.length - m.count, m.count);
        this.piles[m.to].push(...moving);
        this.movesUsed++;
        const flipped = this.flipTop(m.from);
        return { ok: true, flipped };
      }

      case 'foundation': {
        if (!this.canMoveToFoundation(m.from, m.fnd, m.count)) return { ok: false };
        this.pushUndo();
        const src = this.piles[m.from];
        const moving = src.splice(src.length - m.count, m.count);
        const f = this.foundations[m.fnd];
        if (f.family === -1) f.family = moving[0].family;
        f.cards.push(...moving);
        this.movesUsed++;
        const flipped = this.flipTop(m.from);

        if (f.cards.length >= f.needed) {
          f.family = -1;
          f.cards = [];
          this.cleared++;
          return { ok: true, clearedFoundation: m.fnd, flipped };
        }
        return { ok: true, flipped };
      }

      case 'stock': {
        if (!this.stock.length) return { ok: false };
        this.pushUndo();
        const targets = this.piles.map((_, i) => i).filter((i) => this.piles[i].length > 0);
        const dest = targets.length ? targets : this.piles.map((_, i) => i);
        for (const i of dest) {
          const c = this.stock.pop();
          if (!c) break;
          c.faceUp = true;
          this.piles[i].push(c);
        }
        this.movesUsed++;
        return { ok: true };
      }

      case 'discardJoker': {
        const p = this.piles[m.from];
        const top = p[p.length - 1];
        if (!top || top.kind !== 'joker') return { ok: false };
        this.pushUndo();
        p.pop();
        this.movesUsed++;
        const flipped = this.flipTop(m.from);
        return { ok: true, flipped };
      }
    }
  }

  private flipTop(pile: PileId): PileId | undefined {
    const p = this.piles[pile];
    if (p.length && !p[p.length - 1].faceUp) {
      p[p.length - 1].faceUp = true;
      return pile;
    }
    return undefined;
  }

  // ---------------------------------------------------------------- powerups

  /** Joker: a wildcard placed on the shortest column. */
  addJoker(): boolean {
    this.pushUndo();
    const idx = this.piles
      .map((p, i) => [p.length, i] as const)
      .sort((a, b) => a[0] - b[0])[0][1];
    this.piles[idx].push({
      id: this.nextId++,
      kind: 'joker',
      family: -1,
      value: NaN,
      label: '★',
      faceUp: true,
    });
    return true;
  }

  /** Extra foundation slot. */
  addFoundation(): boolean {
    if (this.foundations.length >= 6) return false;
    this.pushUndo();
    this.foundations.push({ family: -1, cards: [], needed: this.familySize, bonus: true });
    return true;
  }

  /** Extra moves power-up. */
  grantMoves(n: number) {
    this.cfg = { ...this.cfg, moves: this.cfg.moves + n };
  }

  // ------------------------------------------------------------------ state

  get won(): boolean {
    return (
      this.piles.every((p) => p.length === 0) &&
      this.stock.length === 0 &&
      this.foundations.every((f) => f.cards.length === 0)
    );
  }

  get movesLeft(): number {
    return Math.max(0, this.cfg.moves - this.movesUsed);
  }

  get cardsLeft(): number {
    return (
      this.piles.reduce((a, p) => a + p.length, 0) +
      this.stock.length +
      this.foundations.reduce((a, f) => a + f.cards.length, 0)
    );
  }

  get progress(): number {
    const total = this.cfg.totalCards;
    return total ? 1 - this.cardsLeft / total : 0;
  }

  // ------------------------------------------------------------------- hint

  /** All legal moves, ranked. Used for hints and for stuck-detection. */
  legalMoves(): HintMove[] {
    const out: HintMove[] = [];

    for (let p = 0; p < this.piles.length; p++) {
      const pile = this.piles[p];
      if (!pile.length) continue;

      // → foundations (best moves: they permanently remove cards)
      for (let f = 0; f < this.foundations.length; f++) {
        for (let count = 1; count <= pile.length; count++) {
          if (!this.canMoveToFoundation(p, f, count)) continue;
          const fnd = this.foundations[f];
          let score = 100 + count * 12;
          if (fnd.cards.length + count >= fnd.needed) score += 70; // completes!
          if (fnd.family !== -1) score += 18;
          out.push({ move: { t: 'foundation', from: p, fnd: f, count }, score });
        }
      }

      // → other columns
      for (let q = 0; q < this.piles.length; q++) {
        if (p === q) continue;
        for (let count = 1; count <= pile.length; count++) {
          if (!this.canMoveToPile(p, count, q)) continue;
          let score = 30 + count * 6;
          // rewarded for uncovering a face-down card
          const under = pile[pile.length - count - 1];
          if (under && !under.faceUp) score += 34;
          // discourage emptying a column onto another just to shuffle
          if (count === pile.length && this.piles[q].length === 0) score -= 40;
          if (this.piles[q].length === 0) score -= 8;
          out.push({ move: { t: 'tableau', from: p, to: q, count }, score });
        }
      }
    }

    if (this.stock.length) out.push({ move: { t: 'stock' }, score: 20 });

    out.sort((a, b) => b.score - a.score);
    return out;
  }

  /**
   * A hint that actually LEADS TO A WIN.
   * We re-solve from the live position (fast: boards are small), so the hint
   * stays correct even after the player has wandered off the original line.
   * Falls back to the greedy ranking if the search budget runs out.
   */
  hint(): Move | null {
    const s = solve(this.piles, this.foundations, this.stock, 14_000, 80);
    if (s.solved && s.first) return s.first;
    const m = this.legalMoves();
    return m.length ? m[0].move : null;
  }

  /** True when the position is dead: no legal move at all. */
  get stuck(): boolean {
    return !this.won && this.legalMoves().length === 0;
  }

  /**
   * True when moves exist but none of them can still win.
   * Used to offer the joker before the player wastes the whole move budget.
   */
  get unwinnable(): boolean {
    if (this.won) return false;
    return !solve(this.piles, this.foundations, this.stock, 14_000, 80).solved;
  }
}
