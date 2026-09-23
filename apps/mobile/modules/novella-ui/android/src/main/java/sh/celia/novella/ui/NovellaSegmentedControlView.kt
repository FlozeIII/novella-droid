package sh.celia.novella.ui

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.roundToInt

/** Mirrors the `SegmentedControlOption` record declared by the iOS module. */
class SegmentedControlOption : Record {
  @Field var label: String = ""
  @Field var value: String = ""
}

/**
 * Android counterpart of modules/novella-ui/ios/NovellaSegmentedControlView.swift.
 *
 * The iOS view wraps a `UISegmentedControl`. The platform equivalent here is a
 * hand-rolled row of pill-shaped labels rather than a `RadioGroup`, because
 * `CompoundButton` exposes no public API for hiding the indicator glyph, and
 * Material's `MaterialButtonToggleGroup` refuses to inflate under this app's
 * `Theme.AppCompat.*` theme.
 */
class NovellaSegmentedControlView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  val onValueChange by EventDispatcher<Map<String, Any>>()

  private val container = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
  private val segments = mutableListOf<TextView>()

  private var optionValues: List<String> = emptyList()
  private var selectedValue = ""
  private var isGroupEnabled = true

  private val accentColor = themeColor(android.R.attr.colorAccent, FALLBACK_ACCENT_COLOR)
  private val labelColor = themeColor(android.R.attr.textColorPrimary, Color.BLACK)
  private val selectedLabelColor = if (isLightColor(accentColor)) Color.BLACK else Color.WHITE

  init {
    gravity = Gravity.CENTER_VERTICAL
    addView(
      container,
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      )
    )
  }

  fun setOptions(options: List<SegmentedControlOption>?) {
    val entries = options.orEmpty()
    optionValues = entries.map { it.value }
    segments.clear()
    container.removeAllViews()
    entries.forEachIndexed { index, option ->
      val segment = createSegment(option.label) { selectIndex(index) }
      segments.add(segment)
      container.addView(segment)
    }
    // The selected value may have arrived before the options did.
    applySelection()
  }

  fun setSelectedValue(value: String?) {
    selectedValue = value.orEmpty()
    applySelection()
  }

  fun setEnabledProp(enabled: Boolean) {
    isGroupEnabled = enabled
    segments.forEach { it.isEnabled = enabled }
    applySelection()
  }

  private fun selectIndex(index: Int) {
    if (!isGroupEnabled || index !in optionValues.indices) return
    val value = optionValues[index]
    if (value == selectedValue) return
    selectedValue = value
    applySelection()
    onValueChange(mapOf("value" to value))
  }

  private fun applySelection() {
    val selectedIndex = optionValues.indexOf(selectedValue)
    segments.forEachIndexed { index, segment ->
      val isSelected = index == selectedIndex
      segment.background = createSegmentBackground(isSelected)
      segment.setTextColor(if (isSelected) selectedLabelColor else labelColor)
      segment.alpha = if (isGroupEnabled) 1f else 0.5f
    }
  }

  private fun createSegment(label: String, onClick: () -> Unit): TextView = TextView(context).apply {
    text = label
    gravity = Gravity.CENTER
    isEnabled = isGroupEnabled
    setTextSize(TypedValue.COMPLEX_UNIT_SP, SEGMENT_TEXT_SIZE_SP)
    setOnClickListener { onClick() }
    val horizontalPadding = dp(SEGMENT_HORIZONTAL_PADDING_DP)
    val verticalPadding = dp(SEGMENT_VERTICAL_PADDING_DP)
    setPadding(horizontalPadding, verticalPadding, horizontalPadding, verticalPadding)
    layoutParams = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply {
      marginEnd = dp(SEGMENT_GAP_DP)
    }
  }

  private fun createSegmentBackground(selected: Boolean): GradientDrawable = GradientDrawable().apply {
    shape = GradientDrawable.RECTANGLE
    setColor(if (selected) accentColor else Color.TRANSPARENT)
    cornerRadius = dp(SEGMENT_CORNER_RADIUS_DP).toFloat()
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

  private fun isLightColor(color: Int): Boolean {
    val luminance =
      (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255.0
    return luminance > 0.6
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).roundToInt()

  private companion object {
    const val FALLBACK_ACCENT_COLOR = 0xFFFF6B81.toInt()
    const val SEGMENT_CORNER_RADIUS_DP = 8
    const val SEGMENT_GAP_DP = 4
    const val SEGMENT_HORIZONTAL_PADDING_DP = 12
    const val SEGMENT_TEXT_SIZE_SP = 14f
    const val SEGMENT_VERTICAL_PADDING_DP = 6
  }
}
