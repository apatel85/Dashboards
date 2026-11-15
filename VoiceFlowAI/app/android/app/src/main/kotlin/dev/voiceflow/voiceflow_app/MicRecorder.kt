package dev.voiceflow.voiceflow_app

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlin.math.abs

/**
 * 16 kHz mono 16-bit capture, streamed in ~100 ms chunks to [onChunk] (called on the capture
 * thread). Nothing is buffered here, so there is no length limit; audio never touches disk.
 */
class MicRecorder(
    private val onChunk: (ByteArray, Float) -> Unit,
    /** Called (on the capture thread) if the microphone stops delivering audio on its own. */
    private val onLost: () -> Unit = {},
) {
    private var rec: AudioRecord? = null
    private var thread: Thread? = null
    @Volatile private var running = false

    @SuppressLint("MissingPermission")
    fun start(): Boolean {
        val min = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (min <= 0) return false
        val r = try {
            AudioRecord(MediaRecorder.AudioSource.MIC, 16000, AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT, maxOf(min, 16000))
        } catch (e: Exception) { return false }
        if (r.state != AudioRecord.STATE_INITIALIZED) { r.release(); return false }
        rec = r
        running = true
        r.startRecording()
        thread = Thread {
            val b = ByteArray(3200)
            while (running) {
                val n = r.read(b, 0, b.size)
                if (n < 0) { if (running) onLost(); break } // mic taken by a call / another app
                if (n > 0) {
                    var peak = 0
                    var i = 0
                    while (i + 1 < n) {
                        val v = abs((b[i].toInt() and 255) or (b[i + 1].toInt() shl 8))
                        if (v > peak) peak = v
                        i += 2
                    }
                    onChunk(b.copyOf(n), minOf(1f, peak / 12000f))
                }
            }
        }.also { it.start() }
        return true
    }

    /** Stops capture. Safe to call twice. */
    fun stop() {
        running = false
        thread?.join(500)
        thread = null
        rec?.let {
            try { it.stop() } catch (_: Exception) {}
            it.release()
        }
        rec = null
    }
}
