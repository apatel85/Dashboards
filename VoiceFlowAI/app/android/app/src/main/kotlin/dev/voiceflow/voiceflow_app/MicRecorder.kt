package dev.voiceflow.voiceflow_app

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import java.io.ByteArrayOutputStream
import kotlin.math.abs

/** 16 kHz mono 16-bit capture into memory. Audio never touches disk. */
class MicRecorder(private val onLevel: (Float) -> Unit) {
    private var rec: AudioRecord? = null
    private var thread: Thread? = null
    @Volatile private var running = false
    private val buf = ByteArrayOutputStream()

    @SuppressLint("MissingPermission")
    fun start(): Boolean {
        val min = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (min <= 0) return false
        val r = try {
            AudioRecord(MediaRecorder.AudioSource.MIC, 16000, AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT, maxOf(min, 16000))
        } catch (e: Exception) { return false }
        if (r.state != AudioRecord.STATE_INITIALIZED) { r.release(); return false }
        synchronized(buf) { buf.reset() }
        rec = r
        running = true
        r.startRecording()
        thread = Thread {
            val b = ByteArray(3200)
            while (running) {
                val n = r.read(b, 0, b.size)
                if (n < 0) break
                if (n > 0) {
                    synchronized(buf) { buf.write(b, 0, n) }
                    var peak = 0
                    var i = 0
                    while (i + 1 < n) {
                        val v = abs((b[i].toInt() and 255) or (b[i + 1].toInt() shl 8))
                        if (v > peak) peak = v
                        i += 2
                    }
                    onLevel(minOf(1f, peak / 12000f))
                }
            }
        }.also { it.start() }
        return true
    }

    /** Stops and returns everything captured. Safe to call twice. */
    fun stop(): ByteArray {
        running = false
        thread?.join(500)
        thread = null
        rec?.let {
            try { it.stop() } catch (_: Exception) {}
            it.release()
        }
        rec = null
        return synchronized(buf) { buf.toByteArray() }
    }
}
