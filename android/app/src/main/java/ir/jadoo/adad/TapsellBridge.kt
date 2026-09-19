package ir.jadoo.adad

import android.app.Activity
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import ir.tapsell.mediation.Tapsell
import ir.tapsell.mediation.ad.AdStateListener
import ir.tapsell.mediation.ad.request.BannerSize
import ir.tapsell.mediation.ad.request.RequestResultListener
import ir.tapsell.mediation.ad.show.AdShowCompletionState
import ir.tapsell.mediation.ad.views.banner.BannerContainer
import ir.tapsell.mediation.ad.views.ntv.NativeAdView
import ir.tapsell.mediation.ad.views.ntv.NativeAdViewContainer

/**
 * Native half of `src/platform/tapsell.ts`, built on the **Tapsell Mediation
 * SDK** (`ir.tapsell:tapsell`). Tapsell Plus is deprecated and is not used.
 *
 * Exposed to JS as `window.__tapsell`; `bridge.js` promisifies it into
 * `window.TapsellBridge`.
 *
 * The SDK auto-initialises through a ContentProvider using the
 * `TapsellMediationAppKey` manifest placeholder, so `init()` here only
 * registers the completion listener.
 *
 * POLICY: `showRewarded` resolves with nothing. `onRewarded` is deliberately
 * left empty and `AdShowCompletionState` is dropped — rewarded ads in this
 * game never grant coins or any other reward.
 */
class TapsellBridge(
    private val activity: Activity,
    private val webBridge: WebBridge,
) {

    private var bannerContainer: BannerContainer? = null
    private var bannerAdId: String? = null

    private var nativeHost: FrameLayout? = null
    private var nativeContainer: NativeAdViewContainer? = null
    private var nativeAdId: String? = null

    private val density: Float get() = activity.resources.displayMetrics.density

    private fun dp(px: Float): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, px, activity.resources.displayMetrics).toInt()

    private fun rootView(): ViewGroup = activity.findViewById(android.R.id.content)

    // ------------------------------------------------------------------ init

    @JavascriptInterface
    fun init(@Suppress("UNUSED_PARAMETER") appKey: String) {
        // The app key comes from the TapsellMediationAppKey manifest placeholder
        // (see app/build.gradle.kts); the SDK self-initialises on startup.
        activity.runOnUiThread {
            Tapsell.setInitializationListener {
                webBridge.emit("tapsell-ready")
            }
        }
    }

    /** Forwarded from a GDPR/consent dialog if you add one. */
    @JavascriptInterface
    fun setUserConsent(granted: Boolean) {
        activity.runOnUiThread { Tapsell.setUserConsent(activity, granted) }
    }

    // ---------------------------------------------------------------- banner

    @JavascriptInterface
    fun showBanner(zoneId: String) {
        activity.runOnUiThread {
            val container = bannerContainer ?: BannerContainer(activity).also {
                it.layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL,
                )
                rootView().addView(it)
                bannerContainer = it
            }
            container.visibility = View.VISIBLE

            Tapsell.requestBannerAd(zoneId, BannerSize.BANNER_320_50, object : RequestResultListener {
                override fun onSuccess(adId: String) {
                    bannerAdId = adId
                    Tapsell.showBannerAd(adId, container, activity, object : AdStateListener.Banner {
                        override fun onAdImpression() {}
                        override fun onAdClicked() {}
                        override fun onAdFailed(message: String) {
                            container.visibility = View.GONE
                        }
                    })
                }

                override fun onFailure(message: String) {
                    // No fill — collapse the strip so the layout stays clean.
                    container.visibility = View.GONE
                }
            })
        }
    }

    @JavascriptInterface
    fun hideBanner() {
        activity.runOnUiThread {
            bannerContainer?.visibility = View.GONE
            bannerAdId?.let { Tapsell.destroyBannerAd(it) }
            bannerAdId = null
        }
    }

    // ---------------------------------------------------------- interstitial

    @JavascriptInterface
    fun requestInterstitial(callId: String, zoneId: String) {
        activity.runOnUiThread {
            Tapsell.requestInterstitialAd(zoneId, object : RequestResultListener {
                override fun onSuccess(adId: String) = webBridge.resolve(callId, adId)
                override fun onFailure(message: String) = webBridge.reject(callId, message)
            })
        }
    }

    @JavascriptInterface
    fun showInterstitial(callId: String, adId: String) {
        activity.runOnUiThread {
            Tapsell.showInterstitialAd(adId, activity, object : AdStateListener.Interstitial {
                override fun onAdImpression() {}
                override fun onAdClicked() {}
                override fun onAdClosed(completionState: AdShowCompletionState) {
                    webBridge.resolve(callId, null)
                }
                override fun onAdFailed(message: String) {
                    // Never block gameplay because an ad failed.
                    webBridge.resolve(callId, null)
                }
            })
        }
    }

    // -------------------------------------------------------------- rewarded

    @JavascriptInterface
    fun requestRewarded(callId: String, zoneId: String) {
        activity.runOnUiThread {
            Tapsell.requestRewardedAd(zoneId, object : RequestResultListener {
                override fun onSuccess(adId: String) = webBridge.resolve(callId, adId)
                override fun onFailure(message: String) = webBridge.reject(callId, message)
            })
        }
    }

    /**
     * Shows a rewarded video and resolves when it closes.
     *
     * `onRewarded` is intentionally a no-op and `completionState` is ignored:
     * the web layer receives no reward signal, so nothing can be granted for
     * watching. The only free coins in the app are the flat 50 per first
     * level completion.
     */
    @JavascriptInterface
    fun showRewarded(callId: String, adId: String) {
        activity.runOnUiThread {
            Tapsell.showRewardedAd(adId, activity, object : AdStateListener.Rewarded {
                override fun onAdImpression() {}
                override fun onAdClicked() {}
                override fun onAdClosed(completionState: AdShowCompletionState) {
                    webBridge.resolve(callId, null)
                }
                override fun onRewarded() {
                    // Deliberately empty. Do NOT grant anything here.
                }
                override fun onAdFailed(message: String) {
                    webBridge.resolve(callId, null)
                }
            })
        }
    }

    // ---------------------------------------------------------------- native

    /**
     * Shows a REAL Tapsell native ad positioned over a rectangle the web UI
     * reserved for it (CSS pixels from the top-left of the viewport).
     *
     * The creative is rendered by the SDK into our own Persian-styled layout,
     * so impressions and clicks are tracked properly — re-drawing the creative
     * as HTML inside the WebView would not be.
     */
    @JavascriptInterface
    fun showNativeAt(callId: String, zoneId: String, x: Float, y: Float, w: Float, h: Float) {
        activity.runOnUiThread {
            val host = nativeHost ?: FrameLayout(activity).also {
                rootView().addView(it)
                nativeHost = it
            }
            host.visibility = View.VISIBLE
            positionHost(host, x, y, w, h)

            // build (once) the ad layout inside a NativeAdViewContainer
            val container = nativeContainer ?: NativeAdViewContainer(activity).also {
                activity.layoutInflater.inflate(R.layout.tapsell_native_ad, it, true)
                host.removeAllViews()
                host.addView(
                    it,
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    ),
                )
                nativeContainer = it
            }

            Tapsell.requestNativeAd(zoneId, object : RequestResultListener {
                override fun onSuccess(adId: String) {
                    nativeAdId = adId
                    val view = NativeAdView.Builder(container)
                        .withLogo(container.findViewById<ImageView>(R.id.tapsell_native_ad_logo))
                        .withTitle(container.findViewById<TextView>(R.id.tapsell_native_ad_title))
                        .withSponsored(container.findViewById<TextView>(R.id.tapsell_native_ad_sponsored))
                        .withDescription(container.findViewById<TextView>(R.id.tapsell_native_ad_description))
                        .withCtaButton(container.findViewById<Button>(R.id.tapsell_native_ad_cta))
                        .withMedia(container.findViewById<FrameLayout>(R.id.tapsell_native_ad_media))
                        .build()

                    Tapsell.showNativeAd(adId, view, activity, object : AdStateListener.Native {
                        override fun onAdImpression() {}
                        override fun onAdClicked() {}
                        override fun onAdFailed(message: String) {
                            host.visibility = View.GONE
                        }
                    })
                    webBridge.resolve(callId, null)
                }

                override fun onFailure(message: String) {
                    host.visibility = View.GONE
                    webBridge.reject(callId, message)
                }
            })
        }
    }

    /** Keeps the overlay glued to its slot as the web layout moves. */
    @JavascriptInterface
    fun moveNative(x: Float, y: Float, w: Float, h: Float) {
        activity.runOnUiThread { nativeHost?.let { positionHost(it, x, y, w, h) } }
    }

    @JavascriptInterface
    fun hideNative() {
        activity.runOnUiThread {
            nativeHost?.visibility = View.GONE
            nativeAdId?.let { Tapsell.destroyNativeAd(it) }
            nativeAdId = null
        }
    }

    private fun positionHost(host: FrameLayout, x: Float, y: Float, w: Float, h: Float) {
        val lp = (host.layoutParams as? FrameLayout.LayoutParams)
            ?: FrameLayout.LayoutParams(0, 0)
        lp.width = (w * density).toInt()
        lp.height = (h * density).toInt()
        lp.gravity = Gravity.TOP or Gravity.START
        lp.leftMargin = (x * density).toInt()
        lp.topMargin = (y * density).toInt()
        host.layoutParams = lp
        host.requestLayout()
    }

    fun onDestroy() {
        nativeAdId?.let { Tapsell.destroyNativeAd(it) }
        bannerAdId?.let { Tapsell.destroyBannerAd(it) }
    }
}
