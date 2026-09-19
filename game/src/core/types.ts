/** ---- Card model -------------------------------------------------------
 * A "family" is a target value V. Every family owns:
 *   - exactly one MASTER card, showing the bare number V. It is the only card
 *     that may open an empty foundation.
 *   - N MEMBER cards, each an arithmetic expression that evaluates to V.
 * A foundation is cleared (and freed for reuse) once master + all members of
 * its family have been stacked on it.
 */

export type CardKind = 'master' | 'member' | 'joker';

export interface Card {
  /** stable unique id within a level deal */
  id: number;
  kind: CardKind;
  /** family index; -1 for jokers (wildcards belong to no family) */
  family: number;
  /** target value of the family; NaN for jokers */
  value: number;
  /** rendered face, e.g. "7 + 5" (members) or "12" (masters) */
  label: string;
  /** face up in the tableau? face-down cards flip when exposed */
  faceUp: boolean;
}

export interface Foundation {
  /** active family, or -1 when the slot is empty */
  family: number;
  /** cards currently stacked here (bottom → top) */
  cards: Card[];
  /** total cards required to clear this family (1 master + members) */
  needed: number;
  /** slot unlocked by the "extra foundation" power-up */
  bonus: boolean;
}

export type PileId = number;

/** A move the engine can apply. */
export type Move =
  | { t: 'tableau'; from: PileId; to: PileId; count: number }
  | { t: 'foundation'; from: PileId; fnd: number; count: number }
  | { t: 'stock' }
  | { t: 'discardJoker'; from: PileId };

export interface LevelConfig {
  level: number;
  /** number of tableau columns */
  piles: number;
  /** number of foundation slots */
  foundations: number;
  /** distinct families in the deal */
  families: number;
  /** member cards per family (excludes the master card) */
  perFamily: number;
  /** maximum player moves before "out of moves" */
  moves: number;
  /** how many cards are dealt face-down per pile at the start */
  faceDownPerPile: number;
  /** difficulty tier drives the expression generator */
  tier: number;
  /** total cards in the deal (derived) */
  totalCards: number;
}

export interface Snapshot {
  piles: Card[][];
  foundations: Foundation[];
  stock: Card[];
  movesUsed: number;
  cleared: number;
}
