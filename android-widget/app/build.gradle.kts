import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Config lives in android-widget/local.properties (gitignored): the public Supabase URL + anon
// key (same values the PWA bundle ships) and the PWA URL. Missing values become empty strings
// and the widgets show a "not configured" state instead of failing the build. No user secret is
// baked in: the app signs in with the owner's Supabase account at runtime.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

fun prop(name: String, default: String = ""): String =
    (localProps.getProperty(name) ?: default).trim()

fun quoted(value: String): String =
    "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "dev.portfolio.widget"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.portfolio.widget"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "SUPABASE_URL", quoted(prop("SUPABASE_URL").trimEnd('/')))
        buildConfigField("String", "SUPABASE_ANON_KEY", quoted(prop("SUPABASE_ANON_KEY")))
        buildConfigField(
            "String", "PWA_URL",
            quoted(prop("PWA_URL", "https://portfolio-tracker-theta-seven.vercel.app")),
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Personal sideload build: sign with the debug key so `assembleRelease` installs too.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.glance:glance-appwidget:1.1.1")
    implementation("androidx.work:work-runtime-ktx:2.10.3")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

    testImplementation("junit:junit:4.13.2")
}
