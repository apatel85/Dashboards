package dev.voiceflow.voiceflow_app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import kotlin.math.abs

/**
 * The floating dictation button. Kotlin owns the button, the microphone and (through the
 * accessibility service) typing into the focused field; the shared Dart brain (speech model,
 * formatting, per-app profile memory) runs in a headless FlutterEngine.
 *
 * Audio is streamed to Dart in small chunks while you talk, so a dictation can be any length.
 */
class FloatingService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var wm: WindowManager
    private var bubble: BubbleView? = null
    private var lp: WindowManager.LayoutParams? = null
    private var attached = false
    private var inputActive = false
    private val hide = Runnable { if (!inputActive && state == BubbleState.IDLE) detach() }
    private var state = BubbleState.IDLE
    private var token = 0 // bumped on cancel so a late result is dropped, never typed
    private var kind = "text"
    private var pkg: String? = null
    private var modelReady = false
    private var profiles: List<Pair<String, String>> = emptyList()
    private var profileId = ""

    private val recorder = MicRecorder(
        onChunk = { chunk, lvl ->
            main.post {
                if (state == BubbleState.LISTENING) {
                    bubble?.setLevel(lvl)
                    DartBridge.call(this, "streamChunk", mapOf("pcm" to chunk))
                }
            }
        },
        onLost = {
            // The microphone was taken (a call, another app). Keep what was said so far.
            main.post {
                if (state == BubbleState.LISTENING) {
                    Log.w("VoiceFlow", "microphone lost while listening")
                    say(R.string.vf_mic_lost)
                    stopAndDictate()
                }
            }
        },
    )
    private val idleUnload = Runnable { // free ~480 MB: drop the whole engine after 5 idle minutes
        if (state == BubbleState.IDLE) ImeEngine.shutdown()
    }
    private var picker: View? = null
    private val hidePicker = Runnable { closePicker() }

    override fun onBind(i: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        ImeEngine.get(this) // cold start begins here
        refreshStatus()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopSelf(); return START_NOT_STICKY }
        startForegroundCompat()
        if (!Settings.canDrawOverlays(this)) { stopSelf(); return START_NOT_STICKY }
        if (bubble == null) createBubble()
        running = true
        // Show only if a text box is in use right now; the accessibility service keeps it updated.
        VoiceFlowAccessibilityService.instance?.evaluate()
        return START_STICKY
    }

    private fun startForegroundCompat() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, getString(R.string.vf_notif_channel), NotificationManager.IMPORTANCE_LOW))
        val stop = PendingIntent.getService(this, 1,
            Intent(this, FloatingService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
        val open = PendingIntent.getActivity(this, 2, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(getString(R.string.vf_notif_title))
            .setContentText(getString(R.string.vf_notif_text))
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, getString(R.string.vf_notif_hide), stop).build())
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        else startForeground(NOTIF_ID, n)
    }

    // ---- the button
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun createBubble() {
        val size = dp(56)
        val p = WindowManager.LayoutParams(
            size, size,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            // Never takes input focus, so the field you are typing in keeps it.
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = resources.displayMetrics.widthPixels - size - dp(8)
            y = resources.displayMetrics.heightPixels / 3
        }
        val v = BubbleView(this)
        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0
        var moved = false; var longFired = false
        val slop = dp(8)
        val longPress = Runnable { longFired = true; onLongPress() }
        v.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX; downY = e.rawY; startX = p.x; startY = p.y
                    moved = false; longFired = false
                    main.postDelayed(longPress, 600)
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX; val dy = e.rawY - downY
                    if (!moved && (abs(dx) > slop || abs(dy) > slop)) { moved = true; main.removeCallbacks(longPress) }
                    if (moved) {
                        p.x = (startX + dx).toInt(); p.y = (startY + dy).toInt()
                        try { wm.updateViewLayout(v, p) } catch (_: Exception) {}
                    }
                }
                MotionEvent.ACTION_UP -> {
                    main.removeCallbacks(longPress)
                    if (!moved && !longFired) onTap()
                }
                MotionEvent.ACTION_CANCEL -> main.removeCallbacks(longPress)
            }
            true
        }
        bubble = v; lp = p
    }

    /** The button exists on screen only while the person is typing (see [setInputActive]). */
    private fun attach() {
        val v = bubble ?: return
        val p = lp ?: return
        if (attached) return
        try {
            wm.addView(v, p)
            attached = true
            Log.i("VoiceFlow", "BUBBLE visible")
            v.post {
                val loc = IntArray(2); v.getLocationOnScreen(loc)
                Log.i("VoiceFlow", "BUBBLE_AT ${loc[0] + v.width / 2} ${loc[1] + v.height / 2}")
            }
        } catch (e: Exception) {
            Log.e("VoiceFlow", "bubble failed: $e"); stopSelf()
        }
    }

    private fun detach() {
        val v = bubble ?: return
        if (!attached) return
        try { wm.removeView(v) } catch (_: Exception) {}
        attached = false
        Log.i("VoiceFlow", "BUBBLE hidden")
    }

    /** Called by the accessibility service: true while a text box is focused or the keyboard is up. */
    fun setInputActive(active: Boolean) {
        main.post {
            inputActive = active
            main.removeCallbacks(hide)
            if (active) attach() else main.postDelayed(hide, 700) // short delay: no flicker between fields
        }
    }

    // ---- gestures: tap = start/stop (or abort a stuck "working"), press and hold = choose the
    // style (cancel while listening)
    private fun onTap() {
        closePicker()
        when (state) {
            BubbleState.IDLE -> startListening()
            BubbleState.LISTENING -> stopAndDictate()
            // Escape hatch: if "working" ever drags on, a tap abandons it and restarts the engine.
            BubbleState.PROCESSING -> { cancelAll(); ImeEngine.destroy(); say(R.string.vf_cancelled) }
            else -> {}
        }
    }

    private fun onLongPress() {
        when (state) {
            BubbleState.LISTENING -> { cancelAll(); say(R.string.vf_cancelled) }
            BubbleState.IDLE -> if (picker != null) closePicker() else showStylePicker()
            else -> {}
        }
    }

    // ---- the style chooser (press and hold the button)
    private fun showStylePicker() {
        val pkgName = VoiceFlowAccessibilityService.instance?.focusedField()?.pkg
        // Ask for the style that applies in the app being typed into, so the tick is right.
        DartBridge.call(this, "status", mapOf("packageName" to pkgName), 10_000) { r ->
            (r as? Map<*, *>)?.let { applyStatus(it) }
            if (profiles.isEmpty()) { say(R.string.vf_error); return@call }
            if (state == BubbleState.IDLE && attached) buildPicker(pkgName)
        }
    }

    private fun buildPicker(pkgName: String?) {
        closePicker()
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(6), dp(6), dp(6), dp(6))
            background = GradientDrawable().apply { setColor(Color.parseColor("#1F2937")); cornerRadius = dp(16).toFloat() }
            elevation = dp(8).toFloat()
        }
        card.addView(TextView(this).apply {
            text = getString(if (pkgName == null) R.string.vf_style_all else R.string.vf_style_this_app)
            setTextColor(Color.parseColor("#9CA3AF")); textSize = 12f
            setPadding(dp(12), dp(8), dp(12), dp(4))
        })
        val rows = ArrayList<Pair<String, TextView>>()
        for ((id, name) in profiles) {
            val row = TextView(this).apply {
                text = (if (id == profileId) "✓  " else "    ") + name
                setTextColor(Color.WHITE); textSize = 16f
                minHeight = dp(48); gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(12), 0, dp(20), 0)
                if (id == profileId) background = GradientDrawable().apply {
                    setColor(Color.parseColor("#2563EB")); cornerRadius = dp(10).toFloat()
                }
                setOnClickListener { chooseStyle(id, name, pkgName) }
            }
            card.addView(row); rows.add(id to row)
        }
        card.setOnTouchListener { _, e -> if (e.actionMasked == MotionEvent.ACTION_OUTSIDE) closePicker(); false }
        card.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED)
        val b = lp ?: return
        val dm = resources.displayMetrics
        val onRight = b.x + dp(28) > dm.widthPixels / 2
        val x = if (onRight) b.x - card.measuredWidth - dp(8) else b.x + dp(56) + dp(8)
        val y = (b.y + dp(28) - card.measuredHeight / 2).coerceIn(dp(24), maxOf(dp(24), dm.heightPixels - card.measuredHeight - dp(48)))
        val p = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            // Never takes focus, so the text box you are typing in keeps it.
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT,
        ).apply { gravity = Gravity.TOP or Gravity.START; this.x = x.coerceAtLeast(0); this.y = y }
        try {
            wm.addView(card, p)
            picker = card
            main.removeCallbacks(hide)
            main.postDelayed(hidePicker, 8000)
            Log.i("VoiceFlow", "STYLE_PICKER shown pkg=$pkgName current=$profileId")
            card.post {
                rows.forEach { (id, v) ->
                    val loc = IntArray(2); v.getLocationOnScreen(loc)
                    Log.i("VoiceFlow", "PICKER_ITEM $id ${loc[0] + v.width / 2} ${loc[1] + v.height / 2}")
                }
            }
        } catch (e: Exception) { Log.e("VoiceFlow", "style picker failed: $e") }
    }

    private fun closePicker() {
        main.removeCallbacks(hidePicker)
        val v = picker ?: return
        picker = null
        try { wm.removeView(v) } catch (_: Exception) {}
        if (!inputActive && state == BubbleState.IDLE) main.postDelayed(hide, 700)
    }

    private fun chooseStyle(id: String, name: String, pkgName: String?) {
        profileId = id
        // Remembered for this app (or as the default when no app is known); used from the next dictation.
        DartBridge.call(this, "setProfile", mapOf("id" to id, "packageName" to pkgName))
        Toast.makeText(this, getString(R.string.vf_style, name), Toast.LENGTH_SHORT).show()
        Log.i("VoiceFlow", "STYLE $id pkg=$pkgName")
        closePicker()
    }

    private fun applyStatus(m: Map<*, *>) {
        modelReady = m["modelReady"] == true
        profiles = (m["profiles"] as? List<*>)?.mapNotNull {
            val p = it as? Map<*, *>
            val id = p?.get("id") as? String; val n = p?.get("name") as? String
            if (id != null && n != null) id to n else null
        } ?: emptyList()
        profileId = (m["profile"] as? Map<*, *>)?.get("id") as? String ?: ""
    }

    private fun refreshStatus(then: (() -> Unit)? = null) =
        DartBridge.call(this, "status", null, 15_000) { r ->
            (r as? Map<*, *>)?.let { applyStatus(it) }
            then?.invoke()
        }

    // ---- dictation
    private fun say(res: Int) {
        Log.i("VoiceFlow", "SAY ${getString(res)}")
        Toast.makeText(this, res, Toast.LENGTH_SHORT).show()
    }

    private fun openApp() =
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))

    /** Checks everything a dictation needs and tells Dart to start. False = told the person why. */
    private fun begin(): Boolean {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            say(R.string.vf_mic_permission); openApp(); return false
        }
        if (!modelReady) {
            // Maybe just stale (the engine restarted): ask again before sending the person to Settings.
            refreshStatus {
                if (modelReady) { if (state == BubbleState.IDLE) startListening() }
                else { say(R.string.vf_setup); openApp() }
            }
            return false
        }
        val a11y = VoiceFlowAccessibilityService.instance
        if (a11y == null) {
            // Android switched the typing service off (or it is still reconnecting).
            say(R.string.vf_need_access)
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return false
        }
        val f = a11y.focusedField()
        if (f == null) { say(R.string.vf_no_field); return false }
        if (f.password) { say(R.string.vf_password); return false }
        kind = f.kind; pkg = f.pkg
        main.removeCallbacks(idleUnload)
        DartBridge.call(this, "streamStart", mapOf(
            "packageName" to pkg, "fieldKind" to kind, "before" to f.before, "after" to f.after,
        ))
        state = BubbleState.LISTENING
        bubble?.state = state
        Log.i("VoiceFlow", "STATE listening pkg=$pkg kind=$kind")
        return true
    }

    private fun startListening() {
        if (!begin()) return
        if (!recorder.start()) {
            DartBridge.call(this, "streamCancel", null)
            state = BubbleState.IDLE; bubble?.state = state
            say(R.string.vf_error)
        }
    }

    /** Test seam entry (E2eReceiver in the e2e build): feeds PCM through the same path as the mic. */
    fun dictatePcm(pcm: ByteArray) {
        if (state != BubbleState.IDLE || !begin()) return
        var i = 0
        while (i < pcm.size) {
            val end = minOf(i + 3200, pcm.size)
            DartBridge.call(this, "streamChunk", mapOf("pcm" to pcm.copyOfRange(i, end)))
            i = end
        }
        stopAndDictate()
    }

    private fun stopAndDictate() {
        recorder.stop()
        state = BubbleState.PROCESSING
        bubble?.state = state
        Log.i("VoiceFlow", "STATE processing")
        val mine = ++token
        val k = kind
        // 90 s ceiling: transcription happens while you talk, so the end is normally quick. If Dart
        // never answers, do not stay "working" for good.
        DartBridge.call(this, "streamEnd", null, 90_000) { r ->
            if (mine != token) return@call // cancelled meanwhile
            if (r == null) { // engine wedged or gone: start over with a fresh one next time
                Log.w("VoiceFlow", "streamEnd gave no answer; restarting the engine")
                ImeEngine.destroy()
                modelReady = true
                refreshStatus()
            }
            @Suppress("UNCHECKED_CAST")
            val m = (r as? Map<String, Any?>) ?: mapOf("status" to "error")
            val status = m["status"] as? String ?: "error"
            var shown = when (status) {
                "ok" -> R.string.vf_inserted
                "noSpeech", "discarded" -> R.string.vf_nospeech
                "passwordField" -> R.string.vf_password
                "modelMissing" -> R.string.vf_setup
                "commandUndo" -> R.string.vf_undone
                else -> R.string.vf_error
            }
            val a11y = VoiceFlowAccessibilityService.instance
            var text = ""
            if (status == "ok") {
                text = m["text"] as? String ?: ""
                val res = a11y?.insert(text, k) ?: "noField"
                if (res != "ok") {
                    // Never lose what was said: leave it on the clipboard.
                    a11y?.copy(text)
                    shown = if (res == "password") R.string.vf_password else R.string.vf_copied
                }
            } else if (status == "commandUndo") {
                if (a11y?.undo() != true) shown = R.string.vf_nothing_undo
            }
            Log.i("E2E", "RESULT status=$status text='$text'")
            state = BubbleState.IDLE
            bubble?.state = state
            say(shown)
            main.postDelayed(idleUnload, 5 * 60_000L)
            if (!inputActive) main.postDelayed(hide, 700)
        }
    }

    private fun cancelAll() {
        token++
        if (state == BubbleState.LISTENING) {
            recorder.stop()
            DartBridge.call(this, "streamCancel", null)
        }
        state = BubbleState.IDLE
        bubble?.state = state
        if (!inputActive) main.postDelayed(hide, 700)
    }

    override fun onDestroy() {
        running = false
        instance = null
        main.removeCallbacksAndMessages(null)
        if (state == BubbleState.LISTENING) recorder.stop()
        closePicker()
        detach()
        bubble = null
        ImeEngine.shutdown()
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "dev.voiceflow.STOP_BUBBLE"
        private const val CHANNEL = "voiceflow_bubble"
        private const val NOTIF_ID = 17
        @Volatile var running = false
        @Volatile var instance: FloatingService? = null
    }
}
