/**
 * NATIVE BRIDGE SHIM  —  loaded before the game bundle inside the Android app.
 *
 * Kotlin exposes flat, callback-style @JavascriptInterface objects
 * (`__tapsell`, `__poolakey`, `__host`). This file turns them into the exact
 * promise-based contracts the web build looks for:
 *
 *    window.TAPSELL_CONFIG  = { appKey, zones: { banner, interstitial, native, rewarded } }
 *    window.TapsellBridge   = { init, showBanner, hideBanner, requestInterstitial,
 *                               showInterstitial, requestRewarded, showRewarded,
 *                               showNativeAt, moveNative, hideNative }
 *    window.BAZAAR_RSA_KEY  = "<key>"
 *    window.PoolakeyBridge  = { connect, disconnect, purchase, consume,
 *                               getPurchasedProducts, getSkuDetails }
 *
 * If the natives are missing (plain browser), nothing is defined and the game
 * transparently falls back to its built-in mocks.
 */
(function () {
  'use strict';

  var host = window.__host;
  if (!host) return; // running in a normal browser — use the web mocks

  // ---------------------------------------------------------------- config
  try {
    var cfg = JSON.parse(host.config());
    window.TAPSELL_CONFIG = cfg.tapsell;
    window.BAZAAR_RSA_KEY = cfg.bazaarRsaKey;
  } catch (e) {
    console.warn('bridge: bad config', e);
  }

  // ------------------------------------------------------- promise plumbing
  var pending = Object.create(null);
  var seq = 0;

  function call(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      var id = 'c' + ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      try {
        fn.apply(null, [id].concat(args));
      } catch (err) {
        delete pending[id];
        reject(err);
      }
    });
  }

  /** Called from Kotlin (WebBridge.resolve / .reject). */
  window.__bridgeSettle = function (id, ok, value) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    if (ok) p.resolve(value);
    else p.reject(new Error(value || 'bridge-error'));
  };

  // ---------------------------------------------------------------- Tapsell
  var t = window.__tapsell;
  if (t) {
    window.TapsellBridge = {
      init: function (appKey) {
        t.init(appKey);
      },
      showBanner: function (zoneId) {
        t.showBanner(zoneId);
      },
      hideBanner: function () {
        t.hideBanner();
      },
      requestInterstitial: function (zoneId) {
        return call(t.requestInterstitial.bind(t), zoneId);
      },
      showInterstitial: function (responseId) {
        return call(t.showInterstitial.bind(t), responseId).then(function () {});
      },
      requestRewarded: function (zoneId) {
        return call(t.requestRewarded.bind(t), zoneId);
      },
      // Resolves with nothing: rewarded ads grant no coins and no rewards.
      showRewarded: function (responseId) {
        return call(t.showRewarded.bind(t), responseId).then(function () {});
      },
      // Shows a real Tapsell native view over the rectangle the web UI
      // reserved for it, so impressions and clicks are tracked by the SDK.
      showNativeAt: function (zoneId, x, y, w, h) {
        return call(t.showNativeAt.bind(t), zoneId, x, y, w, h).then(function () {});
      },
      moveNative: function (x, y, w, h) {
        t.moveNative(x, y, w, h);
      },
      hideNative: function () {
        t.hideNative();
      },
      setUserConsent: function (granted) {
        t.setUserConsent(!!granted);
      },
    };
  }

  // --------------------------------------------------------------- Poolakey
  var p = window.__poolakey;
  if (p) {
    window.PoolakeyBridge = {
      connect: function (rsaKey) {
        return call(p.connect.bind(p), rsaKey || '').then(function (v) {
          return v === 'true';
        });
      },
      disconnect: function () {
        p.disconnect();
      },
      purchase: function (productId, payload) {
        return call(p.purchase.bind(p), productId, payload || '').then(function (json) {
          return JSON.parse(json);
        });
      },
      consume: function (token) {
        return call(p.consume.bind(p), token).then(function (v) {
          return v === 'true';
        });
      },
      getPurchasedProducts: function () {
        return call(p.getPurchasedProducts.bind(p)).then(function (json) {
          return JSON.parse(json);
        });
      },
      getSkuDetails: function (skus) {
        return call(p.getSkuDetails.bind(p), JSON.stringify(skus || [])).then(function (json) {
          return JSON.parse(json);
        });
      },
    };
  }

  // ------------------------------------------------------------- hardware
  // The game answers `android-back` with `android-exit` when it is already on
  // the main menu and nothing is open.
  window.addEventListener('android-exit', function () {
    host.exit();
  });

  window.nativeVibrate = function (ms) {
    try {
      host.vibrate(ms || 12);
    } catch (e) {
      /* ignore */
    }
  };
})();