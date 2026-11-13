package dev.voiceflow.voiceflow_app

import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.EditText

/** Native EditText the emulator test types into (spec §10.2 test seam). */
class TestActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
        setContentView(EditText(this).apply {
            contentDescription = "s3_target"
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            gravity = android.view.Gravity.TOP
            requestFocus()
        })
    }
}
