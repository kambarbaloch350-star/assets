plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ir.jadoo.adad"
    compileSdk = 34

    defaultConfig {
        applicationId = "ir.jadoo.adad"
        minSdk = 21
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        // ---------------------------------------------------------------
        // Fill these in from your Tapsell + CafeBazaar dashboards.
        // They are injected into the WebView as window.TAPSELL_CONFIG and
        // window.BAZAAR_RSA_KEY, so the web layer never hardcodes secrets.
        // ---------------------------------------------------------------
        buildConfigField("String", "TAPSELL_APP_KEY", "\"${properties["tapsell.appKey"] ?: "PUT_TAPSELL_APP_KEY_HERE"}\"")

        // The Mediation SDK self-initialises from this manifest placeholder.
        addManifestPlaceholders(
            mapOf("TapsellMediationAppKey" to (properties["tapsell.appKey"] ?: "PUT_TAPSELL_APP_KEY_HERE"))
        )
        buildConfigField("String", "ZONE_BANNER", "\"${properties["tapsell.zone.banner"] ?: "PUT_BANNER_ZONE_ID"}\"")
        buildConfigField("String", "ZONE_INTERSTITIAL", "\"${properties["tapsell.zone.interstitial"] ?: "PUT_INTERSTITIAL_ZONE_ID"}\"")
        buildConfigField("String", "ZONE_NATIVE", "\"${properties["tapsell.zone.native"] ?: "PUT_NATIVE_ZONE_ID"}\"")
        buildConfigField("String", "ZONE_REWARDED", "\"${properties["tapsell.zone.rewarded"] ?: "PUT_REWARDED_ZONE_ID"}\"")
        buildConfigField("String", "BAZAAR_RSA_KEY", "\"${properties["bazaar.rsaKey"] ?: "PUT_BAZAAR_RSA_PUBLIC_KEY_HERE"}\"")
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        // Tapsell requires Java 8+ desugaring
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources.excludes += setOf("META-INF/*.kotlin_module")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // ---- Tapsell Mediation (banner / interstitial / native / rewarded) ---
    // Tapsell Plus is deprecated; this is the current SDK.
    implementation("ir.tapsell:tapsell:1.3.0")
    implementation("ir.tapsell.mediation.adapter:legacy:1.3.0")
    // Add more adapters (admob, applovin, unity, …) from the Tapsell docs to
    // widen fill; the SDK serves no ads without at least one adapter.

    // ---- Poolakey: CafeBazaar in-app billing -----------------------------
    implementation("com.github.cafebazaar.Poolakey:poolakey:2.2.0")
}
