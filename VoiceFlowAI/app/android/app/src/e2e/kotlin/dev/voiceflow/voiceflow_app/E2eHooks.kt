package dev.voiceflow.voiceflow_app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import java.io.File

/**
 * E2E-flavor only (never in the shipped APK): lets the emulator test
 *  - install a model it pushed to /sdcard/Download (the real download path is covered on Windows CI),
 *  - feed a WAV through the exact same dictate() path the microphone uses.
 */
class E2eHooks(private val ime: VoiceFlowIME) : ImeHooks {
    private val tag = "E2E"
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            when (i.action) {
                "dev.voiceflow.E2E_INSTALL_MODEL" -> installModel(
                    i.getStringExtra("src") ?: "", i.getStringExtra("id") ?: "",
                    i.getStringExtra("sha") ?: "")
                "dev.voiceflow.E2E_INSTALL_PACK" -> installPack(
                    i.getStringExtra("src") ?: "", i.getStringExtra("name") ?: "")
                "dev.voiceflow.E2E_DICTATE_WAV" -> dictateWav(
                    i.getStringExtra("wav") ?: "", i.getStringExtra("kind"))
            }
        }
    }

    init {
        val f = IntentFilter().apply {
            addAction("dev.voiceflow.E2E_INSTALL_MODEL")
            addAction("dev.voiceflow.E2E_DICTATE_WAV")
            addAction("dev.voiceflow.E2E_INSTALL_PACK")
        }
        if (Build.VERSION.SDK_INT >= 33) {
            ime.registerReceiver(receiver, f, Context.RECEIVER_EXPORTED)
        } else {
            ime.registerReceiver(receiver, f)
        }
    }

    private fun installModel(src: String, id: String, sha: String) {
        try {
            val dst = File(ime.filesDir, "models/$id").apply { mkdirs() }
            File(src).listFiles()?.filter { it.isFile }?.forEach { it.copyTo(File(dst, it.name), true) }
            File(dst, ".verified").writeText(sha)
            Log.i(tag, "MODEL_INSTALLED ${dst.list()?.sorted()}")
        } catch (e: Exception) {
            Log.e(tag, "MODEL_ERROR $e")
        }
    }

    /** Drops a pack file into the user pack folder, exactly where an import would put it. */
    private fun installPack(src: String, name: String) {
        try {
            val dir = File(ime.filesDir, "packs").apply { mkdirs() }
            File(src).copyTo(File(dir, name), true)
            Log.i(tag, "PACK_INSTALLED $name")
        } catch (e: Exception) {
            Log.e(tag, "PACK_ERROR $e")
        }
    }

    private fun dictateWav(path: String, kind: String?) {
        val b = File(path).readBytes()
        // Find the "data" chunk; the fixtures are 16 kHz mono 16-bit PCM.
        var p = 12
        while (p + 8 <= b.size && String(b, p, 4) != "data") {
            p += 8 + (b[p + 4].toInt() and 255 or (b[p + 5].toInt() and 255 shl 8) or
                (b[p + 6].toInt() and 255 shl 16) or (b[p + 7].toInt() and 255 shl 24))
        }
        val pcm = b.copyOfRange(p + 8, b.size)
        ime.dictate(pcm, kind) { r -> Log.i(tag, "RESULT status=${r["status"]} text='${r["text"] ?: ""}'") }
    }

    override fun onDestroy() {
        ime.unregisterReceiver(receiver)
    }
}
