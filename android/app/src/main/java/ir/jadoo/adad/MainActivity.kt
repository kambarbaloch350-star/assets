package ir.jadoo.adad

import android.annotation.SuppressLint
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Hosts the game. The whole UI is the web build in `assets/www`, loaded through
 * WebViewAssetLoader so it runs on a real https:// origin (needed for
 * localStorage to persist reliably and for modern web APIs).
 *
 * Native responsibilities:
 *   - inject Tapsell/Bazaar config + the promise shim before the app boots
 *   - expose the ad and billing bridges
 *   - forward the hardware back button as an `android-back` DOM event and
 *     finish the activity when the web layer answers with `android-exit`
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var webBridge: WebBridge
    private lateinit var tapsell: TapsellBridge
    private lateinit var poolakey: PoolakeyBridge

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        // Swap the splash theme out for the real one before inflating.
        setTheme(R.style.Theme_JadooyeAdad)
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.setFlags(
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        )
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        configureWebView()

        webBridge = WebBridge(webView)
        tapsell = TapsellBridge(this, webBridge)
        poolakey = PoolakeyBridge(this, activityResultRegistry, webBridge)

        webView.addJavascriptInterface(tapsell, "__tapsell")
        webView.addJavascriptInterface(poolakey, "__poolakey")
        webView.addJavascriptInterface(HostBridge(), "__host")

        // Serve assets/www under https://appassets.androidplatform.net/
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this, "www"))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                // Keep in-app navigation inside the WebView; send anything else
                // (privacy policy, Bazaar page, …) to the system browser.
                val url = request.url
                if (url.host == "appassets.androidplatform.net") return false
                startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, url))
                return true
            }
        }

        webView.loadUrl("https://appassets.androidplatform.net/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Let the game decide: it closes dialogs / navigates back, and
                // fires `android-exit` only when it is sitting on the main menu.
                webBridge.emit("android-back")
            }
        })
    }

    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
            textZoom = 100 // never let system font scaling break the layout
        }
        webView.setBackgroundColor(0xFF1B1035.toInt())
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.overScrollMode = View.OVER_SCROLL_NEVER
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT && BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
    }

    /** Small surface for things that are neither ads nor billing. */
    inner class HostBridge {
        @android.webkit.JavascriptInterface
        fun exit() {
            runOnUiThread { finishAndRemoveTask() }
        }

        @android.webkit.JavascriptInterface
        fun config(): String =
            """
            {
              "tapsell": {
                "appKey": "${BuildConfig.TAPSELL_APP_KEY}",
                "zones": {
                  "banner": "${BuildConfig.ZONE_BANNER}",
                  "interstitial": "${BuildConfig.ZONE_INTERSTITIAL}",
                  "native": "${BuildConfig.ZONE_NATIVE}",
                  "rewarded": "${BuildConfig.ZONE_REWARDED}"
                }
              },
              "bazaarRsaKey": "${BuildConfig.BAZAAR_RSA_KEY}"
            }
            """.trimIndent()

        @android.webkit.JavascriptInterface
        fun vibrate(ms: Int) {
            runOnUiThread {
                val v = getSystemService(VIBRATOR_SERVICE) as? android.os.Vibrator ?: return@runOnUiThread
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(android.os.VibrationEffect.createOneShot(ms.toLong(), 80))
                } else {
                    @Suppress("DEPRECATION")
                    v.vibrate(ms.toLong())
                }
            }
        }
    }

    override fun onDestroy() {
        tapsell.onDestroy()
        poolakey.disconnect()
        super.onDestroy()
    }
}
