import { COINS_PER_LEVEL, TOTAL_KEY } from './constants';
import { TOTAL_LEVELS } from './levels';

export interface LevelRecord {
  stars: number;
  bestMoves: number;
}

export interface PlayerState {
  coins: number;
  /** highest level unlocked (1-based) */
  unlocked: number;
  levels: Record<number, LevelRecord>;
  /** levels that already paid out their one-time 50 coin reward */
  paid: number[];
  noAds: boolean;
  sound: boolean;
  music: boolean;
  tutorialDone: boolean;
  /** consumable power-up inventory (bought with coins) */
  inv: { hint: number; undo: number; joker: number };
}

const KEY = TOTAL_KEY;

const DEFAULT: PlayerState = {
  coins: 0,
  unlocked: 1,
  levels: {},
  paid: [],
  noAds: false,
  sound: true,
  music: true,
  tutorialDone: false,
  inv: { hint: 1, undo: 2, joker: 1 },
};

function read(): PlayerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const p = JSON.parse(raw) as Partial<PlayerState>;
    return {
      ...structuredClone(DEFAULT),
      ...p,
      inv: { ...DEFAULT.inv, ...(p.inv ?? {}) },
      levels: p.levels ?? {},
      paid: p.paid ?? [],
    };
  } catch {
    return structuredClone(DEFAULT);
  }
}

class Store {
  state: PlayerState = read();
  private subs = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  private flush() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* storage full / private mode — game still playable in-memory */
    }
    this.subs.forEach((f) => f());
  }

  // ------------------------------------------------------------- coins

  get coins(): number {
    return this.state.coins;
  }

  /** Purchases only. Never call this for gameplay rewards. */
  addPurchasedCoins(n: number) {
    this.state.coins += Math.max(0, Math.floor(n));
    this.flush();
  }

  spend(n: number): boolean {
    if (this.state.coins < n) return false;
    this.state.coins -= n;
    this.flush();
    return true;
  }

  // ------------------------------------------------------------ progress

  /**
   * The ONLY free coin source in the whole game.
   * Pays exactly COINS_PER_LEVEL, and only the first time a level is cleared.
   */
  completeLevel(level: number, stars: number, moves: number): { earned: number; firstClear: boolean } {
    const prev = this.state.levels[level];
    const firstClear = !this.state.paid.includes(level);

    this.state.levels[level] = {
      stars: Math.max(prev?.stars ?? 0, stars),
      bestMoves: prev ? Math.min(prev.bestMoves, moves) : moves,
    };

    let earned = 0;
    if (firstClear) {
      this.state.paid.push(level);
      this.state.coins += COINS_PER_LEVEL;
      earned = COINS_PER_LEVEL;
    }

    if (level >= this.state.unlocked && level < TOTAL_LEVELS) {
      this.state.unlocked = level + 1;
    }

    this.flush();
    return { earned, firstClear };
  }

  record(level: number): LevelRecord | undefined {
    return this.state.levels[level];
  }

  get totalStars(): number {
    return Object.values(this.state.levels).reduce((a, r) => a + r.stars, 0);
  }

  // ------------------------------------------------------------ inventory

  addItem(k: keyof PlayerState['inv'], n = 1) {
    this.state.inv[k] += n;
    this.flush();
  }

  useItem(k: keyof PlayerState['inv']): boolean {
    if (this.state.inv[k] <= 0) return false;
    this.state.inv[k]--;
    this.flush();
    return true;
  }

  // -------------------------------------------------------------- toggles

  setNoAds(v: boolean) {
    this.state.noAds = v;
    this.flush();
  }

  toggle(k: 'sound' | 'music') {
    this.state[k] = !this.state[k];
    this.flush();
  }

  markTutorial() {
    this.state.tutorialDone = true;
    this.flush();
  }

  resetAll() {
    this.state = structuredClone(DEFAULT);
    this.flush();
  }
}

export const player = new Store();
