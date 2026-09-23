package sh.celia.novella.readium

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentContainerView
import androidx.fragment.app.FragmentFactory

/**
 * Hosts the Readium navigator fragment.
 *
 * The toolkit requires its [FragmentFactory] to be installed on the FragmentManager
 * *before* `Fragment.onCreate` calls `super`, because that is where a FragmentManager
 * restores its saved fragments, and instantiating the navigator without the factory
 * fails. A factory can only be installed on a FragmentManager we own, so
 * [NovellaReadiumView] attaches this fragment to the activity and the navigator lives
 * in this fragment's own [childFragmentManager].
 *
 * This class deliberately knows nothing about Readium: the factory and the navigator's
 * class are supplied by the view, which is the layer that already holds the publication
 * inputs and the bridge back to JS.
 */
internal class NovellaReadiumHostFragment : Fragment() {

  /**
   * Supplies the factory for the navigator. Must be assigned before this fragment is
   * committed, because [onCreate] runs inside the commit.
   *
   * Not parceled, and not parcelable: it closes over a parsed `Publication` and a listener
   * bound to the view that opened it. A fragment rebuilt from saved state therefore always
   * arrives with this null, which is what [DegradedNavigatorFactory] compensates for.
   */
  var factoryProvider: (() -> FragmentFactory)? = null

  /** The Readium navigator fragment class the factory builds. */
  var navigatorFragmentClass: Class<out Fragment>? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    // Before super: see the class comment. `super` is where the child FragmentManager
    // replays its saved fragments, so the factory has to be in place first.
    childFragmentManager.fragmentFactory = factoryProvider?.invoke() ?: DegradedNavigatorFactory
    super.onCreate(savedInstanceState)
  }

  override fun onCreateView(
    inflater: LayoutInflater,
    container: ViewGroup?,
    savedInstanceState: Bundle?
  ): View = FragmentContainerView(requireContext()).apply {
    id = R.id.novella_readium_navigator_container
  }

  override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
    super.onViewCreated(view, savedInstanceState)
    // On restore the child FragmentManager replays its own saved fragments, so adding one
    // here would stack a second copy. Note that what it replays is an empty placeholder and
    // not a working navigator, because the factory cannot be reconstructed in this process
    // (see DegradedNavigatorFactory).
    if (savedInstanceState != null) return
    if (childFragmentManager.isStateSaved) return
    val navigatorClass = navigatorFragmentClass ?: return
    // The platform transaction API, not the fragment-ktx `commitNow {}` extension: this
    // module compiles against the `fragment` artifact appcompat already exposes, and
    // readium's fragment-ktx is runtime-scope only.
    childFragmentManager
      .beginTransaction()
      .add(R.id.novella_readium_navigator_container, navigatorClass, null)
      .commitNow()
  }
}

/**
 * Stands in for Readium's factory when this fragment was rebuilt from saved state.
 *
 * The surviving child FragmentManager still holds the navigator it saved, and replays it
 * during [NovellaReadiumHostFragment.onCreate]'s `super` call. Readium's navigator is only
 * constructible through its own factory — it takes the open inputs as constructor
 * arguments — so the default factory's reflective instantiation throws
 * `InstantiationException`. That happens while the activity is attaching, before the
 * reopening ExpoView can mount, so it surfaces as a crash on relaunch rather than as a
 * reader that lost its place.
 *
 * Yielding an empty fragment leaves the container blank, which is the deliberate
 * degradation: the navigator genuinely cannot be rebuilt here. Restoring it for real would
 * mean putting the open inputs in this fragment's arguments instead of in instance fields;
 * the JS side re-opens the publication through the replacement host fragment in the
 * meantime.
 *
 * Reachable after process death, or an activity recreation from a configuration change the
 * manifest does not list — `fontScale` and `density` notably. Rotation is not one of them:
 * the activity declares `orientation` in `configChanges` and the app is portrait-locked.
 */
private object DegradedNavigatorFactory : FragmentFactory() {
  override fun instantiate(classLoader: ClassLoader, className: String): Fragment = Fragment()
}
