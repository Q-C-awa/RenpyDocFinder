# Add project specific ProGuard rules here.
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# WebView 的 JS 桥接方法必须保留，否则 release 包复制/跳转会失效
-keepclassmembers class com.qc.renpydocfinder.MainActivity$JsBridge {
    public *;
}
-keepattributes JavascriptInterface
