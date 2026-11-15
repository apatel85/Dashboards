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
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.WindowManager
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

    private val recorder = MicRecorder { chunk, lvl ->
        main.post {
            if (state == BubbleState.LISTENING) {
                bubble?.setLevel(lvl)
                DartBridge.call(this, "streamChunk", mapOf("pcm" to chunk))
            }
        }
    }
    private val idleUnload = Runnable { // free ~480 MB: drop the whole engine after 5 idle minutes
        if (state == BubbleState.IDLE) ImeEngine.destroy()
    }

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

    // ---- gestures: tap = start/stop, long-press = cancel while listening, else cycle the style
    private fun onTap() {
        when (state) {
            BubbleState.IDLE -> startListening()
            BubbleState.LISTENING -> stopAndDictate()
            else -> {}
        }
    }

    private fun onLongPress() {
        when (state) {
            BubbleState.LISTENING -> { cancelAll(); say(R.string.vf_cancelled) }
            BubbleState.IDLE -> cycleProfile()
            else -> {}
        }
    }

    private fun cycleProfile() {
        if (profiles.isEmpty()) { refreshStatus(); return }
        val i = profiles.indexOfFirst { it.first == profileId }
        val next = profiles[(i + 1) % profiles.size]
        profileId = next.first
        val a11y = VoiceFlowAccessibilityService.instance
        val pkgName = a11y?.focusedField()?.pkg
        DartBridge.call(this, "setProfile", mapOf("id" to next.first, "packageName" to pkgName))
        Toast.makeText(this, getString(R.string.vf_style, next.second), Toast.LENGTH_SHORT).show()
        Log.i("VoiceFlow", "STYLE ${next.first} pkg=$pkgName")
    }

    private fun refreshStatus() = DartBridge.call(this, "status", null) { r ->
        val m = r as? Map<*, *> ?: return@call
        modelReady = m["modelReady"] == true
        profiles = (m["profiles"] as? List<*>)?.mapNotNull {
            val p = it as? Map<*, *>
            val id = p?.get("id") as? String; val n = p?.get("name") as? String
            if (id != null && n != null) id to n else null
        } ?: emptyList()
        profileId = (m["profile"] as? Map<*, *>)?.get("id") as? String ?: ""
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
        if (!modelReady) { refreshStatus(); say(R.string.vf_setup); openApp(); return false }
        val a11y = VoiceFlowAccessibilityService.instance
        if (a11y == null) { say(R.string.vf_need_access); openApp(); return false }
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
        DartBridge.call(this, "streamEnd", null) { r ->
            if (mine != token) return@call // cancelled meanwhile
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
        detach()
        bubble = null
        ImeEngine.destroy()
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
