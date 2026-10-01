package com.qc.renpydocfinder

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import com.qc.renpydocfinder.databinding.ActivityMainBinding
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.util.concurrent.Executors

/**
 * 手机版外壳：整屏 WebView 直接加载电脑版的网页 UI（index.html + style.css + app.js + data）。
 *
 * Android 侧只做四件事：
 *  1. 把电脑版网页资源与文档数据从 assets/web 提供出来（构建时由 syncWebAssets 拷入）；
 *  2. 给 index.html 内联注入手机适配（mobile.css / mobile-boot.js / mobile.js）；
 *  3. 提供 window.renpyDocUpdate 外壳接口（更新检测 / 打开外链 / 同步提示）；
 *  4. 处理系统栏、返回键与外部链接。
 *
 * 系统栏：网页铺满整屏，状态栏/导航栏透明；顶栏上方留出一条"占位栏"（由 --shell-top 决定高度），
 * 那条显示的是网页自己的主题底色（浅 #FEF7FF / 深 #141218）。
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val io = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    private val assetsHandler by lazy { WebViewAssetLoader.AssetsPathHandler(this) }

    /** 最近一次的系统栏尺寸（left, top, right, bottom），页面加载完成后重放一次 */
    private var shellInsets: IntArray? = null

    /** /web/ 下的 index.html 由这里返回：内联注入手机端样式与脚本 */
    private val webHandler = object : WebViewAssetLoader.PathHandler {
        override fun handle(path: String): WebResourceResponse? {
            if (path.isEmpty() || path == "index.html") {
                val html = readAsset("web/index.html") ?: return null
                /* 直接把引导脚本、样式、适配脚本内联进 HTML：
                   不依赖任何外部资源是否加载成功，确保手机适配一定生效 */
                val boot = readAsset("mobile-boot.js") ?: ""
                val css = readAsset("mobile.css") ?: ""
                val mobile = readAsset("mobile.js") ?: ""
                val injected = html
                    .replaceFirst(
                        "<head>",
                        "<head>\n<script>" + boot + "</script>\n<style>" + css + "</style>"
                    )
                    .replaceFirst("</body>", "<script>" + mobile + "</script>\n</body>")
                return WebResourceResponse(
                    "text/html", "utf-8",
                    ByteArrayInputStream(injected.toByteArray(Charsets.UTF_8))
                )
            }
            /* 其余资源都在 assets/web/ 下 */
            return assetsHandler.handle("web/" + path)
        }
    }

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", assetsHandler)
            .addPathHandler("/web/", webHandler)
            .build()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        installCrashHandler()
        checkCrashLog()

        applySystemBarInsets()
        binding.webView.setBackgroundColor(surfaceColor())
        setupWebView()
        binding.webView.loadUrl(HOME_URL)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                binding.webView.evaluateJavascript(BACK_JS) { result ->
                    if (result != "\"true\"") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        })
    }

    override fun onDestroy() {
        io.shutdown()
        binding.webView.destroy()
        super.onDestroy()
    }

    /* ---------------- 系统栏 ---------------- */

    /**
     * 真·边到边：系统栏透明，网页铺满整屏；系统栏尺寸通过 CSS 变量传给网页，
     * 由网页在 .app 上留出内边距 —— 这就是顶栏上方那条"占位栏"，
     * 它显示的是网页自己的主题底色（浅 #FEF7FF / 深 #141218）。
     */
    private fun applySystemBarInsets() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        @Suppress("DEPRECATION")
        run {
            window.statusBarColor = Color.TRANSPARENT
            window.navigationBarColor = Color.TRANSPARENT
        }
        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { _, insets ->
            /* 只取系统栏尺寸：不要把键盘(IME)高度算进 --shell-bottom，
               否则一聚焦搜索框，底部状态栏就会被顶上来 */
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            pushInsetsToPage(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setSystemBarIcons(dark = false)
    }

    /**
     * 把系统栏尺寸写进网页的 CSS 变量（--shell-top/bottom/left/right）。
     *
     * 注意：Android 的 insets 是**物理像素**，而网页里的 CSS px 是**独立像素**，
     * 必须先除以屏幕密度（DPR），否则留白会被放大 3 倍左右（之前顶部那片空白就是这么来的）。
     */
    private fun pushInsetsToPage(left: Int, top: Int, right: Int, bottom: Int) {
        shellInsets = intArrayOf(left, top, right, bottom)
        evaluate(
            "document.documentElement.style.setProperty('--shell-top','" + cssPx(top) + "');" +
                "document.documentElement.style.setProperty('--shell-bottom','" + cssPx(bottom) + "');" +
                "document.documentElement.style.setProperty('--shell-left','" + cssPx(left) + "');" +
                "document.documentElement.style.setProperty('--shell-right','" + cssPx(right) + "');"
        )
    }

    /** 物理像素 → CSS px（网页里的 px 是独立像素，要按屏幕密度换算） */
    private fun cssPx(physical: Int): String {
        val density = resources.displayMetrics.density
        val value = if (density > 0f) physical / density else physical.toFloat()
        return String.format(java.util.Locale.US, "%.2fpx", value)
    }

    private fun evaluate(js: String) {
        try {
            binding.webView.evaluateJavascript(js, null)
        } catch (e: Exception) { /* 页面未就绪时忽略 */ }
    }

    /** 状态栏/导航栏图标颜色跟随网页主题（浅色页面用深色图标） */
    private fun setSystemBarIcons(dark: Boolean) {
        try {
            WindowInsetsControllerCompat(window, binding.root).apply {
                isAppearanceLightStatusBars = !dark
                isAppearanceLightNavigationBars = !dark
            }
        } catch (e: Exception) { /* ignore */ }
    }

    /* ---------------- WebView ---------------- */

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val s = binding.webView.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.allowFileAccess = false
        s.allowContentAccess = false
        s.useWideViewPort = true
        s.loadWithOverviewMode = false
        s.builtInZoomControls = true
        s.displayZoomControls = false

        binding.webView.addJavascriptInterface(Bridge(), "Android")
        binding.webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (url.startsWith("https://appassets.androidplatform.net/")) return false
                if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("mailto:")) {
                    openExternal(url)
                    return true
                }
                return false
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                binding.webProgress.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                binding.webProgress.visibility = View.GONE
                shellInsets?.let { pushInsetsToPage(it[0], it[1], it[2], it[3]) }
            }
        }
    }

    /** 电脑版 app.js 通过 window.renpyDocUpdate 调用外壳（Electron / pywebview 那套） */
    inner class Bridge {
        @JavascriptInterface
        fun openExternal(url: String?) {
            val value = url ?: return
            mainHandler.post { openExternal(value) }
        }

        @JavascriptInterface
        fun shellTheme(dark: Boolean) {
            mainHandler.post { setSystemBarIcons(dark) }
        }

        @JavascriptInterface
        fun updateCheck(token: String?) {
            val t = token ?: return
            io.execute {
                var ok = false
                var payload = "网络不可用"
                try {
                    val r = UpdateChecker.check()
                    if (r.ok) {
                        payload = JSONObject()
                            .put(
                                "zh",
                                JSONObject().put("date", r.zhDate).put("sha", r.zhSha)
                                    .put("url", UpdateChecker.ZH_REPO)
                            )
                            .put("en", JSONObject().put("version", r.enVersion))
                            .toString()
                        ok = true
                    } else if (r.error.isNotEmpty()) {
                        payload = r.error
                    }
                } catch (e: Exception) {
                    payload = e.message ?: "网络不可用"
                }
                finishBridge(t, ok, payload)
            }
        }

        @JavascriptInterface
        fun syncDocs(token: String?, payload: String?) {
            val t = token ?: return
            finishBridge(t, false, "手机版文档打包在安装包内，请重新运行打包脚本后重装")
        }
    }

    private fun finishBridge(token: String, ok: Boolean, payload: String) {
        val js = "window.__rpdBridgeResult && window.__rpdBridgeResult(" +
            JSONObject.quote(token) + "," + ok + "," + JSONObject.quote(payload) + ")"
        mainHandler.post { evaluate(js) }
    }

    /* ---------------- 工具 ---------------- */

    private fun readAsset(path: String): String? = try {
        assets.open(path).use { it.readBytes().toString(Charsets.UTF_8) }
    } catch (e: Exception) {
        null
    }

    private fun surfaceColor(): Int {
        val tv = TypedValue()
        return if (theme.resolveAttribute(android.R.attr.colorBackground, tv, true)) {
            if (tv.resourceId != 0) ContextCompat.getColor(this, tv.resourceId) else tv.data
        } else {
            Color.WHITE
        }
    }

    private fun openExternal(url: String) {
        if (url.isEmpty()) return
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (e: ActivityNotFoundException) { /* 没有浏览器时忽略 */ }
    }

    /* 崩溃日志：写到 filesDir，下次启动弹出来，免得只看到"闪退"没法定位 */
    private fun installCrashHandler() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                java.io.File(filesDir, CRASH_LOG).appendText(
                    "\n[" + java.util.Date().toString() + "]\n" + throwable.stackTraceToString() + "\n"
                )
            } catch (e: Exception) { /* ignore */ }
            previous?.uncaughtException(thread, throwable)
        }
    }

    private fun checkCrashLog() {
        val file = java.io.File(filesDir, CRASH_LOG)
        if (!file.exists()) return
        val text = try { file.readText() } catch (e: Exception) { "" }
        try { file.delete() } catch (e: Exception) { /* ignore */ }
        if (text.isBlank()) return
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle("上次运行发生错误（已记录）")
            .setMessage(text.takeLast(1800))
            .setPositiveButton("知道了", null)
            .show()
    }

    companion object {
        private const val CRASH_LOG = "crash.log"
        private const val HOME_URL = "https://appassets.androidplatform.net/web/index.html"

        /** 返回键：先关侧边栏，再交给网页的 Esc（电脑版的返回逻辑） */
        private const val BACK_JS = "(function(){" +
            "var sb=document.querySelector('.sidebar');" +
            "if(sb&&sb.classList.contains('open')){sb.classList.remove('open');" +
            "var sc=document.getElementById('scrim');if(sc){sc.classList.remove('show');sc.hidden=true;}return 'true';}" +
            "var page=document.getElementById('viewPage');" +
            "if(page&&!page.hidden){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return 'true';}" +
            "var res=document.getElementById('viewResults');" +
            "if(res&&!res.hidden){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return 'true';}" +
            "return 'false';})()"
    }
}
