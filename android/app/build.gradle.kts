plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/**
 * Resolve a credential from a gradle property, falling back to an environment
 * variable, then to a harmless placeholder so the project always builds.
 */
fun cred(property: String, env: String, fallback: String): String =
    (project.findProperty(property) as String?)?.takeIf { it.isNotBlank() }
        ?: System.getenv(env)?.takeIf { it.isNotBlank() }
        ?: fallback

android {
    namespace = "ir.jadoo.adad"
    // A transitive AndroidX dependency requires compileSdk 35. Raising
    // compileSdk only lets newer APIs be referenced at build time; it does not
    // change runtime behaviour — targetSdk stays at 34 for that.
    compileSdk = 35

    defaultConfig {
        applicationId = "ir.jadoo.adad"
        minSdk = 21
        targetSdk = 34
        // CI sets these from the run number / git tag.
        versionCode = (project.findProperty("versionCode") as String?)?.toIntOrNull() ?: 1
        versionName = (project.findProperty("versionName") as String?) ?: "1.0.0"

        // ---------------------------------------------------------------
        // Tapsell + CafeBazaar credentials.
        //
        // Resolved from (in order): a -P gradle property, ~/.gradle or
        // gradle.properties, then an environment variable. CI passes them as
        // env vars from repository secrets. Nothing secret is committed; the
        // placeholders below just let the project build without keys.
        // ---------------------------------------------------------------
        buildConfigField("String", "TAPSELL_APP_KEY", "\"${cred("tapsell.appKey", "TAPSELL_APP_KEY", "PUT_TAPSELL_APP_KEY_HERE")}\"")
        buildConfigField("String", "ZONE_BANNER", "\"${cred("tapsell.zone.banner", "TAPSELL_ZONE_BANNER", "PUT_BANNER_ZONE_ID")}\"")
        buildConfigField("String", "ZONE_INTERSTITIAL", "\"${cred("tapsell.zone.interstitial", "TAPSELL_ZONE_INTERSTITIAL", "PUT_INTERSTITIAL_ZONE_ID")}\"")
        buildConfigField("String", "ZONE_NATIVE", "\"${cred("tapsell.zone.native", "TAPSELL_ZONE_NATIVE", "PUT_NATIVE_ZONE_ID")}\"")
        buildConfigField("String", "ZONE_REWARDED", "\"${cred("tapsell.zone.rewarded", "TAPSELL_ZONE_REWARDED", "PUT_REWARDED_ZONE_ID")}\"")
        buildConfigField("String", "BAZAAR_RSA_KEY", "\"${cred("bazaar.rsaKey", "BAZAAR_RSA_KEY", "PUT_BAZAAR_RSA_PUBLIC_KEY_HERE")}\"")

        // The Mediation SDK self-initialises from this manifest placeholder.
        addManifestPlaceholders(
            mapOf("TapsellMediationAppKey" to cred("tapsell.appKey", "TAPSELL_APP_KEY", "PUT_TAPSELL_APP_KEY_HERE"))
        )
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    signingConfigs {
        create("release") {
            // CI decodes ANDROID_KEYSTORE_BASE64 to app/release.keystore.
            val ksFile = rootProject.file("app/release.keystore")
            if (ksFile.exists()) {
                storeFile = ksFile
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")

            // Sign with the upload key when present; otherwise fall back to the
            // debug key so CI still emits an installable APK for testing.
            signingConfig = if (rootProject.file("app/release.keystore").exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
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
