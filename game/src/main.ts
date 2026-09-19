import './styles/main.css';

import { player } from './core/save';
import { REMOVE_ADS } from './core/economy';
import { router } from './ui/router';
import { mountBanner } from './ui/banner';
import { createMenu } from './screens/menu';
import { createLevels } from './screens/levels';
import { createGame } from './screens/game';
import { createStore } from './screens/store';
import { sfx } from './platform/audio';
import { ads } from './platform/tapsell';
import { billing } from './platform/poolakey';

async function boot() {
  const host = document.getElementById('app')!;
  router.mount(host);

  sfx.preload();

  // --- ads ------------------------------------------------------------
  ads.init();
  ads.setNoAds(player.state.noAds);
  mountBanner();

  // --- billing: restore the non-consumable Remove-Ads entitlement ------
  void billing.connect().then(async () => {
    const owned = await billing.getPurchasedProducts();
    if (owned.some((p) => p.productId === REMOVE_ADS.sku)) {
      player.setNoAds(true);
      ads.setNoAds(true);
    }
  });

  // --- screens ---------------------------------------------------------
  router.register(createMenu());
  router.register(createLevels());
  router.register(createGame());
  router.register(createStore());
  router.go('menu');

  // banner only during gameplay & store, like the original
  const applyBanner = () => {
    if (player.state.noAds) {
      ads.hideBanner();
      return;
    }
    if (router.current === 'game' || router.current === 'store') ads.showBanner();
    else ads.hideBanner();
  };
  const origGo = router.go.bind(router);
  router.go = (name, params, track) => {
    origGo(name, params, track);
    applyBanner();
  };

  window.addEventListener('open-store', () => router.go('store'));
  window.addEventListener('progress-reset', () => router.go('menu'));

  // Android hardware back button, forwarded by the WebView wrapper.
  window.addEventListener('android-back', () => {
    const open = document.querySelector('.overlay.is-open') as HTMLElement | null;
    if (open) {
      (open.querySelector('.panel__close') as HTMLButtonElement | null)?.click();
      return;
    }
    if (router.current === 'menu') {
      window.dispatchEvent(new CustomEvent('android-exit'));
      return;
    }
    router.back();
  });

  // keep vh correct when the mobile URL bar shows/hides
  const setVh = () =>
    document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
  setVh();
  window.addEventListener('resize', setVh);

  document.getElementById('splash')?.classList.add('is-gone');
  setTimeout(() => document.getElementById('splash')?.remove(), 700);
}

void boot();
