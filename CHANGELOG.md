# Changelog
The format of this Changelog is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# [Unreleased]
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
  * Note that Chrome offers a maximum of 25 reently closed tabs, so this limits the
    usefuless of this feature
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

# [1.0.0] - 2021-02-20
## Added
- First release