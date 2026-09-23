package sh.celia.novella.readium

import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.util.Url

/**
 * Bridges Readium's [Locator] to the plain map shape the JS side declares as
 * `ReadiumLocator` (see `modules/novella-readium/src/novella-readium.types.ts`).
 *
 * The two representations line up field for field, so both directions go
 * through the toolkit's own JSON codec instead of a hand-written mapping:
 * `Locator.toJSON` / `Locator.fromJSON` already know the wire names (notably
 * `href`, `type` and the nested `locations`/`text` objects, which do not match
 * the Kotlin property names) and validate the required ones.
 */
object LocatorUtils {

  /** Readium's JSON key for the media type; the Kotlin property is `mediaType`. */
  private const val TYPE_KEY = "type"

  /**
   * Absent fields are dropped rather than sent as nulls. `ReadiumLocator` declares them
   * optional, and Expo turns a null value into a present-but-null JS field, which the
   * reader would then have to guard against on every read.
   */
  fun toMap(locator: Locator): Map<String, Any> {
    val cleaned = mutableMapOf<String, Any>()
    for ((key, value) in JsonUtils.jsonToMap(locator.toJSON())) {
      if (value != null) cleaned[key] = value
    }
    return cleaned
  }

  /**
   * Returns `null` when the map is not a usable locator. `Locator.fromJSON`
   * already rejects a missing/blank `href` or `type`; an `href` Readium cannot
   * parse as a URL is rejected here for the same reason.
   */
  fun fromMap(value: Map<String, Any?>): Locator? {
    val href = (value["href"] as? String)?.takeIf { it.isNotBlank() } ?: return null
    if (Url(href) == null) return null
    if ((value[TYPE_KEY] as? String)?.isBlank() != false) return null
    return Locator.fromJSON(JsonUtils.mapToJsonObject(value))
  }

  /** Same as [fromMap] but for the optional props, which may legitimately be absent. */
  fun fromMapOrNull(value: Map<String, Any?>?): Locator? = value?.let { fromMap(it) }
}
