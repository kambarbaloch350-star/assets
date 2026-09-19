import type { LevelConfig } from './types';
import { tierForLevel } from './equations';

export const TOTAL_LEVELS = 120;

/**
 * Difficulty curve, modelled on the original's `leveling` table:
 * it ramps foundations 3→5, piles 3→7, families 4→14 and interleaves
 * "breather" levels so the climb never feels monotonous.
 */
export function levelConfig(level: number): LevelConfig {
  const L = Math.max(1, level);
  const tier = tierForLevel(L);

  // foundations / piles grow in steps and cap out
  let foundations: number;
  if (L <= 4) foundations = 3;
  else if (L <= 14) foundations = 4;
  else if (L <= 34) foundations = 4;
  else foundations = 5;

  let piles: number;
  if (L <= 2) piles = 4;
  else if (L <= 8) piles = 5;
  else if (L <= 20) piles = 6;
  else piles = 7;

  // Every 5th level is a short "breather", every 10th is a big board.
  const isBreather = L % 5 === 0 && L % 10 !== 0;
  const isBig = L % 10 === 0;

  let families: number;
  if (L <= 3) families = 4;
  else if (L <= 8) families = 5;
  else if (L <= 16) families = 6;
  else if (L <= 28) families = 7;
  else if (L <= 44) families = 8;
  else if (L <= 70) families = 9;
  else families = 10;

  if (isBreather) families = Math.max(4, families - 2);
  if (isBig) families = Math.min(12, families + 2);

  // members per family (master card is extra)
  let perFamily: number;
  if (L <= 3) perFamily = 2;
  else if (L <= 12) perFamily = 3;
  else if (L <= 40) perFamily = 3 + (L % 3 === 0 ? 1 : 0);
  else perFamily = 4;
  if (isBreather) perFamily = Math.max(2, perFamily - 1);

  const totalCards = families * (perFamily + 1);

  // Face-down cards appear from level 4 and deepen slowly (solitaire tension).
  let faceDownPerPile = 0;
  if (L >= 4) faceDownPerPile = 1;
  if (L >= 12) faceDownPerPile = 2;
  if (L >= 30) faceDownPerPile = 3;
  if (isBreather) faceDownPerPile = Math.max(0, faceDownPerPile - 1);

  // Move budget.
  // The solver clears a board in roughly `totalCards + families` moves, so the
  // budget is anchored to that optimum plus a shrinking cushion: very forgiving
  // early on, genuinely tight (but always fair) in the late game.
  const optimum = totalCards + families;
  const cushionPct = Math.max(0.35, 1.15 - L * 0.012); // 115% → 35%
  const slack =
    L <= 3 ? 9999 : Math.max(optimum + 6, Math.round(optimum * (1 + cushionPct)));

  return {
    level: L,
    piles,
    foundations,
    families,
    perFamily,
    moves: slack,
    faceDownPerPile,
    tier,
    totalCards,
  };
}

/**
 * Star rating on win, measured against the theoretical optimum
 * (every card moved straight to a foundation, once per family opening).
 *   ★★★  within 25% of optimal
 *   ★★   within 70% of optimal
 *   ★    cleared at all
 */
export function starsFor(cfg: LevelConfig, movesUsed: number): number {
  const optimum = cfg.totalCards + cfg.families;
  if (movesUsed <= Math.ceil(optimum * 1.25)) return 3;
  if (movesUsed <= Math.ceil(optimum * 1.7)) return 2;
  return 1;
}
