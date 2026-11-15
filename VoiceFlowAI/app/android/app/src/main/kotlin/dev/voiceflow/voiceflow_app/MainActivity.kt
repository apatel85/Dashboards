package dev.voiceflow.voiceflow_app

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private fun accessibilityOn(): Boolean {
        val want = ComponentName(this, VoiceFlowAccessibilityService::class.java).flattenToString()
        val list = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
            ?: return false
        return list.split(':').any { it.equals(want, ignoreCase = true) }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Setup checklist: read-only status queries, system deep links, and show/hide of the button.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "voiceflow/setup")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "micGranted" ->
                        result.success(checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
                            PackageManager.PERMISSION_GRANTED)
                    "overlayGranted" -> result.success(Settings.canDrawOverlays(this))
                    "accessibilityEnabled" -> result.success(accessibilityOn())
                    "bubbleRunning" -> result.success(FloatingService.running)
                    "openOverlaySettings" -> {
                        startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:$packageName")))
                        result.success(null)
                    }
                    "openAccessibilitySettings" -> {
                        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                        result.success(null)
                    }
                    "listApps" -> {
                        val pm = packageManager
                        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                        val apps = pm.queryIntentActivities(intent, 0)
                            .map { mapOf("id" to it.activityInfo.packageName, "name" to it.loadLabel(pm).toString()) }
                            .distinctBy { it["id"] }
                            .sortedBy { (it["name"] as String).lowercase() }
                        result.success(apps)
                    }
                    "openAppInfo" -> {
                        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:$packageName")))
                        result.success(null)
                    }
                    "showBubble" -> {
                        ContextCompat.startForegroundService(this, Intent(this, FloatingService::class.java))
                        result.success(null)
                    }
                    "hideBubble" -> {
                        startService(Intent(this, FloatingService::class.java)
                            .setAction(FloatingService.ACTION_STOP))
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
