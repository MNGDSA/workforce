import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

// Task #43 step 1 & 3: load operator-supplied secrets (release keystore
// credentials and TLS pin material) from gradle.properties or the
// process environment. Either source works so CI can inject via env
// without committing values to disk. Empty strings are tolerated and
// trigger a graceful skip in both consumers.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) load(f.inputStream())
}
fun resolveSecret(key: String): String =
    System.getenv(key)
        ?: (project.findProperty(key) as String?)
        ?: localProps.getProperty(key)
        ?: ""

val keystorePath = resolveSecret("WORKFORCE_KEYSTORE_FILE")
val keystorePassword = resolveSecret("WORKFORCE_KEYSTORE_PASSWORD")
val keyAlias = resolveSecret("WORKFORCE_KEY_ALIAS")
val keyPassword = resolveSecret("WORKFORCE_KEY_PASSWORD")
val certPinHost = resolveSecret("WORKFORCE_CERT_PIN_HOST")
    .ifEmpty { "workforce.tanaqolapp.com" }
val certPins = resolveSecret("WORKFORCE_CERT_PINS")

android {
    namespace = "com.luxurycarts.workforce"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.luxurycarts.workforce"
        minSdk = 26
        // Task #43 step 4: target Android 15. Edge-to-edge enforcement
        // was handled by Task #83 (systemBarsPadding on every screen).
        // Predictive back is opted in via the manifest application
        // attribute `android:enableOnBackInvokedCallback="true"`.
        // We don't use foreground services so the FGS-restrictions
        // changes do not apply.
        targetSdk = 35
        versionCode = 2
        versionName = "1.0.1"

        // Task #43 step 1: pin material is exposed at runtime via
        // BuildConfig so OkHttp's CertificatePinner can be configured
        // without bundling the values into resources or strings.
        buildConfigField("String", "CERT_PIN_HOST", "\"$certPinHost\"")
        buildConfigField("String", "CERT_PINS", "\"$certPins\"")
    }

    // Task #43 step 3: release signing config wired from environment /
    // gradle.properties. If WORKFORCE_KEYSTORE_FILE is not set, we
    // skip the signingConfig assignment entirely; gradle then falls
    // back to debug signing for unsigned local builds (CI that
    // produces a Play-track build MUST set the four env vars).
    val hasReleaseSigning = keystorePath.isNotEmpty() &&
        keystorePassword.isNotEmpty() &&
        keyAlias.isNotEmpty() &&
        keyPassword.isNotEmpty() &&
        file(keystorePath).exists()

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = keystorePassword
                this.keyAlias = keyAlias
                this.keyPassword = keyPassword
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = true
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            } else {
                logger.warn(
                    "WORKFORCE release build will be UNSIGNED — set WORKFORCE_KEYSTORE_FILE / " +
                        "WORKFORCE_KEYSTORE_PASSWORD / WORKFORCE_KEY_ALIAS / WORKFORCE_KEY_PASSWORD " +
                        "in gradle.properties or the CI environment to produce a Play-uploadable APK."
                )
            }
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.8.5")

    val cameraxVersion = "1.4.1"
    implementation("androidx.camera:camera-core:$cameraxVersion")
    implementation("androidx.camera:camera-camera2:$cameraxVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraxVersion")
    implementation("androidx.camera:camera-view:$cameraxVersion")

    implementation("com.google.android.gms:play-services-location:21.3.0")

    implementation("org.osmdroid:osmdroid-android:6.1.18")

    val roomVersion = "2.6.1"
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    ksp("androidx.room:room-compiler:$roomVersion")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Task #43 / Task #84: pinned to 1.1.0-alpha06 intentionally.
    //
    // We require `MasterKey.Builder` (introduced in 1.1.0-alpha) for
    // EncryptedSharedPreferences key construction in SessionManager — the
    // older 1.0.0 `MasterKeys.getOrCreate` API is deprecated and triggers
    // a lint warning. As of 2026-04 there is no 1.1.0 stable release;
    // alpha06 is the most recent, has been on Maven for >18 months without
    // API churn in the Master-Key surface, and is what every comparable
    // production app on the Play track ships.
    //
    // DO NOT bump to a newer alpha without re-running the encrypted-prefs
    // migration smoke test in `mobile-android/docs/keystore-rotation.md`.
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Task #84: encrypt the Room database at rest. SQLCipher's
    // `SupportFactory` plugs into Room's openHelperFactory; the passphrase
    // is wrapped by our AndroidKeyStore-backed `EncryptionService` (see
    // `data/DatabaseKeyManager.kt`).
    //
    // We pin the legacy `net.zetetic:android-database-sqlcipher` artifact
    // (package `net.sqlcipher.database.*`) rather than the renamed
    // `net.zetetic:sqlcipher-android` (package
    // `net.zetetic.database.sqlcipher.*`) because the former keeps
    // `SupportFactory(byte[])` source-compatible with hundreds of Room +
    // SQLCipher integration guides and our own migration code in
    // `DatabaseEncryptionMigration.kt`. Re-evaluate at the next major
    // SQLCipher release.
    implementation("net.zetetic:android-database-sqlcipher:4.5.4")
    implementation("androidx.sqlite:sqlite-ktx:2.4.0")

    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("io.coil-kt:coil-compose:2.7.0")

    debugImplementation("androidx.compose.ui:ui-tooling")

    // Task #84: pure-JVM unit tests for telemetry scrubbing
    // (`SyncTelemetry.scrubMessage`). Kept minimal — no Robolectric, no
    // instrumentation runner, so this dependency does not bloat the APK
    // or slow the CI release build.
    testImplementation("junit:junit:4.13.2")
}
