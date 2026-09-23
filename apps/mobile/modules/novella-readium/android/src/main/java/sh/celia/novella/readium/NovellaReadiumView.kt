package sh.celia.novella.readium

import android.content.Context
import android.net.Uri
import android.webkit.JavascriptInterface
import androidx.fragment.app.FragmentActivity
import androidx.fragment.app.FragmentContainerView
import androidx.fragment.app.FragmentFactory
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import expo.modules.kotlin.viewevent.EventDispatcher
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.yield
import org.readium.r2.navigator.HyperlinkNavigator
import org.readium.r2.navigator.epub.EpubNavigatorFactory
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.navigator.input.DragEvent
import org.readium.r2.navigator.input.InputListener
import org.readium.r2.navigator.input.KeyEvent
import org.readium.r2.navigator.input.TapEvent
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.util.AbsoluteUrl
import org.readium.r2.shared.util.Url
import org.readium.r2.shared.util.asset.AssetRetriever
import org.readium.r2.shared.util.data.ReadError
import org.readium.r2.shared.util.file.DirectoryContainer
import org.readium.r2.shared.util.format.FormatHints
import org.readium.r2.shared.util.Try
import org.readium.r2.shared.util.http.DefaultHttpClient
import org.readium.r2.shared.util.mediatype.MediaType
import org.readium.r2.streamer.PublicationOpener
import org.readium.r2.streamer.parser.DefaultPublicationParser
import java.io.File
import kotlin.math.abs

/**
 * Renders one chapter of a Novella publication with the Readium navigator.
 *
 * The JS side writes a real (unzipped) EPUB to the cache directory and hands over the
 * directory URI plus the list of hrefs it declared. Because the publication is a
 * directory rather than an archive, it is opened through `DirectoryContainer` +
 * `AssetRetriever.retrieve(Container)` — no custom Container implementation and no
 * zipping is needed.
 *
 * Only one chapter is mounted at a time: the reading order handed to the navigator is
 * narrowed to the chapter the locator points at. Advancing past its end therefore fails
 * inside the navigator, which is exactly the signal [onBoundary] forwards so JS can swap
 * in the next chapter.
 *
 * Behavior mirrors `ios/NovellaReadiumView.swift`. It cannot mirror it exactly in places
 * where 3.1.0 exposes no equivalent API; every such spot is marked with a `Divergence
 * from iOS` comment explaining what iOS does instead and why it is unavailable here.
 *
 * The toolkit marks most of the navigator API as experimental, hence the class-wide
 * opt-in. That risk is contained by the version pin documented in `build.gradle`: the
 * point of sitting on 3.1.0 is that its API surface cannot shift underneath this file.
 */
@OptIn(ExperimentalReadiumApi::class)
class NovellaReadiumView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

  // Event names must match the `Events(...)` declaration in NovellaReadiumModule, and the
  // property names are the wire names — Expo derives one from the other.
  val onReady by EventDispatcher<Map<String, Any>>()
  val onLocatorChange by EventDispatcher<Map<String, Any>>()
  val onLink by EventDispatcher<Map<String, Any>>()
  val onImage by EventDispatcher<Map<String, Any>>()
  val onError by EventDispatcher<Map<String, Any>>()
  val onStatus by EventDispatcher<Map<String, Any>>()
  val onTap by EventDispatcher<Map<String, Any>>()
  val onBoundary by EventDispatcher<Map<String, Any>>()

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  private val container = FragmentContainerView(context).apply {
    id = R.id.novella_readium_host_container
    layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
  }

  private var navigator: EpubNavigatorFragment? = null
  private var hostFragment: NovellaReadiumHostFragment? = null
  private var openJob: Job? = null
  private var locatorJob: Job? = null

  /** True once the navigator reported its first locator, i.e. the first page is up. */
  private var isReady = false

  /** Set before the navigator mounts, mounted later when the view reaches the window. */
  private var pendingFactory: FragmentFactory? = null

  /** Href the navigator was mounted at, reported alongside the install statuses. */
  private var installedHref: String? = null

  private var suppressNextTap = false
  private var lastBoundaryEventAt = 0L

  /**
   * Progression of the most recently reported locator. Used to decide whether a drag is
   * asking to leave the chapter, since 3.1.0 exposes no scroll-offset query.
   */
  private var lastProgression = 0.0

  // ---------------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------------

  var publicationUri: String? = null
    set(value) {
      if (field != value) {
        field = value
        scheduleOpen()
      }
    }

  var publicationId: String? = null
    set(value) {
      if (field != value) {
        field = value
        scheduleOpen()
      }
    }

  var declaredHrefs: List<String>? = null
    set(value) {
      field = value
      scheduleOpen()
    }

  var initialLocator: Map<String, Any>? = null
    set(value) {
      field = value
      scheduleOpen()
    }

  var preferences: Map<String, Any>? = null
    set(value) {
      field = value
      applyPreferences()
    }

  var contentInsets: Map<String, Double>? = null
    set(value) {
      field = value
      applyContentInsets()
    }

  // ---------------------------------------------------------------------------------
  // View lifecycle
  // ---------------------------------------------------------------------------------

  init {
    addView(container)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    mountNavigatorIfPossible()
  }

  override fun onDetachedFromWindow() {
    detachNavigator()
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    applyContentInsets()
  }

  /**
   * Called from the module's `OnViewDestroys`. Detaching on every `onDetachedFromWindow`
   * is not enough on its own: a detached view can still be holding an open job, and the
   * scope would outlive it.
   */
  fun dispose() {
    openJob?.cancel()
    detachNavigator()
    scope.cancel()
  }

  // ---------------------------------------------------------------------------------
  // Opening
  // ---------------------------------------------------------------------------------

  /**
   * Props arrive in arbitrary order, so every input that feeds the open chain calls this
   * and the last call wins. The guard makes the earlier ones no-ops, and cancelling the
   * in-flight job means a half-configured open never installs a navigator.
   */
  private fun scheduleOpen() {
    openJob?.cancel()
    val id = publicationId
    val hrefs = declaredHrefs
    val uri = publicationUri
    if (id.isNullOrEmpty() || hrefs.isNullOrEmpty() || uri.isNullOrEmpty()) return

    isReady = false
    onStatus(payload("stage" to "opening", "href" to LocatorUtils.fromMapOrNull(initialLocator)?.href?.toString()))
    openJob = scope.launch {
      // Let the remaining props land before doing any work.
      yield()
      try {
        val publication = openPublication(uri, hrefs)
        // Parsing suspends, so a newer scheduleOpen may have cancelled this job while it
        // ran and already queued a different chapter. Installing now would mount the
        // chapter the reader just navigated away from.
        if (!isActive) return@launch
        install(publication)
      } catch (cancellation: CancellationException) {
        throw cancellation
      } catch (error: Exception) {
        onError(
          payload(
            "code" to "open_failed",
            "message" to error.toString(),
            "recoverable" to true,
          )
        )
      }
    }
  }

  private suspend fun openPublication(uri: String, hrefs: List<String>): Publication {
    val directory = directoryFromUri(uri)
      ?: throw IllegalArgumentException("publication URI is not a local file: $uri")
    val entries = hrefs.mapNotNull { Url(it) }.toSet()

    val httpClient = DefaultHttpClient()
    val assetRetriever = AssetRetriever(context.contentResolver, httpClient)
    val parser = DefaultPublicationParser(
      context = context,
      httpClient = httpClient,
      assetRetriever = assetRetriever,
      // EPUB only. PDF support is an opt-in adapter that is not a dependency here.
      pdfFactory = null,
    )
    val opener = PublicationOpener(publicationParser = parser)

    val container = DirectoryContainer(root = directory, entries = entries)
    val asset = assetRetriever
      .retrieve(container, FormatHints(mediaType = MediaType.EPUB))
      .orThrow("could not read the publication directory")
    // No LCP or other content protection is configured, so there is nothing to prompt for.
    val publication = opener.open(asset, allowUserInteraction = false)
      .orThrow("could not open the publication")

    return publication
  }

  /**
   * `Try.getOrThrow()` only accepts a `Throwable` failure, and Readium's error types are
   * sealed classes that do not extend it, so unwrap with the message preserved instead.
   */
  private fun <S, F> Try<S, F>.orThrow(message: String): S =
    getOrNull() ?: throw IllegalStateException("$message: ${failureOrNull()}")

  /** `file://` from expo-file-system; anything else cannot be opened as a directory. */
  private fun directoryFromUri(uri: String): File? {
    val parsed = Uri.parse(uri)
    val path = if (parsed.scheme == "file") parsed.path else null
    return path?.let { File(it) }
  }

  private fun install(publication: Publication) {
    val requested = LocatorUtils.fromMapOrNull(initialLocator)
    val readingOrder = publication.readingOrder
    val requestedHref = requested?.href?.toString()
    val matchedLink = requestedHref?.let { href ->
      readingOrder.firstOrNull { hrefMatches(it.href.toString(), href) }
    }
    val targetLink = matchedLink ?: readingOrder.firstOrNull()

    if (targetLink == null) {
      onError(
        payload(
          "code" to "navigator_failed",
          "message" to "publication has no reading order",
          "recoverable" to true,
        )
      )
      return
    }

    // The stored position only means anything if it belongs to the chapter we are about to
    // mount. It is re-hung on the link's own href rather than reused verbatim, so that the
    // locator is spelled the way the reading order is even when the two spellings differ
    // (see [hrefMatches]); a mismatched href would make the navigator fail to load the
    // resource and the reader would open blank.
    val linkLocator = publication.locatorFromLink(targetLink)
    val initialLocation = if (requested == null || matchedLink == null || linkLocator == null) {
      linkLocator
    } else {
      Locator(
        href = linkLocator.href,
        mediaType = linkLocator.mediaType,
        title = linkLocator.title,
        locations = requested.locations,
        text = requested.text,
      )
    }
    if (initialLocation == null) {
      onError(
        payload(
          "code" to "navigator_failed",
          "message" to "could not build a locator for ${targetLink.href}",
          "recoverable" to true,
        )
      )
      return
    }

    onStatus(
      payload(
        "stage" to "publicationOpened",
        "detail" to "readingOrder=${readingOrder.size}",
        "href" to initialLocation.href.toString(),
      )
    )

    val configuration = EpubNavigatorFragment.Configuration(
      // Our insets cover the app's own header, not the system bars, so we apply them
      // ourselves rather than letting the navigator consume the window insets.
      shouldApplyInsetsPadding = false,
    ).apply {
      registerJavascriptInterface(IMAGE_BRIDGE_NAME) { ImageBridge() }
    }

    val factory = EpubNavigatorFactory(publication).createFragmentFactory(
      initialLocator = initialLocation,
      readingOrder = listOf(targetLink),
      initialPreferences = PreferencesUtils.toEpubPreferences(preferences ?: emptyMap()),
      listener = navigatorListener,
      configuration = configuration,
    )

    pendingFactory = factory
    installedHref = initialLocation.href.toString()
    mountNavigatorIfPossible()
  }

  /**
   * The generated OPF declares each chapter relative to the package document
   * (`chapters/1.xhtml`, in `EPUB/package.opf`) while the JS locator uses the path from the
   * publication root (`EPUB/chapters/1.xhtml`). Which spelling Readium surfaces on
   * `Link.href` depends on whether it keeps the manifest spelling or resolves it against
   * the publication base, and that cannot be settled without a device. Accept either
   * spelling rather than silently dropping the reader back to the chapter start.
   */
  private fun hrefMatches(linkHref: String, requestedHref: String): Boolean =
    linkHref == requestedHref ||
      linkHref.endsWith("/$requestedHref") ||
      requestedHref.endsWith("/$linkHref")

  /**
   * Mounts the navigator into the activity. Deferred until the view is attached, because
   * the transaction resolves its container by id through the activity's view tree.
   */
  private fun mountNavigatorIfPossible() {
    if (navigator != null) return
    val factory = pendingFactory ?: return
    if (!isAttachedToWindow) return
    val activity = appContext.currentActivity as? FragmentActivity
    if (activity == null) {
      onError(
        payload(
          "code" to "navigator_failed",
          "message" to "the hosting activity is not a FragmentActivity",
          "recoverable" to false,
        )
      )
      return
    }

    try {
      detachNavigator()
      val host = NovellaReadiumHostFragment().apply {
        factoryProvider = { factory }
        navigatorFragmentClass = EpubNavigatorFragment::class.java
      }
      activity.supportFragmentManager
        .beginTransaction()
        .replace(R.id.novella_readium_host_container, host, HOST_TAG)
        .commitNow()
      hostFragment = host

      // The host adds the navigator with commitNow in its own onViewCreated, so by the
      // time the transaction above returns it already exists.
      val mounted = host.childFragmentManager
        .findFragmentById(R.id.novella_readium_navigator_container) as? EpubNavigatorFragment
      if (mounted == null) {
        throw IllegalStateException("the navigator fragment was not created")
      }
      navigator = mounted
      mounted.addInputListener(inputListener)
    } catch (error: Exception) {
      onError(
        payload(
          "code" to "navigator_failed",
          "message" to error.toString(),
          "recoverable" to true,
        )
      )
      return
    }

    onStatus(payload("stage" to "navigatorInstalled", "href" to installedHref))
    applyContentInsets()
    observeLocator()
  }

  private fun detachNavigator() {
    locatorJob?.cancel()
    locatorJob = null
    navigator?.removeInputListener(inputListener)
    navigator = null
    isReady = false
    val host = hostFragment ?: return
    hostFragment = null
    host.parentFragmentManager
      .beginTransaction()
      .remove(host)
      .commitNowAllowingStateLoss()
  }

  // ---------------------------------------------------------------------------------
  // Applying state to a live navigator
  // ---------------------------------------------------------------------------------

  private fun applyPreferences() {
    val preferences = preferences ?: return
    navigator?.submitPreferences(PreferencesUtils.toEpubPreferences(preferences))
  }

  /**
   * Divergence from iOS: `EPUBNavigatorViewController` has a content-inset callback,
   * `EpubNavigatorFragment` does not, so the insets become padding on the container.
   */
  private fun applyContentInsets() {
    val insets = contentInsets ?: return
    container.setPadding(
      (insets["left"] ?: 0.0).toInt(),
      (insets["top"] ?: 0.0).toInt(),
      (insets["right"] ?: 0.0).toInt(),
      (insets["bottom"] ?: 0.0).toInt(),
    )
  }

  private fun observeLocator() {
    val mounted = navigator ?: return
    locatorJob?.cancel()
    locatorJob = scope.launch {
      mounted.currentLocator.collect { locator ->
        lastProgression = locator.locations.progression ?: lastProgression
        if (!isReady) {
          isReady = true
          onStatus(payload("stage" to "resourceLoaded", "href" to locator.href.toString()))
          onReady(emptyMap())
        }
        // Divergence from iOS: `bridgeLocator` there rewrites the progression to the
        // visible viewport's trailing edge using `viewport.resources[].progression`. That
        // per-resource range does not exist in 3.1.0, so the toolkit's own progression is
        // forwarded unchanged. The reader slider is therefore right everywhere except a
        // chapter's last page, which reports its first visible point instead of 100%.
        onLocatorChange(LocatorUtils.toMap(locator))
      }
    }
  }

  // ---------------------------------------------------------------------------------
  // Public API (AsyncFunction targets)
  // ---------------------------------------------------------------------------------

  fun getCurrentLocator(): Map<String, Any>? =
    navigator?.currentLocator?.value?.let(LocatorUtils::toMap)

  fun goToLocator(locator: Map<String, Any>?): Boolean {
    val mounted = navigator ?: return false
    val parsed = LocatorUtils.fromMapOrNull(locator) ?: return false
    return mounted.go(parsed, animated = false)
  }

  fun goToProgression(progression: Double): Boolean {
    val mounted = navigator ?: return false
    val current = mounted.currentLocator.value ?: return false
    val target = Locator(
      href = current.href,
      mediaType = MediaType.XHTML,
      locations = Locator.Locations(progression = progression.coerceIn(0.0, 1.0)),
    )
    return mounted.go(target, animated = false)
  }

  fun goForward(): Boolean = navigator?.goForward(animated = false) ?: false

  fun goBackward(): Boolean = navigator?.goBackward(animated = false) ?: false

  // ---------------------------------------------------------------------------------
  // Navigator events
  // ---------------------------------------------------------------------------------

  private val navigatorListener = object : EpubNavigatorFragment.Listener {
    override fun shouldFollowInternalLink(
      link: Link,
      context: HyperlinkNavigator.LinkContext?,
    ): Boolean {
      // Divergence from iOS: its note callback carries a `referrer`, and Android's
      // FootnoteContext only carries the note body.
      val noteContent = (context as? HyperlinkNavigator.FootnoteContext)?.noteContent
      onLink(
        payload(
          "href" to link.href.toString(),
          "title" to link.title,
          "content" to noteContent,
        )
      )
      // JS owns link handling on both platforms, including chapter-local anchors.
      return false
    }

    override fun onExternalLinkActivated(url: AbsoluteUrl) {
      onLink(payload("href" to url.toString()))
    }

    override fun onResourceLoadFailed(url: Url, error: ReadError) {
      onStatus(payload("stage" to "resourceLoadFailed", "href" to url.toString()))
      onError(
        payload(
          "code" to "resource_failed",
          "href" to url.toString(),
          "message" to error.toString(),
          "recoverable" to true,
        )
      )
    }
  }

  private val inputListener = object : InputListener {
    override fun onTap(event: TapEvent): Boolean {
      if (suppressNextTap) {
        suppressNextTap = false
        return true
      }
      val mounted = navigator ?: return false
      val isPaged = !mounted.overflow.value.scroll
      val allowsPageTap = preferences?.get("pagedTapNavigation") as? Boolean != false
      if (isPaged && allowsPageTap) {
        val width = mounted.view?.width ?: 0
        if (width > 0) {
          val x = event.point.x
          val direction = when {
            x <= width * PAGE_TAP_EDGE_RATIO -> DIRECTION_PREVIOUS
            x >= width * (1 - PAGE_TAP_EDGE_RATIO) -> DIRECTION_NEXT
            else -> null
          }
          if (direction != null) {
            val animated = preferences?.get("pageAnimation") as? Boolean == true
            val moved = if (direction == DIRECTION_PREVIOUS) {
              mounted.goBackward(animated = animated)
            } else {
              mounted.goForward(animated = animated)
            }
            // Could not turn the page: the chapter is over, so let JS swap in the next one.
            if (!moved) onBoundary(payload("direction" to direction))
            return true
          }
        }
      }
      onTap(payload("x" to event.point.x.toDouble(), "y" to event.point.y.toDouble()))
      return false
    }

    /**
     * Divergence from iOS: it resolves the boundary from the WebView scroll view's
     * content offset. There is no scroll-offset query in 3.1.0, so a drag that runs the
     * reading direction and happens while the locator sits at a chapter edge is treated as
     * a chapter boundary. Passive on purpose — calling goForward here would advance the
     * page a second time for a swipe the navigator already handled.
     */
    override fun onDrag(event: DragEvent): Boolean {
      if (event.type != DragEvent.Type.End) return false
      val horizontal = abs(event.offset.x) >= abs(event.offset.y)
      val primary = if (horizontal) event.offset.x else event.offset.y
      if (abs(primary) < BOUNDARY_DRAG_THRESHOLD_PX) return false

      val next = primary < 0
      val atEdge = if (next) {
        lastProgression >= CHAPTER_EDGE
      } else {
        lastProgression <= 1 - CHAPTER_EDGE
      }
      if (!atEdge) return false

      val now = System.currentTimeMillis()
      if (now - lastBoundaryEventAt <= BOUNDARY_DEBOUNCE_MS) return false
      lastBoundaryEventAt = now
      onBoundary(payload("direction" to if (next) DIRECTION_NEXT else DIRECTION_PREVIOUS))
      return false
    }

    override fun onKey(event: KeyEvent): Boolean = false
  }

  /** Exposed to the chapter's JS as `window.novellaReader`, see `buildImagePreviewScript`. */
  private inner class ImageBridge {
    @JavascriptInterface
    fun open(uri: String, alt: String, gesture: String) {
      // Called from the WebView's JavaScript thread.
      post {
        val expectsLongPress = preferences?.get("imagePreviewOpenOnLongPress") as? Boolean == true
        if (gesture != if (expectsLongPress) GESTURE_LONG_PRESS else GESTURE_TAP) return@post
        suppressNextTap = true
        postDelayed({ suppressNextTap = false }, TAP_SUPPRESSION_MS)
        onImage(payload("uri" to uri, "alt" to alt.takeIf { it.isNotEmpty() }))
      }
    }
  }

  /** Builds an event body, dropping absent fields to match the optional JS fields. */
  private fun payload(vararg pairs: Pair<String, Any?>): Map<String, Any> {
    val map = mutableMapOf<String, Any>()
    for ((key, value) in pairs) {
      if (value != null) map[key] = value
    }
    return map
  }

  private companion object {
    const val HOST_TAG = "novella-readium-host"
    const val IMAGE_BRIDGE_NAME = "novellaReader"
    const val GESTURE_TAP = "tap"
    const val GESTURE_LONG_PRESS = "longPress"
    const val DIRECTION_NEXT = "next"
    const val DIRECTION_PREVIOUS = "previous"
    const val PAGE_TAP_EDGE_RATIO = 0.3
    const val TAP_SUPPRESSION_MS = 500L
    const val BOUNDARY_DEBOUNCE_MS = 350L
    const val BOUNDARY_DRAG_THRESHOLD_PX = 40f
    const val CHAPTER_EDGE = 0.98
  }
}
