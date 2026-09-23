package sh.celia.novella.ui

import android.content.Context
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.LinearLayout
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * Android counterpart of modules/novella-ui/ios/NovellaSearchBarView.swift.
 *
 * The imperative API (focus/blur/clear/setQuery) and the two events mirror the
 * iOS view; modules/novella-ui/src/native-search-bar.tsx holds the JS contract.
 */
class NovellaSearchBarView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  // The property names are the event names, so they must stay in sync with the
  // Events(...) declaration in NovellaUiModule.
  val onQueryChange by EventDispatcher<Map<String, Any>>()
  val onSearch by EventDispatcher<Map<String, Any>>()

  /** Suppresses [queryWatcher] while the field text is being assigned from props. */
  private var isApplyingNativeQuery = false

  private val queryField = EditText(context).apply {
    setSingleLine(true)
    imeOptions = EditorInfo.IME_ACTION_SEARCH
    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
    background = null
    gravity = Gravity.CENTER_VERTICAL
  }

  private val queryWatcher = object : TextWatcher {
    override fun beforeTextChanged(text: CharSequence?, start: Int, count: Int, after: Int) = Unit

    override fun onTextChanged(text: CharSequence?, start: Int, before: Int, count: Int) = Unit

    override fun afterTextChanged(text: Editable?) {
      if (isApplyingNativeQuery) return
      onQueryChange(mapOf("value" to (text?.toString() ?: "")))
    }
  }

  init {
    addView(
      queryField,
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.MATCH_PARENT
      )
    )
    queryField.addTextChangedListener(queryWatcher)
    queryField.setOnEditorActionListener { _, actionId, _ ->
      val isSubmitAction = actionId == EditorInfo.IME_ACTION_SEARCH ||
        actionId == EditorInfo.IME_ACTION_DONE
      if (!isSubmitAction) {
        return@setOnEditorActionListener false
      }
      onSearch(mapOf("value" to queryField.text?.toString().orEmpty()))
      blur()
      true
    }
  }

  fun setQuery(query: String) {
    // The native field owns any in-flight IME composition. A delayed JS prop
    // update can be older than the text the IME is currently composing, and
    // assigning it here would commit a partial CJK sequence (for example "nih").
    // Android equivalent of the iOS `markedTextRange == nil` guard.
    if (hasActiveComposition()) return
    if (queryField.text?.toString() == query) return
    applyNativeQuery(query)
  }

  fun setPlaceholder(placeholder: String?) {
    queryField.hint = placeholder
  }

  fun setEnabledProp(enabled: Boolean) {
    queryField.isEnabled = enabled
  }

  fun focus() {
    queryField.requestFocus()
    val inputMethodManager =
      context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager ?: return
    inputMethodManager.showSoftInput(queryField, InputMethodManager.SHOW_IMPLICIT)
  }

  fun blur() {
    queryField.clearFocus()
    val inputMethodManager =
      context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager ?: return
    inputMethodManager.hideSoftInputFromWindow(queryField.windowToken, 0)
  }

  fun clear() {
    if (queryField.text.isNullOrEmpty()) return
    applyNativeQuery("")
    onQueryChange(mapOf("value" to ""))
  }

  private fun applyNativeQuery(query: String) {
    isApplyingNativeQuery = true
    try {
      queryField.setText(query)
      queryField.setSelection(query.length)
    } finally {
      isApplyingNativeQuery = false
    }
  }

  /** True while the IME holds an uncommitted composition, e.g. partial pinyin. */
  private fun hasActiveComposition(): Boolean {
    val text = queryField.text ?: return false
    return BaseInputConnection.getComposingSpanStart(text) != -1
  }
}
