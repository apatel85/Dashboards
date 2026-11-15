package dev.voiceflow.voiceflow_app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.View

enum class BubbleState { IDLE, LISTENING, PROCESSING, DISABLED }

/** The floating button: a round mic that turns red while listening and pulses with your voice. */
class BubbleView(ctx: Context) : View(ctx) {
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 4f }
    private val glyph = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE; style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND
    }
    private val glyphFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
    private var level = 0f
    var state = BubbleState.IDLE
        set(v) { field = v; refresh() }

    init { refresh() }

    fun setLevel(l: Float) { level = l; invalidate() }

    private fun refresh() {
        contentDescription = when (state) {
            BubbleState.IDLE -> context.getString(R.string.vf_cd_dictate)
            BubbleState.LISTENING -> context.getString(R.string.vf_cd_stop)
            BubbleState.PROCESSING -> context.getString(R.string.vf_working)
            BubbleState.DISABLED -> context.getString(R.string.vf_cd_dictate)
        }
        invalidate()
    }

    override fun onDraw(c: Canvas) {
        val w = width.toFloat(); val cx = w / 2; val cy = height / 2f; val r = w / 2 - 6
        fill.color = when (state) {
            BubbleState.IDLE -> Color.parseColor("#2563EB")
            BubbleState.LISTENING -> Color.parseColor("#DC2626")
            BubbleState.PROCESSING -> Color.parseColor("#D97706")
            BubbleState.DISABLED -> Color.parseColor("#6B7280")
        }
        if (state == BubbleState.LISTENING) {
            ring.color = Color.argb(120, 220, 38, 38)
            c.drawCircle(cx, cy, r + 2 + level * 4, ring)
        }
        c.drawCircle(cx, cy, r, fill)
        // microphone glyph
        val u = w / 56f
        glyph.strokeWidth = 2.5f * u
        c.drawRoundRect(RectF(cx - 5 * u, cy - 14 * u, cx + 5 * u, cy + 3 * u), 5 * u, 5 * u, glyphFill)
        val arc = Path().apply { addArc(RectF(cx - 10 * u, cy - 8 * u, cx + 10 * u, cy + 10 * u), 20f, 140f) }
        c.drawPath(arc, glyph)
        c.drawLine(cx, cy + 10 * u, cx, cy + 15 * u, glyph)
        c.drawLine(cx - 5 * u, cy + 15 * u, cx + 5 * u, cy + 15 * u, glyph)
        if (state == BubbleState.PROCESSING) {
            ring.color = Color.WHITE
            c.drawCircle(cx, cy, r - 3, ring)
        }
    }
}
