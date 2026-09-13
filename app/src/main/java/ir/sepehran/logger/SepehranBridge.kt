package ir.sepehran.logger

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.nfc.NfcAdapter
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * The whole native surface the UI is allowed to touch, reachable from JS as
 * `window.SepehranAndroid`. Every method is small and side-effect-explicit so that when a
 * screen migrates to Compose, the Kotlin call it replaces is obvious.
 *
 * Records are written as one JSON file per collection round in
 * filesDir/records/, photos in filesDir/photos/ — the on-device staging area that
 * Room + WorkManager take over in the native phases.
 */
class SepehranBridge(
    private val activity: MainActivity,
    private val webView: WebView
) {
    private val recordsDir = File(activity.filesDir, "records").apply { mkdirs() }
    private val photosDir = File(activity.filesDir, "photos").apply { mkdirs() }
    private val prefs = activity.getSharedPreferences("sepehran", Context.MODE_PRIVATE)

    data class PhotoInfo(val path: String, val bytes: Long, val sha256: String)

    // ── Device / app info ───────────────────────────────────────────────────

    @JavascriptInterface
    fun deviceInfo(): String = JSONObject().apply {
        put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
        put("androidVersion", Build.VERSION.RELEASE)
        put("sdkInt", Build.VERSION.SDK_INT)
        put("appVersion", BuildConfig.VERSION_NAME)
        put("packageName", BuildConfig.APPLICATION_ID)
        put("debug", BuildConfig.DEBUG)
        put("locale", Locale.getDefault().toLanguageTag())
    }.toString()

    @JavascriptInterface
    fun now(): String {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US)
        return JSONObject().apply {
            put("epochMillis", System.currentTimeMillis())
            put("iso", f.format(Date()))
            put("time", SimpleDateFormat("HH:mm:ss", Locale.US).format(Date()))
            put("date", SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()))
        }.toString()
    }

    // ── NFC ─────────────────────────────────────────────────────────────────

    /** ABSENT — no hardware · DISABLED — off in settings · READY */
    @JavascriptInterface
    fun nfcState(): String {
        val adapter = NfcAdapter.getDefaultAdapter(activity) ?: return "ABSENT"
        return if (adapter.isEnabled) "READY" else "DISABLED"
    }

    @JavascriptInterface
    fun openNfcSettings() = activity.openNfcSettings()

    // ── Camera ──────────────────────────────────────────────────────────────

    /**
     * Starts a capture. The result arrives asynchronously as
     * window.SepehranNative.onPhotoCaptured / onPhotoCancelled / onPhotoDenied,
     * carrying back the same [token] (use the parameter code).
     */
    @JavascriptInterface
    fun capturePhoto(token: String) = activity.capturePhoto(token)

    @JavascriptInterface
    fun deletePhoto(path: String): Boolean {
        val f = File(path)
        return f.parentFile?.absolutePath == photosDir.absolutePath && f.delete()
    }

    fun newPhotoFile(token: String): File {
        val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        return File(photosDir, "IMG_${token.replace(Regex("[^A-Za-z0-9]"), "")}_$stamp.jpg")
    }

    /** Downscale + recompress in place; industrial gauges need legibility, not megapixels. */
    fun finalizePhoto(file: File): PhotoInfo {
        try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.absolutePath, bounds)
            val longest = maxOf(bounds.outWidth, bounds.outHeight)
            val target = 1280
            val opts = BitmapFactory.Options().apply {
                inSampleSize = if (longest > target) Integer.highestOneBit(longest / target) else 1
            }
            val bmp: Bitmap? = BitmapFactory.decodeFile(file.absolutePath, opts)
            if (bmp != null) {
                FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.JPEG, 80, it) }
                bmp.recycle()
            }
        } catch (_: Throwable) {
            // Keep the original capture rather than losing the operator's photo.
        }
        return PhotoInfo(file.absolutePath, file.length(), sha256(file))
    }

    private fun sha256(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(8192)
            while (true) {
                val read = input.read(buf)
                if (read <= 0) break
                md.update(buf, 0, read)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    // ── Local persistence (staging for Room) ────────────────────────────────

    /**
     * Persists one submitted round. The UI passes its own payload; the bridge attaches the
     * metadata the operator must never type, and returns the stored record.
     */
    @JavascriptInterface
    fun saveRecord(payload: String): String {
        val record = JSONObject(payload)
        val id = record.optString("id").ifBlank { UUID.randomUUID().toString() }
        record.put("id", id)
        record.put("createdAt", System.currentTimeMillis())
        record.put("deviceTime", System.currentTimeMillis())
        record.put("device", JSONObject(deviceInfo()))
        record.put("appVersion", BuildConfig.VERSION_NAME)
        record.put("syncState", "PENDING")
        File(recordsDir, "$id.json").writeText(record.toString())
        audit("READING_SUBMITTED", id)
        return record.toString()
    }

    @JavascriptInterface
    fun saveDraft(payload: String) {
        prefs.edit().putString("draft", payload).apply()
    }

    @JavascriptInterface
    fun loadDraft(): String = prefs.getString("draft", "") ?: ""

    @JavascriptInterface
    fun clearDraft() {
        prefs.edit().remove("draft").apply()
    }

    /** Everything still waiting for the sync engine — drives the "n pending" indicator. */
    @JavascriptInterface
    fun pendingRecords(): String {
        val arr = JSONArray()
        recordsDir.listFiles { f -> f.extension == "json" }
            ?.sortedBy { it.lastModified() }
            ?.forEach { f ->
                runCatching { JSONObject(f.readText()) }.getOrNull()?.let { rec ->
                    if (rec.optString("syncState") != "SYNCED") {
                        arr.put(JSONObject().apply {
                            put("id", rec.optString("id"))
                            put("tag", rec.optString("equipmentTag"))
                            put("submittedAt", rec.optLong("createdAt"))
                            put("syncState", rec.optString("syncState"))
                        })
                    }
                }
            }
        return arr.toString()
    }

    @JavascriptInterface
    fun readRecord(id: String): String {
        val f = File(recordsDir, "$id.json")
        return if (f.exists()) f.readText() else ""
    }

    @JavascriptInterface
    fun audit(actionCode: String, entityId: String) {
        val line = JSONObject().apply {
            put("at", System.currentTimeMillis())
            put("action", actionCode)
            put("entityId", entityId)
            put("user", prefs.getString("personnelCode", "") ?: "")
        }
        File(activity.filesDir, "audit.log").appendText(line.toString() + "\n")
    }

    @JavascriptInterface
    fun setSessionUser(personnelCode: String, fullName: String, shift: String) {
        prefs.edit()
            .putString("personnelCode", personnelCode)
            .putString("fullName", fullName)
            .putString("shift", shift)
            .apply()
        audit("LOGIN", personnelCode)
    }

    @JavascriptInterface
    fun setTheme(theme: String) {
        prefs.edit().putString("theme", theme).apply()
    }

    @JavascriptInterface
    fun theme(): String = prefs.getString("theme", "light") ?: "light"

    // ── Small UI affordances ────────────────────────────────────────────────

    @JavascriptInterface
    fun toast(message: String) = activity.runOnUiThread {
        Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()
    }

    /** Short confirmation buzz — the operator is often wearing gloves and not looking. */
    @JavascriptInterface
    fun tick() {
        val effect = VibrationEffect.createOneShot(35, VibrationEffect.DEFAULT_AMPLITUDE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val mgr = activity.getSystemService(VibratorManager::class.java)
            mgr?.defaultVibrator?.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            (activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)?.vibrate(effect)
        }
    }

    @JavascriptInterface
    fun exitApp() = activity.runOnUiThread { activity.finish() }
}
