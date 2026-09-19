package ir.jadoo.adad

import android.webkit.JavascriptInterface
import androidx.activity.result.ActivityResultRegistry
import androidx.appcompat.app.AppCompatActivity
import com.github.cafebazaar.poolakey.Connection
import com.github.cafebazaar.poolakey.ConnectionState
import com.github.cafebazaar.poolakey.Payment
import com.github.cafebazaar.poolakey.config.PaymentConfiguration
import com.github.cafebazaar.poolakey.config.SecurityCheck
import com.github.cafebazaar.poolakey.request.PurchaseRequest
import org.json.JSONArray
import org.json.JSONObject

/**
 * Native half of `src/platform/poolakey.ts` — CafeBazaar in-app billing.
 *
 * Exposed to JS as `window.__poolakey`; `bridge.js` promisifies it into
 * `window.PoolakeyBridge`.
 *
 * Consumption policy mirrors the store:
 *   - coin packs  (coins_50 … coins_2500) are CONSUMABLE  → consumed after the
 *     coins are credited, so the player can buy them again.
 *   - remove_ads is NON-CONSUMABLE → never consumed, and restored on startup
 *     via getPurchasedProducts().
 */
class PoolakeyBridge(
    private val activity: AppCompatActivity,
    private val registry: ActivityResultRegistry,
    private val webBridge: WebBridge,
) {

    private var payment: Payment? = null
    private var connection: Connection? = null

    // --------------------------------------------------------------- connect

    @JavascriptInterface
    fun connect(callId: String, rsaPublicKey: String) {
        activity.runOnUiThread {
            val securityCheck = if (rsaPublicKey.isBlank() || rsaPublicKey.startsWith("PUT_")) {
                // Local/side-loaded testing only. Ship with a real key.
                SecurityCheck.Disable
            } else {
                SecurityCheck.Enable(rsaPublicKey = rsaPublicKey)
            }

            val p = Payment(context = activity, config = PaymentConfiguration(localSecurityCheck = securityCheck))
            payment = p
            connection = p.connect {
                connectionSucceed { webBridge.resolve(callId, "true") }
                connectionFailed { webBridge.resolve(callId, "false") }
                disconnected { /* Bazaar app closed or updated */ }
            }
        }
    }

    @JavascriptInterface
    fun disconnect() {
        activity.runOnUiThread {
            if (connection?.getState() == ConnectionState.Connected) connection?.disconnect()
        }
    }

    // -------------------------------------------------------------- purchase

    @JavascriptInterface
    fun purchase(callId: String, productId: String, payload: String) {
        activity.runOnUiThread {
            val p = payment
            if (p == null) {
                webBridge.resolve(callId, JSONObject().put("status", "failed").put("message", "not-connected").toString())
                return@runOnUiThread
            }

            p.purchaseProduct(
                registry = registry,
                request = PurchaseRequest(productId = productId, payload = payload),
            ) {
                purchaseFlowBegan { /* Bazaar sheet is opening */ }

                failedToBeginFlow { throwable ->
                    webBridge.resolve(
                        callId,
                        JSONObject().put("status", "failed")
                            .put("message", throwable.message ?: "flow-error").toString(),
                    )
                }

                purchaseSucceed { entity ->
                    webBridge.resolve(
                        callId,
                        JSONObject()
                            .put("status", "success")
                            .put(
                                "purchase",
                                JSONObject()
                                    .put("orderId", entity.orderId)
                                    .put("productId", entity.productId)
                                    .put("purchaseToken", entity.purchaseToken)
                                    .put("payload", entity.payload)
                                    .put("purchaseTime", entity.purchaseTime),
                            )
                            .toString(),
                    )
                }

                purchaseCanceled {
                    webBridge.resolve(callId, JSONObject().put("status", "canceled").toString())
                }

                purchaseFailed { throwable ->
                    webBridge.resolve(
                        callId,
                        JSONObject().put("status", "failed")
                            .put("message", throwable.message ?: "purchase-failed").toString(),
                    )
                }
            }
        }
    }

    // --------------------------------------------------------------- consume

    @JavascriptInterface
    fun consume(callId: String, purchaseToken: String) {
        activity.runOnUiThread {
            val p = payment
            if (p == null) {
                webBridge.resolve(callId, "false")
                return@runOnUiThread
            }
            p.consumeProduct(purchaseToken) {
                consumeSucceed { webBridge.resolve(callId, "true") }
                consumeFailed { webBridge.resolve(callId, "false") }
            }
        }
    }

    // ------------------------------------------------------------- inventory

    /** Used on startup to restore the non-consumable Remove Ads entitlement. */
    @JavascriptInterface
    fun getPurchasedProducts(callId: String) {
        activity.runOnUiThread {
            val p = payment
            if (p == null) {
                webBridge.resolve(callId, "[]")
                return@runOnUiThread
            }
            p.getPurchasedProducts {
                querySucceed { entities ->
                    val arr = JSONArray()
                    entities.forEach { e ->
                        arr.put(
                            JSONObject()
                                .put("orderId", e.orderId)
                                .put("productId", e.productId)
                                .put("purchaseToken", e.purchaseToken)
                                .put("payload", e.payload)
                                .put("purchaseTime", e.purchaseTime),
                        )
                    }
                    webBridge.resolve(callId, arr.toString())
                }
                queryFailed { webBridge.resolve(callId, "[]") }
            }
        }
    }

    /** Localized Bazaar prices, so the store can show the market's own strings. */
    @JavascriptInterface
    fun getSkuDetails(callId: String, skusJson: String) {
        activity.runOnUiThread {
            val p = payment
            if (p == null) {
                webBridge.resolve(callId, "[]")
                return@runOnUiThread
            }
            val ids = mutableListOf<String>()
            val incoming = JSONArray(skusJson)
            for (i in 0 until incoming.length()) ids.add(incoming.getString(i))

            p.getInAppSkuDetails(skuIds = ids) {
                getSkuDetailsSucceed { details ->
                    val arr = JSONArray()
                    details.forEach { d ->
                        arr.put(
                            JSONObject()
                                .put("sku", d.sku)
                                .put("title", d.title)
                                .put("description", d.description)
                                .put("price", d.price),
                        )
                    }
                    webBridge.resolve(callId, arr.toString())
                }
                getSkuDetailsFailed { webBridge.resolve(callId, "[]") }
            }
        }
    }
}
