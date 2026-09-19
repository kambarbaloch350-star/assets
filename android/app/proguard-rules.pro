# ---- CafeBazaar / Poolakey -------------------------------------------------
-keep class com.android.vending.billing.** { *; }
-keep class com.github.cafebazaar.poolakey.** { *; }

# ---- Tapsell Mediation -----------------------------------------------------
# The SDK ships its own consumer rules; these are belt-and-braces.
-keep class ir.tapsell.** { *; }
-dontwarn ir.tapsell.**

# ---- JS bridges ------------------------------------------------------------
# @JavascriptInterface methods are only called reflectively from JS.
-keepclassmembers class ir.jadoo.adad.** {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class ir.jadoo.adad.MainActivity$HostBridge { *; }
