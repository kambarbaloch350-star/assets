import { T, faNum, faToman } from '../core/i18n';
import { COIN_PACKS, REMOVE_ADS, TOMAN_PER_COIN, COINS_PER_LEVEL, type CoinPack } from '../core/economy';
import { player } from '../core/save';
import { clear, el, toast } from '../ui/dom';
import { router, topbar, type Screen } from '../ui/router';
import { coinChip, flyCoins } from '../ui/coinchip';
import { sfx } from '../platform/audio';
import { billing } from '../platform/poolakey';
import { ads } from '../platform/tapsell';

export function createStore(): Screen {
  const root = el('div', 'store');
  root.appendChild(topbar(T.storeTitle, () => router.back(), coinChip(() => {})));

  const scroll = el('div', 'store__scroll');
  const inner = el('div', 'store__inner');
  scroll.appendChild(inner);
  root.appendChild(scroll);

  let busySku: string | null = null;

  // ------------------------------------------------------------- purchase
  async function purchase(
    sku: string,
    btn: HTMLButtonElement,
    onGranted: (btn: HTMLButtonElement) => void,
    consumable: boolean,
  ) {
    if (busySku) return;
    busySku = sku;
    const original = btn.textContent;
    btn.disabled = true;
    btn.classList.add('is-busy');
    btn.textContent = T.buying;
    sfx.play('tap');

    try {
      const res = await billing.purchase(sku);

      if (res.status === 'canceled') {
        toast(T.purchaseCancel, 'warn');
        return;
      }
      if (res.status === 'failed') {
        toast(`${T.purchaseFail} — ${res.message}`.slice(0, 90), 'warn');
        return;
      }

      // In production: validate res.purchase.purchaseToken server-side
      // against the CafeBazaar Developer REST API v2 BEFORE granting.
      if (consumable) await billing.consume(res.purchase.purchaseToken);

      onGranted(btn);
      sfx.play('cash', 0.6);
      toast(T.purchaseOk, 'good');
    } finally {
      busySku = null;
      btn.disabled = false;
      btn.classList.remove('is-busy');
      if (btn.textContent === T.buying) btn.textContent = original ?? '';
      build();
    }
  }

  // --------------------------------------------------------------- render
  function build() {
    clear(inner);

    // ---- Remove ads hero
    inner.appendChild(el('div', 'store__sect', T.removeAds));

    const noads = el('div', `noads${player.state.noAds ? ' is-owned' : ''}`);
    const art = el('img', 'noads__art');
    art.src = `./ui/${REMOVE_ADS.art}`;
    art.alt = '';
    const txt = el('div', 'noads__txt');
    txt.append(
      el('div', 'noads__t', T.removeAds),
      el(
        'div',
        'noads__d',
        player.state.noAds ? T.adsRemoved : `${T.removeAdsDesc} — بنر، میان‌برنامه‌ای و تبلیغ همسان حذف می‌شود.`,
      ),
    );
    noads.append(art, txt);

    const adBtn = el('button', 'pricebtn') as HTMLButtonElement;
    if (player.state.noAds) {
      adBtn.textContent = '✓';
      adBtn.disabled = true;
    } else {
      adBtn.textContent = faToman(REMOVE_ADS.toman);
      adBtn.onclick = () =>
        purchase(
          REMOVE_ADS.sku,
          adBtn,
          () => {
            player.setNoAds(true);
            ads.setNoAds(true);
            document.documentElement.style.setProperty('--banner-h', '0px');
          },
          false, // non-consumable entitlement
        );
    }
    noads.appendChild(adBtn);
    inner.appendChild(noads);

    // ---- Coin packs
    inner.appendChild(el('div', 'store__sect', T.coinPacks));

    const grid = el('div', 'packs');
    COIN_PACKS.forEach((p) => grid.appendChild(packTile(p)));
    inner.appendChild(grid);

    // ---- value explainer + policy note
    inner.appendChild(
      el(
        'div',
        'store__foot',
        `نرخ پایه: <b style="color:var(--gold-lt)">${faNum(COINS_PER_LEVEL)} سکه = ${faToman(
          COINS_PER_LEVEL * TOMAN_PER_COIN,
        )}</b><br>` +
          `هر مرحله‌ای که تکمیل کنی دقیقاً ${faNum(COINS_PER_LEVEL)} سکه می‌گیری.<br>` +
          `${T.poweredByBazaar}`,
      ),
    );

    inner.appendChild(
      el(
        'div',
        'store__rate',
        'تبلیغات توسط تپسل نمایش داده می‌شود • پرداخت درون‌برنامه‌ای توسط کافه‌بازار (Poolakey)',
      ),
    );
  }

  function packTile(p: CoinPack): HTMLElement {
    const t = el('div', `pack${p.best ? ' pack--best' : ''}`);
    if (p.badge) t.appendChild(el('div', 'pack__badge', p.badge));
    if (p.best) t.appendChild(el('div', 'pack__best', T.bestValue));

    const img = el('img', 'pack__art');
    img.src = `./ui/${p.art}`;
    img.alt = '';
    t.appendChild(img);

    const amt = el('div', 'pack__amt');
    const ci = el('img');
    ci.src = './ui/img_coin.png';
    ci.alt = '';
    amt.append(el('span', 'num', faNum(p.coins)), ci);
    t.appendChild(amt);

    if (p.bonus > 0) {
      const bonus = el('div', '', `+${faNum(p.bonus)} هدیه`);
      bonus.style.cssText = 'font-size:10.5px;font-weight:800;color:#6ee7a0';
      t.appendChild(bonus);
    }

    const btn = el('button', 'pricebtn') as HTMLButtonElement;
    btn.textContent = faToman(p.toman);
    btn.onclick = () =>
      purchase(
        p.sku,
        btn,
        (b) => {
          player.addPurchasedCoins(p.coins);
          const r = b.getBoundingClientRect();
          flyCoins(r.left + r.width / 2, r.top, 12);
        },
        true, // coin packs are consumable
      );
    t.appendChild(btn);
    return t;
  }

  return {
    name: 'store',
    root,
    onEnter() {
      build();
      scroll.scrollTop = 0;
    },
  };
}
