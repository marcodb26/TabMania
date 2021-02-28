# Changelog
The format of this Changelog is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# [Unreleased]
## Added
- This Changelog file
- Moved release process to [README-DEV.md](https://github.com/marcodb26/TabMania/blob/main/README-DEV.md)
- Added ability to undock the popup, so users can resize it and have it always available
- Added "+" button to open a new tab; the tab will recycle leftover "new tabs" or use the
  "least tabbed window"
  * If a search is active, the "+" button opens a launch/search with the search text instead
    of opening an empty new tab
- Added `settingsStore.setOptionDevMode(true)` to control visualization and enabling of
  dev-only features like the _extended tab ID_
- Search results now also include matching bookmarks, not only open tabs
  * This feature is enabled by default, but can be disabled via settings
  * Clicking the tile of a bookmark will try to find an existing tab with a matching URL to
    activate, and if not found, will open a new tab using our standard "recycle empty or
    least tabbed window"
- Officially supporting pressing the _Paste_ keyboard shortcut (`CTRL+v` in Windows, `Command+v`
  on Mac) to activate search
  * If the clipboard has no text, the searchbox will close immediately again

## Changed
- Updated Bootstrap to v.5.0.0-beta2
- Added some initial minimal NPM automation scripts
- Shortcuts try to recycle leftover "new tabs" created in the past and never used
- Shortcuts open new tabs in the "least tabbed window", to keep balancing tabs across
  all your open windows
- Custom shortcuts now default to an "Open new tab" behavior when not configured

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