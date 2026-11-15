package dev.voiceflow.voiceflow_app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import io.flutter.plugin.common.MethodChannel

/**
 * Calls into the shared Dart brain (headless FlutterEngine). Main thread only.
 *
 * A cold engine is not ready for a while after it is created. Calls made meanwhile wait in one
 * queue and are sent in the order they were made once Dart answers a ping. (Before, every call
 * retried on its own timer, so a chunk of audio could overtake the "start" that should come first.)
 */
object DartBridge {
    private val main = Handler(Looper.getMainLooper())

    private class Pending(val method: String, val args: Any?, val timeoutMs: Long, val cb: (Any?) -> Unit)

    private val queue = ArrayDeque<Pending>()
    private var pinging = false

    /**
     * [timeoutMs] > 0: if Dart has not answered by then, [cb] gets null (once) instead of never.
     * A call that errors, times out or cannot be delivered reports null.
     */
    fun call(ctx: Context, method: String, args: Any?, timeoutMs: Long = 0, cb: (Any?) -> Unit = {}) {
        if (ImeEngine.retiring) { // an old engine is being shut down: wait for it, then start a fresh one
            main.postDelayed({ call(ctx, method, args, timeoutMs, cb) }, 100)
            return
        }
        ImeEngine.get(ctx)
        if (!ImeEngine.ready) {
            queue.addLast(Pending(method, args, timeoutMs, cb))
            if (!pinging) { pinging = true; ping(ctx, 0) }
            return
        }
        send(method, args, timeoutMs, cb)
    }

    private fun send(method: String, args: Any?, timeoutMs: Long, cb: (Any?) -> Unit) {
        val ch = ImeEngine.channel ?: run { cb(null); return }
        var done = false
        val finish = { r: Any? -> if (!done) { done = true; cb(r) } }
        if (timeoutMs > 0) main.postDelayed({
            if (!done) Log.w("VoiceFlow", "$method timed out after ${timeoutMs}ms")
            finish(null)
        }, timeoutMs)
        ch.invokeMethod(method, args, object : MethodChannel.Result {
            override fun success(r: Any?) = finish(r)
            override fun error(code: String, msg: String?, d: Any?) {
                Log.e("VoiceFlow", "$method failed: $code $msg")
                finish(null)
            }
            override fun notImplemented() = finish(null)
        })
    }

    private fun ping(ctx: Context, attempt: Int) {
        val ch = ImeEngine.channel ?: run { failQueue(); return }
        ch.invokeMethod("ping", null, object : MethodChannel.Result {
            override fun success(r: Any?) {
                ImeEngine.ready = true
                pinging = false
                while (queue.isNotEmpty()) {
                    val p = queue.removeFirst()
                    send(p.method, p.args, p.timeoutMs, p.cb)
                }
            }
            override fun error(code: String, msg: String?, d: Any?) = retry()
            override fun notImplemented() = retry()
            private fun retry() {
                if (attempt < 400) main.postDelayed({ ping(ctx, attempt + 1) }, 50) // ~20 s, then give up
                else { Log.e("VoiceFlow", "Dart engine never answered"); failQueue() }
            }
        })
    }

    private fun failQueue() {
        pinging = false
        val all = queue.toList(); queue.clear()
        all.forEach { it.cb(null) }
    }

    /** The engine was destroyed: anything waiting for it is told it failed. */
    fun engineGone() { failQueue() }
}
