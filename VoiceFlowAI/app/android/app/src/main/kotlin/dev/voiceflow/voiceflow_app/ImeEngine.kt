package dev.voiceflow.voiceflow_app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import io.flutter.FlutterInjector
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.engine.dart.DartExecutor
import io.flutter.plugin.common.MethodChannel

/** Holds the keyboard's single headless FlutterEngine (spike S3). */
object ImeEngine {
    private val main = Handler(Looper.getMainLooper())
    private var engine: FlutterEngine? = null
    var channel: MethodChannel? = null
        private set
    var startedAtMs = 0L
        private set

    /** True once Dart has answered a ping, i.e. its handlers are registered. */
    @Volatile var ready = false

    /** True while an old engine is being asked to free the speech model before it is destroyed. */
    @Volatile var retiring = false
        private set

    fun get(ctx: Context): MethodChannel {
        channel?.let { return it }
        startedAtMs = SystemClock.elapsedRealtime()
        ready = false
        val e = FlutterEngine(ctx.applicationContext)
        val path = FlutterInjector.instance().flutterLoader().findAppBundlePath()
        e.dartExecutor.executeDartEntrypoint(
            DartExecutor.DartEntrypoint(path, "package:voiceflow_app/ime_main.dart", "imeMain")
        )
        engine = e
        val ch = MethodChannel(e.dartExecutor.binaryMessenger, "voiceflow/ime")
        channel = ch
        Log.i("S3", "engine_created_ms=${SystemClock.elapsedRealtime() - startedAtMs}")
        return ch
    }

    /** Destroys the engine right now. Anything still waiting on it is told it failed. */
    fun destroy() {
        engine?.destroy()
        engine = null
        channel = null
        ready = false
        DartBridge.engineGone()
    }

    /**
     * Frees the speech model first (Dart `unload`), then destroys the engine. Destroying it
     * outright left the model's native memory behind, so each idle-unload and reload added
     * hundreds of MB until the phone got slow or killed the app.
     */
    fun shutdown(done: () -> Unit = {}) {
        val ch = channel
        if (ch == null || !ready || retiring) { destroy(); done(); return }
        retiring = true
        var finished = false
        val fin = Runnable {
            if (!finished) {
                finished = true
                destroy()
                retiring = false
                Log.i("VoiceFlow", "engine unloaded")
                done()
            }
        }
        main.postDelayed(fin, 5000)
        ch.invokeMethod("unload", null, object : MethodChannel.Result {
            override fun success(r: Any?) { main.post(fin) }
            override fun error(code: String, msg: String?, d: Any?) { main.post(fin) }
            override fun notImplemented() { main.post(fin) }
        })
    }
}
