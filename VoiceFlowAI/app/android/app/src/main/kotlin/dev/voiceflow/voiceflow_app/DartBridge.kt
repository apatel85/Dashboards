package dev.voiceflow.voiceflow_app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import io.flutter.plugin.common.MethodChannel

/** Calls into the shared Dart brain (headless FlutterEngine). Main thread only. */
object DartBridge {
    private val main = Handler(Looper.getMainLooper())

    /** Retries while Dart's handler is not registered yet (cold engine). */
    fun call(ctx: Context, method: String, args: Any?, attempt: Int = 0, cb: (Any?) -> Unit = {}) {
        ImeEngine.get(ctx).invokeMethod(method, args, object : MethodChannel.Result {
            override fun success(r: Any?) = cb(r)
            override fun error(code: String, msg: String?, d: Any?) {
                Log.e("VoiceFlow", "$method failed: $code $msg")
                cb(null)
            }
            override fun notImplemented() {
                if (attempt < 200) main.postDelayed({ call(ctx, method, args, attempt + 1, cb) }, 50)
                else cb(null)
            }
        })
    }
}
