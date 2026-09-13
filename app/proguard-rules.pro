# Keep the JavaScript bridge — its methods are called by name from WebView JS.
-keepclassmembers class ir.sepehran.logger.SepehranBridge {
    public *;
}
-keepattributes JavascriptInterface
