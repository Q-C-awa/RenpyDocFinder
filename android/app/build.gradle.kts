plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

/* ---------------------------------------------------------------
 * 品牌图标：直接用电脑版自己的 assets/ico/window-icon.png
 * （和电脑版顶栏 logo、窗口图标是同一张图）
 * 构建时复制到生成资源目录，避免在仓库里重复存一份二进制文件。
 * --------------------------------------------------------------- */
val brandIconSource = rootProject.file("../assets/ico/window-icon.png")
val brandResDir = layout.buildDirectory.dir("generated/brand-res")

val syncBrandIcon = tasks.register<Copy>("syncBrandIcon") {
    description = "把电脑版的 assets/ico/window-icon.png 复制为 Android 图标资源"
    from(brandIconSource)
    into(brandResDir.map { it.dir("mipmap-nodpi") })
    rename { "launcher_source.png" }
}

/* ---------------------------------------------------------------
 * 手机版直接跑电脑版的网页 UI：构建时把 index.html / assets / data
 * 复制进 APK 的 assets/web，Android 侧只做一层外壳。
 * --------------------------------------------------------------- */
val webAssetsDir = layout.buildDirectory.dir("generated/web-assets")

val syncWebAssets = tasks.register<Copy>("syncWebAssets") {
    description = "把电脑版网页 UI 与文档数据复制进 Android assets/web"
    from(rootProject.file("../index.html")) { into("web") }
    from(rootProject.file("../assets")) {
        into("web/assets")
        include("style.css", "app.js")
    }
    from(rootProject.file("../assets/ico")) { into("web/assets/ico") }
    from(rootProject.file("../assets/docimg")) { into("web/assets/docimg") }
    from(rootProject.file("../data")) {
        into("web/data")
        include("*.js")
    }
    into(webAssetsDir)
}

android {
    namespace = "com.qc.renpydocfinder"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.qc.renpydocfinder"
        minSdk = 30
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    buildFeatures {
        viewBinding = true
    }

    sourceSets.getByName("main") {
        res.srcDir(brandResDir.get().asFile)
        assets.srcDir(webAssetsDir.get().asFile)
    }
}

/* 资源合并前必须先拷好图标（preBuild 之外再兜一层，避免个别构建路径漏掉） */
tasks.named("preBuild") { dependsOn(syncBrandIcon, syncWebAssets) }
tasks.matching {
    it.name.startsWith("merge") && (it.name.endsWith("Resources") || it.name.endsWith("Assets"))
}.configureEach { dependsOn(syncBrandIcon, syncWebAssets) }

configurations.all {
    resolutionStrategy {
        // Android Studio 模板带的 androidx.core 版本较高（1.19+ 要求 compileSdk 37 / AGP 9.1）。
        // 本工程是 compileSdk 36 + AGP 8.13.2，这里统一锁到兼容版本，
        // 并防止被 appcompat / material 等间接提升回去再次触发 AAR metadata 校验失败。
        force("androidx.core:core:1.13.1", "androidx.core:core-ktx:1.13.1")
    }
}

dependencies {

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)
    implementation(libs.androidx.recyclerview)
    implementation(libs.androidx.drawerlayout)
    implementation(libs.androidx.webkit)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}