# Changelog
The format of this Changelog is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# [Unreleased]
## Added
- Added `tmUtils.showTabInfo(<tabId>)` for debugging from the Chrome dev tools console

- Added support for "Search tabs with TabMania" as context menu and shortcuts option
  * Use keyword "tabmania" (case insensitive) in the _Hostname or URL_ field of a shortcut
    to enable this functionality in a shortcut
	- All other fields of the shortcut definition are ignored

- Added debug function tmUtils.showSearchParserInfo() to monitor how SearchQuery is interpreting
  the user input in the serch, and to show some search statistics

## Changed
- Replaced search mode parser, the new parser is trying to match the syntax used by
  google search (case insensitive)
  * Support for `AND` and `OR` binary operators
    - `AND` has precedence over `OR`
  * Multiple tokens separated by spaces are considered having implicit `AND` in between
  * Support for unary operators
    - Boolean unary operator `-` to indicate exclusion/negation
	  * Replaces the `!` we used before
	- Unary search modifiers `site:` (search only hostname), `intitle:`, `inurl:`, `inbadge:`,
      `ingroup:` (searches only custom group labels assigned to a tab)
	- The text affected by the unary operators must be attached to the unary operators,
	  no whitespaces allowed
	- Unary operators can be concatenated/nested, only the innermost search modifier takes
	  effect, while one or more `-` always work regardless of other modifiers
  * Use quotes (single or double) to indicate exact match (or to escape all operators `"AND"`,
    `"OR"`, etc.)
  * Use `\` to escape quotes, `-` and `:` (and of course to escape `\` too) (not sure if Google
    does this)
  * The v.1.1 operator `^` (for "starts with") is not supported anymore
- Removed _Close_ button and _Delete_ menu item for bookmarks marked unmodifiable

## Fixed
- Trimming input value for shortcuts hostname/URL, to guarantee correct processing


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