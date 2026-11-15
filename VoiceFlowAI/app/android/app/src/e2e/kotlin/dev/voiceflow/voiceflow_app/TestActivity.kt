package dev.voiceflow.voiceflow_app

import android.app.Activity
import android.os.Bundle
import android.text.InputType
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.EditText
import android.widget.LinearLayout
import android.content.Context
import android.view.accessibility.AccessibilityNodeInfo

/** Like WhatsApp's message box: its placeholder is exposed as plain text with no hint flag. */
class PlaceholderEdit(ctx: Context) : EditText(ctx) {
    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        if (text.isNullOrEmpty()) {
            info.text = "Message"
            info.isShowingHintText = false
            info.hintText = null
            info.setTextSelection(0, 0)
        }
    }
}

/** E2E-flavor only: three native fields (plain, email, password) the emulator test types into. */
class TestActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        fun field(desc: String, type: Int, view: EditText = EditText(this)) = view.apply {
            contentDescription = desc
            inputType = type
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (84 * resources.displayMetrics.density).toInt())
        }
        col.addView(field("t_text", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE))
        col.addView(field("t_email", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS))
        col.addView(field("t_hint", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE, PlaceholderEdit(this)))
        col.addView(field("t_password", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD))
        setContentView(col)
        col.getChildAt(0).requestFocus()
    }
}
