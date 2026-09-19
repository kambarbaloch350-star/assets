/**
 * Power-up + economy interaction test.
 *
 * Confirms that hint / undo / joker / extra-foundation all work mid-game
 * through the real UI, that each one debits the right number of coins, and
 * that an insufficient balance routes the player to the store rather than
 * handing out anything free.
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `<!doctype html><html lang="fa" dir="rtl"><body><div id="app"></div><div id="splash"></div></body></html>`,
  { url: 'http://localhost/', pretendToBeVisual: true },
);

const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.CustomEvent = dom.window.CustomEvent;
g.localStorage = dom.window.localStorage;
g.requestAnimationFrame = (cb: FrameRequestCallback) =>
  dom.window.setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.cancelAnimationFrame = (id: number) => dom.window.clearTimeout(id);
g.Audio = class {
  volume = 1;
  currentTime = 0;
  preload = '';
  play() {
    return Promise.resolve();
  }
} as unknown as typeof Audio;
dom.window.Element.prototype.animate = function () {
  return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation;
} as never;
dom.window.Element.prototype.getBoundingClientRect = function (this: Element) {
  const w = (this as HTMLElement).classList?.contains('card') ? 70 : 100;
  return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: 100, width: w, height: 100, toJSON() {} } as DOMRect;
} as never;

const checks: [string, boolean, string][] = [];
const ck = (name: string, cond: boolean, extra = '') => {
  checks.push([name, cond, extra]);
  console.log(`${cond ? '  ok' : 'FAIL'}  ${name}${extra ? `   (${extra})` : ''}`);
};
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const doc = dom.window.document;
const $ = <T extends Element>(s: string) => doc.querySelector(s) as T | null;

function mkPointer(type: string, x: number, y: number): Event {
  const ev = new dom.window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    clientX: { value: x },
    clientY: { value: y },
    pointerId: { value: 1 },
    pointerType: { value: 'touch' },
    button: { value: 0 },
    isPrimary: { value: true },
  });
  return ev;
}
const tap = (n: Element, x = 10, y = 10) => {
  n.dispatchEvent(mkPointer('pointerdown', x, y));
  dom.window.dispatchEvent(mkPointer('pointerup', x, y));
};

/** Board signature that ignores transient highlight classes. */
const board = () =>
  (doc.querySelector('.tableau')?.innerHTML ?? '')
    .replace(/ ?is-(hint|target|drag|deal|flip|new)/g, '')
    .replace(/style="[^"]*"/g, '');

/** Find a tool button by its Persian label. */
const toolByLabel = (label: string): HTMLButtonElement | undefined =>
  (Array.from(doc.querySelectorAll('.game .tool')) as HTMLButtonElement[]).find((b) =>
    (b.querySelector('.tool__lbl')?.textContent ?? '').includes(label),
  );

async function run() {
  const { register } = await import('node:module');
  register(new URL('./css-stub.mjs', import.meta.url));

  const { player } = await import('../src/core/save');
  const { PRICES } = await import('../src/core/economy');
  const { router } = await import('../src/ui/router');
  player.resetAll();

  await import('../src/main');
  await tick(300);

  // jump straight into a mid-game level so the tools matter
  player.addPurchasedCoins(1000);
  router.go('game', { level: 8 });
  await tick(600);
  ck('game screen active', !!$('.game.is-active'), '');

  // A fresh save ships a small one-time starter kit (hint 1, undo 2, joker 1).
  // Those are ITEMS, never coins. Verify the item path first, then zero the
  // inventory so the coin-price path is the one under test.
  ck(
    'new player gets a one-time starter kit of items (not coins)',
    player.state.inv.hint === 1 && player.state.inv.undo === 2 && player.state.inv.joker === 1,
    JSON.stringify(player.state.inv),
  );
  const coinsAtStart = player.coins;
  toolByLabel('راهنما')?.click();
  await tick(350);
  ck('a free starter hint spends an item, not coins', player.coins === coinsAtStart && player.state.inv.hint === 0, `coins=${player.coins} inv=${player.state.inv.hint}`);

  player.state.inv.hint = 0;
  player.state.inv.undo = 0;
  player.state.inv.joker = 0;

  const coins0 = player.coins;

  // ------------------------------------------------------------------ hint
  // This is the key regression check: the engine's cached `solution` is empty
  // when a deal is validated by the fast oracle, so hint() must re-solve live.
  const hintBtn = toolByLabel('راهنما');
  ck('hint tool exists', !!hintBtn, '');
  const t0 = Date.now();
  hintBtn?.click();
  await tick(400);
  const hintMs = Date.now() - t0;
  const highlighted = doc.querySelectorAll('.game .is-hint').length;
  ck('hint highlights a real move mid-game', highlighted > 0, `highlighted=${highlighted}, ${hintMs}ms`);
  ck('hint costs exactly 60 coins', player.coins === coins0 - PRICES.hint, `spent=${coins0 - player.coins}`);
  ck('hint responds quickly', hintMs < 3000, `${hintMs}ms`);

  // ------------------------------------------------------------------ make a move, then undo it
  const beforeMove = board();
  const cards = Array.from(doc.querySelectorAll('.game .pile .card')) as HTMLElement[];
  for (const c of cards.reverse()) {
    tap(c);
    await tick(60);
    if (board() !== beforeMove) break;
  }
  ck('a tap changed the board', board() !== beforeMove, '');

  const coinsBeforeUndo = player.coins;
  toolByLabel('برگشت')?.click();
  await tick(400);
  ck('undo costs exactly 40 coins', player.coins === coinsBeforeUndo - PRICES.undo, `spent=${coinsBeforeUndo - player.coins}`);
  ck('undo restored the board exactly', board() === beforeMove, '');

  // ------------------------------------------------------------------ joker
  const coinsBeforeJoker = player.coins;
  const jokerSel = '.game .card--joker, .game .card.is-joker, .game .card[data-joker]';
  const jokersBefore = doc.querySelectorAll(jokerSel).length;
  toolByLabel('جوکر')?.click();
  await tick(400);
  ck('joker costs exactly 120 coins', player.coins === coinsBeforeJoker - PRICES.joker, `spent=${coinsBeforeJoker - player.coins}`);
  const jokersAfter = doc.querySelectorAll(jokerSel).length;
  ck('a joker card appeared', jokersAfter > jokersBefore, `${jokersBefore} → ${jokersAfter}`);

  // ------------------------------------------------------------------ extra foundation
  const fndBefore = doc.querySelectorAll('.game .fnd').length;
  const coinsBeforeFnd = player.coins;
  toolByLabel('خانهٔ جدید')?.click();
  await tick(500);
  const fndAfter = doc.querySelectorAll('.game .fnd').length;
  ck('extra foundation slot added', fndAfter === fndBefore + 1, `${fndBefore} → ${fndAfter}`);
  ck(
    'foundation costs exactly 200 coins',
    player.coins === coinsBeforeFnd - PRICES.foundation,
    `spent=${coinsBeforeFnd - player.coins}`,
  );

  // ------------------------------------------------------------------ broke player
  const drain = player.coins;
  player.spend(drain);
  ck('wallet emptied for the next check', player.coins === 0, `coins=${player.coins}`);
  toolByLabel('راهنما')?.click();
  await tick(400);
  const needPanel = doc.body.textContent ?? '';
  ck('insufficient coins opens a store prompt', /سکه|فروشگاه/.test(needPanel), '');
  ck('no coins were granted for free', player.coins === 0, `coins=${player.coins}`);
  const anyAdReward = doc.querySelector('.ad-overlay');
  ck('no watch-ad-for-coins offer', !anyAdReward, '');

  const fail = checks.filter((c) => !c[1]).length;
  console.log(`\n=== ${checks.length - fail}/${checks.length} checks passed ===`);
  if (fail) process.exitCode = 1;
}

run().catch((e) => {
  console.error('FATAL', e);
  process.exitCode = 1;
});
