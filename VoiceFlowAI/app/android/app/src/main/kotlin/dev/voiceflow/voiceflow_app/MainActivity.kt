package dev.voiceflow.voiceflow_app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import android.view.inputmethod.InputMethodManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Setup checklist: read-only status queries plus two system deep links.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "voiceflow/setup")
            .setMethodCallHandler { call, result ->
                val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
                when (call.method) {
                    "keyboardEnabled" ->
                        result.success(imm.enabledInputMethodList.any { it.packageName == packageName })
                    "keyboardSelected" -> {
                        val cur = Settings.Secure.getString(contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
                        result.success(cur != null && cur.startsWith("$packageName/"))
                    }
                    "micGranted" ->
                        result.success(checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
                            PackageManager.PERMISSION_GRANTED)
                    "openKeyboardSettings" -> {
                        startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
                        result.success(null)
                    }
                    "showKeyboardPicker" -> {
                        imm.showInputMethodPicker()
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
