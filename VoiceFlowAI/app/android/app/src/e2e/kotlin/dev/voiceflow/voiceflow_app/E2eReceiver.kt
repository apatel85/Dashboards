package dev.voiceflow.voiceflow_app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.io.File

/**
 * E2E flavor only (never in the shipped APK): lets the emulator test
 *  - install a model it pushed to /sdcard/Download (the real download path is covered separately),
 *  - drop a pack file where an import would put it,
 *  - feed a WAV through the exact same path the microphone uses (the emulator mic is silent).
 */
class E2eReceiver : BroadcastReceiver() {
    private val tag = "E2E"
    override fun onReceive(c: Context, i: Intent) {
        when (i.action) {
            "dev.voiceflow.E2E_INSTALL_MODEL" -> installModel(c,
                i.getStringExtra("src") ?: "", i.getStringExtra("id") ?: "", i.getStringExtra("sha") ?: "")
            "dev.voiceflow.E2E_INSTALL_PACK" -> installPack(c,
                i.getStringExtra("src") ?: "", i.getStringExtra("name") ?: "")
            "dev.voiceflow.E2E_DICTATE_WAV" -> dictateWav(i.getStringExtra("wav") ?: "")
        }
    }

    private fun installModel(c: Context, src: String, id: String, sha: String) {
        try {
            val dst = File(c.filesDir, "models/$id").apply { mkdirs() }
            File(src).listFiles()?.filter { it.isFile }?.forEach { it.copyTo(File(dst, it.name), true) }
            File(dst, ".verified").writeText(sha)
            Log.i(tag, "MODEL_INSTALLED ${dst.list()?.sorted()}")
        } catch (e: Exception) { Log.e(tag, "MODEL_ERROR $e") }
    }

    private fun installPack(c: Context, src: String, name: String) {
        try {
            val dir = File(c.filesDir, "packs").apply { mkdirs() }
            File(src).copyTo(File(dir, name), true)
            Log.i(tag, "PACK_INSTALLED $name")
        } catch (e: Exception) { Log.e(tag, "PACK_ERROR $e") }
    }

    private fun dictateWav(path: String) {
        val b = File(path).readBytes()
        // Find the "data" chunk; the fixtures are 16 kHz mono 16-bit PCM.
        var p = 12
        while (p + 8 <= b.size && String(b, p, 4) != "data") {
            p += 8 + (b[p + 4].toInt() and 255 or (b[p + 5].toInt() and 255 shl 8) or
                (b[p + 6].toInt() and 255 shl 16) or (b[p + 7].toInt() and 255 shl 24))
        }
        val pcm = b.copyOfRange(p + 8, b.size)
        val s = FloatingService.instance
        if (s == null) { Log.e(tag, "RESULT status=noService text=''"); return }
        s.dictatePcm(pcm)
    }
}
