package ir.jadoo.adad

import android.webkit.WebView
import org.json.JSONObject

/**
 * Tiny RPC plumbing between Kotlin and the WebView.
 *
 * The JS side generates a `callId`, stores a pending promise under it, and
 * calls a `@JavascriptInterface` method. Kotlin answers asynchronously with
 * [resolve] / [reject], which settles that promise. [emit] fires a plain
 * DOM CustomEvent on `window` (used for android-back, android-exit, …).
 */
class WebBridge(private val webView: WebView) {

    private fun eval(js: String) {
        webView.post { webView.evaluateJavascript(js, null) }
    }

    /** JSON-encode a value so it can be embedded safely in a JS string literal. */
    private fun enc(value: String?): String =
        if (value == null) "null" else JSONObject.quote(value)

    fun resolve(callId: String, value: String?) {
        eval("window.__bridgeSettle && window.__bridgeSettle(${enc(callId)}, true, ${enc(value)});")
    }

    fun reject(callId: String, message: String) {
        eval("window.__bridgeSettle && window.__bridgeSettle(${enc(callId)}, false, ${enc(message)});")
    }

    /** Dispatch a CustomEvent on window, e.g. emit("android-back", null). */
    fun emit(event: String, detail: JSONObject? = null) {
        val d = detail?.toString() ?: "null"
        eval("window.dispatchEvent(new CustomEvent(${enc(event)}, { detail: $d }));")
    }
}
