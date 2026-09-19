/**
 * TAPSELL ADS BRIDGE  (تپسل)
 * ---------------------------------------------------------------------------
 * The game talks to this module only. When the build runs inside the Android
 * WebView wrapper (see android/ in the repo), `window.TapsellBridge` is
 * injected by the native layer and every call below forwards to the real
 * TapsellPlus SDK. In a plain browser we fall back to a faithful mock so the
 * whole ad flow stays testable.
 *
 * Zone ids are supplied by the native layer / build config — never hardcoded
 * secrets in JS.
 *
 * IMPORTANT POLICY, ENFORCED HERE:
 *   Rewarded ads grant NO coins and NO rewards of any kind. `showRewarded`
 *   resolves with `void`. There is intentionally no reward payload, so no
 *   caller can accidentally wire a reward to an ad.
 */

export type AdType = 'banner' | 'interstitial' | 'native' | 'rewarded';

export interface TapsellNativeAd {
  title: string;
  description: string;
  cta: string;
  iconUrl?: string;
  bannerUrl?: string;
  sponsoredLabel: string;
}

interface NativeBridge {
  init(appKey: string): void;
  showBanner(zoneId: string): void;
  hideBanner(): void;
  requestInterstitial(zoneId: string): Promise<string>;
  showInterstitial(responseId: string): Promise<void>;
  requestRewarded(zoneId: string): Promise<string>;
  showRewarded(responseId: string): Promise<void>;
  requestNative(zoneId: string): Promise<TapsellNativeAd>;
}

declare global {
  interface Window {
    TapsellBridge?: Partial<NativeBridge>;
    TAPSELL_CONFIG?: { appKey: string; zones: Record<AdType, string> };
  }
}

const DEFAULT_ZONES: Record<AdType, string> = {
  banner: 'ZONE_BANNER',
  interstitial: 'ZONE_INTERSTITIAL',
  native: 'ZONE_NATIVE',
  rewarded: 'ZONE_REWARDED',
};

/** Frequency caps, modelled on the original game's interstitial trigger script. */
const AD_FREE_UNTIL_LEVEL = 3;
const INTERSTITIAL_MIN_GAP_MS = 110_000;
const INTERSTITIAL_MIN_LEVELS = 2;

type Listener = (v: boolean) => void;

class TapsellAds {
  private bridge?: Partial<NativeBridge>;
  private lastInterstitial = 0;
  private levelsSinceInterstitial = 99;
  private bannerVisible = false;
  private noAds = false;
  private bannerListeners = new Set<Listener>();

  get isNative(): boolean {
    return !!this.bridge;
  }

  get zones(): Record<AdType, string> {
    return window.TAPSELL_CONFIG?.zones ?? DEFAULT_ZONES;
  }

  init() {
    this.bridge = window.TapsellBridge;
    const key = window.TAPSELL_CONFIG?.appKey;
    if (this.bridge?.init && key) this.bridge.init(key);
  }

  /** Reflects the "Remove Ads" purchase; kills every ad surface. */
  setNoAds(v: boolean) {
    this.noAds = v;
    if (v) this.hideBanner();
  }

  // ------------------------------------------------------------- banner

  onBannerChange(fn: Listener): () => void {
    this.bannerListeners.add(fn);
    fn(this.bannerVisible);
    return () => this.bannerListeners.delete(fn);
  }

  showBanner() {
    if (this.noAds) return;
    this.bannerVisible = true;
    this.bridge?.showBanner?.(this.zones.banner);
    this.bannerListeners.forEach((f) => f(true));
  }

  hideBanner() {
    this.bannerVisible = false;
    this.bridge?.hideBanner?.();
    this.bannerListeners.forEach((f) => f(false));
  }

  // ------------------------------------------------------- interstitial

  /** Should an interstitial play right now? Mirrors the original's pacing. */
  canShowInterstitial(level: number): boolean {
    if (this.noAds) return false;
    if (level <= AD_FREE_UNTIL_LEVEL) return false;
    if (this.levelsSinceInterstitial < INTERSTITIAL_MIN_LEVELS) return false;
    return Date.now() - this.lastInterstitial > INTERSTITIAL_MIN_GAP_MS;
  }

  noteLevelFinished() {
    this.levelsSinceInterstitial++;
  }

  async showInterstitial(): Promise<void> {
    if (this.noAds) return;
    this.lastInterstitial = Date.now();
    this.levelsSinceInterstitial = 0;

    if (this.bridge?.requestInterstitial && this.bridge.showInterstitial) {
      try {
        const id = await this.bridge.requestInterstitial(this.zones.interstitial);
        await this.bridge.showInterstitial(id);
      } catch {
        /* no fill — fail silently, never block gameplay */
      }
      return;
    }
    await mockFullscreen('interstitial');
  }

  // ----------------------------------------------------------- rewarded

  /**
   * Rewarded video. Resolves when the ad closes.
   *
   * By design this returns `void` — NO coins, NO power-ups, NO reward of any
   * kind is granted for watching. It exists purely as an optional, opt-in
   * placement (e.g. the player taps "تماشای ویدیو" in the ad centre).
   */
  async showRewarded(): Promise<void> {
    if (this.noAds) return;
    if (this.bridge?.requestRewarded && this.bridge.showRewarded) {
      try {
        const id = await this.bridge.requestRewarded(this.zones.rewarded);
        await this.bridge.showRewarded(id);
      } catch {
        /* ignore */
      }
      return;
    }
    await mockFullscreen('rewarded');
  }

  // ------------------------------------------------------------- native

  async requestNative(): Promise<TapsellNativeAd | null> {
    if (this.noAds) return null;
    if (this.bridge?.requestNative) {
      try {
        return await this.bridge.requestNative(this.zones.native);
      } catch {
        return null;
      }
    }
    return MOCK_NATIVE[Math.floor(Math.random() * MOCK_NATIVE.length)];
  }
}

/** House-ad style placeholders used only in the browser build. */
const MOCK_NATIVE: TapsellNativeAd[] = [
  {
    title: 'اسنپ‌فود',
    description: 'سفارش غذا از بهترین رستوران‌های شهر با تخفیف ویژه',
    cta: 'نصب رایگان',
    sponsoredLabel: 'تبلیغ',
  },
  {
    title: 'دیجی‌کالا',
    description: 'جشنواره فروش ویژه؛ تا ۷۰٪ تخفیف روی هزاران کالا',
    cta: 'مشاهده',
    sponsoredLabel: 'تبلیغ',
  },
  {
    title: 'کافه‌بازار',
    description: 'هزاران بازی و برنامهٔ ایرانی را رایگان دانلود کن',
    cta: 'دانلود',
    sponsoredLabel: 'تبلیغ',
  },
];

/** Mock fullscreen ad used in the browser: a real, skippable overlay. */
function mockFullscreen(kind: 'interstitial' | 'rewarded'): Promise<void> {
  return new Promise((resolve) => {
    const secs = kind === 'rewarded' ? 6 : 4;
    const el = document.createElement('div');
    el.className = 'ad-overlay';
    el.innerHTML = `
      <div class="ad-overlay__card">
        <div class="ad-overlay__tag">${kind === 'rewarded' ? 'ویدیوی تبلیغاتی' : 'پیام بازرگانی'}</div>
        <div class="ad-overlay__art"><img src="./ui/img_ad_break.png" alt=""></div>
        <div class="ad-overlay__title">تپسل</div>
        <div class="ad-overlay__msg">بازی به‌زودی ادامه پیدا می‌کند…</div>
        <button class="ad-overlay__skip" disabled>بستن در <b>${secs}</b></button>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-open'));

    const btn = el.querySelector('.ad-overlay__skip') as HTMLButtonElement;
    const num = btn.querySelector('b')!;
    let left = secs;
    const iv = setInterval(() => {
      left--;
      if (left <= 0) {
        clearInterval(iv);
        btn.disabled = false;
        btn.textContent = 'بستن ✕';
      } else {
        num.textContent = String(left);
      }
    }, 1000);

    btn.onclick = () => {
      if (btn.disabled) return;
      el.classList.remove('is-open');
      setTimeout(() => {
        el.remove();
        resolve();
      }, 240);
    };
  });
}

export const ads = new TapsellAds();
