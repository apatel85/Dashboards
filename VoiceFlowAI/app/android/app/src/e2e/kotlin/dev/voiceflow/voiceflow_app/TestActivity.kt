package dev.voiceflow.voiceflow_app

import android.app.Activity
import android.os.Bundle
import android.text.InputType
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.EditText
import android.widget.LinearLayout

/** E2E-flavor only: three native fields (plain, email, password) the emulator test types into. */
class TestActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        fun field(desc: String, type: Int) = EditText(this).apply {
            contentDescription = desc
            inputType = type
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (84 * resources.displayMetrics.density).toInt())
        }
        col.addView(field("t_text", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE))
        col.addView(field("t_email", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS))
        col.addView(field("t_password", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD))
        setContentView(col)
        col.getChildAt(0).requestFocus()
    }
}
