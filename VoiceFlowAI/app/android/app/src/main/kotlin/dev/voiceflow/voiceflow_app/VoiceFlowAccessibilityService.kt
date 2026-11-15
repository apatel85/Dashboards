package dev.voiceflow.voiceflow_app

import android.accessibilityservice.AccessibilityService
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.text.InputType
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo

/** What kind of field has focus. [password] fields are never dictated into. */
data class FieldInfo(val pkg: String?, val kind: String, val password: Boolean)

/** Maps an Android inputType to how dictated text must be formatted. */
fun fieldKindOf(t: Int): String {
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

/**
 * The only job of this service: put dictated text into the field that has input focus, and take
 * the last insertion back out. It does not read, log or store screen content. Events are ignored.
 */
class VoiceFlowAccessibilityService : AccessibilityService() {
    override fun onServiceConnected() { instance = this; Log.i("VoiceFlow", "a11y connected"); evaluate() }
    override fun onAccessibilityEvent(e: AccessibilityEvent?) {
        when (e?.eventType) {
            AccessibilityEvent.TYPE_VIEW_FOCUSED,
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
            AccessibilityEvent.TYPE_WINDOWS_CHANGED -> evaluate()
        }
    }

    /**
     * Is the person typing? True while a text box has input focus or the keyboard is up, never in
     * a password field. Only flags are looked at (editable / password / keyboard window): no text
     * from the screen is read, kept or sent anywhere. The floating button follows this.
     */
    fun evaluate() {
        val n = try { focused() } catch (_: Exception) { null }
        val password = n != null && (n.isPassword || fieldKindOf(n.inputType) == "password")
        val editable = n != null && n.isEditable
        val ime = try {
            windows.any { it.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD }
        } catch (_: Exception) { false }
        FloatingService.instance?.setInputActive(!password && (editable || ime))
    }
    override fun onInterrupt() {}
    override fun onUnbind(i: android.content.Intent?): Boolean { instance = null; return super.onUnbind(i) }
    override fun onDestroy() { instance = null; super.onDestroy() }

    private fun focused(): AccessibilityNodeInfo? =
        findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?: rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)

    fun focusedField(): FieldInfo? {
        val n = focused() ?: return null
        if (!n.isEditable) return null
        val kind = if (n.isPassword) "password" else fieldKindOf(n.inputType)
        return FieldInfo(n.packageName?.toString(), kind, kind == "password")
    }

    private data class Last(val pkg: String?, val before: String, val after: String, val at: Long)
    private var last: Last? = null

    /** Result of [insert]: ok, noField, password, failed. */
    fun insert(text: String, kind: String): String {
        val n = focused() ?: return "noField"
        if (!n.isEditable) return "noField"
        if (n.isPassword || fieldKindOf(n.inputType) == "password") return "password"
        val cur = if (n.isShowingHintText) "" else n.text?.toString().orEmpty()
        var s = n.textSelectionStart; var e = n.textSelectionEnd
        if (s < 0 || e < 0) { s = cur.length; e = cur.length }
        s = s.coerceIn(0, cur.length); e = e.coerceIn(s, cur.length)
        // Prose gets a separating space after existing text; email/url/number fields never do.
        val lead = if (kind == "text" && s > 0 && !cur[s - 1].isWhitespace()) " " else ""
        val ins = lead + text
        val next = cur.substring(0, s) + ins + cur.substring(e)
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, next)
        }
        if (n.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
            val sel = Bundle().apply {
                putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, s + ins.length)
                putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, s + ins.length)
            }
            n.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, sel)
            last = Last(n.packageName?.toString(), cur, next, System.currentTimeMillis())
            return "ok"
        }
        // Fallback: paste (keeps the caret where it was).
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("VoiceFlow", ins))
        return if (n.performAction(AccessibilityNodeInfo.ACTION_PASTE)) "ok" else "failed"
    }

    /** Undo only while the field still holds exactly what we left there. */
    fun undo(): Boolean {
        val l = last ?: return false
        if (System.currentTimeMillis() - l.at > 60_000) return false
        val n = focused() ?: return false
        if (n.text?.toString() != l.after) return false
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, l.before)
        }
        val ok = n.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        if (ok) last = null
        return ok
    }

    /** No field to type into: leave the text on the clipboard instead of losing it. */
    fun copy(text: String) {
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("VoiceFlow", text))
    }

    companion object {
        @Volatile var instance: VoiceFlowAccessibilityService? = null
    }
}
