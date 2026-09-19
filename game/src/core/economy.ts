/**
 * ECONOMY — coin rules are deliberately strict and enforced in ONE place.
 *
 *   • Completing a level grants EXACTLY 50 coins, once per level (first clear).
 *   • There is NO other free source of coins:
 *       – no daily rewards
 *       – no login bonuses
 *       – no "watch an ad for coins"
 *       – rewarded ads NEVER grant coins or any other reward
 *   • The only other way to obtain coins is buying a pack via CafeBazaar.
 *
 * Reference price: 50 coins = 5,000 تومان  →  100 تومان per coin.
 */

export const COINS_PER_LEVEL = 50;
export const TOMAN_PER_COIN = 100; // 50 coins = 5,000 تومان

export interface CoinPack {
  id: string;
  /** CafeBazaar / Poolakey SKU */
  sku: string;
  coins: number;
  /** price in تومان */
  toman: number;
  /** bonus coins advertised on the tile, already included in `coins` */
  bonus: number;
  art: string;
  badge?: string;
  best?: boolean;
}

/** Pack ladder: base rate 100 تومان/coin, with increasing bonus value. */
export const COIN_PACKS: CoinPack[] = [
  { id: 'pack_1', sku: 'coins_50', coins: 50, toman: 5_000, bonus: 0, art: 'img_coin_pack0.png' },
  { id: 'pack_2', sku: 'coins_150', coins: 165, toman: 15_000, bonus: 15, art: 'img_coin_pack1.png', badge: '٪۱۰ بیشتر' },
  { id: 'pack_3', sku: 'coins_300', coins: 360, toman: 30_000, bonus: 60, art: 'img_coin_pack2.png', badge: '٪۲۰ بیشتر' },
  { id: 'pack_4', sku: 'coins_600', coins: 780, toman: 60_000, bonus: 180, art: 'img_coin_pack3.png', badge: '٪۳۰ بیشتر', best: true },
  { id: 'pack_5', sku: 'coins_1200', coins: 1_680, toman: 120_000, bonus: 480, art: 'img_coin_pack4.png', badge: '٪۴۰ بیشتر' },
  { id: 'pack_6', sku: 'coins_2500', coins: 3_750, toman: 250_000, bonus: 1_250, art: 'img_coin_pack5.png', badge: '٪۵۰ بیشتر' },
];

export const REMOVE_ADS = {
  id: 'remove_ads',
  sku: 'remove_ads',
  toman: 20_000,
  art: 'img_no_ads_big.png',
};

/** In-game sinks — the reason coins have value. */
export const PRICES = {
  hint: 60,
  undo: 40,
  joker: 120,
  foundation: 200,
  extraMoves: 80,
} as const;

export const EXTRA_MOVES_AMOUNT = 15;

export type PowerUp = keyof typeof PRICES;
