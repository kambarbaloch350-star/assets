/**
 * Interaction test: plays a real level to victory by dispatching genuine
 * pointerdown/pointerup events on the rendered DOM, then inspects the win
 * panel, the coin payout, the store purchase flow and the settings reset.
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
// jsdom lays nothing out; give every element a plausible box so hit-testing works
dom.window.Element.prototype.getBoundingClientRect = function (this: Element) {
  const e = this as HTMLElement;
  const w = e.classList?.contains('card') ? 70 : 100;
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

/** Dispatch a real tap (pointerdown at a point, pointerup at the same point). */
function mkPointer(type: string, x: number, y: number): Event {
  const ev = new dom.window.Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
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

function tap(node: Element, x = 10, y = 10) {
  node.dispatchEvent(mkPointer('pointerdown', x, y));
  dom.window.dispatchEvent(mkPointer('pointerup', x, y));
}

async function run() {
  const { register } = await import('node:module');
  register(new URL('./css-stub.mjs', import.meta.url));

  const { player } = await import('../src/core/save');
  const { COIN_PACKS } = await import('../src/core/economy');
  player.resetAll();

  await import('../src/main');
  await tick(300);

  // ------------------------------------------------------------ play level 1
  ($('.bigbtn--play') as HTMLElement)?.click();
  await tick(400);
  ck('game screen opened', !!$('.game.is-active'), '');

  const hud = () => $('.hud')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  ck('HUD renders', hud().length > 0, hud().slice(0, 60));

  // Tap every face-up card repeatedly; `autoMove` routes each to its best home.
  // This is exactly what a player does when tapping instead of dragging.
  let rounds = 0;
  let won = false;
  while (rounds++ < 260 && !won) {
    if ($('.overlay')) break; // a dialog opened (win / stuck / out of moves)
    const cards = Array.from(doc.querySelectorAll('.game .pile .card')) as HTMLElement[];
    let acted = false;
    for (const c of cards.reverse()) {
      const beforeTxt = doc.querySelector('.tableau')?.innerHTML;
      tap(c);
      await tick(40);
      if (doc.querySelector('.tableau')?.innerHTML !== beforeTxt) {
        acted = true;
        break;
      }
    }
    if (!acted) {
      const stock = $('[data-stock]');
      if (stock) {
        (stock as HTMLElement).click();
        await tick(60);
      } else break;
    }
    won = !!doc.querySelector('.win__stars');
    if (won) break;
    await tick(20);
  }
  await tick(600);

  ck('tapping cards drives the board', rounds > 1, `rounds=${rounds}`);

  const winPanel = $('.win__stars')?.closest('.panel') as HTMLElement | null;
  ck(
    'win panel appeared after clearing the board',
    !!winPanel,
    winPanel ? '' : `panelText=${($('.panel')?.textContent ?? 'none').replace(/\s+/g, ' ').slice(0, 70)}`,
  );

  if (winPanel) {
    const txt = winPanel.textContent ?? '';
    ck('win panel shows the 50-coin reward', /۵۰/.test(txt), txt.replace(/\s+/g, ' ').slice(0, 90));
    ck('win panel has no ASCII digits', !/[0-9]/.test(txt), '');
    const stars = winPanel.querySelectorAll('.win__star');
    ck('win panel shows 3 star slots', stars.length === 3, `starEls=${stars.length}`);
    await tick(1000);
    const lit = winPanel.querySelectorAll('.win__star.on');
    ck('at least one star lights up', lit.length >= 1, `lit=${lit.length}`);
    ck('win panel offers the next level', /مرحلهٔ بعد/.test(winPanel.textContent ?? ''), '');
    ck('win panel offers replay', /بازی دوباره/.test(winPanel.textContent ?? ''), '');
    ck('win panel offers the main menu', /منوی اصلی/.test(winPanel.textContent ?? ''), '');
    ck('coins credited to the player', player.coins === 50, `coins=${player.coins}`);
    ck('level 2 unlocked', player.state.unlocked >= 2, `unlocked=${player.state.unlocked}`);
  }

  // ------------------------------------------------------------ store flow
  player.addPurchasedCoins(0); // no-op, keeps the API exercised
  dom.window.dispatchEvent(new dom.window.CustomEvent('open-store'));
  await tick(400);
  const packs = Array.from(doc.querySelectorAll('.pack')) as HTMLElement[];
  ck('store shows 6 packs', packs.length === COIN_PACKS.length, `packs=${packs.length}`);

  const coinsBeforeBuy = player.coins;
  const buyBtn = packs[0]?.querySelector('button') as HTMLElement | null;
  buyBtn?.click();
  await tick(300);
  const sheet = $('.bazaar-sheet');
  ck('Bazaar payment sheet opens', !!sheet, '');
  ck('sheet is branded Bazaar', /بازار/.test(sheet?.textContent ?? ''), '');
  const pay = sheet?.querySelector('.bz-pay') as HTMLElement | null;
  pay?.click();
  await tick(1600);
  ck(
    'successful purchase credits the pack',
    player.coins === coinsBeforeBuy + COIN_PACKS[0].coins,
    `coins=${player.coins} (was ${coinsBeforeBuy})`,
  );

  ck('payment sheet closes after paying', !$('.bazaar-sheet'), '');

  // cancelling must not grant anything
  const beforeCancel = player.coins;
  (packs[1]?.querySelector('button') as HTMLElement | null)?.click();
  await tick(300);
  ($('.bz-cancel') as HTMLElement | null)?.click();
  await tick(500);
  ck('cancelled purchase grants no coins', player.coins === beforeCancel, `coins=${player.coins}`);

  // remove ads
  const noadsBtn = $('.noads .pricebtn') as HTMLElement | null;
  noadsBtn?.click();
  await tick(300);
  ($('.bz-pay') as HTMLElement | null)?.click();
  await tick(1600);
  ck('remove-ads purchase sets the no-ads flag', player.state.noAds === true, `noAds=${player.state.noAds}`);

  // ------------------------------------------------------------ settings reset
  const coinsNow = player.coins;
  ck('player has coins before reset', coinsNow > 0, `coins=${coinsNow}`);
  player.resetAll();
  ck('reset clears coins', player.coins === 0, `coins=${player.coins}`);
  ck('reset relocks progress', player.state.unlocked === 1, `unlocked=${player.state.unlocked}`);
  ck('reset clears no-ads', player.state.noAds === false, `noAds=${player.state.noAds}`);

  const fail = checks.filter((c) => !c[1]).length;
  console.log(`\n=== ${checks.length - fail}/${checks.length} checks passed ===`);
  if (fail) process.exitCode = 1;
}

run().catch((e) => {
  console.error('FATAL', e);
  process.exitCode = 1;
});
