# جادوی اعداد — Android wrapper

Native shell for the web game in [`../game`](../game). The entire UI is the
Vite build running in a `WebView`; this module adds the things a web page
cannot do by itself:

| Concern | Native class | Web contract it fulfils |
|---|---|---|
| Tapsell ads (Mediation SDK) | `TapsellBridge.kt` | `window.TapsellBridge` → `src/platform/tapsell.ts` |
| CafeBazaar billing | `PoolakeyBridge.kt` | `window.PoolakeyBridge` → `src/platform/poolakey.ts` |
| Promise plumbing | `WebBridge.kt` + `assets/www/bridge.js` | `window.__bridgeSettle` |
| Hardware back / exit | `MainActivity.kt` | `android-back` / `android-exit` events |

> The web build always runs standalone too. When `window.__host` is absent the
> shim installs nothing and the game falls back to its built-in mocks, so you
> can develop the whole store and ad flow in a desktop browser.

---

## 1. Build

### In CI (recommended)

`.github/workflows/android.yml` builds the APK on every push and PR. It runs
the web test suites first, builds the bundle once, then compiles the APK from
exactly those bytes. Download the result from the run's **Artifacts**:

- `jadooye-adad-debug` — debug APK, always built
- `jadooye-adad-release` — release APK (minified + shrunk)
- `mapping` — R8 mapping file for deobfuscating crash reports

Pushing a `v*` tag additionally publishes the APKs as a GitHub release. You can
also trigger a build by hand from the **Actions** tab and pick which variant.

### Locally

```bash
cd android
./sync-web.sh            # builds ../game and copies dist/ into assets/www
gradle wrapper --gradle-version 8.7   # first time only; the jar is not committed
./gradlew :app:assembleRelease
```

The Gradle wrapper JAR is deliberately not committed (binaries in git age
badly and are a supply-chain risk). Generate it once with a local Gradle
install; CI does the same step automatically.

`sync-web.sh` also injects `<script src="./bridge.js">` above the game bundle
in `index.html`, so the bridges exist before the app boots. Re-run it after
**every** change to the web code — `assets/www` is generated and git-ignored
(except `bridge.js`, which is source).

### Requirements

- JDK 17, Android SDK 34, Gradle 8.7 (via the wrapper), AGP 7.4.2+
- `minSdk 21`, `compileSdk 34`, `targetSdk 34`

### Which Tapsell SDK?

This wrapper uses the **Tapsell Mediation SDK** (`ir.tapsell:tapsell`), which
is Tapsell's current library. The older `ir.tapsell.plus:tapsell-plus-sdk-android`
is deprecated — it still serves ads for existing integrations but receives no
updates or bug fixes, so it is deliberately not used here.

The SDK **initialises itself** from the `TapsellMediationAppKey` manifest
placeholder (set in `app/build.gradle.kts`), so there is no `initialize()` call
to forget. `TapsellBridge.init()` only registers the completion listener.

Mediation serves nothing without at least one **adapter**. Only
`ir.tapsell.mediation.adapter:legacy` (Tapsell's own inventory) is included;
add `admob`, `applovin`, `unity`, etc. from the
[ad-networks docs](https://developer.tapsell.ir/docs/sdk/platforms/android/adnetworks)
to widen fill.

---

## 2. Keys and zone ids

Nothing secret is hardcoded. Each credential is resolved from a Gradle property
first, then an environment variable, then a harmless placeholder — so the
project always builds, with or without keys.

### For CI — repository secrets

Set these under **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|---|---|
| `TAPSELL_APP_KEY` | Tapsell app key |
| `TAPSELL_ZONE_BANNER` | banner zone id |
| `TAPSELL_ZONE_INTERSTITIAL` | interstitial zone id |
| `TAPSELL_ZONE_NATIVE` | native zone id |
| `TAPSELL_ZONE_REWARDED` | rewarded zone id |
| `BAZAAR_RSA_KEY` | CafeBazaar RSA public key |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 upload.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

All are optional. Without them the workflow still produces an installable APK
signed with the debug key and built against placeholder ad/billing ids — useful
for testing gameplay, but **not** shippable to CafeBazaar.

### Locally

Put your values in `~/.gradle/gradle.properties` (preferred) or pass them
with `-P`:

```properties
tapsell.appKey=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
tapsell.zone.banner=5xxxxxxxxxxxxxxxxxxxxxxx
tapsell.zone.interstitial=5xxxxxxxxxxxxxxxxxxxxxxx
tapsell.zone.native=5xxxxxxxxxxxxxxxxxxxxxxx
tapsell.zone.rewarded=5xxxxxxxxxxxxxxxxxxxxxxx
bazaar.rsaKey=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ...
```

They become `BuildConfig` fields, are handed to JS by `HostBridge.config()`,
and surface as `window.TAPSELL_CONFIG` / `window.BAZAAR_RSA_KEY`.

Get them from:
- **Tapsell** — <https://dashboard.tapsell.ir> → app → *Zones*. Create one zone
  per format (banner 320×50, interstitial, native, rewarded video).
- **CafeBazaar** — developer panel → your app → *In-app billing* → RSA public key.

Leaving `bazaar.rsaKey` unset disables local signature verification
(`SecurityCheck.Disable`). That is fine for side-loaded testing, **never** for
a release.

---

## 3. In-app products

Create these in the CafeBazaar developer panel with **exactly** these product
ids — they are the SKUs in [`../game/src/core/economy.ts`](../game/src/core/economy.ts).

### Coin packs — consumable

Rate: **1 coin = 100 تومان**, i.e. the 50-coin pack is 5,000 تومان.

| Product id | Coins | Price (تومان) | Bonus |
|---|---:|---:|---|
| `coins_50`   | 50    | 5,000   | — |
| `coins_150`  | 165   | 15,000  | ۱۰٪ |
| `coins_300`  | 360   | 30,000  | ۲۰٪ |
| `coins_600`  | 780   | 60,000  | ۳۰٪ (best value) |
| `coins_1200` | 1,680 | 120,000 | ۴۰٪ |
| `coins_2500` | 3,750 | 250,000 | ۵۰٪ |

### Remove ads — non-consumable

| Product id | Price (تومان) |
|---|---:|
| `remove_ads` | 20,000 |

**Consumption rules (already implemented):** coin packs are consumed right
after the coins are credited so they can be re-bought; `remove_ads` is *never*
consumed and is restored on every cold start via `getPurchasedProducts()`.

---

## 4. How native ads are rendered

Native ads are **not** re-drawn as HTML inside the WebView — doing that would
show the creative without the SDK ever registering an impression or click.

Instead:

1. The web UI reserves an empty `.nativead-slot` box inside a panel and reports
   its viewport rectangle (`ads.mountNative(slot)`).
2. `TapsellBridge.showNativeAt()` inflates `res/layout/tapsell_native_ad.xml`
   into a `NativeAdViewContainer`, binds the views with `NativeAdView.Builder`,
   and positions that real view over the slot.
3. While the panel lives, the web layer keeps sending `moveNative()` on resize
   and scroll so the overlay stays glued to the slot.
4. Closing the panel calls `hideNative()` → `Tapsell.destroyNativeAd()`.

The layout is styled to match the game (purple card, gold CTA, RTL), so the ad
still looks native to the Persian UI. In a plain browser, step 1 falls back to
drawing a house-ad placeholder inside the same slot.

---

## 5. Ad policy — read before changing anything

The game's economy is deliberately tight:

- A completed level pays **exactly 50 coins**, on first completion only.
- **There is no other source of free coins.** No daily rewards, no free-coin
  timers, no "watch an ad for coins".
- **Rewarded ads grant nothing.** `TapsellBridge.showRewarded` does not
  override `onRewarded`, and the JS side resolves with `undefined`, so there is
  no reward payload that could be wired to a grant. Keep it that way; the
  `bridgetest` suite asserts it.

Ad pacing lives in `tapsell.ts` and mirrors the original game: no ads before
level 4, at least 2 levels and 110 s between interstitials, banner only on the
game and store screens.

---

## 6. Verifying without a device

The Kotlin↔JS contract is covered by a test that loads the real `bridge.js`
against fake `@JavascriptInterface` objects and drives the game's own modules
through it:

```bash
cd ../game
npx tsx tools/bridgetest.ts     # 27 assertions
npm test                        # all suites, 107 assertions
```

It checks method names, argument order, payload shapes, the consumable vs
non-consumable split and the no-reward guarantee — the mismatches that would
otherwise only appear on a phone.

---

## 7. Release checklist

1. `./sync-web.sh` — refresh `assets/www`. (CI does this for you.)
2. Set a real `bazaar.rsaKey`; confirm `SecurityCheck.Enable` is active.
3. Bump `versionCode` / `versionName` in `app/build.gradle.kts`.
4. Sign with your upload keystore (don't commit it).
5. `./gradlew :app:bundleRelease` → upload the `.aab` to CafeBazaar.
6. Smoke-test on a device with the Bazaar app installed: buy `coins_50`,
   confirm the coins land and the purchase is consumed (buyable again); buy
   `remove_ads`, kill the app, reopen, confirm ads stay gone.
7. Server-side validation of coin purchases with the CafeBazaar Developer REST
   API v2 is recommended before granting coins in production. The purchase
   token is already surfaced for this.
