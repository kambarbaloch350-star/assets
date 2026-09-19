import { Rng } from './rng';

/** Persian/Arabic-Indic digits used everywhere in the UI. */
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toFa(n: number | string): string {
  return String(n).replace(/\d/g, (d) => FA_DIGITS[+d]);
}

/** Operators are rendered with the glyphs Iranian players expect. */
export const OP = { add: '+', sub: '−', mul: '×', div: '÷' } as const;

/**
 * Difficulty tiers. Tier grows with the level and unlocks harder operators
 * and larger operands, exactly like the original's easy/medium/hard tag mix.
 *
 *  tier 0 : + and − only, small numbers          (levels 1–5)
 *  tier 1 : + − with bigger numbers              (levels 6–12)
 *  tier 2 : introduces ×                         (levels 13–24)
 *  tier 3 : introduces ÷                         (levels 25–44)
 *  tier 4 : all four, 3-term expressions appear  (levels 45+)
 */
export function tierForLevel(level: number): number {
  if (level <= 5) return 0;
  if (level <= 12) return 1;
  if (level <= 24) return 2;
  if (level <= 44) return 3;
  return 4;
}

/** Target value range for a family, widening with difficulty. */
export function targetRange(tier: number): [number, number] {
  switch (tier) {
    case 0:
      return [3, 12];
    case 1:
      return [5, 20];
    case 2:
      return [6, 36];
    case 3:
      return [8, 48];
    default:
      return [10, 60];
  }
}

type Gen = (v: number, rng: Rng) => string | null;

const genAdd: Gen = (v, rng) => {
  if (v < 2) return null;
  const a = rng.int(1, v - 1);
  return `${toFa(a)} ${OP.add} ${toFa(v - a)}`;
};

const genSub: Gen = (v, rng) => {
  const b = rng.int(1, Math.max(1, Math.min(20, v + 8)));
  return `${toFa(v + b)} ${OP.sub} ${toFa(b)}`;
};

const genMul: Gen = (v, rng) => {
  const divisors: number[] = [];
  for (let d = 2; d <= Math.min(12, v); d++) if (v % d === 0 && v / d <= 12) divisors.push(d);
  if (!divisors.length) return null;
  const d = rng.pick(divisors);
  return `${toFa(d)} ${OP.mul} ${toFa(v / d)}`;
};

const genDiv: Gen = (v, rng) => {
  if (v < 1 || v > 60) return null;
  const k = rng.int(2, Math.min(9, Math.max(2, Math.floor(120 / Math.max(1, v)))));
  const num = v * k;
  if (num > 144) return null;
  return `${toFa(num)} ${OP.div} ${toFa(k)}`;
};

/** three-term, e.g. "۴ × ۳ − ۲" — only at the highest tier */
const genTriple: Gen = (v, rng) => {
  const c = rng.int(1, 9);
  const mid = rng.next() < 0.5 ? v + c : v - c;
  if (mid < 2) return null;
  const sign = mid === v + c ? OP.sub : OP.add;
  const divisors: number[] = [];
  for (let d = 2; d <= Math.min(12, mid); d++) if (mid % d === 0 && mid / d <= 12) divisors.push(d);
  if (!divisors.length) {
    if (mid < 3) return null;
    const a = rng.int(1, mid - 1);
    return `${toFa(a)} ${OP.add} ${toFa(mid - a)} ${sign} ${toFa(c)}`;
  }
  const d = rng.pick(divisors);
  return `${toFa(d)} ${OP.mul} ${toFa(mid / d)} ${sign} ${toFa(c)}`;
};

/** Weighted generator pool per tier. */
function poolFor(tier: number): Gen[] {
  switch (tier) {
    case 0:
      return [genAdd, genAdd, genAdd, genSub];
    case 1:
      return [genAdd, genAdd, genSub, genSub];
    case 2:
      return [genAdd, genSub, genMul, genMul];
    case 3:
      return [genAdd, genSub, genMul, genMul, genDiv, genDiv];
    default:
      return [genAdd, genSub, genMul, genDiv, genDiv, genTriple, genTriple];
  }
}

/**
 * Produce `count` DISTINCT expressions that all evaluate to `value`.
 * Falls back to simpler generators when a tier cannot satisfy the request,
 * so a deal can never fail to fill a family.
 */
export function makeExpressions(value: number, count: number, tier: number, rng: Rng): string[] {
  const pool = poolFor(tier);
  const out: string[] = [];
  const seen = new Set<string>();
  let guard = 0;

  while (out.length < count && guard++ < count * 80) {
    const g = rng.pick(pool);
    const e = g(value, rng);
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }

  // Guaranteed fallback: additive decompositions never run dry.
  let k = 1;
  while (out.length < count) {
    const a = 1 + ((k * 7) % Math.max(1, value + 12));
    const e = `${toFa(value + a)} ${OP.sub} ${toFa(a)}`;
    if (!seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
    k++;
    if (k > 500) break;
  }
  return out;
}
