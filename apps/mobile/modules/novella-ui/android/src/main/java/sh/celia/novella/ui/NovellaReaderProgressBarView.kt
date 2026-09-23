package sh.celia.novella.ui

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.RelativeLayout
import android.widget.SeekBar
import android.widget.TextView
import androidx.core.content.ContextCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.types.ColorCompat
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.roundToInt

/**
 * Android counterpart of modules/novella-ui/ios/NovellaReaderProgressBarView.swift.
 *
 * A [SeekBar] spanning 0..1 with the current page centered underneath and the
 * remaining-pages text pinned to the trailing edge, mirroring the iOS layout.
 * `SeekBar` is integer based, so progress is carried in [PROGRESS_STEPS]ths and
 * snapped back to the same page boundaries the iOS slider uses.
 */
class NovellaReaderProgressBarView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  val onProgressChange by EventDispatcher<Map<String, Any>>()

  private val slider = SeekBar(context).apply { max = PROGRESS_STEPS }

  private val currentPageLabel = TextView(context).apply {
    typeface = Typeface.MONOSPACE
    setTextSize(TypedValue.COMPLEX_UNIT_SP, LABEL_TEXT_SIZE_SP)
    gravity = Gravity.CENTER
    setTextColor(themeColor(android.R.attr.textColorPrimary, Color.BLACK))
  }

  private val remainingPagesLabel = TextView(context).apply {
    typeface = Typeface.MONOSPACE
    setTextSize(TypedValue.COMPLEX_UNIT_SP, LABEL_TEXT_SIZE_SP)
    gravity = Gravity.CENTER
    setTextColor(themeColor(android.R.attr.textColorSecondary, Color.GRAY))
  }

  private var currentPage = 0
  private var totalPages = 0
  private var progressLabel: String? = null
  private var isProgressDisabled = false

  private val seekListener = object : SeekBar.OnSeekBarChangeListener {
    override fun onProgressChanged(seekBar: SeekBar, progress: Int, fromUser: Boolean) {
      // fromUser keeps the programmatic setProgress() path from echoing an event
      // back to JS while the reader is syncing from a locator change.
      if (!fromUser || isProgressDisabled) return
      val snapped = snappedProgress(progress.toFloat() / PROGRESS_STEPS)
      seekBar.progress = (snapped * PROGRESS_STEPS).roundToInt()
      onProgressChange(mapOf("value" to snapped.toDouble()))
    }

    override fun onStartTrackingTouch(seekBar: SeekBar) = Unit

    override fun onStopTrackingTouch(seekBar: SeekBar) = Unit
  }

  init {
    val container = RelativeLayout(context)
    addView(
      container,
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.MATCH_PARENT
      )
    )

    container.addView(
      slider,
      RelativeLayout.LayoutParams(
        RelativeLayout.LayoutParams.MATCH_PARENT,
        dp(SLIDER_HEIGHT_DP)
      ).apply {
        addRule(RelativeLayout.ALIGN_PARENT_TOP)
        topMargin = dp(SLIDER_TOP_MARGIN_DP)
      }
    )
    container.addView(
      currentPageLabel,
      RelativeLayout.LayoutParams(
        RelativeLayout.LayoutParams.WRAP_CONTENT,
        RelativeLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        addRule(RelativeLayout.ALIGN_PARENT_BOTTOM)
        addRule(RelativeLayout.CENTER_HORIZONTAL)
      }
    )
    container.addView(
      remainingPagesLabel,
      RelativeLayout.LayoutParams(
        RelativeLayout.LayoutParams.WRAP_CONTENT,
        RelativeLayout.LayoutParams.WRAP_CONTENT
      ).apply {
        addRule(RelativeLayout.ALIGN_PARENT_BOTTOM)
        addRule(RelativeLayout.ALIGN_PARENT_END)
        marginEnd = dp(REMAINING_END_MARGIN_DP)
      }
    )

    slider.setOnSeekBarChangeListener(seekListener)
    updatePageLabels()
  }

  fun setProgress(progress: Double) {
    slider.progress = (progress.coerceIn(0.0, 1.0) * PROGRESS_STEPS).roundToInt()
  }

  fun setCurrentPage(page: Int) {
    currentPage = page
    updatePageLabels()
  }

  fun setTotalPages(pages: Int) {
    totalPages = pages
    updatePageLabels()
  }

  fun setProgressLabel(text: String?) {
    progressLabel = text
    updatePageLabels()
  }

  fun setRemainingText(text: String) {
    remainingPagesLabel.text = text.ifEmpty { null }
  }

  fun setDirection(direction: String) {
    slider.layoutDirection = if (direction == "rtl") {
      View.LAYOUT_DIRECTION_RTL
    } else {
      View.LAYOUT_DIRECTION_LTR
    }
  }

  fun setDisabled(disabled: Boolean) {
    isProgressDisabled = disabled
    slider.isEnabled = !disabled
  }

  fun setAccentColor(color: Color?) {
    val argb = if (color == null) FALLBACK_ACCENT_COLOR else ColorCompat.toArgb(color)
    slider.progressTintList = ColorStateList.valueOf(argb)
  }

  private fun updatePageLabels() {
    val label = progressLabel
    if (label != null) {
      currentPageLabel.text = label
      return
    }
    if (totalPages <= 0) {
      currentPageLabel.text = null
      return
    }
    val page = currentPage.coerceIn(1, totalPages)
    currentPageLabel.text = "$page / $totalPages"
  }

  /** Snaps to the same page boundaries the iOS slider rounds to. */
  private fun snappedProgress(value: Float): Float {
    if (totalPages <= 1) {
      return if (totalPages == 1) 1f else value
    }
    val step = 1f / (totalPages - 1)
    return ((value / step).roundToInt() * step).coerceIn(0f, 1f)
  }

  private fun themeColor(attribute: Int, fallback: Int): Int {
    val typedValue = TypedValue()
    if (!context.theme.resolveAttribute(attribute, typedValue, true)) return fallback
    return if (typedValue.resourceId != 0) {
      ContextCompat.getColor(context, typedValue.resourceId)
    } else {
      typedValue.data
    }
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).roundToInt()

  private companion object {
    // iOS tints the track with `.systemPink` when no accent colour is supplied.
    const val FALLBACK_ACCENT_COLOR = 0xFFFF2D55.toInt()
    const val LABEL_TEXT_SIZE_SP = 10f
    const val PROGRESS_STEPS = 1000
    const val REMAINING_END_MARGIN_DP = 12
    const val SLIDER_HEIGHT_DP = 12
    const val SLIDER_TOP_MARGIN_DP = 10
  }
}
