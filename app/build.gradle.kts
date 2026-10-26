plugins {
    id("com.android.application")
}

android {
    namespace = "io.github.hikeandmap.messengercleaner"
    compileSdk = 37
    defaultConfig {
        applicationId = "io.github.hikeandmap.messengercleaner"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "0.2.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// Copy the debug APK to MessengerCleaner/release/MessengerCleaner.apk after every build.
val renameApk = tasks.register<Copy>("renameApk") {
    from(layout.buildDirectory.file("outputs/apk/debug/app-debug.apk"))
    into(rootProject.layout.projectDirectory.dir("release"))
    rename { "MessengerCleaner.apk" }
}
tasks.matching { it.name == "assembleDebug" }.configureEach { finalizedBy(renameApk) }

dependencies {
    implementation("androidx.activity:activity:1.9.3")
}
