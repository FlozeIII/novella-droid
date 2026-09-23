package sh.celia.novella.readium

import org.readium.r2.navigator.epub.EpubPreferences
import org.readium.r2.navigator.preferences.Color
import org.readium.r2.navigator.preferences.ColumnCount
import org.readium.r2.shared.ExperimentalReadiumApi

/**
 * Translates the `ReadiumReaderPreferences` map the JS side sends into the
 * toolkit's [EpubPreferences]. This mirrors, field for field, what the iOS
 * implementation builds in `NovellaReadiumView.makePreferences()`; keep the two
 * in sync, since `mode`/`doublePage` are the only platform-independent readers
 * of the same JS contract.
 */
object PreferencesUtils {

  /** Anything other than `"paged"` means continuous scrolling, as on iOS. */
  private const val PAGED_MODE = "paged"

  // EpubPreferences carries no stability guarantee across toolkit releases; it is
  // the only reader-preferences type 3.1.0 exposes for EPUB.
  @OptIn(ExperimentalReadiumApi::class)
  fun toEpubPreferences(preferences: Map<String, Any?>): EpubPreferences {
    val isPaged = preferences.string("mode") == PAGED_MODE
    val doublePage = preferences.boolean("doublePage") == true

    return EpubPreferences(
      backgroundColor = preferences.string("backgroundColor")?.let(::readiumColor),
      // Readium only honours a column count while paginating; asking for one in
      // scroll mode makes it lay the content out in columns it never scrolls.
      columnCount = if (isPaged) {
        if (doublePage) ColumnCount.TWO else ColumnCount.ONE
      } else {
        null
      },
      fontSize = preferences.number("fontSize"),
      lineHeight = preferences.number("lineHeight"),
      pageMargins = preferences.number("pageMargins"),
      paragraphIndent = preferences.number("paragraphIndent"),
      paragraphSpacing = preferences.number("paragraphSpacing"),
      // The synthesized EPUB ships Novella's own reader.css; publisher styles
      // would fight the colours and metrics the user picked.
      publisherStyles = false,
      scroll = !isPaged,
      textColor = preferences.string("textColor")?.let(::readiumColor),
    )
  }

  /**
   * Parses the CSS hex colours the JS side emits (`createReadiumReaderPreferences`
   * normalizes to `#RRGGBB`, but `#RGB`/`#RRGGBBAA` are accepted defensively).
   * Returns `null` for anything unparseable so the preference stays unset rather
   * than applying black.
   */
  fun readiumColor(value: String): Color? {
    val hex = value.trim().removePrefix("#")
    val rgb = when (hex.length) {
      3 -> hex.map { "$it$it" }.joinToString(separator = "")
      6 -> hex
      // Reader surfaces are intentionally opaque; drop the alpha channel.
      8 -> hex.substring(0, 6)
      else -> return null
    }
    val parsed = rgb.toLongOrNull(radix = 16) ?: return null
    return Color((0xFF000000L or parsed).toInt())
  }

  private fun Map<String, Any?>.string(key: String): String? = this[key] as? String

  private fun Map<String, Any?>.boolean(key: String): Boolean? = this[key] as? Boolean

  /** JS numbers arrive as whatever `Number` subclass the bridge picked. */
  private fun Map<String, Any?>.number(key: String): Double? = (this[key] as? Number)?.toDouble()
}
