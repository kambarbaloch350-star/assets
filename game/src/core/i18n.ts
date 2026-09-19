import { toFa } from './equations';

/** Persian strings — the game ships Farsi-only, fully RTL. */
export const T = {
  appName: 'جادوی اعداد',
  tagline: 'پاسور ریاضی ایرانی',

  // menu
  play: 'بازی',
  continueGame: 'ادامهٔ بازی',
  levels: 'مراحل',
  store: 'فروشگاه',
  settings: 'تنظیمات',
  howTo: 'آموزش',
  exit: 'خروج',

  // hud
  level: 'مرحله',
  moves: 'حرکت',
  movesLeft: 'حرکت باقی‌مانده',
  coins: 'سکه',
  stock: 'دسته',
  cards: 'کارت',

  // gameplay messages
  onlyMasterOnEmpty: 'فقط کارت «عدد هدف» روی خانهٔ خالی قرار می‌گیرد.',
  sameFamilyOnly: 'فقط کارت‌های هم‌ارزش روی هم قرار می‌گیرند.',
  foundationFull: 'این خانه تکمیل شده است.',
  noStock: 'دسته‌کارت تمام شد!',
  familyCleared: 'آفرین! خانه پاک شد',
  nothingHere: 'حرکتی برای این کارت نیست.',

  // win / lose
  levelComplete: 'مرحله تکمیل شد!',
  congrats: 'آفرین!',
  reward: 'پاداش',
  nextLevel: 'مرحلهٔ بعد',
  replay: 'بازی دوباره',
  backToMenu: 'منوی اصلی',
  outOfMoves: 'حرکت‌ها تمام شد',
  outOfMovesMsg: 'می‌توانی حرکت بیشتری بخری یا مرحله را از نو شروع کنی.',
  noMoves: 'حرکتی باقی نمانده',
  noMovesMsg: 'از جوکر استفاده کن تا مسیر باز شود!',
  buyMoves: 'حرکت بیشتر',
  restart: 'شروع دوباره',

  // power-ups
  hint: 'راهنما',
  undo: 'برگشت',
  joker: 'جوکر',
  newSlot: 'خانهٔ جدید',
  notEnoughCoins: 'سکهٔ کافی نداری',
  goToStore: 'رفتن به فروشگاه',

  // levels screen
  levelSelect: 'انتخاب مرحله',
  locked: 'قفل',
  stars: 'ستاره',
  best: 'بهترین',

  // store
  storeTitle: 'فروشگاه',
  coinPacks: 'بسته‌های سکه',
  removeAds: 'حذف تبلیغات',
  removeAdsDesc: 'برای همیشه بدون تبلیغ بازی کن',
  adsRemoved: 'تبلیغات حذف شد ✓',
  buy: 'خرید',
  buying: 'در حال اتصال به بازار…',
  purchaseOk: 'خرید با موفقیت انجام شد',
  purchaseFail: 'خرید ناموفق بود',
  purchaseCancel: 'خرید لغو شد',
  toman: 'تومان',
  bestValue: 'بهترین پیشنهاد',
  poweredByBazaar: 'پرداخت امن از طریق کافه‌بازار',

  // settings
  sound: 'صدا',
  music: 'موسیقی',
  language: 'زبان',
  persian: 'فارسی',
  resetProgress: 'پاک کردن پیشرفت',
  resetConfirm: 'همهٔ پیشرفت پاک شود؟',
  yes: 'بله',
  no: 'خیر',
  version: 'نسخه',

  // tutorial
  tut1: 'کارت‌ها را در «خانه‌ها» بچین. هر خانه با یک کارت *عدد هدف* باز می‌شود.',
  tut2: 'سپس کارت‌هایی که حاصلشان *همان عدد* است را رویش بگذار.',
  tut3: 'وقتی خانه کامل شد *پاک می‌شود* و دوباره آزاد می‌شود.',
  tut4: 'روی *دستهٔ کارت* بزن تا کارت تازه بیاید.',
  tut5: 'همهٔ کارت‌ها را پاک کن تا مرحله تمام شود!',
  gotIt: 'متوجه شدم',
  skip: 'رد کردن',

  // ads
  adBreak: 'پیام بازرگانی',
  adResume: 'بازی به‌زودی ادامه پیدا می‌کند…',
  sponsored: 'تبلیغ',
  watchAd: 'تماشای ویدیو',
  close: 'بستن',
} as const;

/** Persian digits helper, re-exported for convenience. */
export { toFa };

/** Group a number with Persian thousands separators: 12500 → ۱۲٬۵۰۰ */
export function faNum(n: number): string {
  return toFa(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬');
}

/** Format a تومان price. */
export function faToman(n: number): string {
  return `${faNum(n)} ${T.toman}`;
}
