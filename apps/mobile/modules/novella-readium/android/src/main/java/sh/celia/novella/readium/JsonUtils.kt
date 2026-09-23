package sh.celia.novella.readium

import org.json.JSONArray
import org.json.JSONObject

object JsonUtils {

  fun jsonToMap(json: JSONObject): Map<String, Any?> {
    val map = mutableMapOf<String, Any?>()
    val keys = json.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      map[key] = convertValue(json.get(key))
    }
    return map
  }

  /**
   * Inverse of [jsonToMap]. Null values are dropped rather than written as
   * [JSONObject.NULL]: Readium's `fromJSON` helpers read optional fields with
   * `optString`/`optDouble`, which treat an explicit JSON null as a value (an
   * absent key is the only spelling they understand as "unset").
   */
  fun mapToJsonObject(map: Map<String, Any?>): JSONObject {
    val json = JSONObject()
    for ((key, value) in map) {
      putIfPresent(json, key, value)
    }
    return json
  }

  private fun putIfPresent(json: JSONObject, key: String, value: Any?) {
    if (value == null) return
    json.put(key, convertToJsonValue(value))
  }

  private fun convertValue(value: Any?): Any? {
    return when (value) {
      JSONObject.NULL -> null
      is JSONObject -> jsonToMap(value)
      is JSONArray -> jsonToList(value)
      else -> value
    }
  }

  private fun convertToJsonValue(value: Any): Any {
    return when (value) {
      is Map<*, *> -> {
        val json = JSONObject()
        for ((key, entry) in value) {
          if (key is String) putIfPresent(json, key, entry)
        }
        json
      }
      is List<*> -> {
        val array = JSONArray()
        for (item in value) {
          array.put(if (item == null) JSONObject.NULL else convertToJsonValue(item))
        }
        array
      }
      else -> value
    }
  }

  private fun jsonToList(array: JSONArray): List<Any?> {
    val list = mutableListOf<Any?>()
    for (i in 0 until array.length()) {
      list.add(convertValue(array.get(i)))
    }
    return list
  }
}
