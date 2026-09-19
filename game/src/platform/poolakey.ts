/**
 * POOLAKEY / CAFEBAZAAR BILLING BRIDGE  (کافه‌بازار — پولکی)
 * ---------------------------------------------------------------------------
 * All in-app purchases (coin packs + Remove Ads) go through here.
 *
 * Inside the Android wrapper, `window.PoolakeyBridge` is injected and forwards
 * to the real Poolakey SDK (`com.github.cafebazaar.Poolakey:poolakey`), which
 * talks to the installed CafeBazaar app over AIDL. In the browser we simulate
 * the same state machine (connect → purchase → consume) so the store UI and
 * entitlement logic can be exercised end to end.
 *
 * Security note: consumable coin packs should additionally be validated
 * server-side with the CafeBazaar Developer REST API v2 before granting coins
 * in a production deployment. The purchase token is surfaced for that purpose.
 */

export interface PurchaseInfo {
  orderId: string;
  productId: string;
  purchaseToken: string;
  payload: string;
  purchaseTime: number;
}

export type PurchaseResult =
  | { status: 'success'; purchase: PurchaseInfo }
  | { status: 'canceled' }
  | { status: 'failed'; message: string };

export interface SkuDetails {
  sku: string;
  title: string;
  description: string;
  /** localized price string coming from Bazaar, e.g. "۵٬۰۰۰ تومان" */
  price: string;
}

interface NativeBilling {
  connect(rsaPublicKey: string): Promise<boolean>;
  disconnect(): void;
  purchase(productId: string, payload: string): Promise<PurchaseResult>;
  consume(purchaseToken: string): Promise<boolean>;
  getPurchasedProducts(): Promise<PurchaseInfo[]>;
  getSkuDetails(skus: string[]): Promise<SkuDetails[]>;
}

declare global {
  interface Window {
    PoolakeyBridge?: Partial<NativeBilling>;
    BAZAAR_RSA_KEY?: string;
  }
}

class Billing {
  private bridge?: Partial<NativeBilling>;
  private connected = false;

  get isNative(): boolean {
    return !!this.bridge?.purchase;
  }

  async connect(): Promise<boolean> {
    this.bridge = window.PoolakeyBridge;
    if (!this.bridge?.connect) {
      this.connected = true; // browser simulation
      return true;
    }
    try {
      this.connected = await this.bridge.connect(window.BAZAAR_RSA_KEY ?? '');
    } catch {
      this.connected = false;
    }
    return this.connected;
  }

  disconnect() {
    this.bridge?.disconnect?.();
    this.connected = false;
  }

  /**
   * Launch the Bazaar payment flow for a SKU.
   * `payload` should be an opaque nonce tied to the player for anti-replay.
   */
  async purchase(sku: string, payload = `u-${Date.now().toString(36)}`): Promise<PurchaseResult> {
    if (!this.connected) await this.connect();

    if (this.bridge?.purchase) {
      try {
        return await this.bridge.purchase(sku, payload);
      } catch (e) {
        return { status: 'failed', message: String(e) };
      }
    }
    return mockPurchase(sku, payload);
  }

  /** Consumables (coin packs) must be consumed so they can be re-bought. */
  async consume(token: string): Promise<boolean> {
    if (this.bridge?.consume) {
      try {
        return await this.bridge.consume(token);
      } catch {
        return false;
      }
    }
    return true;
  }

  /** Used on startup to restore a non-consumable "Remove Ads" entitlement. */
  async getPurchasedProducts(): Promise<PurchaseInfo[]> {
    if (this.bridge?.getPurchasedProducts) {
      try {
        return await this.bridge.getPurchasedProducts();
      } catch {
        return [];
      }
    }
    return [];
  }

  async getSkuDetails(skus: string[]): Promise<SkuDetails[]> {
    if (this.bridge?.getSkuDetails) {
      try {
        return await this.bridge.getSkuDetails(skus);
      } catch {
        return [];
      }
    }
    return [];
  }
}

/** Browser-only simulation of the Bazaar payment sheet. */
function mockPurchase(sku: string, payload: string): Promise<PurchaseResult> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'bazaar-sheet';
    el.innerHTML = `
      <div class="bazaar-sheet__panel">
        <div class="bazaar-sheet__head">
          <div class="bazaar-sheet__logo">بازار</div>
          <div class="bazaar-sheet__sub">پرداخت درون‌برنامه‌ای</div>
        </div>
        <div class="bazaar-sheet__body">
          <div class="bazaar-sheet__sku">${sku}</div>
          <div class="bazaar-sheet__note">این یک شبیه‌سازی است. در نسخهٔ اندروید،
            پرداخت واقعی از طریق کافه‌بازار (Poolakey) انجام می‌شود.</div>
        </div>
        <div class="bazaar-sheet__actions">
          <button class="bz-cancel">انصراف</button>
          <button class="bz-pay">پرداخت</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-open'));

    const done = (r: PurchaseResult) => {
      el.classList.remove('is-open');
      setTimeout(() => {
        el.remove();
        resolve(r);
      }, 220);
    };

    (el.querySelector('.bz-cancel') as HTMLButtonElement).onclick = () => done({ status: 'canceled' });
    (el.querySelector('.bz-pay') as HTMLButtonElement).onclick = () => {
      const panel = el.querySelector('.bazaar-sheet__panel')!;
      panel.classList.add('is-loading');
      setTimeout(
        () =>
          done({
            status: 'success',
            purchase: {
              orderId: `sim-${Math.random().toString(36).slice(2, 10)}`,
              productId: sku,
              purchaseToken: `tok-${Math.random().toString(36).slice(2)}`,
              payload,
              purchaseTime: Date.now(),
            },
          }),
        900,
      );
    };
  });
}

export const billing = new Billing();
