package dev.voiceflow.voiceflow_app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.inputmethodservice.InputMethodService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.InputType
import android.util.Log
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import io.flutter.plugin.common.MethodChannel

/**
 * VoiceFlow keyboard. Kotlin owns UI, microphone and the InputConnection; the shared Dart
 * brain (speech model, formatting, per-app profile memory) runs in a headless FlutterEngine.
 */
class VoiceFlowIME : InputMethodService(), KbHandlers {
    private val main = Handler(Looper.getMainLooper())
    private var hooks: ImeHooks? = null
    private var editor: EditorInfo? = null
    private var ui: KeyboardUi? = null
    private var state = KbState.IDLE
    private var kind = "text"
    private var token = 0 // bumped on cancel so a late result is dropped, never typed

    private var profiles: List<Pair<String, String>> = emptyList() // id to name
    private var profileId = ""
    private var suggestedPack: Pair<String, String>? = null // id to name
    private var modelReady = false
    private var setupDone = false

    private var lastInserted = ""
    private var lastInsertedAt = 0L

    private val recorder = MicRecorder { lvl -> main.post { if (state == KbState.LISTENING) ui?.setLevel(lvl) } }
    private val autoStop = Runnable { if (state == KbState.LISTENING) stopAndDictate() } // 28 s utterance cap
    private val undoFade = Runnable { refreshUndo() }
    private val idleUnload = Runnable { // free ~480 MB: drop the whole engine after 5 idle minutes
        if (state == KbState.IDLE) ImeEngine.destroy()
    }

    override fun onCreate() {
        super.onCreate()
        ImeEngine.get(this) // cold start begins here
        call("ping", null) {
            Log.i("VoiceFlow", "dart_ready_ms=${SystemClock.elapsedRealtime() - ImeEngine.startedAtMs}")
        }
        hooks = ImeHooksFactory.create(this)
    }

    override fun onEvaluateFullscreenMode() = false

    override fun onCreateInputView(): View {
        val k = KeyboardUi(this, this)
        ui = k
        k.setStatus(getString(R.string.vf_idle))
        k.setState(KbState.IDLE)
        k.setUndoEnabled(false)
        return k.root
    }

    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        editor = info
        main.removeCallbacks(idleUnload)
        kind = fieldKind(info)
        if (kind == "password") {
            ui?.setState(KbState.DISABLED); ui?.setStatus(getString(R.string.vf_password))
        } else if (state == KbState.IDLE) {
            ui?.setState(KbState.IDLE); ui?.setStatus(getString(R.string.vf_idle))
        }
        refreshUndo()
        loadStatus()
        loadSuggestion()
    }

    override fun onFinishInputView(finishingInput: Boolean) {
        super.onFinishInputView(finishingInput)
        if (state == KbState.LISTENING) cancelAll()
        main.postDelayed(idleUnload, 5 * 60_000L)
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
            cls == InputType.TYPE_CLASS_NUMBER && v == InputType.TYPE_NUMBER_VARIATION_PASSWORD -> "password"
            cls == InputType.TYPE_CLASS_TEXT && (
                v == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS ||
                v == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS) -> "email"
            cls == InputType.TYPE_CLASS_TEXT && v == InputType.TYPE_TEXT_VARIATION_URI -> "url"
            cls == InputType.TYPE_CLASS_NUMBER || cls == InputType.TYPE_CLASS_PHONE -> "number"
            else -> "text"
        }
    }

    // ---- Dart status (profile chip, cloud glyph, setup state)
    private fun loadStatus() = call("status", null) { r ->
        val m = r as? Map<*, *> ?: return@call
        modelReady = m["modelReady"] == true
        setupDone = m["onboardingDone"] == true
        profiles = (m["profiles"] as? List<*>)?.mapNotNull {
            val p = it as? Map<*, *>
            val id = p?.get("id") as? String; val n = p?.get("name") as? String
            if (id != null && n != null) id to n else null
        } ?: emptyList()
        val cur = m["profile"] as? Map<*, *>
        profileId = cur?.get("id") as? String ?: ""
        // A per-app choice (if any) is applied by Dart at dictate time; show the global one here.
        ui?.setProfile(cur?.get("name") as? String ?: "")
        ui?.setCloud(m["cloud"] == true)
    }

    // ---- pack suggestion (shown, never applied by itself)
    private fun loadSuggestion() {
        suggestedPack = null
        ui?.setPackSuggestion(null)
        call("suggestions", mapOf("packageName" to editor?.packageName)) { r ->
            val first = (r as? List<*>)?.firstOrNull() as? Map<*, *> ?: return@call
            val id = first["id"] as? String ?: return@call
            val name = first["name"] as? String ?: return@call
            suggestedPack = id to name
            ui?.setPackSuggestion(name)
        }
    }

    override fun onPackSuggestion() {
        val (id, name) = suggestedPack ?: return
        call("activatePack", mapOf("id" to id)) { r ->
            Log.i("VoiceFlow", "pack_on id=$id active=$r")
            suggestedPack = null
            ui?.setPackSuggestion(null)
            ui?.setStatus(getString(R.string.vf_pack_on, name))
        }
    }

    override fun onPackDismiss() {
        val (id, _) = suggestedPack ?: return
        call("dismissPack", mapOf("id" to id)) {}
        suggestedPack = null
        ui?.setPackSuggestion(null)
    }

    override fun onProfile() {
        if (profiles.isEmpty()) return
        val i = profiles.indexOfFirst { it.first == profileId }
        val next = profiles[(i + 1) % profiles.size]
        profileId = next.first
        ui?.setProfile(next.second)
        call("setProfile", mapOf("id" to next.first, "packageName" to editor?.packageName)) {}
    }

    // ---- microphone flow
    override fun onMic() {
        when (state) {
            KbState.IDLE -> startListening()
            KbState.LISTENING -> stopAndDictate()
            else -> {}
        }
    }

    private fun openApp() {
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private fun startListening() {
        if (kind == "password") return
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ui?.setStatus(getString(R.string.vf_mic_permission)); openApp(); return
        }
        if (!modelReady) { ui?.setStatus(getString(R.string.vf_setup)); openApp(); return }
        if (!recorder.start()) { ui?.setStatus(getString(R.string.vf_error)); return }
        state = KbState.LISTENING
        ui?.setState(state); ui?.setStatus(getString(R.string.vf_listening))
        main.postDelayed(autoStop, 28_000)
    }

    private fun stopAndDictate() {
        main.removeCallbacks(autoStop)
        val pcm = recorder.stop()
        state = KbState.PROCESSING
        ui?.setState(state); ui?.setStatus(getString(R.string.vf_working))
        val mine = ++token
        dictate(pcm, null, { mine == token }) { m ->
            if (mine != token) return@dictate // cancelled meanwhile
            state = KbState.IDLE
            ui?.setState(if (kind == "password") KbState.DISABLED else KbState.IDLE)
            ui?.setStatus(getString(when (m["status"]) {
                "ok" -> R.string.vf_inserted
                "noSpeech", "discarded" -> R.string.vf_nospeech
                "passwordField" -> R.string.vf_password
                "modelMissing" -> R.string.vf_setup
                else -> R.string.vf_error
            }))
            refreshUndo()
        }
    }

    override fun onCancel() = cancelAll()

    private fun cancelAll() {
        main.removeCallbacks(autoStop)
        token++
        if (state == KbState.LISTENING) recorder.stop()
        state = KbState.IDLE
        ui?.setState(if (kind == "password") KbState.DISABLED else KbState.IDLE)
        ui?.setStatus(getString(R.string.vf_idle))
    }

    /**
     * 16 kHz mono 16-bit PCM -> Dart pipeline -> committed into the focused field.
     * [kindOverride] replaces the field-derived kind (tests only). [accept] is checked just before
     * committing so a cancelled dictation never types. [done] gets the Dart result map.
     */
    fun dictate(
        pcm: ByteArray, kindOverride: String? = null,
        accept: () -> Boolean = { true }, done: (Map<String, Any?>) -> Unit,
    ) {
        val k = kindOverride ?: fieldKind()
        call("dictate", mapOf("pcm" to pcm, "packageName" to editor?.packageName, "fieldKind" to k)) { r ->
            @Suppress("UNCHECKED_CAST")
            val m = (r as? Map<String, Any?>) ?: mapOf("status" to "error")
            if (m["status"] == "ok" && accept()) commit(m["text"] as? String ?: "", k)
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
        lastInserted = lead + text
        lastInsertedAt = SystemClock.elapsedRealtime()
        main.removeCallbacks(undoFade)
        main.postDelayed(undoFade, 5_000)
    }

    // ---- undo: only while the inserted text is still right before the cursor
    private fun undoable(): Boolean {
        if (lastInserted.isEmpty() || SystemClock.elapsedRealtime() - lastInsertedAt > 30_000) return false
        val before = currentInputConnection?.getTextBeforeCursor(lastInserted.length, 0)?.toString()
        return before == lastInserted
    }

    private fun refreshUndo() = ui?.setUndoEnabled(undoable())

    override fun onUndo() {
        if (!undoable()) return
        currentInputConnection?.deleteSurroundingText(lastInserted.length, 0)
        lastInserted = ""
        ui?.setStatus(getString(R.string.vf_undone))
        refreshUndo()
    }

    // ---- plain keys
    override fun onText(s: String) {
        Log.i("VoiceFlow", "key '$s' ic=${currentInputConnection != null}")
        currentInputConnection?.commitText(s, 1); refreshUndo()
    }
    override fun onSpace() = onText(" ")
    override fun onBackspace() {
        val ic = currentInputConnection ?: return
        Log.i("VoiceFlow", "key backspace")
        if (ic.getSelectedText(0).isNullOrEmpty()) ic.deleteSurroundingText(1, 0)
        else ic.commitText("", 1)
        refreshUndo()
    }
    override fun onEnter() {
        if (!sendDefaultEditorAction(true)) currentInputConnection?.commitText("\n", 1)
    }
    override fun onSwitchKeyboard() {
        if (Build.VERSION.SDK_INT >= 28) switchToNextInputMethod(false)
        else (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker()
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

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        if (state == KbState.LISTENING) recorder.stop()
        hooks?.onDestroy()
        ImeEngine.destroy()
        super.onDestroy()
    }
}
