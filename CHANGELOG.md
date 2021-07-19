# Changelog
The format of this Changelog is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# [Unreleased]
## Added

## Changed

## Fixed


# [2.0.0] - 2021-07-19
## Added
- Added option to track Incognito tabs in a separate view; when Incognito tabs are in a separate view:
  * Search applies only to Incognito tabs, and optionally to bookmarks
  * Search of recently closed tabs and browsing history applicable only in the standard tabs view
  * Pressig the `+` button while in Incognito-only view triggers a Launch/Search in a new Incognito tab
  * Opening a bookmark from the Incognito-only view opens the bookmark in a new Incognito tab
  * Search-related keyboard shortcuts only operate on standard tabs, not on Incognito tabs
  * When switching from standard+incognito in same view to separate views, we need to respawn
	the class managing the standard view with minor loss of state (scrollbar position, active
	search, multi-select state)
- New features: "move new tabs to Least Tabbed Window (LTW)" and "new tab deduplication"
  * Intercept new tabs creation and apply "least tabbed window" logic and deduplication logic
	- User configurable (tabs from other applications, tabs from other tabs, and new empty tabs)
	- Excludes `chrome-extension:` tabs, tabs opened in the background (e.g. CTRL+click), popups
  * Both disabled by default
  * For deduplication we match the full URL (including fragment), and if we find a match on an
    existing tab, activate the existing tab
    - We never switch to an existing tab with a different fragment
  * Deduplication works only for new tabs opened from other applications or new empty tabs
    - For new tabs opened from other tabs, the URL field gets set only on the first `onUpdated`,
	  not at `onCreated` (we'll add logic to support this in a later release)
- Support for tiles multi-selection
  * Includes "select/unselect all" behavior for groups, with "indetermined" checkbox state when
	a group is partially selected
	* Groups with no items don't show the selection checkbox
  * Selections are persisted across transitions through searches, to allow users to accumulate
    a selection over time
	- This requires showing count of selected tiles in view separately from total count of
	  selected items
	- And requires an option to display all selected items (to validate current full selection)
  * Some actions apply only to some classes of items, items in other classes will be ignored
    and not cause any errors
  * If Incognito tabs are tracked in a separate view, multi-selection applies only across items
	within one view
- Configurable option to auto-start undocked popup when starting Chrome (default `false`)
- Added default label for special cases of hostname-based groups
  * `[ Pages on this device ]` for protocol `file:` (no hostname)
  * `[ New tabs ]` for `chrome://newtab/`
  * `[ No hostname ]` in general when a hostname is missing (instead of the empty name in v1.3)
- Added custom HTML attribute `data-tab-id` to each tile to simplify debugging by supporting easily
  mapping each tile to a tab ID when inspecting the HTML
- Initial implementation of `Viewer.getViewerByElement()`, to support mapping of DOM elements
  to `Viewer` objects
- Added support for help strings in settings checkboxes (Classes.SettingsCheckboxItemViewer)
- Added automation for creation of GitHub releases (`npm run github-release`)
- Added a `gcChecker` class to validate objects are getting garbage-collected properly
- New explicit `discard()` method for classes that might suffer leaks without explicit actions
- Added a `EventListenersWrapper` helper class to simplify unregistering an instance from all
  the events it was listening to (to simplify the implementation of `discard()`)
- Added `persistentSet.addMany()` and `persistentDict.delMany()` (to generate a single notification)
- Added job name to all instances of `ScheduledJob`

## Changed
- Removed support for docked popup, now the popup is always undocked
- Updated uglify-js from v.3.13.2 to v.3.13.4
- Updated NPM from v.7.7.5 to v.7.10.0
- Improved sequence of LTW open tab: first set back active tab in old window, then move
- Split `chrome.tabs` events processing from tiles rendering
  * The new `TabsManager` offers a more uniform set of events downstream, and the new tiles
    rendering logic uses those events instead of the native chrome.tabs events
  * Also cleaned up relationship between pinned bookmarks and tabs inheriting pins from pinned
    bookmarks (the filtering is now just a rendering feature)
- For tab updates, full re-rendering is now triggered only under specific conditions
  * In v1.3 it was unconditional
  * No performance profiling yet after refactoring
- Improved debuggability of `tmUtils.isEqual()`
- Using new throbber animation for tabs in `loading` state, better aligned with the animation used by
  Chrome itself while tabs reload
- `NormalizedTabs.js` code cleanup
  * Split into `TabNormalizer` and `TabsStore` classes (removed all the ugly static functions)
  * Cleaned up `normalizeTab()` initialization to cleanly support multiple calls on the same tab
  * Added option to separate normalization from adding shortcut badges
  * `TabsStore` improves tab lookup performance over NormalizedTabs by avoiding linear searches every
    time (using a combo dict+list now)
- Keep tiles in a stable position while a tab is loading
  * Prevent temporary title changes while in `loading` state from moving a tile up and down
- Cleaned up the rendering of settings containers and settings options
- Now using `localStore.isAllowedIncognitoAccess()` instead of `chrome.extension.isAllowedIncognitoAccess()`
  in `SettingsBsTabViewer._renderIncognitoInfo()` (avoid the extra async wait)
- Started using new pattern for `this._log()`, avoiding string concatenation
- Restructured `PopupMenuViewer` class to get bsTab menu items as a side effect of creating bsTabs
- Cleaned up `ChromeUtils` to support "incognito or not" for all methods offered (including queries)
- Cleaned up rendering of bsTabs bodies, now using `.d-flex .flex-column` layout to organize multiple
  headers on top of a scrollable tiles container
- Improved `CollapsibleContainerViewer` to support checkboxes rendered as switches
- Minor cleanup in `Viewer` class, renamed `attachToElement()` and `appendToElement()` (as
  `attachInParentElement()` and `appendInParentElement()`) to match `prependInParentElement()`
- Reorganized CSS files and moved to separate folder
  * And started taking advantage of CSS variables where appropriate
- Added custom group colors "pink" and "purple" to match color set from Chrome's tab groups
  * Though the actual color hues are not identical
  * Also switched text of "cyan" badges to dark color to increase contrast
- Switched from "grey" to "gray" for custom groups color label

## Fixed
- Activating a bookmark or history item fails to reuse an existing tab if the URL has a fragment
- `SearchQuery.search()` must not change `tab.tm` to include `searchStats` and `unoptimizedSearchStats`
  * Experienced as: `generateDiffEvents()` shows 177 tabs changed when changing active tab of a window
    from TabMania in search mode
- In search mode, some tabs from `_tabUpdatedCb()` don't have a tile, and we need to validate if a
  tile actually exists
- The `wantsAttention` flag was interfering with the `tmUtils.isEqual()` function
  * `tmUtils.isEqual()` can't treat [ `wantsAttention` missing ] == [ `wantsAttention` set to `false` ]
  * Experienced as: the extension's tab sometimes has `wantsAttention`, sometimes doesn't, and shows
    up as changed when you make any other tab active
- Discovered a massive Chrome memory leak on popup reload
  * Worked around by removing a background page event listener on popup unload
- `chromeUtils.createTab()` ignores existing empty tabs
- When updating custom group color in Settings, only `TilesGroupViewer` gets updated (group header), not
  the individual tiles inside of it
- The left-most color in the custom group definition is the color "None", which should imply no callout
  is displayed, and the standard badge colors are used
- Emptying hostname data in custom group definition causes the group to attracts all tabs
- Pinning a tab doesn't trigger a re-sort of the tiles in view
- Suspending a tab from memory focuses the window where the tab is located


# [1.3.0] - 2021-04-18
## Added
- Added "Wants attention" feature
  * When a site changes title continuously, temporarily push its tile to the top of the popup,
    pulse its favIcon and blink the _Home_ tab
- Using day.js to display relative times in bookmark and browsing history tile menus (subtitle area)
- Support for touch screens
  * Automatically open tile dropdown menus when tap-holding in place (no movement)
  * Prevent Chrome context menu from appearing when users tap-hold
- Added bookmark folder on tile's second line of text
- Responsive layout to support narrow width for TabMania popup
  * Hide inactive BsTabs, then hide active BsTab as well, as the window gets narrower
    - To make sure the main menu remains visible at all times
  * Support changing BsTabs from menu items in the main menu
    - Needed when the BsTabs are hidden
	- Only visible when the popup is undocked
  * Style narrower scrollbars when real estate becomes precious
  * Fixed double horizontal scroll bars when the undocked popup was very narrow
- If a tab/bookmark/history-item doesn't have a title, use the URL as title of the tile
  * Some browsing history items appear to have no title

## Changed
- Updated uglify-js to v.3.13.2
- TabMania tile now doesn't allow to close the popup from within the tile
- The pin for a pinned bookmark is now inherited by all tabs matching the bookmark
  * Before only the first matching tab was inheriting the pin
- Changed styling of settings accordions and custom groups accordions
  * Remove the blue tint from the accordion buttons when expanded
  * Set the button to have all corners rounded
  * Removed extra borders and spacing around the perimeter of the expanded accordion
- Removed display of URL bar at the bottom of the popup when hovering over the _Home_
  and _Settings_ BsTabs (Bootstrap Tabs)
- Disabled use of TabMania context menus on any `chrome-extension://` page
  * The main target was to disable the TabMania context menus on the TabMania popup itself 
- _Home_ and _Settings_ BsTab titles are now unselectable
- If the browser is offline, use the cached favicon without waiting for the <img> tag to trigger
  the URL loading error logic
- Disable the _Suspend_ tile dropdown menu item when a tab is already suspended or unloaded
  * Tabs get automatically unsuspended when opened
- Changed tile styling for tiles in `loading` state
  * Replaced the `loading` badge with a throbber around the favIcon of the tile
  * Very similar visual to what Chrome does in the tab itself

## Fixed
- Missing `tmConsole` class in production build of background page
- Forcing initial position of undocked popup the first time it gets undocked after installation
  * Or any time the local storage gets deleted
- Tile dropdown menus now close automatically when they become hidden
  * They used to remain open while hidden and show up as open when hovering (inconsistent)
- When we fail to load a favicon in a custom group accordion button, attempt to use the cached
  favicon instead
  * This logic was only implemented for standard tiles in v1.2, added support for custom group
    accordion buttons now
- When moving a bookmark to a new folder, search results with the "folder:" modifier were
  not getting updated
- When bookmark title or URL were edited on an existing bookmark, BookmarksManager wasn't updating
  all the data structures supporting search
- Pinned custom groups were not showing the color on their left border when they were empty
- The main menu was not closing automatically when the user started typing into the search box
  (either starting with searchbox closed, or already open)
- Automatically switch to another tab when suspending the active tab
  * If the active tab gets suspended, Chrome triggers the unsuspend logic when switching to
    another tab
- The ellipsis truncating the title in a tile were not properly vertically aligned with the title
- Lowercase "g" gets clipped in tile titles


# [1.2.0] - 2021-03-25
## Added
- Added `tmUtils.showTabInfo(<tabId>)` for debugging from the Chrome dev tools console
- Added support for "Search tabs with TabMania" as "selection" context menu and shortcuts option
  * For the "selection" context menu, select text to see the menu
  * For the shortcut, use keyword "tabmania" (case insensitive) in the _Hostname or URL_ field
    of a shortcut to enable this functionality with text from the clipboard
	- All other fields of the shortcut definition are ignored
- Added search parser matching the syntax used by google search (case insensitive)
  * Support for `AND` and `OR` binary operators
    - `AND` has precedence over `OR`
  * Multiple tokens separated by spaces are considered having implicit `AND` in between
  * Support for unary operators
    - Boolean unary operator `-` to indicate exclusion/negation
	- Unary search modifiers `site:` (search only hostname), `intitle:`, `inurl:`, `badge:`,
      `group:` (searches only custom group labels assigned to a tab), and `folder:`
	- The text affected by the unary operators must be attached to the unary operators,
	  no whitespaces allowed
	- Unary operators can be concatenated/nested, only the innermost search modifier takes
	  effect, while one or more `-` always work regardless of other modifiers
  * Support for regular expressions as tokens prefixed with `r:`
  * Use quotes (single or double) to indicate exact match (or to escape all operators `"AND"`,
    `"OR"`, etc.)
  * Use `\` to escape quotes, `-` and `:` (and of course to escape `\` too) (not sure if Google
    does this)
  * The new search performs basic optimizations for search evaluation
    - Identification and pruning of some tautologies and contradictions
    - Use of C-style "short-circuiting behavior" during evaluation (only evaluate what's
	  strictly needed)
	- Merge all `OR` operands to a regex
  for binary operators (if the left operand is enough to determine truth value, don't
  evaluate the right operand)
- Added new [document describing the new search capabilities](docs/README-search.md) in details
- Added new overlay text area to display messages in the popup
  * Appears at the top of the _Home_ tab, only when there's a message to display
  * Initially only used to report syntax errors in regular expressions from the search box
- Added debug function `tmUtils.showSearchParserInfo()` to monitor how SearchQuery is interpreting
  the user input in the serch, and to show some search statistics
- Added new BookmarksManager class to replace BookmarksFinder
  * `chrome.bookmarks.search()` was inadequate to support our new search needs
- Added support for bookmarks pinning
  * Pinned bookmarks appear in standard mode (regular bookmarks appear only in search mode)
  * If there's a tab open matching a pinned bookmark, show only the open tab, not the bookmark
	- If the tab is not itself pinned, the tab shows the thumbtack icon in gray,
      to indicate the pinning is inherited from the pinned bookmark
    - Users can unpin a pinned bookmark from the corresponding open tab
- Added support for bookmarks marked unmodifiable
  * Removed _Close_ button and _Delete_ menu item for bookmarks marked unmodifiable
- Now showing _dateAdded_ for bookmarks in dropdown details
- Added to bookmarks the hidden search badge `bookmark`
- Tab title normalization taking special actions for open tabs representing pages of
  _Chrome Bookmark manager_ (e.g. `chrome://bookmarks/?id=686`)
  * Added the folder path to the title of the tile
    - The original page title only says _Bookmarks_ (not very informative if you have more than
	  one such pages opened in different folders)

## Changed
- Updated uglify-js to v.3.13.0
- The v.1.1 search operators `^` (for "starts with") and `!` are not supported anymore
  * Replaced by the new search syntax
- Improved performance of `TileBookmarkMenuViewer._updateTitleMenuItem()` by providing a sync
  version of the folder path building logic leveraging the bookmark shadow data in the
  new `bookmarksManager` object
- Improved sorting of tab titles
  * Now only alphanumeric characters (a-z0-9) at the beginning of a title string count
    as title start for sort

## Fixed
- Trimming input value for shortcuts hostname/URL, to guarantee correct processing
- When we fail to load a favicon, attempt to use the cached favicon instead
  * If there's no cached favicon, Chrome will return its default globe favicon,
    so we'll never see again the "broken images" image in place of the favicon
- Sometimes tabs were showing the `loading` badge for a long time after a tab had finished
  (re)loading. Discovered this is due to a Chrome bug (see roadmap-done.txt for details)
  * Implemented workaround polling tabs showing syptoms of the issue
- Fixed issue with the use of `AsyncQueue` in the tiles code, which was causing the dropdown
  toggle button to not show up for some tab tiles
- Forced focus on searchbox whenever a keypress is done while the _Home_ tab is visible and
  search active
  * Supports updating search after having clicked on a tile (dropdown toggle, close button
    or tile body)


# [1.1.0] - 2021-03-07
## Added
- Added this Changelog file
- Moved release process to [README-DEV.md](https://github.com/marcodb26/TabMania/blob/main/README-DEV.md)
- Added ability to dock/undock the popup.
  * The new default is "undocked", so users can have it always available
- Added "+" button to open a new tab; the tab will recycle leftover "new tabs" or use the
  "least tabbed window"
  * If a search is active, the "+" button opens a launch/search with the search text instead
    of opening an empty new tab
- Added `settingsStore.setOptionDevMode(true)` to control visualization and enabling of
  dev-only features like the _extended tab ID_
- Search results now also include matching bookmarks, not only open tabs
  * This feature is enabled by default, but it can be disabled via settings
  * Clicking the tile of a bookmark will try to find an existing tab with a matching URL to
    activate, and if not found, will open a new tab using our standard "recycle empty or
    least tabbed window"
  * We limit search results to a maximum of 500 bookmarks, to avoid making the search too slow
- Added menu item in bookmarks, to open their folder in Chrome Bookmark manager
- Officially supporting pressing the _Paste_ keyboard shortcut (`CTRL+v` in Windows, `Command+v`
  on Mac) to activate search
  * If the clipboard has no text, the searchbox will close immediately again
- Added visual cue during search processing: the search results count blinks while
  the search is in progress
- Search results now also include matching recently closed tabs
  * This feature is enabled by default, but it can be disabled via settings
  * Clicking the tile of a recently closed tab will restore the closed tab in the same
    window where it was originally located
  * Note that Chrome offers a maximum of 25 recently closed tabs, so this limits the
    usefulness of this feature
- Search results now also include matching browsing history
  * This feature is disabled by default
  * When first enabled, the user is prompted to give TabMania permission to access the
    user's browsing history (optional permission)
  * TabMania requests and releases that permission every time the user enables and disables
    searching browsing history
  * The icon for recently closed and history is the same, but we use two different colors
    to tell them apart
- Some keyboard shortcuts can now be invoked via context menus
  * Right click on page has new menu item "Move current page to least tabbed window"
  * Right click on links has new menu item "Open link in least tabbed window"
  * Right click when text is selected offers the following new menu items:
    - Use launch/search shortcut
	- Use any custom shortcuts with search enabled
	- Added a _title_ to the custom shortcuts configuration, to display useful text
	  in the context menu
- Added _Move to least tabbed window_ action to the tile dropdown menu
- Displaying in _Shortcut settings_ the shortcut keys configured for each custom shortcut

## Changed
- Updated Bootstrap to v.5.0.0-beta2
- Added some initial minimal NPM automation scripts
- Shortcuts try to recycle leftover "new tabs" created in the past and never used
- Shortcuts open new tabs in the "least tabbed window", to keep balancing tabs across
  all your open windows
- Custom shortcuts now default to an "Open new tab" behavior when not configured
- Improved tiles rendering efficiency
  * Chunking tile bodies and dropdown menus to be rendered in async groups
  * Caching and reusing tile viewers
- Changing searchbox input resets the scrolling position back to the top
  * Before it would try to stay in the same scrolling position across input changes
- Closing a search opens the standard view in the same scrolling position where it
  was before the search started
- Started using Chrome favicon cache for standard tabs with no favicon
  * Typically some tabs that have stayed unloaded for a very long time
- Tab tile dropdown menu item _Discard from memory_ is now called _Suspend_
  * Hidden badge `Discarded` is now correspondingly `Suspended`
  * Made this menu item a standard item (it was listed under _Advanced mode_ before)
- Removed _Advanced mode_ option, as we don't have any advanced option left

## Fixed
- Discard settings events if they arrive before the TabsTabViewer chrome query has completed (while
  _normTabs is still uninitialized)
- Shortcut05 (SC5) can't be invoked
- Pressing an unconfigured custom shortcut leaves an error on the background page console
- Clearing the hostname/URL of a custom shortcut leaves TabMania attempting to open 'https://'
  (only protocol, no hostname), leading to an error on the console
- The serchbox gets activated if a shortcut CTRL+[key] is pressed while keyboard focus is on the
  TabMania popup, but the searchbox remains empty and can't easily be closed
  * Only for CTRL+[key] that are not TabMania configured shortcuts
- Bootstrap floating labels for input boxes and textareas don't apply consistently
- Tiles dropdown menu stays open instead of closing when clicking on a menu item

# [1.0.0] - 2021-02-20
## Added
- First release