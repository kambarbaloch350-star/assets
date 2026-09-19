/**
 * Head-less UI smoke test.
 *
 * Boots the real app inside jsdom and drives it the way a player would:
 * menu → play → tap cards until the level is won → check the coin payout,
 * then exercises the store (coin pack + remove-ads) and the coin rules.
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
g.HTMLButtonElement = dom.window.HTMLButtonElement;
g.CustomEvent = dom.window.CustomEvent;
g.Event = dom.window.Event;
g.localStorage = dom.window.localStorage;
g.requestAnimationFrame = (cb: FrameRequestCallback) => dom.window.setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.cancelAnimationFrame = (id: number) => dom.window.clearTimeout(id);
g.Audio = class {
  volume = 1;
  currentTime = 0;
  paused = true;
  preload = '';
  play() {
    return Promise.resolve();
  }
} as unknown as typeof Audio;
// jsdom has no Element.animate
dom.window.Element.prototype.animate = function () {
  return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation;
} as never;

async function run() {
  const { player } = await import('../src/core/save');
  const { Engine } = await import('../src/core/engine');
  const { COINS_PER_LEVEL, COIN_PACKS, REMOVE_ADS, TOMAN_PER_COIN } = await import('../src/core/economy');
  const { starsFor } = await import('../src/core/levels');
  const { ads } = await import('../src/platform/tapsell');

  const checks: [string, boolean, string][] = [];
  const ck = (name: string, cond: boolean, extra = '') => {
    checks.push([name, cond, extra]);
    console.log(`${cond ? '  ok' : 'FAIL'}  ${name}${extra ? `   (${extra})` : ''}`);
  };

  // ---------------------------------------------------- coin rules
  player.resetAll();
  ck('starts with 0 coins', player.coins === 0, `coins=${player.coins}`);

  const r1 = player.completeLevel(1, 3, 10);
  ck('level 1 pays exactly 50', r1.earned === COINS_PER_LEVEL, `earned=${r1.earned}`);
  ck('balance is 50', player.coins === 50, `coins=${player.coins}`);

  const r2 = player.completeLevel(1, 3, 8);
  ck('replaying level 1 pays 0', r2.earned === 0, `earned=${r2.earned}`);
  ck('balance still 50', player.coins === 50, `coins=${player.coins}`);

  player.completeLevel(2, 2, 30);
  ck('level 2 pays 50 → 100 total', player.coins === 100, `coins=${player.coins}`);
  ck('unlock advanced to 3', player.state.unlocked === 3, `unlocked=${player.state.unlocked}`);

  // rewarded ad must grant nothing (drive the mock overlay like a user would)
  const before = player.coins;
  const rewarded = ads.showRewarded();
  await new Promise((r) => setTimeout(r, 30));
  const adOverlay = dom.window.document.querySelector('.ad-overlay');
  ck('rewarded ad shows a full-screen ad', !!adOverlay, '');
  const skip = adOverlay?.querySelector('.ad-overlay__skip') as HTMLButtonElement | null;
  if (skip) {
    skip.disabled = false;
    skip.click();
  }
  await new Promise((r) => setTimeout(r, 300));
  const settled = await Promise.race([rewarded.then(() => 'done'), new Promise((r) => setTimeout(() => r('hang'), 1500))]);
  ck('rewarded ad resolves after close', settled === 'done', String(settled));
  ck('rewarded ad grants no coins', player.coins === before, `coins=${player.coins}`);
  ck('rewarded ad returns no reward payload', (await rewarded) === undefined, '');
  ck('ad overlay removed after close', !dom.window.document.querySelector('.ad-overlay'), '');

  // spending
  ck('can spend 60', player.spend(60) && player.coins === 40, `coins=${player.coins}`);
  ck('cannot overspend', !player.spend(9999), `coins=${player.coins}`);

  // ---------------------------------------------------- pricing
  const p1 = COIN_PACKS[0];
  ck(
    '50 coins costs 5,000 toman',
    p1.coins === 50 && p1.toman === 5000,
    `${p1.coins}c / ${p1.toman}t`,
  );
  ck('rate is 100 toman per coin', TOMAN_PER_COIN === 100, String(TOMAN_PER_COIN));
  ck('remove ads is 20,000 toman', REMOVE_ADS.toman === 20000, String(REMOVE_ADS.toman));
  ck(
    'every pack ≥ base value',
    COIN_PACKS.every((p) => p.coins >= p.toman / TOMAN_PER_COIN),
    '',
  );

  // ---------------------------------------------------- play a real level
  player.resetAll();
  const e = new Engine(1, 0);
  let guard = 0;
  while (!e.won && guard++ < 400) {
    const m = e.hint();
    if (!m) break;
    if (!e.apply(m).ok) break;
  }
  ck('level 1 is winnable through the engine', e.won, `moves=${e.movesUsed}`);
  const stars = starsFor(e.cfg, e.movesUsed);
  ck('win yields 1-3 stars', stars >= 1 && stars <= 3, `stars=${stars}`);

  const res = player.completeLevel(1, stars, e.movesUsed);
  ck('completing pays 50', res.earned === 50, `earned=${res.earned}`);

  // ---------------------------------------------------- boot the real UI
  player.resetAll();
  // node cannot import Vite's CSS side-effect module
  const { register } = await import('node:module');
  register(new URL('./css-stub.mjs', import.meta.url));
  await import('../src/main');
  await new Promise((r) => setTimeout(r, 400));

  const doc = dom.window.document;
  const screens = doc.querySelectorAll('.screen');
  ck('4 screens registered', screens.length === 4, `found=${screens.length}`);

  const menuActive = doc.querySelector('.menu')?.classList.contains('is-active');
  ck('menu is the active screen', !!menuActive, '');

  const title = doc.querySelector('.menu__name')?.textContent;
  ck('menu shows the Persian title', title === 'جادوی اعداد', String(title));

  ck('html dir is rtl', doc.documentElement.getAttribute('dir') === 'rtl', '');
  ck('html lang is fa', doc.documentElement.getAttribute('lang') === 'fa', '');

  // start a game via the real button
  const playBtn = doc.querySelector('.bigbtn--play') as HTMLButtonElement;
  ck('play button exists', !!playBtn, '');
  playBtn?.click();
  await new Promise((r) => setTimeout(r, 400));

  const gameActive = doc.querySelector('.game')?.classList.contains('is-active');
  ck('game screen opened', !!gameActive, '');

  const cards = doc.querySelectorAll('.game .card');
  ck('cards rendered on the board', cards.length > 0, `cards=${cards.length}`);

  const fnds = doc.querySelectorAll('.game .fnd');
  ck('foundations rendered', fnds.length >= 3, `fnd=${fnds.length}`);

  const tools = doc.querySelectorAll('.game .tool');
  ck('power-up tools rendered', tools.length === 4, `tools=${tools.length}`);

  // labels must be Persian digits, never ASCII
  const labels = Array.from(doc.querySelectorAll('.game .card__label'))
    .map((n) => n.textContent ?? '')
    .filter(Boolean);
  ck(
    'card faces use Persian digits only',
    labels.every((l) => !/[0-9]/.test(l)),
    labels.slice(0, 3).join(' | '),
  );
  ck('card faces contain math operators', labels.some((l) => /[+−×÷]/.test(l)), '');

  // store
  const storeBtn = doc.querySelector('.bigbtn--gold') as HTMLButtonElement;
  storeBtn?.click();
  await new Promise((r) => setTimeout(r, 400));
  const packs = doc.querySelectorAll('.pack');
  ck('store lists coin packs', packs.length === COIN_PACKS.length, `packs=${packs.length}`);
  const noadsTile = doc.querySelector('.noads');
  ck('store has remove-ads tile', !!noadsTile, '');
  const priceTxt = doc.querySelector('.noads .pricebtn')?.textContent ?? '';
  ck('remove-ads price shown in toman', priceTxt.includes('تومان'), priceTxt);
  ck('remove-ads price uses Persian digits', !/[0-9]/.test(priceTxt), priceTxt);

  // no "free coins" affordance anywhere
  const bodyTxt = doc.body.textContent ?? '';
  ck('no daily-reward UI', !/روزانه|جایزه رایگان|رایگان روزانه/.test(bodyTxt), '');

  // ---------------------------------------------------- report
  const fail = checks.filter((c) => !c[1]).length;
  console.log(`\n=== ${checks.length - fail}/${checks.length} checks passed ===`);
  if (fail) process.exitCode = 1;
}

run().catch((e) => {
  console.error('FATAL', e);
  process.exitCode = 1;
});
