package ir.sepehran.logger

import android.app.Application
import android.webkit.WebView

class SepehranApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            // Lets you inspect the prototype UI from chrome://inspect on a debug build.
            WebView.setWebContentsDebuggingEnabled(true)
        }
    }
}
