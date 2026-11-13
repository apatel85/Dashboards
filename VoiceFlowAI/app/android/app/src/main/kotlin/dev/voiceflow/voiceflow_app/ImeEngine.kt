package dev.voiceflow.voiceflow_app

import android.content.Context
import android.os.SystemClock
import android.util.Log
import io.flutter.FlutterInjector
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.engine.dart.DartExecutor
import io.flutter.plugin.common.MethodChannel

/** Holds the keyboard's single headless FlutterEngine (spike S3). */
object ImeEngine {
    private var engine: FlutterEngine? = null
    var channel: MethodChannel? = null
        private set
    var startedAtMs = 0L
        private set

    fun get(ctx: Context): MethodChannel {
        channel?.let { return it }
        startedAtMs = SystemClock.elapsedRealtime()
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

    fun destroy() {
        engine?.destroy()
        engine = null
        channel = null
    }
}
