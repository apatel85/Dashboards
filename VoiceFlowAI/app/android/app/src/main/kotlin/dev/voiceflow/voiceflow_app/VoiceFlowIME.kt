package dev.voiceflow.voiceflow_app

import android.inputmethodservice.InputMethodService
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.InputType
import android.util.Log
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import io.flutter.plugin.common.MethodChannel

/**
 * VoiceFlow keyboard. Kotlin owns UI, microphone and the InputConnection; the shared Dart
 * brain (speech model, formatting, per-app profile memory) runs in a headless FlutterEngine.
 */
class VoiceFlowIME : InputMethodService() {
    private val main = Handler(Looper.getMainLooper())
    private var hooks: ImeHooks? = null
    private var editor: EditorInfo? = null

    override fun onCreate() {
        super.onCreate()
        ImeEngine.get(this) // cold start begins here
        ping()
        hooks = ImeHooksFactory.create(this)
    }

    override fun onCreateInputView(): View =
        Button(this).apply { text = "VoiceFlow" }

    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        editor = info
    }

    /** Maps the focused field's type to how dictated text must be formatted. */
    fun fieldKind(info: EditorInfo? = editor): String {
        val t = info?.inputType ?: return "text"
        val cls = t and InputType.TYPE_MASK_CLASS
        val v = t and InputType.TYPE_MASK_VARIATION
        return when {
            cls == InputType.TYPE_CLASS_TEXT && (
                v == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
                v == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
                v == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD) -> "password"
            cls == InputType.TYPE_CLASS_NUMBER &&
                (t and InputType.TYPE_MASK_VARIATION) == InputType.TYPE_NUMBER_VARIATION_PASSWORD -> "password"
            cls == InputType.TYPE_CLASS_TEXT && (
                v == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS ||
                v == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS) -> "email"
            cls == InputType.TYPE_CLASS_TEXT && v == InputType.TYPE_TEXT_VARIATION_URI -> "url"
            cls == InputType.TYPE_CLASS_NUMBER || cls == InputType.TYPE_CLASS_PHONE -> "number"
            else -> "text"
        }
    }

    /**
     * 16 kHz mono 16-bit PCM -> Dart pipeline -> committed into the focused field.
     * [kind] overrides the field-derived kind (tests only). [done] gets the Dart result map.
     */
    fun dictate(pcm: ByteArray, kind: String? = null, done: (Map<String, Any?>) -> Unit) {
        val k = kind ?: fieldKind()
        call("dictate", mapOf("pcm" to pcm, "packageName" to editor?.packageName, "fieldKind" to k)) { r ->
            @Suppress("UNCHECKED_CAST")
            val m = (r as? Map<String, Any?>) ?: mapOf("status" to "error")
            if (m["status"] == "ok") commit(m["text"] as? String ?: "", k)
            done(m)
        }
    }

    private fun commit(text: String, kind: String) {
        val ic = currentInputConnection ?: return
        if (text.isEmpty()) return
        // Prose gets a separating space after existing text; email/url/number fields never do.
        val before = ic.getTextBeforeCursor(1, 0)?.toString().orEmpty()
        val lead = if (kind == "text" && before.isNotEmpty() && !before.last().isWhitespace()) " " else ""
        ic.commitText(lead + text, 1)
    }

    /** Calls Dart; retries while its handler is not registered yet (cold engine). */
    private fun call(method: String, args: Any?, attempt: Int = 0, cb: (Any?) -> Unit) {
        ImeEngine.get(this).invokeMethod(method, args, object : MethodChannel.Result {
            override fun success(r: Any?) = cb(r)
            override fun error(code: String, msg: String?, d: Any?) {
                Log.e("VoiceFlow", "$method failed: $code $msg")
                cb(null)
            }
            override fun notImplemented() {
                if (attempt < 200) main.postDelayed({ call(method, args, attempt + 1, cb) }, 50)
                else cb(null)
            }
        })
    }

    private fun ping() = call("ping", null) {
        Log.i("VoiceFlow", "dart_ready_ms=${SystemClock.elapsedRealtime() - ImeEngine.startedAtMs}")
    }

    override fun onDestroy() {
        hooks?.onDestroy()
        ImeEngine.destroy()
        super.onDestroy()
    }
}
