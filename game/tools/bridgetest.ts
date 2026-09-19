/**
 * Contract test for the Android bridge shim.
 *
 * Loads android/app/src/main/assets/www/bridge.js against FAKE Kotlin
 * @JavascriptInterface objects, then drives the game's own `ads` and `billing`
 * modules through it. This proves the native layer and the web layer agree on
 * method names, argument order and payload shapes — the thing that is
 * otherwise only discovered on a physical device.
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(`<!doctype html><html><body></body></html>`, {
  url: 'http://localhost/',
  runScripts: 'outside-only',
});

const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
g.localStorage = dom.window.localStorage;
g.CustomEvent = dom.window.CustomEvent;
g.requestAnimationFrame = (cb: FrameRequestCallback) =>
  dom.window.setTimeout(() => cb(Date.now()), 0) as unknown as number;

const checks: [string, boolean, string][] = [];
const ck = (name: string, cond: boolean, extra = '') => {
  checks.push([name, cond, extra]);
  console.log(`${cond ? '  ok' : 'FAIL'}  ${name}${extra ? `   (${extra})` : ''}`);
};

// --------------------------------------------------------------- fake natives
const log: string[] = [];
type Settle = (id: string, ok: boolean, value: string | null) => void;
const settle = () => (dom.window as unknown as { __bridgeSettle: Settle }).__bridgeSettle;

const w = dom.window as unknown as Record<string, unknown>;

w.__host = {
  config: () =>
    JSON.stringify({
      tapsell: {
        appKey: 'APPKEY123',
        zones: { banner: 'ZB', interstitial: 'ZI', native: 'ZN', rewarded: 'ZR' },
      },
      bazaarRsaKey: 'RSAKEY456',
    }),
  exit: () => log.push('host.exit'),
  vibrate: (ms: number) => log.push(`host.vibrate:${ms}`),
};

w.__tapsell = {
  init: (k: string) => log.push(`tapsell.init:${k}`),
  showBanner: (z: string) => log.push(`tapsell.showBanner:${z}`),
  hideBanner: () => log.push('tapsell.hideBanner'),
  requestInterstitial: (id: string, z: string) => {
    log.push(`tapsell.requestInterstitial:${z}`);
    setTimeout(() => settle()(id, true, 'RESP_I'), 5);
  },
  showInterstitial: (id: string, r: string) => {
    log.push(`tapsell.showInterstitial:${r}`);
    setTimeout(() => settle()(id, true, null), 5);
  },
  requestRewarded: (id: string, z: string) => {
    log.push(`tapsell.requestRewarded:${z}`);
    setTimeout(() => settle()(id, true, 'RESP_R'), 5);
  },
  showRewarded: (id: string, r: string) => {
    log.push(`tapsell.showRewarded:${r}`);
    // Kotlin resolves with null — the reward signal is deliberately dropped.
    setTimeout(() => settle()(id, true, null), 5);
  },
  showNativeAt: (id: string, z: string, x: number, y: number, w: number, h: number) => {
    log.push(`tapsell.showNativeAt:${z}:${x},${y},${w},${h}`);
    setTimeout(() => settle()(id, true, null), 5);
  },
  moveNative: (x: number, y: number, w: number, h: number) => {
    log.push(`tapsell.moveNative:${x},${y},${w},${h}`);
  },
  hideNative: () => log.push('tapsell.hideNative'),
  setUserConsent: (v: boolean) => log.push(`tapsell.setUserConsent:${v}`),
};

w.__poolakey = {
  connect: (id: string, rsa: string) => {
    log.push(`poolakey.connect:${rsa}`);
    setTimeout(() => settle()(id, true, 'true'), 5);
  },
  disconnect: () => log.push('poolakey.disconnect'),
  purchase: (id: string, sku: string, payload: string) => {
    log.push(`poolakey.purchase:${sku}:${payload}`);
    setTimeout(
      () =>
        settle()(
          id,
          true,
          JSON.stringify({
            status: 'success',
            purchase: {
              orderId: 'o1',
              productId: sku,
              purchaseToken: 'tok_' + sku,
              payload,
              purchaseTime: 1700000000000,
            },
          }),
        ),
      5,
    );
  },
  consume: (id: string, token: string) => {
    log.push(`poolakey.consume:${token}`);
    setTimeout(() => settle()(id, true, 'true'), 5);
  },
  getPurchasedProducts: (id: string) => {
    log.push('poolakey.getPurchasedProducts');
    setTimeout(
      () =>
        settle()(
          id,
          true,
          JSON.stringify([
            { orderId: 'o9', productId: 'remove_ads', purchaseToken: 'tok_ra', payload: '', purchaseTime: 1 },
          ]),
        ),
      5,
    );
  },
  getSkuDetails: (id: string, skusJson: string) => {
    log.push(`poolakey.getSkuDetails:${skusJson}`);
    const skus = JSON.parse(skusJson) as string[];
    setTimeout(
      () =>
        settle()(
          id,
          true,
          JSON.stringify(skus.map((s) => ({ sku: s, title: s, description: '', price: '۵٬۰۰۰ تومان' }))),
        ),
      5,
    );
  },
};

async function run() {
  // ---------------------------------------------------------- load the shim
  const src = readFileSync(
    new URL('../../android/app/src/main/assets/www/bridge.js', import.meta.url),
    'utf8',
  );
  dom.window.eval(src);

  ck('shim reads TAPSELL_CONFIG from the host', (w.TAPSELL_CONFIG as { appKey: string })?.appKey === 'APPKEY123', '');
  ck(
    'shim exposes all four zone ids',
    JSON.stringify((w.TAPSELL_CONFIG as { zones: Record<string, string> })?.zones) ===
      JSON.stringify({ banner: 'ZB', interstitial: 'ZI', native: 'ZN', rewarded: 'ZR' }),
    '',
  );
  ck('shim reads the Bazaar RSA key', w.BAZAAR_RSA_KEY === 'RSAKEY456', '');
  ck('shim defines window.TapsellBridge', !!w.TapsellBridge, '');
  ck('shim defines window.PoolakeyBridge', !!w.PoolakeyBridge, '');

  // the shape the game's TS actually calls
  const tb = w.TapsellBridge as Record<string, unknown>;
  const pb = w.PoolakeyBridge as Record<string, unknown>;
  const tapsellApi = ['init', 'showBanner', 'hideBanner', 'requestInterstitial', 'showInterstitial', 'requestRewarded', 'showRewarded', 'showNativeAt', 'moveNative', 'hideNative'];
  const poolakeyApi = ['connect', 'disconnect', 'purchase', 'consume', 'getPurchasedProducts', 'getSkuDetails'];
  ck('TapsellBridge implements the full contract', tapsellApi.every((k) => typeof tb[k] === 'function'), tapsellApi.filter((k) => typeof tb[k] !== 'function').join(',') || 'all present');
  ck('PoolakeyBridge implements the full contract', poolakeyApi.every((k) => typeof pb[k] === 'function'), poolakeyApi.filter((k) => typeof pb[k] !== 'function').join(',') || 'all present');

  // ------------------------------------------------- drive the game's modules
  const { ads } = await import('../src/platform/tapsell');
  const { billing } = await import('../src/platform/poolakey');

  ads.init();
  ck('ads.init forwards the app key natively', log.includes('tapsell.init:APPKEY123'), '');
  ck('ads sees the native bridge', ads.isNative, '');

  ads.showBanner();
  ck('showBanner uses the configured zone', log.includes('tapsell.showBanner:ZB'), '');
  ads.hideBanner();
  ck('hideBanner reaches the native layer', log.includes('tapsell.hideBanner'), '');

  await ads.showInterstitial();
  ck('interstitial does request→show with the response id', log.includes('tapsell.requestInterstitial:ZI') && log.includes('tapsell.showInterstitial:RESP_I'), '');

  const rewardedResult = await ads.showRewarded();
  ck('rewarded does request→show', log.includes('tapsell.requestRewarded:ZR') && log.includes('tapsell.showRewarded:RESP_R'), '');
  ck('rewarded resolves to undefined — no reward payload can cross the bridge', rewardedResult === undefined, String(rewardedResult));

  // Native ads: the SDK's own view is placed over a slot the web UI reserves,
  // so clicks/impressions are tracked natively instead of being re-rendered.
  const slot = dom.window.document.createElement('div');
  slot.getBoundingClientRect = () =>
    ({ x: 12, y: 340, left: 12, top: 340, right: 312, bottom: 424, width: 300, height: 84, toJSON() {} }) as DOMRect;
  dom.window.document.body.appendChild(slot);

  const unmount = await ads.mountNative(slot);
  ck(
    'native ad is placed over the reserved slot',
    log.includes('tapsell.showNativeAt:ZN:12,340,300,84'),
    log.find((l) => l.startsWith('tapsell.showNativeAt')) ?? 'not called',
  );
  ck(
    'creative is NOT re-rendered as HTML on Android (would break tracking)',
    slot.innerHTML === '',
    slot.innerHTML.slice(0, 40),
  );

  dom.window.dispatchEvent(new dom.window.Event('resize'));
  ck('native overlay follows the slot on resize', log.some((l) => l.startsWith('tapsell.moveNative:')), '');

  unmount();
  ck('unmounting hides the native overlay', log.includes('tapsell.hideNative'), '');

  // billing
  const connected = await billing.connect();
  ck('billing connects with the RSA key', connected && log.includes('poolakey.connect:RSAKEY456'), '');
  ck('billing sees the native bridge', billing.isNative, '');

  const buy = await billing.purchase('coins_50', 'payload-1');
  ck('purchase returns a success result', buy.status === 'success', buy.status);
  ck(
    'purchase carries the token for consumption/validation',
    buy.status === 'success' && buy.purchase.purchaseToken === 'tok_coins_50',
    '',
  );

  const consumed = await billing.consume('tok_coins_50');
  ck('consumable coin pack is consumed', consumed && log.includes('poolakey.consume:tok_coins_50'), '');

  const owned = await billing.getPurchasedProducts();
  ck('remove_ads entitlement is restorable on startup', owned.some((p) => p.productId === 'remove_ads'), JSON.stringify(owned.map((p) => p.productId)));
  ck(
    'remove_ads was never consumed',
    !log.some((l) => l.startsWith('poolakey.consume:tok_ra')),
    '',
  );

  const details = await billing.getSkuDetails(['coins_50', 'remove_ads']);
  ck('sku details come back localized', details.length === 2 && details[0].price.includes('تومان'), JSON.stringify(details[0]));

  // hardware exit
  dom.window.dispatchEvent(new dom.window.CustomEvent('android-exit'));
  ck('android-exit closes the activity', log.includes('host.exit'), '');

  const fail = checks.filter((c) => !c[1]).length;
  console.log(`\n=== ${checks.length - fail}/${checks.length} checks passed ===`);
  if (fail) process.exitCode = 1;
}

run().catch((e) => {
  console.error('FATAL', e);
  process.exitCode = 1;
});
