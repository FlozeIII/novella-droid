package sh.celia.novella.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.UUID
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Android counterpart of modules/novella-ui/ios/ReaderImageRasterizer.swift.
 *
 * The source is read once (from local storage for `file://` URIs, over HTTP
 * otherwise), downscaled so that its longest edge is at most `maxPixelSize`,
 * and cached under `cacheDirectory` as a PNG when the source can carry alpha
 * and as a JPEG otherwise. The returned value is a `file://` URI that JS can
 * hand straight to `<Image source={{ uri }} />`.
 */
object ReaderImageRasterizer {
  private const val MAXIMUM_PIXEL_SIZE = 2048
  private const val CACHE_DIRECTORY_NAME = "NovellaReaderImageRasterizer"
  private const val JPEG_COMPRESSION_QUALITY = 88
  private const val CONNECT_TIMEOUT_MS = 15_000
  private const val READ_TIMEOUT_MS = 30_000

  @Throws(IOException::class)
  fun rasterize(uri: String, maxPixelSize: Int, cacheDirectory: File): String {
    val boundedPixelSize = maxPixelSize.coerceIn(1, MAXIMUM_PIXEL_SIZE)
    val directory = File(cacheDirectory, CACHE_DIRECTORY_NAME)
    if (!directory.isDirectory && !directory.mkdirs()) {
      throw IOException("Reader image cache directory is unavailable")
    }

    val cacheBase = File(directory, cacheFileName(uri, boundedPixelSize))
    existingCacheFile(cacheBase)?.let { return Uri.fromFile(it).toString() }

    val source = readSource(uri)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(source, 0, source.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      throw IOException("Reader image data is not decodable")
    }

    val decodeOptions = BitmapFactory.Options().apply {
      inSampleSize = sampleSizeFor(bounds.outWidth, bounds.outHeight, boundedPixelSize)
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    val decoded = BitmapFactory.decodeByteArray(source, 0, source.size, decodeOptions)
      ?: throw IOException("Reader image thumbnail could not be created")

    // BitmapFactory always decodes into an alpha-capable config, so the source
    // container format is the only reliable alpha signal. This matches the iOS
    // implementation, where ImageIO reports an opaque alphaInfo for JPEG.
    val preservesAlpha = bounds.outMimeType != "image/jpeg"
    val target = File(cacheBase.path + if (preservesAlpha) ".png" else ".jpg")

    val thumbnail = scaleToLongestEdge(decoded, boundedPixelSize)
    try {
      writeAtomically(thumbnail, target, preservesAlpha)
    } finally {
      if (thumbnail !== decoded) {
        thumbnail.recycle()
      }
      decoded.recycle()
    }

    return Uri.fromFile(target).toString()
  }

  private fun existingCacheFile(cacheBase: File): File? {
    for (fileExtension in arrayOf("jpg", "png")) {
      val candidate = File("${cacheBase.path}.$fileExtension")
      if (candidate.isFile) {
        return candidate
      }
    }
    return null
  }

  private fun readSource(uri: String): ByteArray {
    val parsed = Uri.parse(uri)
    if (parsed.scheme == null || parsed.scheme == "file") {
      val path = parsed.path ?: throw IOException("Reader image URI is invalid")
      return File(path).readBytes()
    }

    val connection = URL(uri).openConnection() as HttpURLConnection
    try {
      connection.connectTimeout = CONNECT_TIMEOUT_MS
      connection.readTimeout = READ_TIMEOUT_MS
      // Redirects are followed rather than reported, matching the iOS
      // implementation's 200..<400 accepted range.
      connection.instanceFollowRedirects = true
      val status = connection.responseCode
      if (status !in 200..399) {
        throw IOException("Reader image request failed with HTTP status $status")
      }
      return connection.inputStream.use { it.readBytes() }
    } finally {
      connection.disconnect()
    }
  }

  /**
   * Largest power-of-two subsampling factor that still keeps the longest edge at
   * or above [maxPixelSize]; [scaleToLongestEdge] then trims the remainder.
   */
  private fun sampleSizeFor(width: Int, height: Int, maxPixelSize: Int): Int {
    var sampleSize = 1
    while (max(width, height) / (sampleSize * 2) >= maxPixelSize) {
      sampleSize *= 2
    }
    return sampleSize
  }

  private fun scaleToLongestEdge(bitmap: Bitmap, maxPixelSize: Int): Bitmap {
    val longestEdge = max(bitmap.width, bitmap.height)
    if (longestEdge <= maxPixelSize) {
      return bitmap
    }
    val scale = maxPixelSize.toFloat() / longestEdge
    val width = max(1, (bitmap.width * scale).roundToInt())
    val height = max(1, (bitmap.height * scale).roundToInt())
    return Bitmap.createScaledBitmap(bitmap, width, height, true)
  }

  private fun writeAtomically(bitmap: Bitmap, target: File, preservesAlpha: Boolean) {
    val temporary = File(target.parentFile, "${target.name}.${UUID.randomUUID()}.tmp")
    try {
      FileOutputStream(temporary).use { stream ->
        val format = if (preservesAlpha) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG
        if (!bitmap.compress(format, JPEG_COMPRESSION_QUALITY, stream)) {
          throw IOException("Reader image thumbnail could not be written")
        }
      }
      if (!temporary.renameTo(target) && !target.isFile) {
        throw IOException("Reader image thumbnail could not be written")
      }
    } finally {
      temporary.delete()
    }
  }

  private fun cacheFileName(uri: String, maxPixelSize: Int): String {
    val digest = MessageDigest.getInstance("SHA-256").digest("$uri|$maxPixelSize".toByteArray())
    return digest.joinToString(separator = "") { "%02x".format(it.toInt() and 0xFF) }
  }
}
