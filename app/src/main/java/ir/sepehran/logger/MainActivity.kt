package ir.sepehran.logger

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.nfc.tech.MifareClassic
import android.nfc.tech.MifareUltralight
import android.nfc.tech.NfcA
import android.nfc.tech.NfcB
import android.nfc.tech.NfcF
import android.nfc.tech.NfcV
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File

/**
 * Single-activity WebView host for the Sepehran Logger prototype UI.
 *
 * Stage 1 (this build): the approved HTML UI runs from assets; NFC, camera, storage and
 * back navigation are real Android features exposed to it through [SepehranBridge].
 * Later stages replace screens with Compose one at a time — the bridge contract stays,
 * so each screen can migrate without touching the others.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var bridge: SepehranBridge

    private var nfcAdapter: NfcAdapter? = null
    private var lastTagId: String? = null
    private var lastTagAt = 0L

    /** Absolute file the camera intent is writing into, and the JS token waiting for it. */
    private var pendingPhotoFile: File? = null
    private var pendingPhotoToken: String? = null

    private val takePicture =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val file = pendingPhotoFile
            val token = pendingPhotoToken
            pendingPhotoFile = null
            pendingPhotoToken = null
            if (result.resultCode == Activity.RESULT_OK && file != null && file.length() > 0L) {
                val info = bridge.finalizePhoto(file)
                emitToJs("onPhotoCaptured", JSONObject().apply {
                    put("token", token)
                    put("path", info.path)
                    put("name", file.name)
                    put("bytes", info.bytes)
                    put("sha256", info.sha256)
                })
            } else {
                file?.delete()
                emitToJs("onPhotoCancelled", JSONObject().put("token", token))
            }
        }

    private val requestCamera =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) pendingPhotoToken?.let { launchCamera(it) }
            else emitToJs("onPhotoDenied", JSONObject().put("token", pendingPhotoToken))
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_SepehranLogger)
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true          // localStorage for drafts
            settings.databaseEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mediaPlaybackRequiresUserGesture = false
            settings.textZoom = 100                    // field UI must not reflow unpredictably
            setBackgroundColor(0xFFF2F2F3.toInt())
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        setContentView(webView)

        bridge = SepehranBridge(this, webView)
        webView.addJavascriptInterface(bridge, "SepehranAndroid")

        // https://appassets.androidplatform.net/ gives the assets a real https origin,
        // so localStorage and fetch behave the same as they will against the API later.
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView, request: WebResourceRequest
            ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView, request: WebResourceRequest
            ): Boolean {
                val url = request.url
                if (url.host == "appassets.androidplatform.net") return false
                startActivity(Intent(Intent.ACTION_VIEW, url))   // external links leave the app
                return true
            }
        }

        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")

        nfcAdapter = NfcAdapter.getDefaultAdapter(this)

        // Android back is handed to the UI first; it calls back to finish the activity.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript(
                    "window.SepehranNative && window.SepehranNative.onBackPressed ? " +
                        "String(window.SepehranNative.onBackPressed()) : 'false'"
                ) { handled ->
                    if (handled?.contains("true") != true) finish()
                }
            }
        })

        if (savedInstanceState == null) handleNfcIntent(intent)
    }

    // ── NFC ─────────────────────────────────────────────────────────────────

    override fun onResume() {
        super.onResume()
        val adapter = nfcAdapter ?: return
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        val pending = PendingIntent.getActivity(
            this, 0,
            Intent(this, javaClass).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), flags
        )
        val techLists = arrayOf(
            arrayOf(NfcA::class.java.name), arrayOf(NfcB::class.java.name),
            arrayOf(NfcF::class.java.name), arrayOf(NfcV::class.java.name),
            arrayOf(IsoDep::class.java.name), arrayOf(MifareClassic::class.java.name),
            arrayOf(MifareUltralight::class.java.name)
        )
        adapter.enableForegroundDispatch(
            this, pending,
            arrayOf(IntentFilter(NfcAdapter.ACTION_TECH_DISCOVERED)), techLists
        )
        emitToJs("onNfcAvailability", JSONObject().put("state", bridge.nfcState()))
    }

    override fun onPause() {
        super.onPause()
        nfcAdapter?.disableForegroundDispatch(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleNfcIntent(intent)
    }

    private fun handleNfcIntent(intent: Intent?) {
        val action = intent?.action ?: return
        if (action != NfcAdapter.ACTION_TECH_DISCOVERED &&
            action != NfcAdapter.ACTION_TAG_DISCOVERED &&
            action != NfcAdapter.ACTION_NDEF_DISCOVERED
        ) return

        val tag: Tag? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            intent.getParcelableExtra(NfcAdapter.EXTRA_TAG, Tag::class.java)
        else @Suppress("DEPRECATION") intent.getParcelableExtra(NfcAdapter.EXTRA_TAG)

        val uid = tag?.id?.joinToString("") { "%02X".format(it) } ?: return

        // Debounce repeated reads of the same tag while the phone rests on it.
        val now = System.currentTimeMillis()
        if (uid == lastTagId && now - lastTagAt < 2000) return
        lastTagId = uid
        lastTagAt = now

        bridge.tick()
        emitToJs("onNfcTag", JSONObject().apply {
            put("uid", uid)
            put("techList", tag.techList.joinToString(",") { it.substringAfterLast('.') })
        })
    }

    fun openNfcSettings() = startActivity(Intent(Settings.ACTION_NFC_SETTINGS))

    // ── Camera ──────────────────────────────────────────────────────────────

    fun capturePhoto(token: String) {
        pendingPhotoToken = token
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            requestCamera.launch(android.Manifest.permission.CAMERA)
            return
        }
        launchCamera(token)
    }

    private fun launchCamera(token: String) {
        val file = bridge.newPhotoFile(token)
        pendingPhotoFile = file
        val uri: Uri = FileProvider.getUriForFile(
            this, "${BuildConfig.APPLICATION_ID}.fileprovider", file
        )
        val intent = Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(android.provider.MediaStore.EXTRA_OUTPUT, uri)
            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        }
        if (intent.resolveActivity(packageManager) == null) {
            emitToJs("onPhotoDenied", JSONObject().put("token", token))
            return
        }
        takePicture.launch(intent)
    }

    // ── JS event channel ────────────────────────────────────────────────────

    /** Calls window.SepehranNative.<event>(payload) on the UI thread. */
    fun emitToJs(event: String, payload: JSONObject) = runOnUiThread {
        webView.evaluateJavascript(
            "window.SepehranNative && window.SepehranNative.$event && " +
                "window.SepehranNative.$event($payload);", null
        )
    }
}
