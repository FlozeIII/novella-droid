package sh.celia.novella.readium

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NovellaReadiumModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NovellaReadium")

    View(NovellaReadiumView::class) {
      // The JS side resolves this view as ViewManagerAdapter_NovellaReadium_Reader
      // (see modules/novella-readium/src/novella-readium-view.tsx). Name() must
      // match that second argument exactly, otherwise requireNativeView fails at
      // render and the reader never mounts.
      Name("Reader")

      Prop("publicationUri") { view, value: String? ->
        view.publicationUri = value
      }

      Prop("publicationId") { view, value: String? ->
        view.publicationId = value
      }

      Prop("declaredHrefs") { view, value: List<String>? ->
        view.declaredHrefs = value
      }

      Prop("initialLocator") { view, value: Map<String, Any>? ->
        view.initialLocator = value
      }

      Prop("preferences") { view, value: Map<String, Any>? ->
        view.preferences = value
      }

      Prop("contentInsets") { view, value: Map<String, Double>? ->
        view.contentInsets = value
      }

      AsyncFunction("getCurrentLocator") { view: NovellaReadiumView ->
        return@AsyncFunction view.getCurrentLocator()
      }

      AsyncFunction("goToLocator") { view: NovellaReadiumView, locator: Map<String, Any>? ->
        return@AsyncFunction view.goToLocator(locator)
      }

      AsyncFunction("goToProgression") { view: NovellaReadiumView, progression: Double ->
        return@AsyncFunction view.goToProgression(progression)
      }

      AsyncFunction("goForward") { view: NovellaReadiumView ->
        return@AsyncFunction view.goForward()
      }

      AsyncFunction("goBackward") { view: NovellaReadiumView ->
        return@AsyncFunction view.goBackward()
      }

      Events(
        "onReady",
        "onLocatorChange",
        "onLink",
        "onImage",
        "onError",
        "onStatus",
        "onTap",
        "onBoundary"
      )

      // The reader holds a coroutine scope, an open job and a fragmented navigator; none
      // of those are released by the view being detached, so tear them down explicitly.
      OnViewDestroys { view: NovellaReadiumView ->
        view.dispose()
      }
    }
  }
}
