package sh.celia.novella.ui

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NovellaUiModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NovellaUi")

    // Mirrors the iOS AsyncFunction of the same name. The JS caller is
    // src/services/native-reader-image-rasterizer.ts.
    AsyncFunction("rasterizeReaderImage") { uri: String, maxPixelSize: Int ->
      ReaderImageRasterizer.rasterize(
        uri = uri,
        maxPixelSize = maxPixelSize,
        cacheDirectory = appContext.cacheDirectory
      )
    }

    View(NovellaSearchBarView::class) {
      // The JS side resolves this view as ViewManagerAdapter_NovellaUi_SearchBar
      // (see modules/novella-ui/src/native-search-bar.tsx). Name() must match
      // that second argument exactly, otherwise requireNativeView fails at render.
      Name("SearchBar")

      Prop("placeholder") { view, placeholder: String? ->
        view.setPlaceholder(placeholder)
      }

      Prop("enabled") { view, enabled: Boolean ->
        view.setEnabledProp(enabled)
      }

      Events("onQueryChange", "onSearch")

      AsyncFunction("focus") { view: NovellaSearchBarView ->
        view.focus()
      }

      AsyncFunction("blur") { view: NovellaSearchBarView ->
        view.blur()
      }

      AsyncFunction("clear") { view: NovellaSearchBarView ->
        view.clear()
      }

      AsyncFunction("setQuery") { view: NovellaSearchBarView, query: String ->
        view.setQuery(query)
      }
    }

    View(NovellaSegmentedControlView::class) {
      Name("SegmentedControl")

      Prop("options") { view, options: List<SegmentedControlOption>? ->
        view.setOptions(options)
      }

      Prop("selectedValue") { view, value: String? ->
        view.setSelectedValue(value)
      }

      Prop("enabled") { view, enabled: Boolean ->
        view.setEnabledProp(enabled)
      }

      Events("onValueChange")
    }

    View(NovellaReaderProgressBarView::class) {
      Name("ReaderProgressBar")

      Prop("progress") { view, progress: Double ->
        view.setProgress(progress)
      }

      Prop("currentPage") { view, value: Int ->
        view.setCurrentPage(value)
      }

      Prop("disabled") { view, value: Boolean ->
        view.setDisabled(value)
      }

      Prop("totalPages") { view, value: Int ->
        view.setTotalPages(value)
      }

      Prop("progressLabel") { view, value: String? ->
        view.setProgressLabel(value)
      }

      Prop("remainingText") { view, value: String ->
        view.setRemainingText(value)
      }

      Prop("direction") { view, value: String ->
        view.setDirection(value)
      }

      // ColorTypeConverter maps every RN ColorValue (number, "#rrggbb", named
      // color, rgb()/hsl() string) onto android.graphics.Color.
      Prop("accentColor") { view, value: android.graphics.Color? ->
        view.setAccentColor(value)
      }

      Events("onProgressChange")
    }
  }
}
