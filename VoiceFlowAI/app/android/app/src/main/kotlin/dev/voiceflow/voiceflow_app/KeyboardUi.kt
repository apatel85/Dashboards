package dev.voiceflow.voiceflow_app

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView

enum class KbState { IDLE, LISTENING, PROCESSING, DISABLED }

interface KbHandlers {
    fun onMic()
    fun onCancel()
    fun onUndo()
    fun onProfile()
    fun onText(s: String)
    fun onSpace()
    fun onBackspace()
    fun onEnter()
    fun onSwitchKeyboard()
}

/** The keyboard surface (~220 dp). Pure views, no layout XML. Material You accent on Android 12+. */
@SuppressLint("ClickableViewAccessibility")
class KeyboardUi(private val ctx: Context, private val h: KbHandlers) {
    private val ui = Handler(Looper.getMainLooper())
    private val dark = (ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
        Configuration.UI_MODE_NIGHT_YES
    private val bg = if (dark) 0xFF1C1B1F.toInt() else 0xFFF3F1F6.toInt()
    private val keyBg = if (dark) 0xFF2B2A30.toInt() else 0xFFFFFFFF.toInt()
    private val fg = if (dark) 0xFFE6E1E9.toInt() else 0xFF1C1B1F.toInt()
    private val dim = if (dark) 0xFFA9A4AE.toInt() else 0xFF605C66.toInt()
    private val accent: Int = if (Build.VERSION.SDK_INT >= 31)
        ctx.getColor(if (dark) android.R.color.system_accent1_200 else android.R.color.system_accent1_600)
    else 0xFF4F5BD5.toInt()
    private val onAccent = if (dark) 0xFF1C1B1F.toInt() else Color.WHITE
    private val danger = 0xFFB3261E.toInt()

    private fun dp(v: Int) = (v * ctx.resources.displayMetrics.density).toInt()
    private fun round(color: Int, radius: Int, oval: Boolean = false) = GradientDrawable().apply {
        setColor(color)
        if (oval) shape = GradientDrawable.OVAL else cornerRadius = dp(radius).toFloat()
    }

    private fun label(text: String, size: Float, color: Int = fg) = TextView(ctx).apply {
        this.text = text; textSize = size; setTextColor(color); gravity = Gravity.CENTER
        includeFontPadding = false
    }

    private fun key(text: String, desc: String, weight: Float, onClick: () -> Unit): TextView =
        label(text, 18f).apply {
            contentDescription = desc
            background = round(keyBg, 10)
            minHeight = dp(48)
            isClickable = true
            isFocusable = true
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, weight)
                .apply { setMargins(dp(3), dp(3), dp(3), dp(3)) }
            setOnClickListener { performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); onClick() }
        }

    val chip = label("", 13f, accent).apply {
        background = round(keyBg, 16)
        setPadding(dp(12), dp(6), dp(12), dp(6))
        minHeight = dp(48)
        isClickable = true
        setOnClickListener { h.onProfile() }
        setOnLongClickListener { h.onProfile(); true }
    }
    private val cloud = label("☁", 15f, dim).apply {
        contentDescription = ctx.getString(R.string.vf_cd_cloud)
        visibility = View.GONE
        setPadding(dp(8), 0, dp(4), 0)
    }
    val status = label("", 13f, dim).apply {
        maxLines = 1; ellipsize = TextUtils.TruncateAt.END
        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
    }
    val mic = label("🎤", 28f).apply {
        layoutParams = LinearLayout.LayoutParams(dp(72), dp(72)).apply { setMargins(dp(28), 0, dp(28), 0) }
        isClickable = true
        setOnClickListener { performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK); h.onMic() }
    }
    val cancel = label("✕", 20f).apply {
        contentDescription = ctx.getString(R.string.vf_cd_cancel)
        background = round(keyBg, 24, oval = true)
        layoutParams = LinearLayout.LayoutParams(dp(48), dp(48))
        isClickable = true
        setOnClickListener { h.onCancel() }
    }
    val undo = label("↶", 22f, dim).apply {
        contentDescription = ctx.getString(R.string.vf_cd_undo)
        background = round(keyBg, 24, oval = true)
        layoutParams = LinearLayout.LayoutParams(dp(48), dp(48))
        isClickable = true
        setOnClickListener { h.onUndo() }
    }

    private fun row(height: Int, vararg v: View) = LinearLayout(ctx).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(height))
        v.forEach { addView(it) }
    }

    private val repeat = object : Runnable {
        override fun run() { h.onBackspace(); ui.postDelayed(this, 55) }
    }
    private val back = key("⌫", ctx.getString(R.string.vf_cd_backspace), 1.3f) {}.apply {
        setOnClickListener(null)
        setOnTouchListener { v, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    v.isPressed = true
                    v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                    h.onBackspace(); ui.postDelayed(repeat, 400)
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { v.isPressed = false; ui.removeCallbacks(repeat) }
            }
            true
        }
    }

    val root: View = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(bg)
        setPadding(dp(6), dp(4), dp(6), dp(4))
        layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(220))
        addView(row(48, chip, cloud, status))
        addView(row(84, View(ctx).apply { layoutParams = LinearLayout.LayoutParams(0, 1, 1f) }, cancel, mic, undo,
            View(ctx).apply { layoutParams = LinearLayout.LayoutParams(0, 1, 1f) }))
        addView(row(40, *listOf(",", ".", "?", "!", "'", "@").map { c ->
            key(c, c, 1f) { h.onText(c) }
        }.toTypedArray()))
        addView(row(48,
            key("🌐", ctx.getString(R.string.vf_cd_switch), 1.2f) { h.onSwitchKeyboard() },
            key("", ctx.getString(R.string.vf_cd_space), 4f) { h.onSpace() },
            back,
            key("⏎", ctx.getString(R.string.vf_cd_enter), 1.3f) { h.onEnter() }))
    }

    fun setProfile(name: String) {
        chip.text = name
        chip.contentDescription = ctx.getString(R.string.vf_cd_profile, name)
    }

    fun setCloud(on: Boolean) { cloud.visibility = if (on) View.VISIBLE else View.GONE }
    fun setStatus(s: String) { status.text = s }
    fun setUndoEnabled(on: Boolean) {
        undo.isEnabled = on
        undo.setTextColor(if (on) onAccent else dim)
        undo.background = round(if (on) accent else keyBg, 24, oval = true)
    }

    /** Mic pulses with the input level while listening. */
    fun setLevel(level: Float) {
        val s = 1f + 0.25f * level
        mic.scaleX = s; mic.scaleY = s
    }

    fun setState(s: KbState) {
        mic.scaleX = 1f; mic.scaleY = 1f
        cancel.visibility = if (s == KbState.LISTENING || s == KbState.PROCESSING) View.VISIBLE else View.INVISIBLE
        mic.isEnabled = s == KbState.IDLE || s == KbState.LISTENING
        mic.background = round(
            when (s) {
                KbState.LISTENING -> danger
                KbState.DISABLED -> keyBg
                else -> accent
            }, 36, oval = true)
        mic.alpha = if (s == KbState.DISABLED) 0.5f else 1f
        mic.text = when (s) {
            KbState.LISTENING -> "■"
            KbState.PROCESSING -> "…"
            KbState.DISABLED -> "🔒"
            else -> "🎤"
        }
        mic.contentDescription = ctx.getString(
            if (s == KbState.LISTENING) R.string.vf_cd_stop else R.string.vf_cd_dictate)
    }
}
