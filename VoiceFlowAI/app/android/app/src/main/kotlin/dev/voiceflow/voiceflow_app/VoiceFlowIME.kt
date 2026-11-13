package dev.voiceflow.voiceflow_app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.inputmethodservice.InputMethodService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.widget.Button
import io.flutter.plugin.common.MethodChannel

/** Spike S3: keyboard that formats text by calling Dart in a headless engine. */
class VoiceFlowIME : InputMethodService() {
    private val main = Handler(Looper.getMainLooper())

    // Test seam (spike only): adb broadcasts text; we format it via Dart and commit it.
    private val seam = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            format(i.getStringExtra("text") ?: "", 0)
        }
    }

    override fun onCreate() {
        super.onCreate()
        ImeEngine.get(this) // cold start begins here
        val f = IntentFilter("dev.voiceflow.S3_FORMAT")
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(seam, f, Context.RECEIVER_EXPORTED)
        } else {
            registerReceiver(seam, f)
        }
    }

    override fun onCreateInputView(): View =
        Button(this).apply {
            text = "VoiceFlow (S3 spike)"
            setOnClickListener { format("um this is a test", 0) }
        }

    private fun format(text: String, attempt: Int) {
        val ch = ImeEngine.get(this)
        ch.invokeMethod("format", mapOf("text" to text, "profile" to "business"),
            object : MethodChannel.Result {
                override fun success(r: Any?) {
                    val out = r as? String ?: ""
                    val ic = currentInputConnection
                    if (ic == null) { Log.e("S3", "no_input_connection"); return }
                    ic.commitText(out, 1)
                    val readBack = ic.getTextBeforeCursor(500, 0)
                    Log.i("S3", "first_call_ms=${SystemClock.elapsedRealtime() - ImeEngine.startedAtMs}")
                    Log.i("S3", "committed='$readBack'")
                }
                override fun error(code: String, msg: String?, d: Any?) {
                    Log.e("S3", "error $code $msg")
                }
                override fun notImplemented() {
                    // Dart handler not registered yet: retry for up to ~6 s.
                    if (attempt < 120) main.postDelayed({ format(text, attempt + 1) }, 50)
                    else Log.e("S3", "dart_never_ready")
                }
            })
    }

    override fun onDestroy() {
        unregisterReceiver(seam)
        ImeEngine.destroy()
        super.onDestroy()
    }
}
